// تذييل الحقوق + القص الذكي — ملف مشترك بين الواجهة (المعاينة) والعامل (التصدير) حتى يطابق ما تراه ما يُصدَّر.
// كل المقاسات نسبية إلى وحدة u (للمقاس 16:10: u = عرض الصورة) — مستخرجة من الصورة المرجعية 2000×1250.
// الحقوق متزامنة بين المقاسين: نفس العناصر ونفس كسر أسطر العنوان، والفرق فقط في u.

export const RATIOS = {
  "16:10": { r: 16 / 10, key: "16x10", label: "16:10 — الموقع", u: 1.0, titleRight: 0.41, titleW: 0.355 },
  "4:5":   { r: 4 / 5,   key: "4x5",   label: "4:5 — إنستقرام",  u: 1.12, titleRight: 0.41, titleW: 0.355 }
};

export const L = {
  green: [70, 115, 105],            // ‎#467369 — لون التدرج
  gradH: 0.225, gradStops: [[0, 0], [0.25, 0.2], [0.5, 0.45], [0.75, 0.68], [1, 0.93]],
  wedge: { y0: 0.175, x1: 0.43, y1: 0.105, alpha: 0.26 },
  box: { size: 0.047, top: 0.038, side: 0.056, gap: 0.0135, radius: 0.21, pad: 0.19 },
  title: { size: 0.0200, lh: 1.52, base: 0.059 },
  date: { size: 0.0087, track: 0.155, base: 0.028, left: 0.0595, gap: 0.0145 },
  credit: { right: 0.0665, lblSize: 0.0086, lblBase: 0.042, nameSize: 0.0113, nameBase: 0.0265 },
  founding: { opacity: 0.07, h: 0.085 }
};

export const FONT_M = "ZaraDinMedium", FONT_R = "ZaraDinRegular";

/** التاريخ الهجري (أم القرى) بصيغة 1448/05/30 بأرقام لاتينية */
export function hijriOf(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  try {
    const p = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    const g = t => (p.find(x => x.type === t) || {}).value || "";
    return `${g("year").replace(/\D/g, "")}/${g("month")}/${g("day")}`;
  } catch (e) { return ""; }
}
export const gregOf = iso => (iso || "").replace(/-/g, "/");

/** إطار القص: faces = [{x,y,w,h}] بنسب من الصورة (0..1)، pos = موضع يدوي على المحور الحر (0..1) أو null */
export function cropRect(W, H, ratio, faces, pos) {
  const R = RATIOS[ratio].r;
  let cw, ch, axis;
  if (W / H > R) { ch = H; cw = Math.round(H * R); axis = "x"; } else { cw = W; ch = Math.round(W / R); axis = "y"; }
  const free = axis === "x" ? W - cw : H - ch;
  let t;
  if (pos != null) t = pos;
  else if (!free) t = 0.5;
  else t = autoPos(W, H, cw, ch, axis, faces || []);
  t = Math.max(0, Math.min(1, t));
  const off = Math.round(free * t);
  return { sx: axis === "x" ? off : 0, sy: axis === "y" ? off : 0, sw: cw, sh: ch, axis, t, free };
}

function autoPos(W, H, cw, ch, axis, faces) {
  const fs = faces.map(f => ({ x: f.x * W, y: f.y * H, w: f.w * W, h: f.h * H, a: f.w * f.h }));
  if (axis === "x") {
    const free = W - cw;
    if (!fs.length) return 0.5;
    // مركز ثقل الوجوه موزوناً بالمساحة؛ إن لم تتسع كل الوجوه نعتمد الأكبر
    let x0 = Math.min(...fs.map(f => f.x)), x1 = Math.max(...fs.map(f => f.x + f.w));
    let cx;
    if (x1 - x0 <= cw * 0.92) cx = (x0 + x1) / 2;
    else { const tot = fs.reduce((s, f) => s + f.a, 0); cx = fs.reduce((s, f) => s + (f.x + f.w / 2) * f.a, 0) / tot; }
    return (cx - cw / 2) / free;
  } else {
    const free = H - ch;
    if (!fs.length) return 0.35;
    const y0 = Math.min(...fs.map(f => f.y)), y1 = Math.max(...fs.map(f => f.y + f.h));
    // الوجوه في الثلث العلوي، وفوق منطقة التذييل (أعلى 70% من الإطار)
    let top = y0 - ch * 0.2;
    if (y1 > top + ch * 0.7) top = y1 - ch * 0.7;
    if (y0 < top + ch * 0.06) top = y0 - ch * 0.06;
    return top / free;
  }
}

/** يرسم الحقوق على سياق بحجم W×H. A = {mark, partners[], event, founding} صور جاهزة (ImageBitmap/Image) */
export function drawFooter(ctx, W, H, ratio, o, A) {
  const cfg = RATIOS[ratio], u = W * cfg.u;
  ctx.save();
  // 1) الشريحة الفاتحة المائلة يسار الأسفل
  const wd = L.wedge;
  const wg = ctx.createLinearGradient(0, H - wd.y0 * u, 0, H);
  wg.addColorStop(0, `rgba(255,255,255,${wd.alpha})`); wg.addColorStop(0.55, "rgba(255,255,255,0.06)"); wg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.beginPath(); ctx.moveTo(0, H - wd.y0 * u); ctx.lineTo(wd.x1 * u, H - wd.y1 * u); ctx.lineTo(wd.x1 * u, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fillStyle = wg; ctx.fill();
  // 2) التدرج الأخضر
  const [r, g, b] = L.green, gh = Math.min(H * 0.55, L.gradH * u);
  const gg = ctx.createLinearGradient(0, H - gh, 0, H);
  L.gradStops.forEach(([p, a]) => gg.addColorStop(p, `rgba(${r},${g},${b},${a})`));
  ctx.fillStyle = gg; ctx.fillRect(0, H - gh, W, gh);
  // 3) تأثير تاريخ التأسيس (نقشة 1387) — خافت داخل التدرج
  if (A.founding && L.founding.opacity > 0) {
    const fh = L.founding.h * u, fw = fh * (A.founding.width / A.founding.height);
    ctx.globalAlpha = L.founding.opacity;
    for (let x = 0; x < W; x += fw) ctx.drawImage(A.founding, x, H - fh, fw, fh);
    ctx.globalAlpha = 1;
  }
  // 4) مربعات الشعارات
  const bx = L.box, s = bx.size * u, top = bx.top * u;
  const left = [A.mark, ...(A.partners || [])].filter(Boolean);
  left.forEach((img, i) => logoBox(ctx, bx.side * u + i * (s + bx.gap * u), top, s, img, u));
  if (A.event) logoBox(ctx, W - bx.side * u - s, top, s, A.event, u);
  // 5) النصوص
  ctx.fillStyle = "#fff"; ctx.textBaseline = "alphabetic";
  // العنوان
  if (o.title) {
    const lines = fitTitle(ctx, o.title, cfg.titleW * u, L.title.size * u);
    ctx.direction = "rtl"; ctx.textAlign = "right";
    ctx.font = `500 ${lines.size}px ${FONT_M}`;
    const lh = lines.size * L.title.lh, xr = cfg.titleRight * u, yb = H - L.title.base * u;
    lines.list.forEach((t, i) => ctx.fillText(t, xr, yb - (lines.list.length - 1 - i) * lh));
  }
  // التاريخان (هجري ثم ميلادي، من اليسار)
  ctx.direction = "ltr"; ctx.textAlign = "left";
  const ds = L.date.size * u; ctx.font = `500 ${ds}px ${FONT_M}`;
  let x = L.date.left * u; const yb = H - L.date.base * u;
  [o.hijri, o.greg].filter(Boolean).forEach((t, i) => { if (i) x += L.date.gap * u; x = tracked(ctx, t, x, yb, ds * L.date.track); });
  // المصوّر (أسفل اليمين)
  ctx.direction = "rtl"; ctx.textAlign = "right";
  const xr = W - L.credit.right * u;
  ctx.globalAlpha = 0.92; ctx.font = `400 ${L.credit.lblSize * u}px ${FONT_R}`;
  ctx.fillText(o.label || "التغطية الفوتوغرافية", xr, H - L.credit.lblBase * u);
  ctx.globalAlpha = 1;
  if (o.photographer) { ctx.font = `500 ${L.credit.nameSize * u}px ${FONT_M}`; ctx.fillText(o.photographer, xr, H - L.credit.nameBase * u); }
  ctx.restore();
}

function tracked(ctx, t, x, y, sp) {
  for (const ch of t) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + sp; }
  return x - sp;
}

function logoBox(ctx, x, y, s, img, u) {
  const r = s * L.box.radius;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.16)"; ctx.shadowBlur = 0.012 * u; ctx.shadowOffsetY = 0.003 * u;
  rr(ctx, x, y, s, s, r); ctx.fillStyle = "#fff"; ctx.fill();
  ctx.restore();
  const p = s * L.box.pad, iw = img.width, ih = img.height, k = Math.min((s - 2 * p) / iw, (s - 2 * p) / ih);
  const w = iw * k, h = ih * k;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, x + (s - w) / 2, y + (s - h) / 2, w, h);
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** التفاف العنوان: سطران بالحجم المعتمد، وإن طال يُصغَّر حتى 72% ثم يُسمح بثلاثة أسطر */
export function fitTitle(ctx, text, maxW, size) {
  const words = String(text).trim().split(/\s+/);
  const wrap = sz => {
    ctx.font = `500 ${sz}px ${FONT_M}`; ctx.direction = "rtl";
    const out = []; let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { out.push(cur); cur = w; } }
    if (cur) out.push(cur);
    return out;
  };
  // يدعم كسر سطر يدوي بـ «/» أو سطر جديد
  if (/\n|\s\/\s/.test(text)) {
    const parts = String(text).split(/\n|\s\/\s/).map(s => s.trim()).filter(Boolean);
    let sz = size; ctx.font = `500 ${sz}px ${FONT_M}`;
    while (sz > size * 0.6 && parts.some(p => ctx.measureText(p).width > maxW)) { sz *= 0.96; ctx.font = `500 ${sz}px ${FONT_M}`; }
    return { size: sz, list: parts };
  }
  let sz = size, list = wrap(sz);
  while (list.length > 2 && sz > size * 0.72) { sz *= 0.96; list = wrap(sz); }
  return { size: sz, list };
}
