// معالجة صور الفعاليات — بوابة زارة. كل شيء داخل المتصفح: لا Firebase ولا رفع ولا أي خادم.
import { ADJ, ZERO, isZero, applyAdjust, histogram, fromXMP, BANDS, parseCube, lutFromPair, imageStats, matchAdj, LOOKS, lookRef } from "./adjust.js";
import { RATIOS, hijriOf, gregOf, cropRect, drawFooter, FONT_M, FONT_R, LOGO_FILL, titleCheck } from "./footer.js";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const HAS_FS = "showDirectoryPicker" in window;
const IMG_RE = /\.(jpe?g|png|webp|heic|heif|tiff?)$/i;
const ORG = "جمعية العوامية الخيرية للخدمات الاجتماعية";

const QUALITY = {
  orig:   { label: "أصلية — نفس الدقة، أعلى جودة", maxEdge: 0, quality: 92, chroma444: true },
  social: { label: "سوشيال — 2560px", maxEdge: 2560, quality: 88, chroma444: true },
  wa:     { label: "واتساب — 1600px", maxEdge: 1600, quality: 82, chroma444: false },
  custom: { label: "مخصص", maxEdge: 2000, quality: 85, chroma444: false }
};

/* ============ تخزين مقبض مجلد المنظومة (IndexedDB) ============ */
const idb = (() => {
  let p;
  const db = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open("zara-photos", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction("kv", mode); const q = fn(t.objectStore("kv")); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
  return { get: k => tx("readonly", s => s.get(k)).catch(() => null), set: (k, v) => tx("readwrite", s => s.put(v, k)).catch(() => null) };
})();
const ls = { get(k, d) { try { const v = localStorage.getItem("zp:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem("zp:" + k, JSON.stringify(v)); } catch (e) {} } };

/* ============ الحالة ============ */
const S = {
  sys: null,           // مقبض مجلد المنظومة
  settings: ls.get("settings", {}),
  src: null,           // مقبض مجلد الصور (أو null في وضع الملفات)
  srcName: "",
  items: [],           // {name, file|handle, faces, thumb, pos:{}, w, h, status}
  cur: 0, ratio: "16:10",
  logos: [],           // مكتبة الشعارات {name, bmp, url, file}
  partners: [], event: "",
  mark: null, founding: null,
  fontSrc: "", fontBufs: null,
  running: false
};
const F = () => S.settings;
const defaults = { title: "", date: new Date().toISOString().slice(0, 10), hijri: "", photographer: "", photographers: [], pattern: "{اسم}_{تاريخ}_{رقم}", short: "", ratios: ["16:10", "4:5"], adj: { ...ZERO }, preset: "", plain: true, rights: true, quality: "orig", customEdge: 2000, customQ: 85, partners: [], event: "" };
for (const k in defaults) if (F()[k] === undefined) F()[k] = defaults[k];

/* ============ مجلد المنظومة ============ */
async function sysDir(name) { return S.sys.getDirectoryHandle(name, { create: true }); }
async function readJSON(dir, name) { try { const f = await (await dir.getFileHandle(name)).getFile(); return JSON.parse(await f.text()); } catch (e) { return null; } }
async function writeFile(dir, name, data) { const h = await dir.getFileHandle(name, { create: true }); const w = await h.createWritable(); await w.write(data); await w.close(); }
async function ensurePerm(h, mode = "readwrite") {
  if (!h) return false;
  const o = { mode };
  if ((await h.queryPermission(o)) === "granted") return true;
  return (await h.requestPermission(o)) === "granted";
}
async function saveSettings() {
  ls.set("settings", F());
  if (S.sys) { try { await writeFile(S.sys, "إعدادات.json", JSON.stringify(F(), null, 2)); } catch (e) {} }
}
let saveT; const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(saveSettings, 600); };

async function pickSys() {
  if (!HAS_FS) return toast("هذا المتصفح لا يدعم المجلدات — استخدم Chrome أو Edge على الكمبيوتر");
  try {
    const h = await window.showDirectoryPicker({ id: "zara-sys", mode: "readwrite" });
    S.sys = h; await idb.set("sys", h); await loadSys(); toast("تم ربط مجلد المنظومة ✓");
  } catch (e) {}
}
async function restoreSys() {
  if (!HAS_FS) return;
  const h = await idb.get("sys"); if (!h) return;
  S.sys = h;
  if ((await h.queryPermission({ mode: "readwrite" })) === "granted") await loadSys();
  else paintSys(true);
}
async function loadSys() {
  if (!(await ensurePerm(S.sys))) return paintSys(true);
  const st = await readJSON(S.sys, "إعدادات.json");
  if (st) { S.settings = Object.assign({}, defaults, st); }
  await loadFonts(); await loadLogos(); await loadPresets();
  paintForm(); paintAdj(); paintSys(); renderPreview();
}
function paintSys(needPerm) {
  const b = $("#sysBtn");
  if (!HAS_FS) { b.hidden = true; return; }
  b.innerHTML = S.sys ? (needPerm ? `📁 ${esc(S.sys.name)} — <u>اضغط للسماح</u>` : `📁 ${esc(S.sys.name)}`) : "📁 اختر مجلد المنظومة";
  b.classList.toggle("warn", !S.sys || !!needPerm);
  b.onclick = needPerm ? () => loadSys() : pickSys;
}

/* ============ الخطوط ============ */
async function loadFonts() {
  let bufs = null;
  if (S.sys) {
    try {
      const d = await sysDir("خطوط"); const files = {};
      for await (const [n, h] of d.entries()) if (h.kind === "file" && /\.(ttf|otf|woff2?)$/i.test(n)) files[n] = h;
      const pick = re => Object.keys(files).find(n => re.test(n));
      const m = pick(/medium/i), r = pick(/regular/i);
      if (m && r) bufs = { M: await (await files[m].getFile()).arrayBuffer(), R: await (await files[r].getFile()).arrayBuffer() };
    } catch (e) {}
  }
  const LOCAL = { [FONT_M]: 'local("DIN Next LT Arabic Medium"), local("DINNextLTArabic-Medium")', [FONT_R]: 'local("DIN Next LT Arabic Regular"), local("DINNextLTArabic-Regular")' };
  let ok = 0;
  for (const [fam, key] of [[FONT_M, "M"], [FONT_R, "R"]]) {
    try { const f = new FontFace(fam, bufs ? bufs[key].slice(0) : LOCAL[fam]); await f.load(); document.fonts.add(f); ok++; } catch (e) {}
  }
  S.fontBufs = bufs;
  S.fontSrc = ok < 2 ? "" : bufs ? "sys" : "local";
  paintFont();
}
function paintFont() {
  const el = $("#fontState");
  el.className = "fstate " + (S.fontSrc ? "ok" : "bad");
  el.innerHTML = S.fontSrc === "sys" ? "✓ خط DIN Next من مجلد المنظومة"
    : S.fontSrc === "local" ? `✓ خط DIN Next من هذا الجهاز${HAS_FS ? ` · <button type="button" class="lnk" id="fontImp">انسخه لمجلد المنظومة ليعمل على أي جهاز</button>` : ""}`
    : `⚠ خط DIN Next LT Arabic غير موجود — <button type="button" class="lnk" id="fontImp">أضف ملفي Medium و Regular</button>`;
  const b = $("#fontImp"); if (b) b.onclick = importFonts;
}
async function importFonts() {
  if (!S.sys) { toast("اختر مجلد المنظومة أولاً"); return pickSys(); }
  const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true; inp.accept = ".ttf,.otf,.woff,.woff2";
  inp.onchange = async () => {
    const d = await sysDir("خطوط");
    for (const f of inp.files) await writeFile(d, f.name, f);
    await loadFonts(); renderPreview(); toast("تم حفظ الخط في مجلد المنظومة ✓");
  };
  inp.click();
}

/* ============ الشعارات ============ */
async function rasterize(blobOrUrl, max = 640) {
  const url = typeof blobOrUrl === "string" ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const img = new Image(); img.decoding = "async"; img.src = url; await img.decode();
  const w0 = img.naturalWidth || 512, h0 = img.naturalHeight || 512, k = Math.min(1, max / Math.max(w0, h0)) || 1;
  const svg = /svg/.test(blobOrUrl.type || "") || /\.svg($|\?)/.test(url);
  const kk = svg ? max / Math.max(w0, h0) : k;
  const c = new OffscreenCanvas(Math.round(w0 * kk), Math.round(h0 * kk)); const cx = c.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, c.width, c.height);
  // قصّ الهوامش الشفافة/البيضاء حول الشعار حتى يملأ المربع
  const d = cx.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (d[i + 3] > 12 && !(d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  if (x1 > x0 && y1 > y0 && (x1 - x0 < c.width - 4 || y1 - y0 < c.height - 4)) return { bmp: await createImageBitmap(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1), url };
  return { bmp: await createImageBitmap(c), url };
}
async function loadLogos() {
  S.logos = [];
  if (!S.sys) return paintLogos();
  try {
    const d = await sysDir("شعارات");
    for await (const [n, h] of d.entries()) {
      if (h.kind !== "file" || !/\.(png|svg|jpe?g|webp)$/i.test(n)) continue;
      try { const f = await h.getFile(); const r = await rasterize(f); S.logos.push({ name: n, ...r }); } catch (e) {}
    }
  } catch (e) {}
  S.logos.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  paintLogos();
}
async function addLogo() {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/png,image/svg+xml,image/jpeg,image/webp"; inp.multiple = true;
  inp.onchange = async () => {
    for (const f of inp.files) {
      try {
        const r = await rasterize(f);
        if (S.sys) await writeFile(await sysDir("شعارات"), f.name, f);
        S.logos = S.logos.filter(l => l.name !== f.name); S.logos.push({ name: f.name, ...r });
      } catch (e) { toast("تعذّر قراءة " + f.name); }
    }
    if (!S.sys) toast("أُضيف للجلسة فقط — اختر مجلد المنظومة ليُحفظ دائماً");
    paintLogos(); renderPreview();
  };
  inp.click();
}
function paintLogos() {
  const P = F().partners || [], E = F().event || "";
  const chip = (l, on, kind) => `<button type="button" class="logo${on ? " on" : ""}" data-logo="${esc(l.name)}" data-kind="${kind}" title="${esc(l.name)}"><img src="${l.url}" alt=""><i>${on ? "✓" : ""}</i></button>`;
  $("#partners").innerHTML = S.logos.map(l => chip(l, P.includes(l.name), "p")).join("") + `<button type="button" class="logo add" data-add>＋<small>شعار</small></button>`;
  $("#eventLogos").innerHTML = `<button type="button" class="logo none${E ? "" : " on"}" data-logo="" data-kind="e">بدون</button>` + S.logos.map(l => chip(l, E === l.name, "e")).join("") + `<button type="button" class="logo add" data-add>＋<small>شعار</small></button>`;
  $("#logoHint").hidden = !!S.logos.length;
  const sel = [...P, E].filter((n, i, a) => n && a.indexOf(n) === i && S.logos.some(l => l.name === n));
  const LF = F().logoFill || {};
  $("#logoSizes").innerHTML = sel.length ? `<small>حجم الشعار داخل المربع الأبيض</small>` + sel.map(n => { const l = S.logos.find(x => x.name === n), v = Math.round((LF[n] || LOGO_FILL) * 100);
    return `<label class="lsz"><img src="${l.url}" alt=""><input type="range" min="50" max="96" value="${v}" data-lsz="${esc(n)}"><span>${v}%</span></label>`; }).join("") : "";
}

/* ============ اختيار الصور + التحليل (كشف الوجوه) ============ */
async function pickSrc() {
  if (S.running) return;
  if (HAS_FS) {
    try {
      const h = await window.showDirectoryPicker({ id: "zara-src", mode: "readwrite" });
      const list = [];
      for await (const [n, f] of h.entries()) if (f.kind === "file" && IMG_RE.test(n)) list.push({ name: n, handle: f });
      if (!list.length) return toast("لا توجد صور في هذا المجلد");
      S.src = h; S.srcName = h.name; setItems(list);
    } catch (e) {}
  } else $("#fileInp").click();
}
$("#fileInp").onchange = e => {
  const list = [...e.target.files].filter(f => IMG_RE.test(f.name)).map(f => ({ name: f.name, file: f }));
  if (!list.length) return;
  S.src = null; S.srcName = "صور"; setItems(list);
};
function setItems(list) {
  list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  S.items = list.map(x => ({ ...x, faces: null, thumb: null, pos: {}, status: "" }));
  S.cur = 0;
  if (!F().short) { F().short = S.srcName; }
  paintForm(); paintGrid(); paintAdj(); analyze(); renderPreview();
  $("#step2").scrollIntoView({ behavior: "smooth", block: "start" });
}
const getFile = it => it.file ? Promise.resolve(it.file) : it.handle.getFile();

let detector = null, detP = null;
function getDetector() {
  if (detP) return detP;
  detP = (async () => {
    try {
      const { FilesetResolver, FaceDetector } = await import("./vendor/mediapipe/vision_bundle.mjs");
      const fs = await FilesetResolver.forVisionTasks(new URL("./vendor/mediapipe/wasm", location.href).href);
      detector = await FaceDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: new URL("./vendor/models/blaze_face_short_range.tflite", location.href).href, delegate: "CPU" }, runningMode: "IMAGE", minDetectionConfidence: 0.55 });
    } catch (e) { console.warn("face detector", e); detector = null; }
    return detector;
  })();
  return detP;
}
function detectFaces(canvas) {
  if (!detector) return [];
  const W = canvas.width, H = canvas.height, out = [];
  const run = (src, ox, oy, sw, sh) => {
    try { for (const d of detector.detect(src).detections) { const b = d.boundingBox; out.push({ x: (b.originX + ox) / W, y: (b.originY + oy) / H, w: b.width / W, h: b.height / H, s: d.categories[0]?.score || 0 }); } } catch (e) {}
  };
  run(canvas, 0, 0);
  // بلاطات أكبر لالتقاط الوجوه البعيدة الصغيرة
  const tw = Math.round(W * 0.55), th = Math.round(H * 0.55);
  for (const [x, y] of [[0, 0], [W - tw, 0], [0, H - th], [W - tw, H - th]]) {
    const c = new OffscreenCanvas(tw, th); c.getContext("2d").drawImage(canvas, x, y, tw, th, 0, 0, tw, th); run(c, x, y);
  }
  // دمج المتكرر
  out.sort((a, b) => b.w * b.h - a.w * a.h);
  const keep = [];
  for (const f of out) {
    if (keep.some(k => iou(k, f) > 0.3 || contains(k, f))) continue;
    keep.push(f);
  }
  return keep;
}
const iou = (a, b) => { const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); const i = x * y; return i / (a.w * a.h + b.w * b.h - i); };
const contains = (a, b) => b.x >= a.x - 0.01 && b.y >= a.y - 0.01 && b.x + b.w <= a.x + a.w + 0.01 && b.y + b.h <= a.y + a.h + 0.01;

let anaToken = 0;
async function analyze() {
  const tok = ++anaToken;
  await getDetector();
  for (let i = 0; i < S.items.length; i++) {
    if (tok !== anaToken) return;
    const it = S.items[i];
    if (it.faces) continue;
    try {
      const f = await getFile(it);
      const bmp = await createImageBitmap(f, { imageOrientation: "from-image", resizeWidth: 1280, resizeQuality: "medium" });
      it.ar = bmp.width / bmp.height;
      const c = new OffscreenCanvas(bmp.width, bmp.height); c.getContext("2d").drawImage(bmp, 0, 0); bmp.close();
      it.faces = detectFaces(c);
      try { it.stats = imageStats(c.getContext("2d").getImageData(0, 0, c.width, c.height), it.faces); } catch (e) {}
      const tw = 360, th = Math.round(tw / it.ar), t = new OffscreenCanvas(tw, th); t.getContext("2d").drawImage(c, 0, 0, tw, th);
      it.thumb = URL.createObjectURL(await t.convertToBlob({ type: "image/jpeg", quality: 0.8 }));
    } catch (e) { it.faces = []; it.err = "تعذّر قراءة الصورة: " + (e.message || e); }
    paintCell(i);
    $("#anaState").textContent = `تحليل الصور ${i + 1}/${S.items.length}`;
    if (i === S.cur) renderPreview();
    await new Promise(r => setTimeout(r, 0));
  }
  if (tok === anaToken) $("#anaState").textContent = `✓ ${S.items.length} صورة جاهزة · ${S.items.filter(x => x.faces && x.faces.length).length} فيها وجوه`;
}

/* ============ الشبكة ============ */
function paintGrid() {
  $("#gridWrap").hidden = !S.items.length;
  $("#srcInfo").innerHTML = S.items.length ? `<b>${esc(S.srcName)}</b> · ${S.items.length} صورة` : "";
  $("#grid").innerHTML = S.items.map((_, i) => `<button type="button" class="cell" data-i="${i}"></button>`).join("");
  S.items.forEach((_, i) => paintCell(i));
}
function paintCell(i) {
  const el = document.querySelector(`.cell[data-i="${i}"]`); if (!el) return;
  const it = S.items[i];
  el.classList.toggle("cur", i === S.cur);
  el.classList.toggle("err", !!it.err);
  const port = it.ar && it.ar < 1;
  el.innerHTML = (it.thumb ? `<img src="${it.thumb}" alt="" loading="lazy">` : `<span class="sk"></span>`) +
    `<em>${i + 1}</em>` + (it.faces && it.faces.length ? `<span class="fc">☺ ${it.faces.length}</span>` : "") +
    (port ? `<span class="pt">عمودية</span>` : "") + (Object.keys(it.pos).length ? `<span class="ed">✎</span>` : "") + (it.adj ? `<span class="ad">🎨</span>` : "") +
    (it.status ? `<span class="st ${it.status}">${it.status === "done" ? "✓" : it.status === "fail" ? "✕" : it.status === "skip" ? "↷" : "…"}</span>` : "");
}

/* ============ المعاينة ============ */
let prevBmp = null, prevFor = -1, prevTok = 0, prevRect = null;
function textOpts() {
  return { title: F().title, hijri: F().hijri || hijriOf(F().date), greg: gregOf(F().date), photographer: F().noCredit ? "" : F().photographer, label: "التغطية الفوتوغرافية", noCredit: !!F().noCredit };
}
function assetsNow() {
  const by = n => (S.logos.find(l => l.name === n) || {}).bmp;
  const fill = n => (F().logoFill || {})[n] || LOGO_FILL;
  const ps = (F().partners || []).filter(n => by(n));
  return { mark: S.mark, partners: ps.map(by), partnerFills: ps.map(fill), event: F().event && by(F().event) ? by(F().event) : null, eventFill: fill(F().event), founding: S.founding };
}
async function renderPreview() {
  const cv = $("#prev"), it = S.items[S.cur];
  $("#prevWrap").classList.toggle("empty", !it);
  $$("[data-ratio]").forEach(b => b.classList.toggle("on", b.dataset.ratio === S.ratio));
  if (!it) { $("#cropbar").hidden = true; drawDemo(cv); return; }
  const tok = ++prevTok;
  if (prevFor !== S.cur) {
    try {
      const f = await getFile(it);
      const b = await createImageBitmap(f, { imageOrientation: "from-image", resizeWidth: 1800, resizeQuality: "high" });
      if (tok !== prevTok) { b.close(); return; }
      if (prevBmp) prevBmp.close(); prevBmp = b; prevFor = S.cur;
    } catch (e) { return; }
  }
  const r = cropRect(prevBmp.width, prevBmp.height, S.ratio, it.faces || [], it.pos[S.ratio]);
  prevRect = r;
  if (S.cropMode) { drawCropMode(cv, it, r); paintCrop(); return; }
  const maxW = 1400, k = Math.min(1, maxW / r.sw), w = Math.round(r.sw * k), h = Math.round(r.sh * k);
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d"); ctx.imageSmoothingQuality = "high";
  ctx.drawImage(prevBmp, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
  const adj = adjOf(it);
  if (!S.before && !isZero(adj)) { const id = ctx.getImageData(0, 0, w, h); applyAdjust(id, adj); ctx.putImageData(id, 0, 0); }
  paintHist(ctx.getImageData(0, 0, w, Math.round(h * 0.78)));
  if ($("#showRights").checked && !S.before) drawFooter(ctx, w, h, S.ratio, textOpts(), assetsNow());
  if ($("#showFaces").checked && it.faces) {
    ctx.strokeStyle = "#F2C14E"; ctx.lineWidth = Math.max(2, w / 500);
    it.faces.forEach(f => ctx.strokeRect((f.x * prevBmp.width - r.sx) * k, (f.y * prevBmp.height - r.sy) * k, f.w * prevBmp.width * k, f.h * prevBmp.height * k));
  }
  $("#prevMeta").innerHTML = `${S.cur + 1} / ${S.items.length} · ${esc(it.name)}${it.faces ? ` · ${it.faces.length ? it.faces.length + " وجه" : "بلا وجوه — قص من المنتصف"}` : ""}`;
  paintCrop();
}
function drawDemo(cv) {
  const w = 1400, h = Math.round(w / RATIOS[S.ratio].r); cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d"), g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#d9d4cc"); g.addColorStop(1, "#b9b3a8"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.font = `600 ${w * 0.03}px "IBM Plex Sans Arabic"`; ctx.textAlign = "center"; ctx.direction = "rtl";
  ctx.fillText("اختر مجلد الصور لتظهر المعاينة هنا", w / 2, h * 0.42);
  drawFooter(ctx, w, h, S.ratio, textOpts(), assetsNow());
  $("#prevMeta").textContent = "معاينة الحقوق";
}
// ===== تعديل القص: صورة مصغّرة كاملة عليها الإطار + أزرار سريعة + شريط =====
let miniBmp = null, miniFor = -1;
async function paintCrop() {
  const it = S.items[S.cur], bar = $("#cropbar");
  if (!it || !prevBmp || !prevRect) { bar.hidden = true; return; }
  bar.hidden = false;
  const r = prevRect, mv = $("#mini"), W = prevBmp.width, H = prevBmp.height;
  const mw = 520, mh = Math.round(mw * H / W); mv.width = mw; mv.height = mh;
  const c = mv.getContext("2d"); c.drawImage(prevBmp, 0, 0, mw, mh);
  const k = mw / W;
  c.fillStyle = "rgba(20,28,27,.6)";
  c.fillRect(0, 0, mw, r.sy * k); c.fillRect(0, (r.sy + r.sh) * k, mw, mh); c.fillRect(0, r.sy * k, r.sx * k, r.sh * k); c.fillRect((r.sx + r.sw) * k, r.sy * k, mw, r.sh * k);
  c.strokeStyle = "#F2C14E"; c.lineWidth = 3; c.strokeRect(r.sx * k + 1.5, r.sy * k + 1.5, r.sw * k - 3, r.sh * k - 3);
  // خطوط الأثلاث داخل الإطار
  c.strokeStyle = "rgba(255,255,255,.45)"; c.lineWidth = 1; c.beginPath();
  for (const f of [1 / 3, 2 / 3]) { c.moveTo((r.sx + r.sw * f) * k, r.sy * k); c.lineTo((r.sx + r.sw * f) * k, (r.sy + r.sh) * k); c.moveTo(r.sx * k, (r.sy + r.sh * f) * k); c.lineTo((r.sx + r.sw) * k, (r.sy + r.sh * f) * k); }
  c.stroke();
  const manual = it.pos[S.ratio] != null, z = r.z || 1;
  $("#cropHint").textContent = S.cropMode ? "حدد القص على الصورة الكبيرة فوق" : "للتحديد الدقيق اضغط «✂️ حدد القص» أو مفتاح C";
  $("#cropBtns").innerHTML = `<button type="button" data-crop="auto" class="${manual ? "" : "on"}">تلقائي</button><button type="button" data-crop="center">توسيط</button><button type="button" data-crop="all" title="ينسخ نفس الإطار لكل الصور">نفس القص لكل الصور</button>`;
  const rg = $("#cropRange"); rg.hidden = false; rg.min = 20; rg.max = 100; rg.value = Math.round(z * 100);
  $("#cropZoom").textContent = Math.round(z * 100) + "%";
}
// تحويل الإطار الحالي إلى قص يدوي حر {cx, cy, z}
function curBox() { const r = prevRect, W = prevBmp.width, H = prevBmp.height; return { cx: (r.sx + r.sw / 2) / W, cy: (r.sy + r.sh / 2) / H, z: r.z || 1 }; }
function setBox(b) {
  const it = S.items[S.cur]; if (!it) return;
  if (b === "auto") delete it.pos[S.ratio]; else it.pos[S.ratio] = { cx: Math.max(0, Math.min(1, b.cx)), cy: Math.max(0, Math.min(1, b.cy)), z: Math.max(0.2, Math.min(1, b.z)) };
  paintCell(S.cur); previewRAF();
}
(() => {
  const mv = $("#mini"); let drag = null;
  const pt = e => { const p = e.touches ? e.touches[0] : e, b = mv.getBoundingClientRect(); return { x: (p.clientX - b.left) / b.width, y: (p.clientY - b.top) / b.height }; };
  const down = e => {
    if (!prevRect) return; e.preventDefault();
    const p = pt(e), cb = curBox(), W = prevBmp.width, H = prevBmp.height, r = prevRect;
    const inside = p.x * W >= r.sx && p.x * W <= r.sx + r.sw && p.y * H >= r.sy && p.y * H <= r.sy + r.sh;
    // داخل الإطار = سحب، خارجه = نقل المركز لنقطة الضغط
    if (!inside) { setBox({ ...cb, cx: p.x, cy: p.y }); drag = { p, b: { ...cb, cx: p.x, cy: p.y } }; }
    else drag = { p, b: cb };
  };
  const move = e => { if (!drag) return; const p = pt(e); setBox({ ...drag.b, cx: drag.b.cx + (p.x - drag.p.x), cy: drag.b.cy + (p.y - drag.p.y) }); };
  mv.addEventListener("mousedown", down); mv.addEventListener("touchstart", down, { passive: false });
  addEventListener("mousemove", move); addEventListener("touchmove", move, { passive: true });
  addEventListener("mouseup", () => drag = null); addEventListener("touchend", () => drag = null);
  mv.addEventListener("wheel", e => { if (!prevRect) return; e.preventDefault(); const cb = curBox(); setBox({ ...cb, z: cb.z * (e.deltaY > 0 ? 1.05 : 0.95) }); }, { passive: false });
  $("#cropRange").addEventListener("input", e => { if (!prevRect) return; setBox({ ...curBox(), z: +e.target.value / 100 }); });
  $("#cropBtns").addEventListener("click", e => {
    const b = e.target.closest("[data-crop]"); if (!b) return;
    const v = b.dataset.crop;
    if (v === "all") {
      const p = S.items[S.cur].pos[S.ratio];
      S.items.forEach((x, i) => { if (p == null) delete x.pos[S.ratio]; else x.pos[S.ratio] = typeof p === "object" ? { ...p } : p; paintCell(i); });
      toast(p == null ? "رجعت كل الصور للقص التلقائي" : "طُبّق نفس القص على كل الصور"); renderPreview(); return;
    }
    if (v === "auto") return setBox("auto");
    if (v === "center") return setBox({ ...curBox(), cx: 0.5, cy: 0.5 });
  });
  // Shift + الأسهم يحرك، Shift + (+/-) يكبّر ويصغّر
  addEventListener("keydown", e => {
    if (!e.shiftKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || !prevRect) return;
    const cb = curBox(), st = 0.02;
    const m = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
    if (m) { e.preventDefault(); setBox({ ...cb, cx: cb.cx + m[0], cy: cb.cy + m[1] }); }
    if (e.key === "+" || e.key === "=") { e.preventDefault(); setBox({ ...cb, z: cb.z * 0.95 }); }
    if (e.key === "_" || e.key === "-") { e.preventDefault(); setBox({ ...cb, z: cb.z * 1.05 }); }
  });
})();

/* ============ وضع القص على الصورة الكبيرة ============ */
let cropView = null;
function drawCropMode(cv, it, r) {
  const W = prevBmp.width, H = prevBmp.height, maxW = 1400, maxH = 900, k = Math.min(maxW / W, maxH / H, 1.5);
  cv.width = Math.round(W * k); cv.height = Math.round(H * k);
  const c = cv.getContext("2d"); c.imageSmoothingQuality = "high"; c.drawImage(prevBmp, 0, 0, cv.width, cv.height);
  const x = r.sx * k, y = r.sy * k, w = r.sw * k, h = r.sh * k;
  c.fillStyle = "rgba(10,14,13,.62)";
  c.fillRect(0, 0, cv.width, y); c.fillRect(0, y + h, cv.width, cv.height - y - h); c.fillRect(0, y, x, h); c.fillRect(x + w, y, cv.width - x - w, h);
  c.strokeStyle = "#F2C14E"; c.lineWidth = 3; c.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  c.strokeStyle = "rgba(255,255,255,.5)"; c.lineWidth = 1; c.beginPath();
  for (const f of [1 / 3, 2 / 3]) { c.moveTo(x + w * f, y); c.lineTo(x + w * f, y + h); c.moveTo(x, y + h * f); c.lineTo(x + w, y + h * f); }
  c.stroke();
  // مقابض الزوايا
  const hs = Math.max(14, cv.width / 70); c.fillStyle = "#F2C14E";
  for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) c.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
  // معاينة صغيرة للنتيجة النهائية (مع الحقوق) أعلى الإطار
  cropView = { k, x, y, w, h, hs, W, H };
  $("#prevMeta").innerHTML = `✂️ وضع القص — اسحب الإطار لتحريكه، واسحب الزوايا لتكبيره أو تصغيره · المقاس ${S.ratio} ثابت · <button type="button" class="lnk" id="cropDone">تم ✓</button>`;
  $("#cropDone").onclick = () => setCropMode(false);
  cv.style.cursor = "move";
}
function setCropMode(on) { S.cropMode = on; $("#cropModeBtn").classList.toggle("on", on); $("#prevWrap").classList.toggle("cropping", on); renderPreview(); }
(() => {
  const cv = $("#prev"); let drag = null;
  const pt = e => { const p = e.touches ? e.touches[0] : e, b = cv.getBoundingClientRect(); return { x: (p.clientX - b.left) * cv.width / b.width, y: (p.clientY - b.top) * cv.height / b.height }; };
  const base = () => cropRect(prevBmp.width, prevBmp.height, S.ratio, [], { cx: 0.5, cy: 0.5, z: 1 });
  const down = e => {
    if (!S.cropMode || !cropView || !S.items[S.cur]) return; e.preventDefault();
    const p = pt(e), v = cropView, tol = v.hs * 1.2;
    const corners = [[v.x, v.y, v.x + v.w, v.y + v.h], [v.x + v.w, v.y, v.x, v.y + v.h], [v.x, v.y + v.h, v.x + v.w, v.y], [v.x + v.w, v.y + v.h, v.x, v.y]];
    const hit = corners.find(([cx, cy]) => Math.abs(p.x - cx) < tol && Math.abs(p.y - cy) < tol);
    if (hit) { drag = { mode: "size", ax: hit[2], ay: hit[3] }; return; }
    const inside = p.x >= v.x && p.x <= v.x + v.w && p.y >= v.y && p.y <= v.y + v.h;
    if (!inside) { const cb = curBox(); setBox({ ...cb, cx: p.x / v.k / v.W, cy: p.y / v.k / v.H }); }
    drag = { mode: "move", p, b: inside ? curBox() : { ...curBox(), cx: p.x / v.k / v.W, cy: p.y / v.k / v.H } };
  };
  const move = e => {
    if (!drag || !cropView) {
      if (S.cropMode && cropView && !e.touches) { const p = pt(e), v = cropView, tol = v.hs * 1.2; const onC = [[v.x, v.y], [v.x + v.w, v.y + v.h]].some(([a, b]) => Math.abs(p.x - a) < tol && Math.abs(p.y - b) < tol) ? "nwse-resize" : [[v.x + v.w, v.y], [v.x, v.y + v.h]].some(([a, b]) => Math.abs(p.x - a) < tol && Math.abs(p.y - b) < tol) ? "nesw-resize" : "move"; cv.style.cursor = onC; }
      return;
    }
    const p = pt(e), v = cropView;
    if (drag.mode === "move") { const dx = (p.x - drag.p.x) / v.k / v.W, dy = (p.y - drag.p.y) / v.k / v.H; setBox({ ...drag.b, cx: drag.b.cx + dx, cy: drag.b.cy + dy }); return; }
    // تغيير الحجم من زاوية مع تثبيت الزاوية المقابلة والنسبة
    const bw = base().sw * v.k, R = RATIOS[S.ratio].r;
    let w = Math.max(Math.abs(p.x - drag.ax), Math.abs(p.y - drag.ay) * R); w = Math.max(bw * 0.2, Math.min(bw, w));
    const h = w / R, sx = p.x < drag.ax ? -1 : 1, sy = p.y < drag.ay ? -1 : 1;
    const cx = drag.ax + sx * w / 2, cy = drag.ay + sy * h / 2;
    setBox({ cx: cx / v.k / v.W, cy: cy / v.k / v.H, z: w / bw });
  };
  cv.addEventListener("mousedown", down); cv.addEventListener("touchstart", down, { passive: false });
  addEventListener("mousemove", move); addEventListener("touchmove", e => { if (drag) { e.preventDefault(); move(e); } }, { passive: false });
  addEventListener("mouseup", () => drag = null); addEventListener("touchend", () => drag = null);
  cv.addEventListener("wheel", e => { if (!S.cropMode || !prevRect) return; e.preventDefault(); const cb = curBox(); setBox({ ...cb, z: cb.z * (e.deltaY > 0 ? 1.05 : 0.95) }); }, { passive: false });
  cv.addEventListener("dblclick", () => { if (S.cropMode) setCropMode(false); });
  addEventListener("keydown", e => { if (e.key === "Escape" && S.cropMode) setCropMode(false); if ((e.key === "c" || e.key === "ص") && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && S.items.length) setCropMode(!S.cropMode); });
  $("#cropModeBtn").onclick = () => { if (!S.items.length) return toast("اختر الصور أولاً"); setCropMode(!S.cropMode); };
})();

/* ============ الألوان ============ */
// مطابقة المرجع: تصحيح محسوب لكل صورة على حدة (ما لم يكن للصورة تعديل خاص)
const matching = () => !!(F().matchOn && F().ref && F().ref.stats);
const adjOf = it => {
  if (it && it.adj) return it.adj;
  if (matching() && it && it.stats) return { ...matchAdj(it.stats, F().ref.stats), amount: F().adj?.amount ?? 100 };
  return F().adj || ZERO;
};
const curAdj = () => { const it = S.items[S.cur]; return it && it.adj ? it.adj : F().adj; };
function paintAdj() {
  const it = S.items[S.cur], own = !!(it && it.adj), a = curAdj();
  $("#adjScope").innerHTML = `<button type="button" data-scope="all" class="${own ? "" : "on"}">كل الصور</button><button type="button" data-scope="one" class="${own ? "on" : ""}" ${it ? "" : "disabled"}>هذه الصورة فقط</button>`;
  const sl = d => { const v = a[d.k] ?? (d.def || 0);
    const bg = d.hue ? ` style="background:linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);border-radius:9px;height:6px"` : "";
    return `<label class="sl${d.c ? " band" : ""}">${d.c ? `<i style="background:${d.c}"></i>` : ""}<span class="n">${d.l}</span><input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}" data-adj="${d.k}" data-def="${d.def || 0}" title="نقرتان للتصفير"${bg}><input type="number" class="vn" data-adjn="${d.k}" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}" title="اكتب الرقم"></label>`; };
  const grp = g => ADJ.filter(d => d.g === g).map(sl).join("");
  const hslOn = BANDS.some(([k]) => a["h_" + k] || a["s_" + k] || a["l_" + k]), cgOn = ["sh", "mid", "hi"].some(k => a[`cg_${k}_s`]);
  const ht = S.hslTab || "h";
  $("#refBox").innerHTML = refHTML();
  if (matching() && !own) { $("#adjBox").innerHTML = `<div class="amt">${ADJ.filter(d => d.k === "amount").map(sl).join("")}</div><div class="matchNote">🎯 المطابقة مفعّلة: لكل صورة تصحيح محسوب لها لتقترب من المرجع (الأبيض، الميل اللوني، السطوع، التباين، التشبع). «قوة المؤثرات» تخفف المطابقة.</div>`; $("#adjReset").hidden = true; $("#adjTag").textContent = "مطابقة المرجع"; paintPresets(); return; }
  $("#adjBox").innerHTML = `<div class="amt">${grp("amount")}</div>${a.lut ? `<div class="lutTag">🎯 مطابقة ألوان مفعّلة (${a.lut.n}³)</div>` : ""}<h4>الضوء</h4>${grp("الضوء")}<h4>اللون</h4>${grp("اللون")}<h4>التفاصيل</h4>${grp("التفاصيل")}
    <details class="adv" ${S.openHsl ? "open" : ""} data-det="openHsl"><summary>ألوان محددة (HSL)${hslOn ? " <em>●</em>" : ""}</summary>
      <div class="seg mini3">${[["h", "درجة اللون"], ["s", "التشبع"], ["l", "الإضاءة"]].map(([k, l]) => `<button type="button" data-hsl="${k}" class="${ht === k ? "on" : ""}">${l}</button>`).join("")}</div>
      ${grp("hsl-" + ht)}</details>
    <details class="adv" ${S.openCurve ? "open" : ""} data-det="openCurve"><summary>منحنى التون${["pc_sh", "pc_dk", "pc_lt", "pc_hi"].some(k => a[k]) ? " <em>●</em>" : ""}</summary>${grp("curve")}</details>
    <details class="adv" ${S.openCg ? "open" : ""} data-det="openCg"><summary>تدرج الألوان (ظلال / وسط / إضاءات)${cgOn ? " <em>●</em>" : ""}</summary>${grp("grade")}</details>`;
  $("#adjReset").hidden = isZero(a);
  $("#adjTag").textContent = own ? "تعديل خاص بهذه الصورة" : (F().preset && lrFind(F().preset) ? "Lightroom: " + lrFind(F().preset).name : (isZero(F().adj) ? "بدون تعديل" : "تعديل على كل الصور"));
  paintPresets();
}
const fmtAdj = (d, v) => d.k === "exposure" ? (v > 0 ? "+" : "") + (+v).toFixed(2) : d.hue ? v + "°" : d.min === 0 ? String(v) : (v > 0 ? "+" : "") + v;
function setAdjVal(k, v) {
  const d = ADJ.find(x => x.k === k), it = S.items[S.cur];
  if (!d || isNaN(v)) return;
  v = Math.max(d.min, Math.min(d.max, v));
  if (it && it.adj) it.adj = { ...it.adj, [k]: v }; else { F().adj = { ...F().adj, [k]: v }; F().preset = ""; saveSoon(); }
  const rg = document.querySelector(`[data-adj="${k}"]`), nb = document.querySelector(`[data-adjn="${k}"]`);
  if (rg && +rg.value !== v) rg.value = v;
  if (nb && document.activeElement !== nb) nb.value = v;
  $("#adjReset").hidden = isZero(curAdj());
  previewRAF();
}
document.addEventListener("input", e => {
  const r = e.target.closest("[data-adj]"); if (r) return setAdjVal(r.dataset.adj, +r.value);
  const n = e.target.closest("[data-adjn]"); if (n && n.value !== "" && n.value !== "-") setAdjVal(n.dataset.adjn, +n.value);
});
document.addEventListener("change", e => { const n = e.target.closest("[data-adjn]"); if (n) { const d = ADJ.find(x => x.k === n.dataset.adjn); const v = +n.value; n.value = isNaN(v) ? (d.def || 0) : Math.max(d.min, Math.min(d.max, v)); setAdjVal(n.dataset.adjn, +n.value); } });
document.addEventListener("dblclick", e => { const r = e.target.closest("[data-adj]"); if (!r) return; r.value = r.dataset.def || 0; r.dispatchEvent(new Event("input", { bubbles: true })); });
document.addEventListener("click", e => {
  const hb = e.target.closest("[data-hsl]"); if (hb) { S.hslTab = hb.dataset.hsl; paintAdj(); return; }
  const sc = e.target.closest("[data-scope]"); if (sc) {
    const it = S.items[S.cur]; if (!it) return;
    if (sc.dataset.scope === "one" && !it.adj) it.adj = { ...F().adj };
    if (sc.dataset.scope === "all") delete it.adj;
    paintCell(S.cur); paintAdj(); renderPreview(); return;
  }
});
$("#adjReset").onclick = () => { const it = S.items[S.cur]; if (it && it.adj) it.adj = { ...ZERO }; else { F().adj = { ...ZERO }; F().preset = ""; saveSoon(); } paintAdj(); renderPreview(); };
$("#adjApplyAll").onclick = () => { const a = { ...curAdj() }; F().adj = a; S.items.forEach((it, i) => { delete it.adj; paintCell(i); }); saveSoon(); paintAdj(); renderPreview(); toast("طُبّق التعديل على كل الصور"); };
let rafP = 0; function previewRAF() { if (rafP) return; rafP = requestAnimationFrame(() => { rafP = 0; renderPreview(); }); }
// قبل / بعد: ضغطة مطولة على الزر أو مفتاح \
(() => {
  const b = $("#beforeBtn"), on = v => { if (S.before === v) return; S.before = v; b.classList.toggle("on", v); renderPreview(); };
  b.addEventListener("mousedown", () => on(true)); b.addEventListener("touchstart", e => { e.preventDefault(); on(true); }, { passive: false });
  addEventListener("mouseup", () => on(false)); addEventListener("touchend", () => on(false));
  addEventListener("keydown", e => { if (e.key === "\\" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) on(true); });
  addEventListener("keyup", e => { if (e.key === "\\") on(false); });
})();
function paintHist(id) {
  const cv = $("#hist"), c = cv.getContext("2d"), H = histogram(id), W = cv.width, Ht = cv.height;
  c.clearRect(0, 0, W, Ht);
  const mx = Math.max(1, ...H.l, ...H.r, ...H.g, ...H.b) * 1.05;
  c.globalCompositeOperation = "lighter";
  for (const [k, col] of [["r", "rgba(220,70,70,.55)"], ["g", "rgba(70,190,90,.55)"], ["b", "rgba(70,110,230,.55)"]]) {
    c.fillStyle = col; c.beginPath(); c.moveTo(0, Ht);
    H[k].forEach((v, i) => c.lineTo(i / 63 * W, Ht - v / mx * Ht)); c.lineTo(W, Ht); c.fill();
  }
  c.globalCompositeOperation = "source-over";
  const clipL = H.l[0] / (H.l.reduce((a, b) => a + b, 0) || 1), clipH = H.l[63] / (H.l.reduce((a, b) => a + b, 0) || 1);
  $("#clipL").classList.toggle("on", clipL > 0.01); $("#clipH").classList.toggle("on", clipH > 0.01);
}
// البريستات: ملفات JSON في «مجلد المنظومة/بريستات» (أو في هذا المتصفح إن لم يُختر المجلد)
// مقترحات Lightroom الجاهزة (بريستات Adobe الرسمية التي تعتمد على الأشرطة الأساسية) — assets/lr-presets.json
let LR = [];
document.addEventListener("toggle", e => { const d = e.target.closest && e.target.closest("[data-det]"); if (d) S[d.dataset.det] = d.open; }, true);
async function loadPresets() {
  try { LR = await (await fetch("./assets/lr-presets.json")).json(); } catch (e) { LR = []; }
  paintPresets();
}
const lrFind = key => { const [g, i] = String(key).split(":").map(Number); return LR[g] && LR[g].items[i]; };
function paintPresets() {
  const sel = $("#lrSel"); if (!sel) return;
  sel.innerHTML = `<option value="">— بدون —</option>` + LR.map((g, gi) => `<optgroup label="${esc(g.group)}">` + g.items.map((it, i) => `<option value="${gi}:${i}" ${F().preset === gi + ":" + i ? "selected" : ""}>${esc(it.name)}</option>`).join("") + `</optgroup>`).join("");
}
function applyLR(key) {
  const p = key ? lrFind(key) : null, it = S.items[S.cur];
  const a = { ...ZERO, ...(p ? p.adj : {}), amount: (it && it.adj ? it.adj.amount : F().adj?.amount) ?? 100 };
  if (it && it.adj) it.adj = a; else { F().adj = a; F().preset = key || ""; if (F().matchOn) { F().matchOn = false; toast("أُوقفت مطابقة المرجع لتطبيق المقترح"); } saveSoon(); }
  paintAdj(); renderPreview();
}
function pickFile(accept) { return new Promise(res => { const i = document.createElement("input"); i.type = "file"; i.accept = accept; i.onchange = () => res(i.files[0] || null); i.click(); }); }
(() => {
  const sel = $("#lrSel"); if (!sel) return;
  sel.onchange = e => applyLR(e.target.value);
  // التنقل بين المقترحات بالأسهم مع المعاينة الفورية
  $("#lrPrev").onclick = () => { if (sel.selectedIndex > 0) { sel.selectedIndex--; applyLR(sel.value); } };
  $("#lrNext").onclick = () => { if (sel.selectedIndex < sel.options.length - 1) { sel.selectedIndex++; applyLR(sel.value); } };
})();

/* ============ مطابقة صورة مرجعية ============ */
function refHTML() {
  const r = F().ref;
  const looksBtn = `<button type="button" class="ghost sm" data-ref="looks" title="من الصورة المعروضة حالياً">✨ ثلاث معاينات من صورة التغطية</button>`;
  if (!r) return `<div class="refBtns">${looksBtn}<button type="button" class="ghost sm" data-ref="pick">🎯 صورة مرجعية من خارج التغطية</button></div><small class="muted">لتوحيد ألوان كل الصور — اختياري</small>`;
  return `<div class="refRow"><img src="${r.thumb}" alt=""><div><b>${esc(r.name)}</b><small>${r.stats.face ? "فيها وجوه — السطوع يُطابق من البشرة" : "بدون وجوه — السطوع يُطابق من المساحات الفاتحة"}</small>
    <div class="refActs"><label class="chk"><input type="checkbox" data-ref="on" ${F().matchOn ? "checked" : ""}> مطابقة كل الصور</label>
    <button type="button" class="lnk" data-ref="cmp">قارن قبل/بعد</button><button type="button" class="lnk" data-ref="looks">✨ معاينات</button><button type="button" class="lnk" data-ref="pick">مرجع آخر</button><button type="button" class="lnk" data-ref="del">إزالة</button></div></div></div>`;
}
async function pickRef() {
  const f = await pickFile("image/*"); if (!f) return;
  try {
    await getDetector();
    const b = await createImageBitmap(f, { imageOrientation: "from-image", resizeWidth: 1280, resizeQuality: "high" });
    const c = new OffscreenCanvas(b.width, b.height); c.getContext("2d").drawImage(b, 0, 0); b.close();
    // المرجع غالباً عليه حقوق: نتجاهل الوجوه داخل منطقة التذييل والشعارات
    const faces = detectFaces(c).filter(x => x.y > 0.12 && x.y + x.h < 0.68);
    const stats = imageStats(c.getContext("2d").getImageData(0, 0, c.width, c.height), faces, { skipRights: true });
    const t = new OffscreenCanvas(240, Math.round(240 * c.height / c.width)); t.getContext("2d").drawImage(c, 0, 0, t.width, t.height);
    const thumb = await new Promise(res => { const fr = new FileReader(); t.convertToBlob({ type: "image/jpeg", quality: 0.8 }).then(bl => { fr.onload = () => res(fr.result); fr.readAsDataURL(bl); }); });
    F().ref = { name: f.name, stats, thumb }; F().matchOn = false; saveSoon(); paintAdj();
    if (S.items.length) compareMatch(); else toast("اختر صور الفعالية، ثم «قارن قبل/بعد»");
  } catch (e) { toast("تعذّرت قراءة المرجع: " + (e.message || e)); }
}
// تجربة على 3–5 صور مختلفة قبل التعميم
let pendingRef = null;
async function compareMatch(refObj) {
  const R = refObj || F().ref; pendingRef = R;
  const its = S.items.filter(x => x.stats && x.thumb); if (!its.length) return toast("انتظر حتى ينتهي تحليل الصور");
  const n = Math.min(5, its.length), pick = Array.from({ length: n }, (_, i) => its[Math.round(i * (its.length - 1) / Math.max(1, n - 1))]);
  const rows = [];
  for (const it of pick) {
    const img = new Image(); img.src = it.thumb; await img.decode();
    const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight), x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const id = x.getImageData(0, 0, c.width, c.height); applyAdjust(id, { ...matchAdj(it.stats, R.stats), amount: F().adj?.amount ?? 100 }); x.putImageData(id, 0, 0);
    const after = URL.createObjectURL(await c.convertToBlob({ type: "image/jpeg", quality: 0.85 }));
    rows.push(`<div class="cmpRow"><figure><img src="${it.thumb}"><figcaption>قبل</figcaption></figure><figure><img src="${after}"><figcaption>بعد</figcaption></figure></div>`);
  }
  const d = $("#cmpDlg");
  d.innerHTML = `<div class="cmpHead"><b>تجربة المطابقة على ${n} صور</b><figure class="refFig"><img src="${R.thumb}"><figcaption>${R.look ? "المظهر المختار" : "المرجع"}</figcaption></figure></div><div class="cmpBody">${rows.join("")}</div>
    <div class="acts2"><button type="button" class="pri" data-cmp="ok">✓ اعتماد — مطابقة كل الصور</button><button type="button" class="ghost" data-cmp="x">إلغاء — بدون تطبيق</button></div>`;
  d.showModal();
}
document.addEventListener("click", e => {
  const r = e.target.closest("[data-ref]"); if (r && r.tagName !== "INPUT") {
    const v = r.dataset.ref;
    if (v === "pick") pickRef(); else if (v === "cmp") compareMatch(); else if (v === "looks") openLooks();
    else if (v === "del") { F().ref = null; F().matchOn = false; saveSoon(); paintAdj(); renderPreview(); }
    return;
  }
  const c = e.target.closest("[data-cmp]"); if (c) {
    $("#cmpDlg").close();
    if (c.dataset.cmp === "ok") { if (pendingRef) F().ref = pendingRef; F().matchOn = true; F().preset = ""; saveSoon(); paintAdj(); renderPreview(); toast("المطابقة مفعّلة — يُحسب التصحيح لكل صورة عند المعاينة والتصدير"); }
  }
});
document.addEventListener("change", e => { const r = e.target.closest('[data-ref="on"]'); if (!r) return; F().matchOn = r.checked; saveSoon(); paintAdj(); renderPreview(); });

/* ============ ثلاث معاينات من صورة ممثلة للتغطية ============ */
let lookPick = null, lookData = null;
async function openLooks() {
  const it = S.items[S.cur];
  if (!it) return toast("اختر صور التغطية أولاً");
  if (!it.stats) return toast("انتظر حتى ينتهي تحليل هذه الصورة");
  const d = $("#lookDlg");
  d.innerHTML = `<div class="cmpHead"><b>اختر المظهر من الصورة: ${esc(it.name)}</b><small class="muted">جارٍ تجهيز المعاينات…</small></div>`; d.showModal();
  try {
    const f = await getFile(it);
    const b = await createImageBitmap(f, { imageOrientation: "from-image", resizeWidth: 1100, resizeQuality: "high" });
    const c = new OffscreenCanvas(b.width, b.height), x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(b, 0, 0); b.close();
    const base = x.getImageData(0, 0, c.width, c.height);
    const toUrl = async id => { const cc = new OffscreenCanvas(id.width, id.height); cc.getContext("2d").putImageData(id, 0, 0); return URL.createObjectURL(await cc.convertToBlob({ type: "image/jpeg", quality: 0.9 })); };
    const tiles = [{ k: "orig", label: "الأصل", url: await toUrl(base) }];
    lookData = {};
    for (const k of Object.keys(LOOKS)) {
      const ref = lookRef(it.stats, k), id = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
      applyAdjust(id, matchAdj(it.stats, ref));
      const url = await toUrl(id); lookData[k] = { ref, url };
      tiles.push({ k, label: LOOKS[k].label, url });
    }
    lookPick = lookPick && lookData[lookPick] ? lookPick : "neutral";
    const paint = () => {
      d.innerHTML = `<div class="cmpHead"><b>اختر المظهر الأقرب لذوقك</b><small class="muted">من الصورة نفسها: ${esc(it.name)} — اضغط على معاينة لاختيارها</small></div>
        <div class="lookGrid">${tiles.map(t => `<figure class="lk${t.k === lookPick ? " on" : ""}${t.k === "orig" ? " orig" : ""}" data-look="${t.k}"><img src="${t.url}"><figcaption>${t.label}${t.k === lookPick ? " ✓" : ""}</figcaption></figure>`).join("")}</div>
        <div class="acts2"><button type="button" class="pri" data-lk="next">التالي — جرّبه على صور أخرى</button><button type="button" class="ghost" data-lk="x">إلغاء</button></div>`;
    };
    paint();
    d.onclick = async e => {
      const t = e.target.closest("[data-look]"); if (t && t.dataset.look !== "orig") { lookPick = t.dataset.look; paint(); return; }
      const a = e.target.closest("[data-lk]"); if (!a) return;
      if (a.dataset.lk === "x") { d.close(); return; }
      // المعاينة المختارة تصبح مرجعاً: صورة مصغّرة + إحصاءات الهدف
      const L = lookData[lookPick], img = new Image(); img.src = L.url; await img.decode();
      const tc = new OffscreenCanvas(240, Math.round(240 * img.naturalHeight / img.naturalWidth)); tc.getContext("2d").drawImage(img, 0, 0, tc.width, tc.height);
      const thumb = await new Promise(res => { const fr = new FileReader(); tc.convertToBlob({ type: "image/jpeg", quality: 0.8 }).then(bl => { fr.onload = () => res(fr.result); fr.readAsDataURL(bl); }); });
      d.close();
      compareMatch({ name: `${LOOKS[lookPick].label} — من ${it.name}`, stats: L.ref, thumb, look: lookPick });
    };
  } catch (e) { d.close(); toast("تعذّر تجهيز المعاينات: " + (e.message || e)); }
}

/* ============ معاينة بصفحة كاملة ============ */
$("#fullBtn").onclick = async () => {
  const it = S.items[S.cur]; if (!it) return toast("اختر الصور أولاً");
  const win = window.open("", "_blank"); if (!win) return toast("اسمح للنوافذ المنبثقة لهذه الصفحة");
  win.document.write(`<title>معاينة…</title><body style="margin:0;background:#111;color:#ccc;font:16px system-ui;display:grid;place-items:center;height:100vh" dir="rtl">جارٍ تجهيز المعاينة بدقة عالية…</body>`);
  try {
    const w = await makeWorker(), file = await getFile(it), q = { maxEdge: 3200, quality: 92, chroma444: true };
    const run = (adj, rights) => new Promise((res, rej) => { w.onmessage = e => e.data.type === "done" ? res(e.data) : rej(new Error(e.data.error)); w.postMessage({ type: "job", id: 0, file, faces: it.faces || [], pos: it.pos, adj, ratios: [S.ratio], plain: !rights, rights, q, text: textOpts(), meta: {} }); });
    const rights = $("#showRights").checked;
    const after = await run(adjOf(it), rights), before = await run(ZERO, rights);
    w.terminate();
    const u1 = URL.createObjectURL(new Blob([after.outs[0].buf], { type: "image/jpeg" })), u0 = URL.createObjectURL(new Blob([before.outs[0].buf], { type: "image/jpeg" }));
    const name = esc(it.name), tag = esc(F().preset || (isZero(adjOf(it)) ? "بدون تعديل" : "تعديل يدوي"));
    win.document.open();
    win.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${name} — معاينة</title><style>
      html,body{margin:0;height:100%;background:#0E1413;overflow:hidden;font-family:system-ui,"IBM Plex Sans Arabic",sans-serif}
      img{position:fixed;inset:0;width:100%;height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none}
      #b{opacity:0}body.cmp #b{opacity:1}
      .bar{position:fixed;top:12px;right:12px;left:12px;display:flex;gap:8px;align-items:center;justify-content:space-between;pointer-events:none}
      .bar span{background:rgba(0,0,0,.55);color:#fff;border-radius:999px;padding:6px 14px;font-size:13px;backdrop-filter:blur(6px)}
      .bar b{color:#F2C14E}body.cmp .st{background:#B3453F}</style></head>
      <body><img id="a" src="${u1}" alt=""><img id="b" src="${u0}" alt="">
      <div class="bar"><span class="st">${name} · ${S.ratio} · <b>${tag}</b> <span class="w">— بعد</span></span><span>اضغط مطولاً على الصورة أو مسافة = قبل · F = ملء الشاشة</span></div>
      <script>
        const b=document.body,w=document.querySelector('.w'),on=v=>{b.classList.toggle('cmp',v);w.textContent=v?'— قبل':'— بعد'};
        addEventListener('mousedown',()=>on(true));addEventListener('mouseup',()=>on(false));
        addEventListener('touchstart',()=>on(true));addEventListener('touchend',()=>on(false));
        addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();on(true)}if(e.key==='f'||e.key==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}});
        addEventListener('keyup',e=>{if(e.code==='Space')on(false)});
      <\/script></body></html>`);
    win.document.close();
  } catch (e) { try { win.document.body.textContent = "تعذّر تجهيز المعاينة: " + (e.message || e); } catch (x) {} }
};

/* ============ النموذج ============ */
function paintForm() {
  const f = F();
  $("#title").value = f.title; $("#date").value = f.date; $("#hijri").value = f.hijri || hijriOf(f.date); $("#hijri").placeholder = hijriOf(f.date);
  $("#photographer").value = f.photographer; $("#noCredit").checked = !!f.noCredit; $("#photographer").disabled = !!f.noCredit; $("#short").value = f.short; $("#pattern").value = f.pattern;
  $("#photogList").innerHTML = (f.photographers || []).map(n => `<option value="${esc(n)}">`).join("");
  $$("[name=ratio]").forEach(c => c.checked = f.ratios.includes(c.value));
  $("#plain").checked = f.plain; $("#rights").checked = f.rights;
  $("#hq").checked = !!f.hq;
  $("#quality").value = f.quality; $("#customEdge").value = f.customEdge; $("#customQ").value = f.customQ;
  $("#customBox").hidden = f.quality !== "custom";
  paintLogos(); paintName(); paintTitleState();
}
function paintTitleState() {
  const el = $("#titleState"), t = (F().title || "").trim();
  if (!t) { el.className = "tstate"; el.textContent = ""; return; }
  const c = titleCheck(t), n = t.replace(/\s+/g, " ").length;
  if (c.ok && c.scale > 0.99) { el.className = "tstate ok"; el.textContent = `✓ يتسع لسطرين · ${n} حرف`; }
  else if (c.ok) { el.className = "tstate warn"; el.textContent = `يتسع لسطرين بتصغير الخط ${Math.round(c.scale * 100)}% · ${n} حرف — الأفضل اختصاره قليلاً`; }
  else { el.className = "tstate bad"; el.textContent = `✕ أطول من سطرين · ${n} حرف — اختصر العنوان حتى يتسع`; }
}
function paintName() {
  $("#nameEx").textContent = fileName(0, S.items[0] ? S.items[0].name : "DSC0001.jpg");
}
function fileName(i, orig) {
  const f = F(), base = (orig || "").replace(/\.[^.]+$/, "");
  const clean = s => String(s || "").trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-");
  let n = (f.pattern || defaults.pattern).replace(/\{اسم\}/g, clean(f.short || "فعالية")).replace(/\{تاريخ\}/g, f.date || "").replace(/\{رقم\}/g, String(i + 1).padStart(3, "0")).replace(/\{الأصل\}/g, clean(base));
  n = n.replace(/[\\/:*?"<>|]+/g, "").replace(/^[-_.\s]+|[-_.\s]+$/g, "") || String(i + 1).padStart(3, "0");
  return n + ".jpg";
}
document.addEventListener("input", e => {
  const r = e.target.closest("[data-lsz]"); if (!r) return;
  F().logoFill = Object.assign({}, F().logoFill, { [r.dataset.lsz]: +r.value / 100 });
  r.nextElementSibling.textContent = r.value + "%"; saveSoon(); renderPreviewSoon();
});
const bind = (sel, key, ev = "input", fn) => $(sel).addEventListener(ev, e => { F()[key] = e.target.value; fn && fn(); saveSoon(); renderPreviewSoon(); });
let rpT; const renderPreviewSoon = () => { clearTimeout(rpT); rpT = setTimeout(renderPreview, 120); };
bind("#title", "title", "input", paintTitleState);
bind("#date", "date", "change", () => { F().hijri = ""; $("#hijri").value = hijriOf(F().date); $("#hijri").placeholder = hijriOf(F().date); paintName(); });
bind("#hijri", "hijri");
bind("#photographer", "photographer");
$("#noCredit").onchange = e => { F().noCredit = e.target.checked; $("#photographer").disabled = e.target.checked; saveSoon(); renderPreview(); };
$("#photographer").addEventListener("change", () => { const n = F().photographer.trim(); if (n && !F().photographers.includes(n)) { F().photographers.push(n); paintForm(); saveSoon(); } });
bind("#short", "short", "input", paintName);
bind("#pattern", "pattern", "input", paintName);
$$("[name=ratio]").forEach(c => c.onchange = () => { F().ratios = $$("[name=ratio]").filter(x => x.checked).map(x => x.value); saveSoon(); });
$("#plain").onchange = e => { F().plain = e.target.checked; saveSoon(); };
$("#rights").onchange = e => { F().rights = e.target.checked; saveSoon(); };
$("#hq").onchange = e => { F().hq = e.target.checked; saveSoon(); };
$("#quality").onchange = e => { F().quality = e.target.value; $("#customBox").hidden = e.target.value !== "custom"; saveSoon(); };
$("#customEdge").oninput = e => { F().customEdge = +e.target.value || 2000; saveSoon(); };
$("#customQ").oninput = e => { F().customQ = Math.max(40, Math.min(98, +e.target.value || 85)); saveSoon(); };
$("#showRights").onchange = renderPreview; $("#showFaces").onchange = renderPreview;

document.addEventListener("click", e => {
  const lg = e.target.closest("[data-logo]");
  if (lg) {
    const n = lg.dataset.logo;
    if (lg.dataset.kind === "p") { const P = F().partners; F().partners = P.includes(n) ? P.filter(x => x !== n) : [...P, n]; }
    else F().event = n;
    paintLogos(); saveSoon(); renderPreview(); return;
  }
  if (e.target.closest("[data-add]")) return addLogo();
  const r = e.target.closest("[data-ratio]"); if (r) { S.ratio = r.dataset.ratio; renderPreview(); return; }
  const c = e.target.closest(".cell"); if (c) { go(+c.dataset.i); return; }
});
function go(i) {
  if (!S.items.length) return;
  const old = S.cur; S.cur = (i + S.items.length) % S.items.length; paintCell(old); paintCell(S.cur); paintAdj(); renderPreview();
}
$("#prevNext").onclick = () => go(S.cur + 1); $("#prevPrev").onclick = () => go(S.cur - 1);
addEventListener("keydown", e => { if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; if (e.key === "ArrowLeft") go(S.cur + 1); if (e.key === "ArrowRight") go(S.cur - 1); });
$("#srcBtn").onclick = pickSrc;
$("#srcBtn2").onclick = pickSrc;

/* ============ التصدير ============ */
let pool = [];
async function makeWorker() {
  const base = assetsNow(), fonts = S.fontBufs;
  const w = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  const copy = async b => b ? createImageBitmap(b) : null;
  const assets = { mark: await copy(base.mark), founding: await copy(base.founding), event: await copy(base.event), partners: await Promise.all(base.partners.map(copy)), partnerFills: base.partnerFills, eventFill: base.eventFill };
  const tr = [assets.mark, assets.founding, assets.event, ...assets.partners].filter(Boolean);
  const ready = new Promise((res, rej) => { w.onmessage = e => e.data.type === "ready" ? (e.data.fontsOK || !F().rights ? res() : rej(new Error("FONT"))) : rej(new Error(e.data.error)); w.onerror = ev => rej(new Error(ev.message || "worker")); });
  w.postMessage({ type: "setup", fonts: fonts ? { M: fonts.M.slice(0), R: fonts.R.slice(0) } : null, assets }, tr);
  await ready;
  return w;
}
async function makePool() {
  // عدد المعالجات المتوازية حسب أنوية الجهاز وذاكرته (الدقة الأصلية تحتاج ذاكرة أكثر)
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8, full = F().quality === "orig";
  const n = Math.max(1, Math.min(cores - 1, full ? (mem >= 8 ? 4 : 2) : (mem >= 8 ? 6 : 3)));
  pool = await Promise.all(Array.from({ length: n }, makeWorker));
}
function killPool() { pool.forEach(w => w.terminate()); pool = []; }

async function exportAll() {
  const f = F();
  if (!S.items.length) return toast("اختر مجلد الصور أولاً");
  if (!f.ratios.length) return toast("اختر مقاساً واحداً على الأقل");
  if (!f.plain && !f.rights) return toast("اختر نسخة واحدة على الأقل: بدون حقوق أو مع حقوق");
  if (f.rights && !S.fontSrc) return toast("خط DIN Next غير موجود — أضفه أولاً");
  if (f.rights && !f.title.trim()) { $("#title").focus(); return toast("اكتب عنوان الفعالية"); }
  if (f.rights && !titleCheck(f.title.trim()).ok) { $("#title").focus(); return toast("العنوان أطول من سطرين — اختصره"); }
  const q = { ...(f.quality === "custom" ? { maxEdge: +f.customEdge || 2000, quality: +f.customQ || 85, chroma444: false } : QUALITY[f.quality]), fast: !f.hq };
  if (f.photographer && !f.photographers.includes(f.photographer)) f.photographers.push(f.photographer);
  await saveSettings();

  // وجهة الحفظ
  let out = null, zip = null, resume = false;
  const folderName = `${S.srcName}_معالجة`;
  if (S.src) {
    if (!(await ensurePerm(S.src))) return toast("لم يُسمح بالكتابة في المجلد");
    let exists = false; try { await S.src.getDirectoryHandle(folderName); exists = true; } catch (e) {}
    let name = folderName;
    if (exists) {
      const ch = await ask(`يوجد مجلد «${folderName}» من تصدير سابق.`, [["resume", "استئناف — تخطَّ الصور المصدّرة"], ["new", "تصدير نسخة جديدة"], ["cancel", "إلغاء"]]);
      if (ch === "cancel" || !ch) return;
      if (ch === "resume") resume = true;
      else { let k = 2; while (true) { try { await S.src.getDirectoryHandle(`${folderName} ${k}`); k++; } catch (e) { break; } } name = `${folderName} ${k}`; }
    }
    out = await S.src.getDirectoryHandle(name, { create: true });
  } else zip = [];
  // في وضع الملف المضغوط: يُنزَّل على أجزاء (كل ~350MB) حتى لا تمتلئ الذاكرة
  let zipBytes = 0, zipPart = 0;
  const flushZip = async (last) => {
    if (!zip || (!zip.length && !last)) return;
    const { downloadZip } = await import("./vendor/client-zip/index.js");
    zipPart++;
    const blob = await downloadZip(zip).blob();
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = last && zipPart === 1 ? `${folderName}.zip` : `${folderName} - جزء ${zipPart}.zip`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 120000);
    zip.length = 0; zipBytes = 0;
  };

  const project = { version: 1, createdAt: new Date().toISOString(), source: S.srcName, settings: { ...f, photographers: undefined }, quality: q, items: S.items.map((it, i) => ({ name: it.name, out: fileName(i, it.name), faces: it.faces, pos: it.pos, adj: it.adj || null })) };
  if (out) await writeFile(out, "مشروع.json", JSON.stringify(project, null, 2));

  S.running = true; document.body.classList.add("running");
  $("#exportBtn").disabled = true; $("#stopBtn").hidden = false;
  const log = [], t0 = Date.now(); let done = 0, failed = 0, skipped = 0, stop = false;
  $("#stopBtn").onclick = () => { stop = true; $("#stopBtn").textContent = "يتوقف بعد الصور الجارية…"; };
  const dirs = {};
  const dirFor = async (kind, ratio) => {
    const k = kind + ratio; if (dirs[k]) return dirs[k];
    const a = await out.getDirectoryHandle(kind === "rights" ? "مع_حقوق" : "بدون_حقوق", { create: true });
    return (dirs[k] = f.ratios.length > 1 ? await a.getDirectoryHandle(RATIOS[ratio].key, { create: true }) : a);
  };
  const exists = async (dir, name) => { try { await dir.getFileHandle(name); return true; } catch (e) { return false; } };
  const freeName = async (dir, name) => { if (!(await exists(dir, name))) return name; const b = name.replace(/\.jpg$/, ""); let k = 2; while (await exists(dir, `${b}-${k}.jpg`)) k++; return `${b}-${k}.jpg`; };

  const pg = f.noCredit ? "" : f.photographer;
  const meta = { photographer: pg, rights: `© ${ORG}${pg ? " — تصوير: " + pg : ""}`, org: ORG, title: f.title.replace(/\s*\n\s*/g, " "), date: f.date };
  const text = textOpts();
  try {
    progress(0, S.items.length, t0, "تجهيز المعالجة…");
    await makePool();
    let next = 0;
    const runWorker = async w => {
      while (!stop) {
        const i = next++; if (i >= S.items.length) return;
        const it = S.items[i], name = fileName(i, it.name);
        try {
          if (resume && out) {
            let all = true;
            for (const r of f.ratios) for (const k of [f.plain && "plain", f.rights && "rights"].filter(Boolean)) if (!(await exists(await dirFor(k, r), name))) all = false;
            if (all) { it.status = "skip"; skipped++; paintCell(i); progress(done + failed + skipped, S.items.length, t0); continue; }
          }
          it.status = "run"; paintCell(i);
          const file = await getFile(it);
          const res = await new Promise((res, rej) => {
            w.onmessage = e => e.data.type === "done" ? res(e.data) : rej(new Error(e.data.error));
            w.onerror = ev => rej(new Error(ev.message || "worker"));
            w.postMessage({ type: "job", id: i, file, faces: it.faces || [], pos: it.pos, adj: adjOf(it), ratios: f.ratios, plain: f.plain, rights: f.rights, q, text, meta });
          });
          for (const o of res.outs) {
            const blob = new Blob([o.buf], { type: "image/jpeg" });
            if (out) { const d = await dirFor(o.kind, o.ratio); await writeFile(d, resume ? name : await freeName(d, name), blob); }
            else zip.push({ name: `${folderName}/${o.kind === "rights" ? "مع_حقوق" : "بدون_حقوق"}/${f.ratios.length > 1 ? RATIOS[o.ratio].key + "/" : ""}${name}`, input: blob, lastModified: new Date() });
            if (zip) { zipBytes += blob.size; }
          }
          if (zip && zipBytes > 350e6) await flushZip(false);
          if (window.__zp && res.T) console.log("TIMING " + JSON.stringify(Object.fromEntries(Object.entries(res.T).map(([k, v]) => [k, Math.round(v)]))));
          it.status = "done"; done++;
          log.push(`✓ ${it.name} → ${name} (${res.W}×${res.H})`);
        } catch (err) {
          it.status = "fail"; failed++; log.push(`✕ ${it.name}: ${err.message || err}`);
          // عامل تعطّل؟ نستبدله ونكمل
          if (/memory|worker|Aborted|RuntimeError/i.test(String(err.message))) { try { w.terminate(); } catch (e) {} const k = pool.indexOf(w); w = await makeWorker(); if (k > -1) pool[k] = w; }
        }
        paintCell(i); progress(done + failed + skipped, S.items.length, t0);
      }
    };
    await Promise.all(pool.map(w => runWorker(w)));
  } catch (err) {
    if (err.message === "FONT") { log.push("✕ لم يصل خط DIN Next إلى معالج التصدير"); await ask("خط DIN Next لم يصل لمعالج التصدير على هذا الجهاز، فتوقف التصدير حتى لا تطلع الحقوق بخط مختلف. اضغط «انسخه لمجلد المنظومة» تحت بيانات الحقوق (أو أضف ملفي Medium و Regular) ثم صدّر من جديد.", [["ok", "حسناً"]]); }
    else { log.push("✕ خطأ عام: " + (err.message || err)); toast("حدث خطأ: " + (err.message || err)); }
  } finally { killPool(); }

  const secs = Math.round((Date.now() - t0) / 1000);
  const report = [
    `تقرير معالجة الصور — بوابة زارة`, `التاريخ: ${new Date().toLocaleString("ar-SA-u-nu-latn")}`, `المجلد: ${S.srcName}`, ``,
    `العنوان: ${f.title}`, `التاريخ: ${text.hijri}   ${text.greg}`, `المصوّر: ${f.photographer || "—"}`,
    `المقاسات: ${f.ratios.join("، ")}`, `النسخ: ${[f.plain && "بدون حقوق", f.rights && "مع حقوق"].filter(Boolean).join("، ")}`,
    `الجودة: ${f.quality === "custom" ? `مخصص ${q.maxEdge}px / ${q.quality}` : QUALITY[f.quality].label}`, ``,
    `عدد الصور: ${S.items.length} · نجحت: ${done} · تُخطّيت (مصدّرة سابقاً): ${skipped} · فشلت: ${failed}${stop ? " · أُوقفت يدوياً" : ""}`,
    `المدة: ${Math.floor(secs / 60)} د ${secs % 60} ث`, ``,
    `ملاحظات: تُحوَّل الألوان إلى sRGB تلقائياً، وتُحذف بيانات الموقع (GPS) وكل البيانات الوصفية الأصلية، وتُضاف بيانات الحقوق (XMP). الأصل لم يُعدَّل.`, ``,
    ...log
  ].join("\n");
  try {
    if (out) { await writeFile(out, "تقرير.txt", report); }
    else {
      zip.push({ name: `${folderName}/تقرير.txt`, input: report }, { name: `${folderName}/مشروع.json`, input: JSON.stringify(project, null, 2) });
      await flushZip(true);
    }
  } catch (e) { toast("تعذّر كتابة التقرير"); }

  S.running = false; document.body.classList.remove("running");
  $("#exportBtn").disabled = false; $("#stopBtn").hidden = true; $("#stopBtn").textContent = "إيقاف";
  progress(S.items.length, S.items.length, t0, `${failed ? "⚠" : "✓"} انتهى: ${done} صورة${skipped ? ` · ${skipped} سبق تصديرها` : ""}${failed ? ` · ${failed} فشلت (التفاصيل في تقرير.txt)` : ""} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`);
  $("#doneBox").hidden = false;
  $("#doneBox").innerHTML = out ? `✓ الصور محفوظة داخل مجلد الصور في <b>${esc(out.name)}</b>` : `✓ تم تنزيل ${zipPart > 1 ? zipPart + " ملفات مضغوطة" : "الملف المضغوط"} <b>${esc(folderName)}</b>`;
}
function progress(n, tot, t0, msg) {
  const p = tot ? n / tot : 0, el = (Date.now() - t0) / 1000;
  $("#bar").style.width = (p * 100).toFixed(1) + "%";
  let eta = "";
  if (n > 0 && n < tot) { const s = Math.round(el / n * (tot - n)); eta = ` · متبقٍ تقريباً ${s >= 60 ? Math.round(s / 60) + " دقيقة" : s + " ثانية"}`; }
  $("#progTxt").textContent = msg || `${n} / ${tot}${eta}`;
  $("#prog").hidden = false;
}
$("#exportBtn").onclick = exportAll;

/* ============ أدوات ============ */
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("on"), 3200); }
function ask(msg, opts) {
  return new Promise(res => {
    const d = $("#ask"); d.querySelector("p").textContent = msg;
    d.querySelector(".acts").innerHTML = opts.map(([v, l], i) => `<button type="button" class="${i ? "ghost" : "pri"}" value="${v}">${esc(l)}</button>`).join("");
    d.querySelectorAll("button").forEach(b => b.onclick = () => { d.close(); res(b.value); });
    d.showModal();
  });
}

/* ============ البدء ============ */
(async function init() {
  $("#fsNote").hidden = HAS_FS;
  $("#srcBtn").innerHTML = HAS_FS ? "📂 اختر مجلد الصور" : "🖼️ اختر الصور";
  try { S.mark = (await rasterize("./assets/mark.png", 640)).bmp; } catch (e) {}
  try { S.founding = (await rasterize("./assets/founding.svg", 3312)).bmp; } catch (e) {}
  paintSys(); paintForm(); paintAdj(); loadPresets();
  await loadFonts();
  await restoreSys();
  renderPreview();
  getDetector();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").then(r => {
    $("#offline").hidden = false;
  }).catch(() => {});
})();

// للفحص الآلي فقط (?debug)
if (new URLSearchParams(location.search).has("debug")) window.__zp = { S, renderPreview, rasterize, paintLogos, exportAll };
