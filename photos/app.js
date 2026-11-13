// معالجة صور الفعاليات — بوابة زارة. كل شيء داخل المتصفح: لا Firebase ولا رفع ولا أي خادم.
import { ADJ, ZERO, isZero, applyAdjust, histogram, fromXMP, BANDS } from "./adjust.js";
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
  const mw = 340, mh = Math.round(mw * H / W); mv.width = mw; mv.height = mh;
  const c = mv.getContext("2d"); c.drawImage(prevBmp, 0, 0, mw, mh);
  const k = mw / W;
  c.fillStyle = "rgba(20,28,27,.55)";
  c.fillRect(0, 0, mw, r.sy * k); c.fillRect(0, (r.sy + r.sh) * k, mw, mh); c.fillRect(0, r.sy * k, r.sx * k, r.sh * k); c.fillRect((r.sx + r.sw) * k, r.sy * k, mw, r.sh * k);
  c.strokeStyle = "#F2C14E"; c.lineWidth = 3; c.strokeRect(r.sx * k + 1.5, r.sy * k + 1.5, r.sw * k - 3, r.sh * k - 3);
  const manual = it.pos[S.ratio] != null;
  const x = r.axis === "x";
  $("#cropHint").textContent = r.free ? "اضغط أو اسحب على الصورة الصغيرة، أو استخدم الأزرار" : "الصورة بنفس المقاس — لا تحتاج قص";
  $("#cropBtns").innerHTML = r.free ? [["auto", "تلقائي"], ["0", x ? "يسار" : "أعلى"], ["0.5", "وسط"], ["1", x ? "يمين" : "أسفل"]].map(([v, l]) => {
    const on = v === "auto" ? !manual : manual && Math.abs(it.pos[S.ratio] - +v) < 0.01;
    return `<button type="button" data-crop="${v}" class="${on ? "on" : ""}">${l}</button>`;
  }).join("") + `<button type="button" data-crop="all" title="يطبّق هذا الموضع على كل الصور بنفس الاتجاه">نفس الموضع لكل الصور</button>` : "";
  const rg = $("#cropRange"); rg.hidden = !r.free; rg.value = Math.round(r.t * 1000);
  rg.style.direction = x ? "ltr" : "ltr";
}
function setPos(v) {
  const it = S.items[S.cur]; if (!it) return;
  if (v === "auto") delete it.pos[S.ratio]; else it.pos[S.ratio] = Math.max(0, Math.min(1, v));
  paintCell(S.cur); renderPreview();
}
(() => {
  const mv = $("#mini"); let drag = false;
  const at = e => {
    const r = prevRect; if (!r || !r.free) return;
    const p = e.touches ? e.touches[0] : e, b = mv.getBoundingClientRect();
    const fx = (p.clientX - b.left) / b.width, fy = (p.clientY - b.top) / b.height;
    const W = prevBmp.width, H = prevBmp.height;
    // مركز الإطار عند نقطة الضغط
    const t = r.axis === "x" ? (fx * W - r.sw / 2) / r.free : (fy * H - r.sh / 2) / r.free;
    setPos(t);
  };
  mv.addEventListener("mousedown", e => { drag = true; at(e); e.preventDefault(); });
  mv.addEventListener("touchstart", e => { drag = true; at(e); e.preventDefault(); }, { passive: false });
  addEventListener("mousemove", e => { if (drag) at(e); });
  addEventListener("touchmove", e => { if (drag) at(e); }, { passive: true });
  addEventListener("mouseup", () => drag = false); addEventListener("touchend", () => drag = false);
  $("#cropRange").addEventListener("input", e => setPos(+e.target.value / 1000));
  $("#cropBtns").addEventListener("click", e => {
    const b = e.target.closest("[data-crop]"); if (!b) return;
    const v = b.dataset.crop;
    if (v === "all") {
      const it = S.items[S.cur], p = it.pos[S.ratio];
      S.items.forEach((x, i) => { if (p == null) delete x.pos[S.ratio]; else x.pos[S.ratio] = p; paintCell(i); });
      toast(p == null ? "رجعت كل الصور للقص التلقائي" : "طُبّق نفس الموضع على كل الصور"); renderPreview(); return;
    }
    setPos(v === "auto" ? "auto" : +v);
  });
  // أسهم لوحة المفاتيح مع Shift لتحريك القص
  addEventListener("keydown", e => {
    if (!e.shiftKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || !prevRect || !prevRect.free) return;
    const d = { ArrowLeft: -0.05, ArrowRight: 0.05, ArrowUp: -0.05, ArrowDown: 0.05 }[e.key]; if (d == null) return;
    e.preventDefault(); setPos(prevRect.t + d);
  });
})();

/* ============ الألوان ============ */
const adjOf = it => (it && it.adj) || F().adj || ZERO;
const curAdj = () => { const it = S.items[S.cur]; return it && it.adj ? it.adj : F().adj; };
function paintAdj() {
  const it = S.items[S.cur], own = !!(it && it.adj), a = curAdj();
  $("#adjScope").innerHTML = `<button type="button" data-scope="all" class="${own ? "" : "on"}">كل الصور</button><button type="button" data-scope="one" class="${own ? "on" : ""}" ${it ? "" : "disabled"}>هذه الصورة فقط</button>`;
  const sl = d => { const v = a[d.k] ?? (d.def || 0);
    const bg = d.hue ? ` style="background:linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);border-radius:9px;height:6px"` : "";
    return `<label class="sl${d.c ? " band" : ""}">${d.c ? `<i style="background:${d.c}"></i>` : ""}<span class="n">${d.l}</span><input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}" data-adj="${d.k}" data-def="${d.def || 0}" title="نقرتان للتصفير"${bg}><span class="v">${fmtAdj(d, v)}</span></label>`; };
  const grp = g => ADJ.filter(d => d.g === g).map(sl).join("");
  const hslOn = BANDS.some(([k]) => a["h_" + k] || a["s_" + k] || a["l_" + k]), cgOn = ["sh", "mid", "hi"].some(k => a[`cg_${k}_s`]);
  const ht = S.hslTab || "h";
  $("#adjBox").innerHTML = `<h4>الضوء</h4>${grp("الضوء")}<h4>اللون</h4>${grp("اللون")}
    <details class="adv" ${S.openHsl ? "open" : ""} data-det="openHsl"><summary>ألوان محددة (HSL)${hslOn ? " <em>●</em>" : ""}</summary>
      <div class="seg mini3">${[["h", "درجة اللون"], ["s", "التشبع"], ["l", "الإضاءة"]].map(([k, l]) => `<button type="button" data-hsl="${k}" class="${ht === k ? "on" : ""}">${l}</button>`).join("")}</div>
      ${grp("hsl-" + ht)}</details>
    <details class="adv" ${S.openCg ? "open" : ""} data-det="openCg"><summary>تدرج الألوان (ظلال / وسط / إضاءات)${cgOn ? " <em>●</em>" : ""}</summary>${grp("grade")}</details>`;
  $("#adjReset").hidden = isZero(a);
  $("#adjTag").textContent = own ? "تعديل خاص بهذه الصورة" : (F().preset ? "البريست: " + F().preset : (isZero(F().adj) ? "بدون تعديل" : "تعديل على كل الصور"));
  paintPresets();
}
const fmtAdj = (d, v) => d.k === "exposure" ? (v > 0 ? "+" : "") + (+v).toFixed(2) : d.hue ? v + "°" : d.min === 0 ? String(v) : (v > 0 ? "+" : "") + v;
document.addEventListener("input", e => {
  const r = e.target.closest("[data-adj]"); if (!r) return;
  const d = ADJ.find(x => x.k === r.dataset.adj), it = S.items[S.cur], v = +r.value;
  if (it && it.adj) it.adj = { ...it.adj, [d.k]: v }; else { F().adj = { ...F().adj, [d.k]: v }; F().preset = ""; saveSoon(); }
  r.nextElementSibling.textContent = fmtAdj(d, v);
  $("#adjReset").hidden = isZero(curAdj());
  previewRAF();
});
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
let PRESETS = {}, BUILTIN = {};
document.addEventListener("toggle", e => { const d = e.target.closest && e.target.closest("[data-det]"); if (d) S[d.dataset.det] = d.open; }, true);
async function loadPresets() {
  try { const j = await (await fetch("./assets/presets.json")).json(); BUILTIN = Object.fromEntries(Object.entries(j).map(([n, v]) => [n, v.adj])); } catch (e) {}
  PRESETS = { ...BUILTIN, ...ls.get("presets", {}) };
  if (S.sys) { try { const d = await sysDir("بريستات"); for await (const [n, h] of d.entries()) if (h.kind === "file" && /\.json$/i.test(n)) { try { const j = JSON.parse(await (await h.getFile()).text()); PRESETS[j.name || n.replace(/\.json$/i, "")] = j.adj || j; } catch (e) {} } } catch (e) {} }
  paintPresets();
}
function paintPresets() {
  const names = Object.keys(PRESETS).sort((a, b) => a.localeCompare(b, "ar"));
  $("#presetSel").innerHTML = `<option value="">— اختر بريست —</option>` + names.map(n => `<option ${F().preset === n ? "selected" : ""}>${esc(n)}</option>`).join("");
  $("#presetDel").hidden = !F().preset || !PRESETS[F().preset] || !!BUILTIN[F().preset];
}
$("#presetSel").onchange = e => {
  const n = e.target.value; if (!n) return;
  const a = { ...ZERO, ...PRESETS[n] }, it = S.items[S.cur];
  if (it && it.adj) it.adj = a; else { F().adj = a; F().preset = n; saveSoon(); }
  paintAdj(); renderPreview();
};
async function savePreset(n, a) {
  PRESETS[n] = a; const local = ls.get("presets", {}); local[n] = a; ls.set("presets", local);
  if (S.sys) { try { await writeFile(await sysDir("بريستات"), n.replace(/[\\/:*?"<>|]/g, "-") + ".json", JSON.stringify({ name: n, adj: a, savedAt: new Date().toISOString() }, null, 2)); } catch (e) {} }
}
$("#presetImport").onclick = () => {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".xmp,.XMP"; inp.multiple = true;
  inp.onchange = async () => {
    let last = "", miss = new Set();
    for (const f of inp.files) {
      try { const r = fromXMP(await f.text()); const n = r.name || f.name.replace(/\.xmp$/i, ""); await savePreset(n, r.adj); last = n; r.unsupported.forEach(x => miss.add(x)); } catch (e) { toast("تعذّر قراءة " + f.name); }
    }
    if (!last) return;
    F().preset = last; F().adj = { ...ZERO, ...PRESETS[last] }; S.items.forEach(it => delete it.adj); saveSoon(); paintAdj(); renderPreview();
    toast(`استُورد البريست «${last}» — التحويل تقريبي${miss.size ? " (تُجوهلت: " + [...miss].join("، ") + ")" : ""}`);
  };
  inp.click();
};
$("#presetSave").onclick = async () => {
  const n = (prompt("اسم البريست:", F().preset || "") || "").trim(); if (!n) return;
  if (BUILTIN[n]) return toast("هذا اسم بريست جاهز — اختر اسماً آخر");
  const a = { ...curAdj() }; PRESETS[n] = a; F().preset = n;
  const local = ls.get("presets", {}); local[n] = a; ls.set("presets", local);
  if (S.sys) { try { await writeFile(await sysDir("بريستات"), n.replace(/[\\/:*?"<>|]/g, "-") + ".json", JSON.stringify({ name: n, adj: a, savedAt: new Date().toISOString() }, null, 2)); } catch (e) {} }
  saveSoon(); paintAdj(); toast(S.sys ? "حُفظ البريست في مجلد المنظومة ✓" : "حُفظ البريست في هذا المتصفح — اختر مجلد المنظومة ليُحفظ دائماً");
};
$("#presetDel").onclick = async () => {
  const n = F().preset; if (!n || !confirm(`حذف البريست «${n}»؟`)) return;
  delete PRESETS[n]; const local = ls.get("presets", {}); delete local[n]; ls.set("presets", local);
  if (S.sys) { try { await (await sysDir("بريستات")).removeEntry(n.replace(/[\\/:*?"<>|]/g, "-") + ".json"); } catch (e) {} }
  F().preset = ""; saveSoon(); paintAdj();
};

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
  const n = Math.max(1, Math.min(3, Math.floor((navigator.hardwareConcurrency || 4) / 3)));
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
  const q = f.quality === "custom" ? { maxEdge: +f.customEdge || 2000, quality: +f.customQ || 85, chroma444: false } : QUALITY[f.quality];
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
