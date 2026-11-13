// تعديل الألوان — نفس الدالة للمعاينة وللتصدير (ما تراه هو ما يُصدَّر).
// الضوء والتوازن اللوني في جداول لكل قناة (سريعة جداً)، ثم HSL لكل لون + تدرج الألوان + التشبع لكل بكسل.

const BANDS = [["red", "الأحمر", 0, "#E0514A"], ["orange", "البرتقالي", 30, "#E8923A"], ["yellow", "الأصفر", 60, "#E6C93A"], ["green", "الأخضر", 120, "#4DB25A"],
  ["aqua", "السماوي", 180, "#3CB8C2"], ["blue", "الأزرق", 240, "#3F6FD8"], ["purple", "البنفسجي", 270, "#8A5AD6"], ["magenta", "الأرجواني", 300, "#D04FB0"]];
export { BANDS };

export const ADJ = [
  { g: "amount", k: "amount", l: "قوة المؤثرات", min: 0, max: 100, step: 1, def: 100 },
  { g: "الضوء", k: "exposure",   l: "التعريض",  min: -3,   max: 3,   step: 0.05 },
  { g: "الضوء", k: "contrast",   l: "التباين",  min: -100, max: 100, step: 1 },
  { g: "الضوء", k: "highlights", l: "الإضاءات", min: -100, max: 100, step: 1 },
  { g: "الضوء", k: "shadows",    l: "الظلال",   min: -100, max: 100, step: 1 },
  { g: "الضوء", k: "whites",     l: "الأبيض",   min: -100, max: 100, step: 1 },
  { g: "الضوء", k: "blacks",     l: "الأسود",   min: -100, max: 100, step: 1 },
  { g: "اللون", k: "temp",       l: "الحرارة",  min: -100, max: 100, step: 1 },
  { g: "اللون", k: "tint",       l: "الصبغة",   min: -100, max: 100, step: 1 },
  { g: "اللون", k: "vibrance",   l: "الحيوية",  min: -100, max: 100, step: 1 },
  { g: "اللون", k: "saturation", l: "التشبع",   min: -100, max: 100, step: 1 },
  ...["h", "s", "l"].flatMap(t => BANDS.map(([k, l, , c]) => ({ g: "hsl-" + t, k: `${t}_${k}`, l, c, min: -100, max: 100, step: 1, adv: 1 }))),
  ...[["sh", "الظلال"], ["mid", "الوسط"], ["hi", "الإضاءات"]].flatMap(([k, l]) => [
    { g: "grade", k: `cg_${k}_h`, l: `لون ${l}`, min: 0, max: 360, step: 1, hue: 1, adv: 1 },
    { g: "grade", k: `cg_${k}_s`, l: `قوة ${l}`, min: 0, max: 100, step: 1, adv: 1 }]),
  ...[["pc_sh", "الظلال العميقة"], ["pc_dk", "الداكن"], ["pc_lt", "الفاتح"], ["pc_hi", "الإضاءات العالية"]].map(([k, l]) => ({ g: "curve", k, l, min: -100, max: 100, step: 1, adv: 1 })),
  { g: "grade", k: "cg_blend", l: "المزج", min: 0, max: 100, step: 1, def: 50, adv: 1 },
  { g: "grade", k: "cg_bal", l: "التوازن", min: -100, max: 100, step: 1, adv: 1 }
];
export const ZERO = Object.fromEntries(ADJ.map(a => [a.k, a.def || 0]));
export const isZero = p => !p || (!p.lut && ADJ.every(a => a.k === "amount" || (p[a.k] ?? (a.def || 0)) === (a.def || 0) || (a.hue && !p[a.k.replace(/_h$/, "_s")]))) || (p.amount === 0);
const _isZeroOld = p => !p || ADJ.every(a => (p[a.k] ?? (a.def || 0)) === (a.def || 0) || (a.hue && !p[a.k.replace(/_h$/, "_s")]));

const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const l2s = v => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
const bell = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
const clamp = v => v < 0 ? 0 : v > 1 ? 1 : v;

/** جداول القنوات الثلاث (256 قيمة لكل قناة) */
export function buildLUT(p) {
  const t = (p.temp || 0) / 100, ti = (p.tint || 0) / 100;
  const gains = [1 + 0.22 * t + 0.04 * ti, 1 - 0.16 * ti, 1 - 0.26 * t + 0.04 * ti];
  const ev = Math.pow(2, p.exposure || 0);
  const c = (p.contrast || 0) / 100, h = (p.highlights || 0) / 100, sh = (p.shadows || 0) / 100, w = (p.whites || 0) / 100, b = (p.blacks || 0) / 100;
  const pc = ["pc_sh", "pc_dk", "pc_lt", "pc_hi"].map(k => (p[k] || 0) / 100);
  const out = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  for (let ch = 0; ch < 3; ch++) {
    let prev = 0;
    for (let i = 0; i < 256; i++) {
      let x = l2s(clamp(s2l(i / 255) * gains[ch] * ev));
      x = x + w * 0.16 * bell(x, 0.93, 0.13) + b * 0.12 * bell(x, 0.06, 0.12);
      x = x + h * 0.2 * bell(x, 0.76, 0.17) + sh * 0.22 * bell(x, 0.24, 0.17);
      // منحنى التون (Parametric) — أربع مناطق
      x = x + (pc[0] * bell(x, 0.12, 0.12) + pc[1] * bell(x, 0.37, 0.13) + pc[2] * bell(x, 0.63, 0.13) + pc[3] * bell(x, 0.88, 0.12)) * 0.13;
      if (c) { const s = x - 0.5; x = 0.5 + s * (1 + c * 0.9 * (1 - Math.min(1, Math.abs(s) * 2) ** 2)); }
      x = clamp(x);
      if (x < prev) x = prev; prev = x;
      out[ch][i] = Math.round(x * 255);
    }
  }
  return out;
}

// جداول HSL على 360 درجة (استيفاء بين مراكز الألوان الثمانية)
function hslTables(p) {
  const H = new Float32Array(360), S = new Float32Array(360), Lm = new Float32Array(360);
  let any = false;
  for (let deg = 0; deg < 360; deg++) {
    let i = BANDS.length - 1;
    for (let j = 0; j < BANDS.length; j++) if (BANDS[j][2] <= deg) i = j;
    const a = BANDS[i], b = BANDS[(i + 1) % BANDS.length];
    const span = ((b[2] - a[2]) + 360) % 360 || 360, f = (((deg - a[2]) + 360) % 360) / span;
    const g = (t, k) => (p[`${t}_${k}`] || 0);
    H[deg] = g("h", a[0]) * (1 - f) + g("h", b[0]) * f;
    S[deg] = g("s", a[0]) * (1 - f) + g("s", b[0]) * f;
    Lm[deg] = g("l", a[0]) * (1 - f) + g("l", b[0]) * f;
    if (H[deg] || S[deg] || Lm[deg]) any = true;
  }
  return any ? { H, S, L: Lm } : null;
}
function hueRGB(h) { // لون صافٍ من الدرجة (مطروحاً منه الرمادي)
  const f = n => { const k = (n + h / 30) % 12; return 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) - 0.5, f(8) - 0.5, f(4) - 0.5];
}

/** يطبّق التعديل على ImageData في مكانه */
export function applyAdjust(img, p) {
  if (isZero(p)) return img;
  p = { ...ZERO, ...p };
  const [R, G, B] = buildLUT(p), d = img.data, n = d.length;
  const sat = 1 + (p.saturation || 0) / 100, vib = (p.vibrance || 0) / 100;
  const T = hslTables(p);
  // تدرج الألوان
  const cg = [["sh", 0], ["mid", 1], ["hi", 2]].map(([k]) => { const s = (p[`cg_${k}_s`] || 0) / 100; return s ? hueRGB(p[`cg_${k}_h`] || 0).map(v => v * s * 0.32) : null; });
  const [c0, c1, c2] = cg, doCG = cg.some(Boolean), blend = 0.5 + ((p.cg_blend ?? 50) - 50) / 100, bal = (p.cg_bal || 0) / 200;
  const perPixel = T || doCG || sat !== 1 || vib !== 0;
  const L3 = p.lut ? decodeLUT(p.lut) : null, N = L3 ? L3.n : 0, N1 = N - 1, LD = L3 ? L3.d : null;
  const amt = Math.max(0, Math.min(1, (p.amount ?? 100) / 100)), mix = amt < 1;
  for (let i = 0; i < n; i += 4) {
    const r0 = d[i], g0 = d[i + 1], b0 = d[i + 2];
    let r = R[r0], g = G[g0], b = B[b0];
    if (perPixel) {
      r /= 255; g /= 255; b /= 255;
      if (T || sat !== 1 || vib !== 0) {
        // RGB → HSL
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
        let l = (mx + mn) / 2, s = dl ? dl / (1 - Math.abs(2 * l - 1) || 1e-6) : 0, h = 0;
        if (dl) { h = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4; h *= 60; if (h < 0) h += 360; }
        const s0 = s;
        if (T && dl) {
          const k = (h | 0) % 360;
          h = (h + T.H[k] * 0.32 + 360) % 360;
          s = s * (1 + T.S[k] / 100);
          l = l + T.L[k] / 100 * 0.22 * s0 * (1 - Math.abs(2 * l - 1) * 0.5);
        }
        const skin = h > 8 && h < 50 && s0 < 0.6 ? 0.5 : 1;
        s = s * sat * (1 + vib * (1 - s0) * skin);
        s = s < 0 ? 0 : s > 1 ? 1 : s; l = l < 0 ? 0 : l > 1 ? 1 : l;
        // HSL → RGB
        const C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs((h / 60) % 2 - 1)), m = l - C / 2;
        const hi = (h / 60) | 0;
        if (hi === 0) { r = C; g = X; b = 0; } else if (hi === 1) { r = X; g = C; b = 0; } else if (hi === 2) { r = 0; g = C; b = X; }
        else if (hi === 3) { r = 0; g = X; b = C; } else if (hi === 4) { r = X; g = 0; b = C; } else { r = C; g = 0; b = X; }
        r += m; g += m; b += m;
      }
      if (doCG) {
        const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b + bal;
        const q1 = 1 - Y / blend, q2 = (Y - (1 - blend)) / blend, wsh = q1 > 0 ? q1 * Math.sqrt(q1) : 0, whi = q2 > 0 ? q2 * Math.sqrt(q2) : 0, wmid = Math.max(0, 1 - wsh - whi) * 0.8;
        if (c0 && wsh) { r += c0[0] * wsh; g += c0[1] * wsh; b += c0[2] * wsh; }
        if (c1 && wmid) { r += c1[0] * wmid; g += c1[1] * wmid; b += c1[2] * wmid; }
        if (c2 && whi) { r += c2[0] * whi; g += c2[1] * whi; b += c2[2] * whi; }
      }
      r *= 255; g *= 255; b *= 255;
    }
    if (L3) {
      // جدول ألوان ثلاثي الأبعاد (مطابقة Lightroom أو ملف .cube) — استيفاء ثلاثي
      const fr = Math.max(0, Math.min(N1, r / 255 * N1)), fg = Math.max(0, Math.min(N1, g / 255 * N1)), fb = Math.max(0, Math.min(N1, b / 255 * N1));
      const x0 = fr | 0, y0 = fg | 0, z0 = fb | 0, x1 = x0 < N1 ? x0 + 1 : x0, y1 = y0 < N1 ? y0 + 1 : y0, z1 = z0 < N1 ? z0 + 1 : z0;
      const dx = fr - x0, dy = fg - y0, dz = fb - z0;
      const at = (x, y, z) => ((z * N + y) * N + x) * 3;
      const a000 = at(x0, y0, z0), a100 = at(x1, y0, z0), a010 = at(x0, y1, z0), a110 = at(x1, y1, z0), a001 = at(x0, y0, z1), a101 = at(x1, y0, z1), a011 = at(x0, y1, z1), a111 = at(x1, y1, z1);
      const w000 = (1 - dx) * (1 - dy) * (1 - dz), w100 = dx * (1 - dy) * (1 - dz), w010 = (1 - dx) * dy * (1 - dz), w110 = dx * dy * (1 - dz), w001 = (1 - dx) * (1 - dy) * dz, w101 = dx * (1 - dy) * dz, w011 = (1 - dx) * dy * dz, w111 = dx * dy * dz;
      r = LD[a000] * w000 + LD[a100] * w100 + LD[a010] * w010 + LD[a110] * w110 + LD[a001] * w001 + LD[a101] * w101 + LD[a011] * w011 + LD[a111] * w111;
      g = LD[a000 + 1] * w000 + LD[a100 + 1] * w100 + LD[a010 + 1] * w010 + LD[a110 + 1] * w110 + LD[a001 + 1] * w001 + LD[a101 + 1] * w101 + LD[a011 + 1] * w011 + LD[a111 + 1] * w111;
      b = LD[a000 + 2] * w000 + LD[a100 + 2] * w100 + LD[a010 + 2] * w010 + LD[a110 + 2] * w110 + LD[a001 + 2] * w001 + LD[a101 + 2] * w101 + LD[a011 + 2] * w011 + LD[a111 + 2] * w111;
    }
    if (mix) { r = r0 + (r - r0) * amt; g = g0 + (g - g0) * amt; b = b0 + (b - b0) * amt; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  return img;
}

/** هيستوغرام (الإضاءة + القنوات) من ImageData — 64 خانة */
export function histogram(img) {
  const d = img.data, H = { r: new Uint32Array(64), g: new Uint32Array(64), b: new Uint32Array(64), l: new Uint32Array(64) };
  const step = Math.max(4, Math.floor(d.length / 4 / 250000) * 4);
  for (let i = 0; i < d.length; i += step) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    H.r[r >> 2]++; H.g[g >> 2]++; H.b[b >> 2]++; H.l[(0.2126 * r + 0.7152 * g + 0.0722 * b) >> 2]++;
  }
  return H;
}

/** تحويل بريست Lightroom (.xmp) إلى قيم المحرر — تقريبي */
export function fromXMP(text) {
  const doc = new DOMParserish(text), v = k => doc.get(k), num = k => { const x = parseFloat(v(k)); return isNaN(x) ? 0 : x; };
  const a = { ...ZERO };
  a.exposure = num("Exposure2012"); a.contrast = num("Contrast2012"); a.highlights = num("Highlights2012"); a.shadows = num("Shadows2012");
  a.whites = num("Whites2012"); a.blacks = num("Blacks2012"); a.vibrance = num("Vibrance"); a.saturation = num("Saturation");
  a.temp = num("IncrementalTemperature"); a.tint = num("IncrementalTint");
  // التباين الخفيف لـ Dehaze/Clarity (تقريب بسيط)
  a.contrast += num("Dehaze") * 0.5 + num("Clarity2012") * 0.3;
  const LR = { red: "Red", orange: "Orange", yellow: "Yellow", green: "Green", aqua: "Aqua", blue: "Blue", purple: "Purple", magenta: "Magenta" };
  for (const [k, n] of Object.entries(LR)) { a[`h_${k}`] = num("HueAdjustment" + n); a[`s_${k}`] = num("SaturationAdjustment" + n); a[`l_${k}`] = num("LuminanceAdjustment" + n); }
  for (const [k, n] of [["sh", "Shadow"], ["mid", "Midtone"], ["hi", "Highlight"]]) { a[`cg_${k}_h`] = num(`ColorGrade${n}Hue`); a[`cg_${k}_s`] = num(`ColorGrade${n}Sat`); }
  // Split Toning القديم = تدرج الظلال/الإضاءات إن لم يُحدَّد ColorGrade
  if (!a.cg_sh_s && num("SplitToningShadowSaturation")) { a.cg_sh_h = num("SplitToningShadowHue"); a.cg_sh_s = num("SplitToningShadowSaturation"); }
  if (!a.cg_hi_s && num("SplitToningHighlightSaturation")) { a.cg_hi_h = num("SplitToningHighlightHue"); a.cg_hi_s = num("SplitToningHighlightSaturation"); }
  a.pc_sh = num("ParametricShadows"); a.pc_dk = num("ParametricDarks"); a.pc_lt = num("ParametricLights"); a.pc_hi = num("ParametricHighlights");
  a.cg_blend = v("ColorGradeBlending") != null ? num("ColorGradeBlending") : 50; a.cg_bal = num("ColorGradeBalance");
  if (!a.cg_bal && num("SplitToningBalance")) a.cg_bal = num("SplitToningBalance");
  for (const k in a) a[k] = Math.round(a[k] * 100) / 100;
  const name = (text.match(/<crs:Name>[\s\S]*?<rdf:li[^>]*>([^<]+)</) || [])[1] || "";
  const unsupported = ["Texture", "Sharpness", "PostCropVignetteAmount", "RedPrimaryHue", "ShadowTint", "LuminanceSmoothing"].filter(k => v(k) != null && num(k) !== 0);
  return { name: name.trim(), adj: a, unsupported };
}
// قراءة سمات crs:* وعناصرها بدون DOMParser (يعمل في العامل أيضاً)
function DOMParserish(t0) {
  const m = {}, t = (t0.match(/<rdf:Description[\s\S]*?>/) || [t0])[0];
  t0.replace(/<crs:Name>[\s\S]*?<\/crs:Name>/, x => { m.__name = x; });
  t.replace(/crs:([A-Za-z0-9]+)="([^"]*)"/g, (_, k, v) => { m[k] = v; });
  t.replace(/<crs:([A-Za-z0-9]+)>([^<]*)<\/crs:\1>/g, (_, k, v) => { m[k] = v; });
  this.get = k => m[k];
}


/* ============ جداول الألوان ثلاثية الأبعاد ============ */
const _lutCache = new Map();
function decodeLUT(l) {
  if (_lutCache.has(l.b64)) return _lutCache.get(l.b64);
  const bin = atob(l.b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const v = { n: l.n, d: u }; if (_lutCache.size > 6) _lutCache.clear(); _lutCache.set(l.b64, v); return v;
}
function encodeLUT(n, u8) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return { n, b64: btoa(s) }; }

/** ملف .cube (Adobe/Resolve) → جدول 8-بت */
export function parseCube(text) {
  let n = 0; const vals = []; let dmin = [0, 0, 0], dmax = [1, 1, 1];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim(); if (!t || t[0] === "#") continue;
    if (/^LUT_3D_SIZE/i.test(t)) { n = parseInt(t.split(/\s+/)[1]); continue; }
    if (/^DOMAIN_MIN/i.test(t)) { dmin = t.split(/\s+/).slice(1).map(Number); continue; }
    if (/^DOMAIN_MAX/i.test(t)) { dmax = t.split(/\s+/).slice(1).map(Number); continue; }
    if (/^[A-Z_]/i.test(t)) continue;
    const p = t.split(/\s+/).map(Number); if (p.length >= 3 && p.every(x => !isNaN(x))) vals.push(p[0], p[1], p[2]);
  }
  if (!n || vals.length < n * n * n * 3) throw new Error("ملف .cube غير صالح");
  const u = new Uint8Array(n * n * n * 3);
  for (let i = 0; i < u.length; i++) { const c = i % 3; u[i] = Math.max(0, Math.min(255, Math.round((vals[i] - dmin[c]) / (dmax[c] - dmin[c]) * 255))); }
  return encodeLUT(n, u);
}

/** «مطابقة Lightroom»: يتعلّم جدول ألوان من صورة أصلية ونسختها المعدّلة (نفس القص) */
export function lutFromPair(src, dst, n = 33) {
  const N1 = n - 1, cells = n * n * n, sum = new Float64Array(cells * 3), wt = new Float64Array(cells);
  const a = src.data, b = dst.data;
  for (let i = 0; i < a.length; i += 4) {
    const fr = a[i] / 255 * N1, fg = a[i + 1] / 255 * N1, fb = a[i + 2] / 255 * N1;
    const x0 = Math.min(N1 - 1, fr | 0), y0 = Math.min(N1 - 1, fg | 0), z0 = Math.min(N1 - 1, fb | 0), dx = fr - x0, dy = fg - y0, dz = fb - z0;
    for (let k = 0; k < 8; k++) {
      const ox = k & 1, oy = (k >> 1) & 1, oz = (k >> 2) & 1;
      const w = (ox ? dx : 1 - dx) * (oy ? dy : 1 - dy) * (oz ? dz : 1 - dz); if (w < 1e-4) continue;
      const c = ((z0 + oz) * n + (y0 + oy)) * n + (x0 + ox);
      // نحفظ «الفرق» عن اللون الأصلي للخلية حتى يمكن ملء الخلايا الفارغة بانسياب
      sum[c * 3] += w * (b[i] - a[i]); sum[c * 3 + 1] += w * (b[i + 1] - a[i + 1]); sum[c * 3 + 2] += w * (b[i + 2] - a[i + 2]); wt[c] += w;
    }
  }
  const off = new Float32Array(cells * 3), known = new Uint8Array(cells);
  for (let c = 0; c < cells; c++) if (wt[c] > 0.5) { off[c * 3] = sum[c * 3] / wt[c]; off[c * 3 + 1] = sum[c * 3 + 1] / wt[c]; off[c * 3 + 2] = sum[c * 3 + 2] / wt[c]; known[c] = 1; }
  // ملء الخلايا التي لا تمثّلها الصورة: انتشار من الجيران (فرق التعديل يتغير بانسياب)
  const idx = (x, y, z) => (z * n + y) * n + x;
  for (let pass = 0; pass < 60; pass++) {
    let changed = 0;
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const c = idx(x, y, z); if (known[c] === 1) continue;
      let s0 = 0, s1 = 0, s2 = 0, k = 0;
      for (const [ax, ay, az] of [[x - 1, y, z], [x + 1, y, z], [x, y - 1, z], [x, y + 1, z], [x, y, z - 1], [x, y, z + 1]]) {
        if (ax < 0 || ay < 0 || az < 0 || ax > N1 || ay > N1 || az > N1) continue;
        const q = idx(ax, ay, az); if (!known[q]) continue; s0 += off[q * 3]; s1 += off[q * 3 + 1]; s2 += off[q * 3 + 2]; k++;
      }
      if (k) { off[c * 3] = s0 / k; off[c * 3 + 1] = s1 / k; off[c * 3 + 2] = s2 / k; known[c] = 2; changed++; }
    }
    if (!changed) break;
  }
  const u = new Uint8Array(cells * 3);
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = idx(x, y, z), base = [x, y, z].map(v => v / N1 * 255);
    for (let ch = 0; ch < 3; ch++) u[c * 3 + ch] = Math.max(0, Math.min(255, Math.round(base[ch] + off[c * 3 + ch])));
  }
  const cover = known.reduce((s, v) => s + (v === 1), 0) / cells;
  return { ...encodeLUT(n, u), cover };
}
