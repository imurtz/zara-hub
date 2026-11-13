// عامل المعالجة: يفك الصورة ← يقص ← يصغّر ← يرمّز MozJPEG (بدون حقوق) ← يرسم الحقوق ← يرمّز (مع حقوق).
// صورة واحدة في كل مرة، ويُغلق كل شيء بعدها حتى لا تمتلئ الذاكرة.
import encode, { init as initEnc } from "./vendor/jsquash/encode.js";
import { cropRect, drawFooter, FONT_M, FONT_R, RATIOS } from "./footer.js";
import { applyAdjust, isZero } from "./adjust.js";

let assets = null, encReady = null;

async function setup(msg) {
  if (!encReady) {
    encReady = (async () => {
      const wasm = await WebAssembly.compileStreaming(fetch(new URL("./vendor/jsquash/codec/enc/mozjpeg_enc.wasm", import.meta.url)));
      await initEnc(wasm);
    })();
  }
  // الخط من مجلد المنظومة، وإلا من الخطوط المثبّتة على الجهاز
  const LOCAL = { [FONT_M]: 'local("DIN Next LT Arabic Medium"), local("DINNextLTArabic-Medium")', [FONT_R]: 'local("DIN Next LT Arabic Regular"), local("DINNextLTArabic-Regular")' };
  for (const [fam, buf] of [[FONT_M, msg.fonts && msg.fonts.M], [FONT_R, msg.fonts && msg.fonts.R]]) {
    try { const f = new FontFace(fam, buf || LOCAL[fam]); await f.load(); self.fonts.add(f); } catch (e) {}
  }
  assets = msg.assets;
  await encReady;
}

function sizeFor(sw, sh, q) {
  const long = Math.max(sw, sh);
  const max = q.maxEdge && q.maxEdge < long ? q.maxEdge : long;
  const k = max / long;
  return [Math.round(sw * k), Math.round(sh * k)];
}

// تصغير بخطوات نصفية لجودة أعلى عند التصغير الكبير
function drawScaled(bmp, r, tw, th) {
  let src = bmp, sx = r.sx, sy = r.sy, sw = r.sw, sh = r.sh, tmp = null;
  while (sw / 2 >= tw * 1.0001 && sh / 2 >= th * 1.0001) {
    const c = new OffscreenCanvas(Math.round(sw / 2), Math.round(sh / 2));
    const x = c.getContext("2d"); x.imageSmoothingQuality = "high";
    x.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
    if (tmp) { tmp.width = tmp.height = 0; }
    tmp = c; src = c; sx = sy = 0; sw = c.width; sh = c.height;
  }
  const out = new OffscreenCanvas(tw, th);
  const ctx = out.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, tw, th);
  if (tmp) { tmp.width = tmp.height = 0; }
  return { out, ctx };
}

async function jpeg(ctx, w, h, q, meta) {
  const data = ctx.getImageData(0, 0, w, h);
  const buf = await encode(data, {
    quality: q.quality, progressive: true, optimize_coding: true,
    auto_subsample: false, chroma_subsample: q.chroma444 ? 1 : 2, trellis_multipass: false
  });
  return withXmp(new Uint8Array(buf), meta);
}

// بيانات الحقوق (XMP): المصوّر + حقوق الجمعية + العنوان. لا GPS ولا أي بيانات من الأصل (الترميز من البكسلات فقط).
function withXmp(jpg, m) {
  const esc = s => String(s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const xml = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">` +
    `<dc:creator><rdf:Seq><rdf:li>${esc(m.photographer)}</rdf:li></rdf:Seq></dc:creator>` +
    `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${esc(m.rights)}</rdf:li></rdf:Alt></dc:rights>` +
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(m.title)}</rdf:li></rdf:Alt></dc:title>` +
    `<xmpRights:Marked>True</xmpRights:Marked><photoshop:Credit>${esc(m.org)}</photoshop:Credit>` +
    (m.date ? `<photoshop:DateCreated>${esc(m.date)}</photoshop:DateCreated>` : "") +
    `</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const ns = new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\0"), body = new TextEncoder().encode(xml);
  const len = 2 + ns.length + body.length;
  if (len > 65535) return jpg;
  const seg = new Uint8Array(2 + len);
  seg[0] = 0xff; seg[1] = 0xe1; seg[2] = len >> 8; seg[3] = len & 255; seg.set(ns, 4); seg.set(body, 4 + ns.length);
  // بعد SOI و APP0 (JFIF) إن وُجد
  let at = 2;
  if (jpg[2] === 0xff && jpg[3] === 0xe0) at = 4 + ((jpg[4] << 8) | jpg[5]);
  const out = new Uint8Array(jpg.length + seg.length);
  out.set(jpg.subarray(0, at), 0); out.set(seg, at); out.set(jpg.subarray(at), at + seg.length);
  return out;
}

async function job(m) {
  const bmp = await createImageBitmap(m.file, { imageOrientation: "from-image", colorSpaceConversion: "default" });
  const res = { id: m.id, W: bmp.width, H: bmp.height, outs: [] };
  try {
    for (const ratio of m.ratios) {
      const r = cropRect(bmp.width, bmp.height, ratio, m.faces, m.pos && m.pos[ratio]);
      const [tw, th] = sizeFor(r.sw, r.sh, m.q);
      const { out, ctx } = drawScaled(bmp, r, tw, th);
      if (!isZero(m.adj)) { const id = ctx.getImageData(0, 0, tw, th); applyAdjust(id, m.adj); ctx.putImageData(id, 0, 0); }
      if (m.plain) res.outs.push({ ratio, kind: "plain", buf: (await jpeg(ctx, tw, th, m.q, m.meta)).buffer });
      if (m.rights) {
        drawFooter(ctx, tw, th, ratio, m.text, assets);
        res.outs.push({ ratio, kind: "rights", buf: (await jpeg(ctx, tw, th, m.q, m.meta)).buffer });
      }
      out.width = out.height = 0;
      res.size = res.size || {}; res.size[ratio] = [tw, th];
    }
  } finally { bmp.close(); }
  return res;
}

self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === "setup") { await setup(m); self.postMessage({ type: "ready", fontsOK: self.fonts.check(`500 20px ${FONT_M}`) && self.fonts.check(`400 20px ${FONT_R}`) }); return; }
    if (m.type === "job") {
      const r = await job(m);
      self.postMessage({ type: "done", ...r }, r.outs.map(o => o.buf));
    }
  } catch (err) {
    self.postMessage({ type: "error", id: m.id, error: String(err && err.message || err) });
  }
};
