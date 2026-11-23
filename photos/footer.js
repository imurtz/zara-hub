// تذييل الحقوق + القص الذكي — ملف مشترك بين الواجهة (المعاينة) والعامل (التصدير) حتى يطابق ما تراه ما يُصدَّر.
// كل المقاسات نسبية إلى وحدة u (للمقاس 16:10: u = عرض الصورة) — مستخرجة من الصورة المرجعية 2000×1250.
// الحقوق متزامنة بين المقاسين: نفس العناصر ونفس كسر أسطر العنوان، والفرق فقط في u.

export const RATIOS = {
  "16:10": { r: 16 / 10, key: "16x10", label: "16:10 — الموقع", u: 1.0, titleRight: 0.41, titleW: 0.355 },
  "4:5":   { r: 4 / 5,   key: "4x5",   label: "4:5 — إنستقرام",  u: 1.12, titleRight: 0.41, titleW: 0.355 }
};

export const L = {
  green: [70, 115, 105],            // ‎#467369 — لون التدرج
  gradH: 0.29, gradStops: [[0.0,0],[0.0517,0.008],[0.1034,0.025],[0.1552,0.055],[0.2069,0.095],[0.2586,0.14],[0.3103,0.19],[0.3621,0.24],[0.4138,0.29],[0.4655,0.35],[0.5172,0.42],[0.569,0.5],[0.6207,0.585],[0.6724,0.67],[0.7241,0.75],[0.7759,0.81],[0.8276,0.85],[0.8793,0.88],[0.931,0.9],[1.0,0.92]],
  wedge: { y0: 0.175, x1: 0.43, y1: 0.105, alpha: 0 },   // أُلغيت الشريحة الفاتحة — التصميم المرجعي تدرج موحّد بعرض الصورة
  box: { size: 0.047, top: 0.038, side: 0.056, gap: 0.0135, radius: 0.21, pad: 0.19 },
  title: { size: 0.0200, lh: 1.52, base: 0.059 },
  date: { size: 0.0115, track: 0.155, base: 0.028, left: 0.0595, gap: 0.0175 },
  credit: { right: 0.0665, lblSize: 0.0086, lblBase: 0.042, nameSize: 0.0113, nameBase: 0.0265 },
  founding: { opacity: 0.07, h: 543.27 / 3312 }  // بعرض الصورة كاملاً مثل الأصل (3312px)
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
  // قص يدوي حر: مركز الإطار (cx, cy) وحجمه z من أكبر إطار ممكن
  if (pos && typeof pos === "object") {
    const z = Math.max(0.2, Math.min(1, pos.z || 1)), w2 = Math.round(cw * z), h2 = Math.round(ch * z);
    const sx = Math.round(Math.max(0, Math.min(W - w2, pos.cx * W - w2 / 2))), sy = Math.round(Math.max(0, Math.min(H - h2, pos.cy * H - h2 / 2)));
    return { sx, sy, sw: w2, sh: h2, axis: "xy", t: 0, free: 1, manual: true, z };
  }
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
  wg.addColorStop(0, `rgba(255,255,255,${wd.alpha})`); wg.addColorStop(0.55, `rgba(255,255,255,${wd.alpha * 0.23})`); wg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.beginPath(); ctx.moveTo(0, H - wd.y0 * u); ctx.lineTo(wd.x1 * u, H - wd.y1 * u); ctx.lineTo(wd.x1 * u, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fillStyle = wg; ctx.fill();
  // 2) التدرج الأخضر
  const [r, g, b] = L.green, gh = Math.min(H * 0.55, L.gradH * u);
  const gg = ctx.createLinearGradient(0, H - gh, 0, H);
  L.gradStops.forEach(([p, a]) => gg.addColorStop(p, `rgba(${r},${g},${b},${a})`));
  ctx.fillStyle = gg; ctx.fillRect(0, H - gh, W, gh);
  // 3) تأثير تاريخ التأسيس (نقشة 1387) — خافت داخل التدرج
  // تتلاشى النقشة بنفس منحنى التدرج الأخضر: تُرسم على طبقة بارتفاع التدرج ثم تُقنَّع بنفس نقاط التوقف
  if (A.founding && L.founding.opacity > 0) {
    const fh = L.founding.h * u, fw = fh * (A.founding.width / A.founding.height);
    const cw = Math.ceil(W), ch = Math.max(1, Math.ceil(gh));
    const lay = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(cw, ch) : Object.assign(document.createElement("canvas"), { width: cw, height: ch });
    const lc = lay.getContext("2d");
    for (let y = ch - fh; y > -fh; y -= fh) for (let x = 0; x < W; x += fw) lc.drawImage(A.founding, x, y, fw, fh);
    const top = L.gradStops[L.gradStops.length - 1][1] || 1, mg = lc.createLinearGradient(0, 0, 0, ch);
    L.gradStops.forEach(([p, a]) => mg.addColorStop(p, `rgba(0,0,0,${Math.min(1, a / top)})`));
    lc.globalCompositeOperation = "destination-in"; lc.fillStyle = mg; lc.fillRect(0, 0, cw, ch);
    ctx.globalAlpha = L.founding.opacity; ctx.drawImage(lay, 0, H - ch); ctx.globalAlpha = 1;
  }
  // 4) مربعات الشعارات
  const bx = L.box, s = bx.size * u, top = bx.top * u;
  const left = [A.mark, ...(A.partners || [])].filter(Boolean);
  const fills = [A.markFill || MARK_FILL, ...(A.partnerFills || [])];
  left.forEach((img, i) => logoBox(ctx, bx.side * u + i * (s + bx.gap * u), top, s, img, u, fills[i]));
  if (A.event) logoBox(ctx, W - bx.side * u - s, top, s, A.event, u, A.eventFill);
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
  if (!o.noCredit) {
    // السطران في المنتصف بالنسبة لبعضهما، والكتلة كلها ملاصقة للهامش الأيمن
    const lbl = o.label || "التغطية الفوتوغرافية", fL = `400 ${L.credit.lblSize * u}px ${FONT_R}`, fN = `500 ${L.credit.nameSize * u}px ${FONT_M}`;
    ctx.font = fL; const wl = ctx.measureText(lbl).width;
    let wn = 0; if (o.photographer) { ctx.font = fN; wn = ctx.measureText(o.photographer).width; }
    const cx = xr - Math.max(wl, wn) / 2; ctx.textAlign = "center";
    ctx.globalAlpha = 0.92; ctx.font = fL; ctx.fillText(lbl, cx, H - L.credit.lblBase * u); ctx.globalAlpha = 1;
    if (o.photographer) { ctx.font = fN; ctx.fillText(o.photographer, cx, H - L.credit.nameBase * u); }
  }
  ctx.restore();
}

function tracked(ctx, t, x, y, sp) {
  for (const ch of t) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + sp; }
  return x - sp;
}

export const MARK_FILL = 0.62, LOGO_FILL = 0.8;
// fill = نسبة ما يشغله الشعار من المربع الأبيض (0.5–0.96)
function logoBox(ctx, x, y, s, img, u, fill) {
  const r = s * L.box.radius;
  ctx.save();
  // ظل مطابق للتصميم الأصلي: واضح عند الحافة وينتهي خلال ~5px (بمقياس 2000px)
  ctx.shadowColor = "rgba(0,0,0,0.42)"; ctx.shadowBlur = 0.005 * u; ctx.shadowOffsetY = 0.0004 * u;
  rr(ctx, x, y, s, s, r); ctx.fillStyle = "#fff"; ctx.fill();
  ctx.restore();
  const f = Math.max(0.4, Math.min(0.96, fill || LOGO_FILL)), inner = s * f, iw = img.width, ih = img.height, k = Math.min(inner / iw, inner / ih);
  const w = iw * k, h = ih * k;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, x + (s - w) / 2, y + (s - h) / 2, w, h);
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export const TITLE_MIN = 0.8;
/** فحص العنوان للواجهة: هل يتسع لسطرين؟ */
export function titleCheck(text) {
  const c = new OffscreenCanvas(10, 10).getContext("2d"), u = 2000, cfg = RATIOS["16:10"];
  const r = fitTitle(c, text, cfg.titleW * u, L.title.size * u);
  return { lines: r.list.length, scale: r.scale, ok: r.list.length <= 2 && !r.over };
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
    while (sz > size * TITLE_MIN && parts.some(p => ctx.measureText(p).width > maxW)) { sz *= 0.97; ctx.font = `500 ${sz}px ${FONT_M}`; }
    const over = parts.some(p => ctx.measureText(p).width > maxW * 1.01);
    return { size: sz, list: parts, scale: sz / size, over };
  }
  let sz = size, list = wrap(sz);
  while (list.length > 2 && sz > size * TITLE_MIN) { sz *= 0.97; list = wrap(sz); }
  return { size: sz, list, scale: sz / size };
}

// ===== الإمالة: تدوير الصورة ثم قصها لأكبر مستطيل بنفس النسبة داخل الصورة المدوّرة (بلا زوايا فارغة) =====
// deg موجب = مع عقارب الساعة. تُطبَّق قبل القص في المعاينة والتصدير بنفس الدالة.
export function tiltScale(W, H, deg) {
  const t = Math.abs(deg) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  return Math.min(W / (W * c + H * s), H / (W * s + H * c));
}
export function straighten(src, deg) {
  if (!deg) return src;
  const W = src.width, H = src.height, k = tiltScale(W, H, deg), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const out = new OffscreenCanvas(w, h), x = out.getContext("2d", { willReadFrequently: true });
  x.imageSmoothingQuality = "high"; x.translate(w / 2, h / 2); x.rotate(deg * Math.PI / 180); x.drawImage(src, -W / 2, -H / 2);
  return out;
}
// نقل مواضع الوجوه (نسبية) إلى الصورة بعد الإمالة
export function tiltFaces(faces, W, H, deg) {
  if (!deg || !faces || !faces.length) return faces || [];
  const k = tiltScale(W, H, deg), w = W * k, h = H * k, a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return faces.map(f => {
    const px = (f.x + f.w / 2) * W - W / 2, py = (f.y + f.h / 2) * H - H / 2;
    const qx = px * c - py * s, qy = px * s + py * c, fw = f.w * W / w, fh = f.h * H / h;
    return { ...f, x: (qx + w / 2) / w - fw / 2, y: (qy + h / 2) / h - fh / 2, w: fw, h: fh };
  }).filter(f => f.x + f.w > 0 && f.y + f.h > 0 && f.x < 1 && f.y < 1);
}
// الإمالة التلقائية: يقيس ميل الخطوط الأفقية والرأسية الواضحة (جدران، أبواب، طاولات، أفق) ويعيد زاوية التصحيح
export function detectTilt(src) {
  // مرحلتان: تقدير أولي، ثم قياس الميل المتبقي بعد التصحيح (يحسّن الدقة في الزوايا الكبيرة)
  const a1 = tiltOnce(src, 12); if (!a1) return 0;
  const t = straighten(src, a1), a2 = tiltOnce(t, 3); t.width = t.height = 0;
  return Math.max(-15, Math.min(15, Math.round((a1 + a2) * 10) / 10));
}
function tiltOnce(src, range) {
  const M = 640, k = Math.min(1, M / Math.max(src.width, src.height)), w = Math.max(16, Math.round(src.width * k)), h = Math.max(16, Math.round(src.height * k));
  const cv = new OffscreenCanvas(w, h), x = cv.getContext("2d", { willReadFrequently: true }); x.drawImage(src, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  const B = 0.1, n = Math.round(2 * range / B) + 1, hist = new Float64Array(n);
  let total = 0;
  for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
    const i = yy * w + xx;
    const gx = (g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1]) - (g[i - w - 1] + 2 * g[i - 1] + g[i + w - 1]);
    const gy = (g[i + w - 1] + 2 * g[i + w] + g[i + w + 1]) - (g[i - w - 1] + 2 * g[i - w] + g[i - w + 1]);
    const m = gx * gx + gy * gy; if (m < 14400) continue; // حواف واضحة فقط
    let l = Math.atan2(gy, gx) * 180 / Math.PI + 90; l = ((l % 90) + 90) % 90; if (l > 45) l -= 90;
    const wt = Math.sqrt(m); total += wt;
    if (Math.abs(l) > range) continue;
    hist[Math.round((l + range) / B)] += wt;
  }
  if (!total) return 0;
  // تنعيم ثم أعلى قمة
  const sm = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let j = -4; j <= 4; j++) { const q = i + j; if (q >= 0 && q < n) s += hist[q] * (5 - Math.abs(j)); } sm[i] = s; }
  let bi = 0; for (let i = 1; i < n; i++) if (sm[i] > sm[bi]) bi = i;
  const ang = bi * B - range;
  // ثقة: القمة يجب أن تبرز عن المتوسط، وإلا الصورة بلا خطوط مستقيمة واضحة
  const mean = sm.reduce((a, b) => a + b, 0) / n;
  if (sm[bi] < mean * 2 || Math.abs(ang) < 0.15) return 0; // بلا خطوط مستقيمة واضحة (صور الوجوه القريبة) = لا تعديل
  return Math.round(-ang * 10) / 10;
}
