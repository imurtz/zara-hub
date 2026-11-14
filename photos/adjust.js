// تعديل الألوان — نفس الدالة للمعاينة وللتصدير (ما تراه هو ما يُصدَّر).
// الضوء والتوازن اللوني في جداول لكل قناة (سريعة جداً)، ثم HSL لكل لون + تدرج الألوان + التشبع لكل بكسل.

const BANDS = [["red", "Red", 0, "#E0514A"], ["orange", "Orange", 30, "#E8923A"], ["yellow", "Yellow", 60, "#E6C93A"], ["green", "Green", 120, "#4DB25A"],
  ["aqua", "Aqua", 180, "#3CB8C2"], ["blue", "Blue", 240, "#3F6FD8"], ["purple", "Purple", 270, "#8A5AD6"], ["magenta", "Magenta", 300, "#D04FB0"]];
export { BANDS };

export const ADJ = [
  { g: "amount", k: "amount", l: "Amount", min: 0, max: 100, step: 1, def: 100 },
  { g: "amount", k: "auto", l: "Auto", min: 0, max: 100, step: 1 },
  { g: "الضوء", k: "exposure",   l: "Exposure",  min: -3,   max: 3,   step: 0.05 },
  { g: "الضوء", k: "contrast",   l: "Contrast",  min: -100, max: 100, step: 1 },
  { g: "الضوء", k: "highlights", l: "Highlights", min: -100, max: 100, step: 1 },
  { g: "الضوء", k: "shadows",    l: "Shadows",   min: -100, max: 100, step: 1 },
  { g: "الضوء", k: "whites",     l: "Whites",   min: -100, max: 100, step: 1 },
  { g: "الضوء", k: "blacks",     l: "Blacks",   min: -100, max: 100, step: 1 },
  { g: "اللون", k: "temp",       l: "Temp",  min: -150, max: 150, step: 1 },
  { g: "اللون", k: "tint",       l: "Tint",   min: -150, max: 150, step: 1 },
  { g: "اللون", k: "vibrance",   l: "Vibrance",  min: -100, max: 100, step: 1 },
  { g: "اللون", k: "saturation", l: "Saturation",   min: -100, max: 100, step: 1 },
  ...["h", "s", "l"].flatMap(t => BANDS.map(([k, l, , c]) => ({ g: "hsl-" + t, k: `${t}_${k}`, l, c, min: -100, max: 100, step: 1, adv: 1 }))),
  ...[["sh", "Shadows"], ["mid", "Midtones"], ["hi", "Highlights"]].flatMap(([k, l]) => [
    { g: "grade", k: `cg_${k}_h`, l: `${l} Hue`, min: 0, max: 360, step: 1, hue: 1, adv: 1 },
    { g: "grade", k: `cg_${k}_s`, l: `${l} Sat`, min: 0, max: 100, step: 1, adv: 1 }]),
  { g: "التفاصيل", k: "texture", l: "Texture", min: -100, max: 100, step: 1 },
  { g: "التفاصيل", k: "clarity", l: "Clarity", min: -100, max: 100, step: 1 },
  { g: "التفاصيل", k: "sharp", l: "Sharpening", min: 0, max: 150, step: 1 },
  { g: "التفاصيل", k: "vignette", l: "Vignette", min: -100, max: 100, step: 1 },
  ...[["pc_sh", "Shadows"], ["pc_dk", "Darks"], ["pc_lt", "Lights"], ["pc_hi", "Highlights"]].map(([k, l]) => ({ g: "curve", k, l, min: -100, max: 100, step: 1, adv: 1 })),
  { g: "grade", k: "cg_blend", l: "Blending", min: 0, max: 100, step: 1, def: 50, adv: 1 },
  { g: "grade", k: "cg_bal", l: "Balance", min: -100, max: 100, step: 1, adv: 1 }
];
export const ZERO = Object.fromEntries(ADJ.map(a => [a.k, a.def || 0]));
export const isZero = p => !p || (!p.lut && !(p.tc && p.tc.length) && !["tcR", "tcG", "tcB"].some(k => p[k] && p[k].length) && !p.cg_gl_s && ADJ.every(a => a.k === "amount" || (p[a.k] ?? (a.def || 0)) === (a.def || 0) || (a.hue && !p[a.k.replace(/_h$/, "_s")]))) || (p.amount === 0);
const _isZeroOld = p => !p || ADJ.every(a => (p[a.k] ?? (a.def || 0)) === (a.def || 0) || (a.hue && !p[a.k.replace(/_h$/, "_s")]));

const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const l2s = v => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
const bell = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
const clamp = v => v < 0 ? 0 : v > 1 ? 1 : v;

/** جداول القنوات الثلاث (256 قيمة لكل قناة) */
export function buildLUT(p) {
  const t = (p.temp || 0) / 100, ti = (p.tint || 0) / 100;
  const ag = p._g || [1, 1, 1];
  const gains = [(1 + 0.22 * t + 0.04 * ti) * ag[0], (1 - 0.16 * ti) * ag[1], (1 - 0.26 * t + 0.04 * ti) * ag[2]];
  const ev = Math.pow(2, (p.exposure || 0) + (p._ev || 0));
  const c = (p.contrast || 0) / 100, h = (p.highlights || 0) / 100, sh = (p.shadows || 0) / 100, w = (p.whites || 0) / 100, b = (p.blacks || 0) / 100;
  const pc = ["pc_sh", "pc_dk", "pc_lt", "pc_hi"].map(k => (p[k] || 0) / 100);
  const out = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  const TC = p.tc && p.tc.length >= 2 ? monoCurve(p.tc) : null;   // منحنى النقاط (ToneCurvePV2012)
  const TCC = ["tcR", "tcG", "tcB"].map(k => p[k] && p[k].length >= 2 ? monoCurve(p[k]) : null);
  for (let ch = 0; ch < 3; ch++) {
    let prev = 0;
    for (let i = 0; i < 256; i++) {
      let x = l2s(clamp(s2l(i / 255) * gains[ch] * ev));
      x = x + w * 0.16 * bell(x, 0.93, 0.13) + b * 0.12 * bell(x, 0.06, 0.12);
      x = x + h * 0.2 * bell(x, 0.86, 0.15) + sh * 0.22 * bell(x, 0.24, 0.17);
      // منحنى التون (Parametric) — أربع مناطق
      x = x + (pc[0] * bell(x, 0.12, 0.12) + pc[1] * bell(x, 0.37, 0.13) + pc[2] * bell(x, 0.63, 0.13) + pc[3] * bell(x, 0.88, 0.12)) * 0.13;
      if (c) { const s = x - 0.5; x = 0.5 + s * (1 + c * 0.9 * (1 - Math.min(1, Math.abs(s) * 2) ** 2)); }
      x = clamp(x);
      if (TC) x = TC(x);
      if (TCC[ch]) x = TCC[ch](x);
      if (x < prev) x = prev; prev = x;
      out[ch][i] = Math.round(x * 255);
    }
  }
  return out;
}

// منحنى رتيب ناعم يمر بالنقاط (Fritsch–Carlson) — النقاط بمقياس 0..255
function monoCurve(pts) {
  const P = pts.map(([x, y]) => [x / 255, y / 255]).sort((a, b) => a[0] - b[0]), n = P.length;
  const dx = [], m = [], t = new Array(n);
  for (let i = 0; i < n - 1; i++) { dx[i] = P[i + 1][0] - P[i][0] || 1e-6; m[i] = (P[i + 1][1] - P[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (!m[i]) { t[i] = t[i + 1] = 0; continue; } const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b; if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; } }
  return x => {
    if (x <= P[0][0]) return P[0][1]; if (x >= P[n - 1][0]) return P[n - 1][1];
    let i = 0; while (x > P[i + 1][0]) i++;
    const h = dx[i], u = (x - P[i][0]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * P[i][1] + (u3 - 2 * u2 + u) * h * t[i] + (-2 * u3 + 3 * u2) * P[i + 1][1] + (u3 - u2) * h * t[i + 1];
  };
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
/* =====================================================================
   محرك المعالجة (بأسلوب Lightroom):
   1) خطي بدقة عشرية: توازن أبيض بالتكيّف اللوني (Bradford) + التعريض بالـEV.
   2) نغمات موضعية: تُفصل الإضاءة إلى «قاعدة» ناعمة تحافظ على الحواف (مرشّح مُوجَّه سريع) و«تفاصيل»؛
      الظلال/الإضاءات تعمل على القاعدة فتفتح المناطق وتحفظ تباينها الداخلي، والوضوح يقوّي التفاصيل.
   3) التباين/الأبيض/الأسود بوحدات «ستوب» حول الرمادي المتوسط + كتف ناعم يمنع الحرق القاسي.
   4) اللون في فضاء Oklab الإدراكي (تشبع/حيوية/HSL/تدرج) عبر جدول ثلاثي الأبعاد سريع.
   ===================================================================== */
const S2L = new Float32Array(256); for (let i = 0; i < 256; i++) S2L[i] = s2l(i / 255);
const L2S_N = 4096, L2S = new Float32Array(L2S_N + 1); for (let i = 0; i <= L2S_N; i++) L2S[i] = l2s(i / L2S_N);
const enc = v => v <= 0 ? 0 : v >= 1 ? 1 : L2S[(v * L2S_N + 0.5) | 0];
const MID = Math.log2(0.18);
// ثوابت المعايرة على Lightroom (تُضبط بمقارنة نتائج حقيقية: نفس الأرقام ← نفس الشكل)
export const CAL = { expK: 1, temp: 0.75, tint: 0.00045, ct: 0.42, bl: 1.1, wh: 0.7, sh: 1.55, hi: 1.35, cla: 0.9, tex: 0.55, desat: 0.22, knee: 0.5, roll: 1, sat: 1, vib: 1, pc: 0.13 };
// لوغاريتم سريع بجدول (للقيم ≤ 1)
const LGN = 65536, LGT = new Float32Array(LGN + 2); for (let q = 0; q <= LGN + 1; q++) LGT[q] = Math.log2(Math.max(q / LGN, 1e-5));
const flog2 = Y => { if (Y >= 1) return Math.log2(Y); const f = Y * LGN, q = f | 0; return LGT[q] + (LGT[q + 1] - LGT[q]) * (f - q); };

// توازن الأبيض: إزاحة بالـ«مايرد» على منحنى الإضاءة النهارية + صبغة أخضر/أرجواني، ثم Bradford إلى D65
function cctXY(K) {
  K = Math.max(2500, Math.min(25000, K));
  const x = K <= 7000 ? -4.607e9 / K ** 3 + 2.9678e6 / K ** 2 + 0.09911e3 / K + 0.244063 : -2.0064e9 / K ** 3 + 1.9018e6 / K ** 2 + 0.24748e3 / K + 0.23704;
  return [x, -3 * x * x + 2.87 * x - 0.275];
}
const BR = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];
const BRi = [[0.9869929, -0.1470543, 0.1599627], [0.4323053, 0.5183603, 0.0492912], [-0.0085287, 0.0400428, 0.9684867]];
const RGB2XYZ = [[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]];
const XYZ2RGB = [[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]];
const mm = (A, B) => A.map((r, i) => B[0].map((_, j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const mv3 = (A, v) => A.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
function wbMatrix(temp, tint) {
  if (!temp && !tint) return null;
  // موجب الحرارة = أدفأ: نفترض أن الإضاءة كانت أبرد ونكيّفها إلى D65
  const mired = 1e6 / 6504 - temp * CAL.temp, [x, y0] = cctXY(1e6 / Math.max(40, mired)), y = y0 - tint * CAL.tint;
  const src = [x / y, 1, (1 - x - y) / y], dst = [0.95047, 1, 1.08883];
  const cs = mv3(BR, src), cd = mv3(BR, dst), D = [[cd[0] / cs[0], 0, 0], [0, cd[1] / cs[1], 0], [0, 0, cd[2] / cs[2]]];
  return mm(XYZ2RGB, mm(BRi, mm(D, mm(BR, RGB2XYZ))));
}

// Oklab
function toOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function fromOklab(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
// مراكز الألوان الثمانية على تدرّج Oklch
const OK_BANDS = [["red", 27], ["orange", 55], ["yellow", 100], ["green", 142], ["aqua", 195], ["blue", 258], ["purple", 300], ["magenta", 338]];
const hueOk = h => { const c = hueRGB(h).map(v => s2l(Math.max(0, Math.min(1, v + 0.5)))); const [, a, b] = toOklab(...c); const n = Math.hypot(a, b) || 1; return [a / n, b / n]; };

// جدول اللون ثلاثي الأبعاد (منحنيات + Oklab) — يُبنى مرة لكل إعداد
const _clutCache = new Map();
function colorLUT(p) {
  const key = JSON.stringify([CAL.sat, CAL.vib, CAL.pc, p.tc, p.tcR, p.tcG, p.tcB, p.pc_sh, p.pc_dk, p.pc_lt, p.pc_hi, p.saturation, p.vibrance, ...ADJ.filter(d => /^(h|s|l)_|^cg_/.test(d.k)).map(d => p[d.k])]);
  if (_clutCache.has(key)) return _clutCache.get(key);
  const n = 33, out = new Float32Array(n * n * n * 3);
  const TC = p.tc && p.tc.length >= 2 ? monoCurve(p.tc) : null, TCC = ["tcR", "tcG", "tcB"].map(k => p[k] && p[k].length >= 2 ? monoCurve(p[k]) : null);
  const pc = ["pc_sh", "pc_dk", "pc_lt", "pc_hi"].map(k => (p[k] || 0) / 100), hasPC = pc.some(Boolean);
  const sat = 1 + (p.saturation || 0) / 100 * CAL.sat, vib = (p.vibrance || 0) / 100 * CAL.vib;
  const hsl = OK_BANDS.map(([k, c]) => [c, (p["h_" + k] || 0), (p["s_" + k] || 0) / 100, (p["l_" + k] || 0) / 100]), hasHSL = hsl.some(x => x[1] || x[2] || x[3]);
  const cgv = ["sh", "mid", "hi", "gl"].map(k => { const s = (p[`cg_${k}_s`] || 0) / 100; if (!s) return null; const [a, b] = hueOk(p[`cg_${k}_h`] || 0); return [a * s * 0.07, b * s * 0.07]; });
  const blend = 0.5 + ((p.cg_blend ?? 50) - 50) / 100, bal = (p.cg_bal || 0) / 200;
  const band = h => { // استيفاء بين أقرب مركزين
    let i = OK_BANDS.length - 1; for (let j = 0; j < OK_BANDS.length; j++) if (OK_BANDS[j][1] <= h) i = j;
    const A = hsl[i], B = hsl[(i + 1) % hsl.length], span = ((B[0] - A[0]) + 360) % 360 || 360, f = (((h - A[0]) + 360) % 360) / span;
    return [A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f, A[3] + (B[3] - A[3]) * f];
  };
  for (let z = 0, o = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++, o += 3) {
    let r = x / (n - 1), g = y / (n - 1), b = z / (n - 1);
    if (hasPC) { const f = v => v + (pc[0] * bell(v, 0.12, 0.12) + pc[1] * bell(v, 0.37, 0.13) + pc[2] * bell(v, 0.63, 0.13) + pc[3] * bell(v, 0.88, 0.12)) * CAL.pc; r = f(r); g = f(g); b = f(b); }
    if (TC) { r = TC(clamp(r)); g = TC(clamp(g)); b = TC(clamp(b)); }
    if (TCC[0]) r = TCC[0](clamp(r)); if (TCC[1]) g = TCC[1](clamp(g)); if (TCC[2]) b = TCC[2](clamp(b));
    let [L, A, Bb] = toOklab(s2l(clamp(r)), s2l(clamp(g)), s2l(clamp(b)));
    let C = Math.hypot(A, Bb), h = (Math.atan2(Bb, A) * 180 / Math.PI + 360) % 360;
    if (C > 1e-4) {
      const C0 = C;
      if (hasHSL) { const [dh, ds, dl] = band(h), w = Math.min(1, C0 / 0.06); h = (h + dh * 0.25 * w + 360) % 360; C *= 1 + ds * w; L += dl * 0.12 * w * (1 - Math.abs(2 * L - 1) * 0.4); }
      // الحيوية: تقوّي الباهت أكثر، وتحمي البشرة (دافئة متوسطة التشبع)
      const skin = h > 25 && h < 80 && C0 < 0.13 ? 0.45 : 1;
      C *= sat * (1 + vib * Math.max(0, 1 - C0 / 0.2) * skin);
      const hr = h * Math.PI / 180; A = Math.max(0, C) * Math.cos(hr); Bb = Math.max(0, C) * Math.sin(hr);
    }
    if (cgv.some(Boolean)) {
      const Y = L + bal, q1 = 1 - Y / blend, q2 = (Y - (1 - blend)) / blend, ws = q1 > 0 ? q1 * Math.sqrt(q1) : 0, wh = q2 > 0 ? q2 * Math.sqrt(q2) : 0, wm = Math.max(0, 1 - ws - wh) * 0.8;
      for (const [v, w] of [[cgv[0], ws], [cgv[1], wm], [cgv[2], wh], [cgv[3], 1]]) if (v && w) { A += v[0] * w; Bb += v[1] * w; }
    }
    let [R, G, B] = fromOklab(L, A, Bb);
    // خارج النطاق: نقرّب نحو الرمادي بدل القص القاسي
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    if (mx > 1 || mn < 0) { const Yl = 0.2126 * R + 0.7152 * G + 0.0722 * B, yl = clamp(Yl); let k = 1; if (mx > 1 && mx - Yl > 1e-6) k = Math.min(k, (1 - yl) / (mx - Yl)); if (mn < 0 && Yl - mn > 1e-6) k = Math.min(k, yl / (Yl - mn)); R = yl + (R - Yl) * k; G = yl + (G - Yl) * k; B = yl + (B - Yl) * k; }
    out[o] = enc(R); out[o + 1] = enc(G); out[o + 2] = enc(B);
  }
  const v = { n, d: out, identity: !TC && !TCC.some(Boolean) && !hasPC && !hasHSL && sat === 1 && !vib && !cgv.some(Boolean) };
  if (_clutCache.size > 8) _clutCache.clear(); _clutCache.set(key, v); return v;
}

// مرشّح مُوجَّه سريع على نسخة مصغّرة من لوغاريتم الإضاءة (يحفظ الحواف ويمنع الهالات)
function baseLayer(lowSum, lowCnt, w, h, f) {
  const I = new Float32Array(w * h); for (let i = 0; i < I.length; i++) I[i] = lowSum[i] / Math.max(1, lowCnt[i]);
  const r = Math.max(2, Math.round(Math.max(w, h) * 0.035)), eps = 0.35;
  const box = src => { const t = new Float32Array(w * h), o = new Float32Array(w * h), L = 2 * r + 1;
    for (let y = 0; y < h; y++) { let a = 0; const ro = y * w; for (let x = -r; x <= r; x++) a += src[ro + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[ro + x] = a / L; a += src[ro + Math.min(w - 1, x + r + 1)] - src[ro + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let a = 0; for (let y = -r; y <= r; y++) a += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { o[y * w + x] = a / L; a += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
    return o; };
  const II = new Float32Array(w * h); for (let i = 0; i < I.length; i++) II[i] = I[i] * I[i];
  const mI = box(I), mII = box(II), A = new Float32Array(w * h), B = new Float32Array(w * h);
  for (let i = 0; i < I.length; i++) { const v = mII[i] - mI[i] * mI[i], a = v / (v + eps); A[i] = a; B[i] = mI[i] - a * mI[i]; }
  return { a: box(A), b: box(B), w, h, f };
}

export function applyAdjust(img, p) {
  if (isZero(p)) return img;
  p = { ...ZERO, ...p };
  if (p.lut) return applyAdjustLegacy(img, p);
  if (p.auto) Object.assign(p, autoStats(img, p.auto / 100, p.autoWb !== 0));
  const W = img.width, H = img.height, d = img.data, N = W * H;
  // 1) مصفوفة الأبيض + المكاسب التلقائية + التعريض
  const ag = p._g || [1, 1, 1], WB = wbMatrix(p.temp || 0, p.tint || 0) || [[1, 0, 0], [0, 1, 0], [0, 0, 1]], ev = Math.pow(2, (p.exposure || 0) * CAL.expK + (p._ev || 0));
  const M = WB.map(r => r.map((v, j) => v * ag[j] * ev));
  const sh = (p.shadows || 0) / 100, hi = (p.highlights || 0) / 100, wh = (p.whites || 0) / 100, bl = (p.blacks || 0) / 100, ct = (p.contrast || 0) / 100;
  const cla = (p.clarity || 0) / 100, local = !!(sh || hi || cla) && W > 8 && H > 8;
  const amt = Math.max(0, Math.min(1, (p.amount ?? 100) / 100)), mix = amt < 1;
  const CL = colorLUT(p), cn = CL.n, cn1 = cn - 1, CD = CL.d;
  // 2) لوغاريتم الإضاءة (للطبقة القاعدية)
  let logL = null, base = null;
  if (local) {
    logL = new Float32Array(N);
    // معاملات الإضاءة بعد المصفوفة: Y = cr*r + cg*g + cb*b
    const cr = 0.2126 * M[0][0] + 0.7152 * M[1][0] + 0.0722 * M[2][0], cgc = 0.2126 * M[0][1] + 0.7152 * M[1][1] + 0.0722 * M[2][1], cb = 0.2126 * M[0][2] + 0.7152 * M[1][2] + 0.0722 * M[2][2];
    const f = Math.max(1, Math.round(Math.max(W, H) / 640)), lw = Math.ceil(W / f), lh = Math.ceil(H / f), sum = new Float32Array(lw * lh), cnt = new Uint16Array(lw * lh);
    const XL = new Int32Array(W); for (let x = 0; x < W; x++) XL[x] = (x / f) | 0;
    for (let y = 0, i = 0, j = 0; y < H; y++) { const ro = ((y / f) | 0) * lw;
      for (let x = 0; x < W; x++, i += 4, j++) { const lv = flog2(cr * S2L[d[i]] + cgc * S2L[d[i + 1]] + cb * S2L[d[i + 2]]); logL[j] = lv; const q = ro + XL[x]; sum[q] += lv; cnt[q]++; } }
    base = baseLayer(sum, cnt, lw, lh, f);
  }
  const bw = base ? base.w : 0, bh = base ? base.h : 0, bf = base ? base.f : 1;
  // جداول مسبقة للنغمات (بوحدات ستوب) — تُغني عن الحساب الثقيل لكل بكسل
  const LO = -16, HI = 4, NB = 4096, sc = NB / (HI - LO);
  const FU = new Float32Array(NB + 1), GC = new Float32Array(NB + 1), HY = new Float32Array(NB + 1);
  const rawY = lv => { let v = lv - MID;
    if (ct) v = v * (1 + ct * CAL.ct) / (1 + ct * CAL.ct * Math.min(1, Math.abs(v) / 6));
    if (bl) v += bl * CAL.bl * Math.max(0, Math.min(1, (-v - 2.2) / 3)) ** 1.5 * (bl < 0 ? 1.2 : 1);
    if (wh) v += wh * CAL.wh * Math.max(0, Math.min(1, (v + 0.4) / 2.6)) ** 2;
    return Math.pow(2, v + MID); };
  // كتف ناعم متكيّف (مثل Lightroom): يضغط ما يتجاوز الأبيض على مدى واسع يبدأ من 0.5 بدل القص المفاجئ
  const gainMax = Math.max(ev * Math.max(...ag), 1), Ymax = Math.max(rawY(Math.log2(gainMax) + (sh > 0 ? 0.35 : 0)), 1);
  const knee = CAL.knee, YmaxE = 1 + (Ymax - 1) * CAL.roll, r = (YmaxE - knee) / (1 - knee);
  let sa = 0; if (r > 1.0001) { let lo = 1e-4, hi2 = 60; for (let it = 0; it < 60; it++) { const m = (lo + hi2) / 2; (m / (1 - Math.exp(-m)) > r ? (hi2 = m) : (lo = m)); } sa = (lo + hi2) / 2; }
  const shoulder = Y => { if (!sa || Y <= knee) return Math.min(Y, sa ? Y : Y); const t = Math.min(1.5, (Y - knee) / (YmaxE - knee)); return knee + (1 - knee) * (1 - Math.exp(-sa * t)) / (1 - Math.exp(-sa)); };
  for (let q = 0; q <= NB; q++) {
    const lv = LO + q / sc; let u = lv - MID;
    if (sh) u += sh * CAL.sh * Math.max(0, Math.min(1, (0.6 - u) / 4.2)) ** 1.2;
    if (hi) u += hi * CAL.hi * Math.max(0, Math.min(1, (u + 0.2) / 2.8)) ** 1.3;
    FU[q] = u; GC[q] = cla ? 1 + cla * CAL.cla * Math.max(0, 1 - Math.abs(u) / 4.5) : 1;
    let v = lv - MID;
    if (ct) v = v * (1 + ct * CAL.ct) / (1 + ct * CAL.ct * Math.min(1, Math.abs(v) / 6));
    if (bl) v += bl * CAL.bl * Math.max(0, Math.min(1, (-v - 2.2) / 3)) ** 1.5 * (bl < 0 ? 1.2 : 1);
    if (wh) v += wh * CAL.wh * Math.max(0, Math.min(1, (v + 0.4) / 2.6)) ** 2;
    let Yn = shoulder(Math.pow(2, v + MID)); if (!sa && Yn > 0.9) Yn = 0.9 + 0.1 * Math.tanh((Yn - 0.9) / 0.1);
    HY[q] = Yn;
  }
  const look = (T, lv) => { let f = (lv - LO) * sc; if (f <= 0) return T[0]; if (f >= NB) return T[NB]; const q = f | 0, t = f - q; return T[q] + (T[q + 1] - T[q]) * t; };
  const sx = 3, sy = cn * 3, sz = cn * cn * 3, ident = CL.identity;
  const BX0 = base ? new Int32Array(W) : null, BDX = base ? new Float32Array(W) : null;
  if (base) for (let x = 0; x < W; x++) { const fx = Math.min(bw - 1.001, Math.max(0, (x + 0.5) / bf - 0.5)); BX0[x] = fx | 0; BDX[x] = fx - (fx | 0); }
  for (let y = 0, i = 0, j = 0; y < H; y++) {
    let y0 = 0, dy = 0; if (base) { const fy = Math.min(bh - 1.001, Math.max(0, (y + 0.5) / bf - 0.5)); y0 = fy | 0; dy = fy - y0; }
    const dRow = (y * 13) & 7;
    for (let x = 0; x < W; x++, i += 4, j++) {
      const r0 = d[i], g0 = d[i + 1], b0 = d[i + 2];
      const rl = S2L[r0], gl = S2L[g0], bL = S2L[b0];
      let R = M[0][0] * rl + M[0][1] * gl + M[0][2] * bL, G = M[1][0] * rl + M[1][1] * gl + M[1][2] * bL, B = M[2][0] * rl + M[2][1] * gl + M[2][2] * bL;
      const Y = Math.max(0.2126 * R + 0.7152 * G + 0.0722 * B, 1e-5);
      let Yn;
      if (base) {
        const lY = logL[j], x0 = BX0[x], dx = BDX[x], o0 = y0 * bw + x0, o1 = o0 + bw, A = base.a, Bb = base.b;
        const a = (A[o0] + (A[o0 + 1] - A[o0]) * dx) * (1 - dy) + (A[o1] + (A[o1 + 1] - A[o1]) * dx) * dy;
        const b = (Bb[o0] + (Bb[o0 + 1] - Bb[o0]) * dx) * (1 - dy) + (Bb[o1] + (Bb[o1 + 1] - Bb[o1]) * dx) * dy;
        const bs = a * lY + b, det = lY - bs;
        Yn = look(HY, look(FU, bs) + det * look(GC, bs) + MID);
      } else Yn = look(HY, flog2(Y));
      const k = Yn / Y; R *= k; G *= k; B *= k;
      if (k > 1.02) { const ds = Math.pow(1 / k, CAL.desat); R = Yn + (R - Yn) * ds; G = Yn + (G - Yn) * ds; B = Yn + (B - Yn) * ds; }
      const mx = R > G ? (R > B ? R : B) : (G > B ? G : B);
      if (mx > 1) { const t = (mx - 1) / (mx - Yn + 1e-6); R += (Yn - R) * t; G += (Yn - G) * t; B += (Yn - B) * t; }
      let er = R <= 0 ? 0 : R >= 1 ? 1 : L2S[(R * L2S_N + 0.5) | 0], eg = G <= 0 ? 0 : G >= 1 ? 1 : L2S[(G * L2S_N + 0.5) | 0], eb = B <= 0 ? 0 : B >= 1 ? 1 : L2S[(B * L2S_N + 0.5) | 0];
      if (!ident) {
        const fr = er * cn1, fg = eg * cn1, fb = eb * cn1, xa = fr < cn1 ? fr | 0 : cn1 - 1, ya = fg < cn1 ? fg | 0 : cn1 - 1, za = fb < cn1 ? fb | 0 : cn1 - 1;
        const ux = fr - xa, uy = fg - ya, uz = fb - za, p0 = ((za * cn + ya) * cn + xa) * 3;
        let c00 = CD[p0] + (CD[p0 + sx] - CD[p0]) * ux, c10 = CD[p0 + sy] + (CD[p0 + sy + sx] - CD[p0 + sy]) * ux, c01 = CD[p0 + sz] + (CD[p0 + sz + sx] - CD[p0 + sz]) * ux, c11 = CD[p0 + sz + sy] + (CD[p0 + sz + sy + sx] - CD[p0 + sz + sy]) * ux;
        let e0 = c00 + (c10 - c00) * uy; er = e0 + (c01 + (c11 - c01) * uy - e0) * uz;
        c00 = CD[p0 + 1] + (CD[p0 + 1 + sx] - CD[p0 + 1]) * ux; c10 = CD[p0 + 1 + sy] + (CD[p0 + 1 + sy + sx] - CD[p0 + 1 + sy]) * ux; c01 = CD[p0 + 1 + sz] + (CD[p0 + 1 + sz + sx] - CD[p0 + 1 + sz]) * ux; c11 = CD[p0 + 1 + sz + sy] + (CD[p0 + 1 + sz + sy + sx] - CD[p0 + 1 + sz + sy]) * ux;
        e0 = c00 + (c10 - c00) * uy; eg = e0 + (c01 + (c11 - c01) * uy - e0) * uz;
        c00 = CD[p0 + 2] + (CD[p0 + 2 + sx] - CD[p0 + 2]) * ux; c10 = CD[p0 + 2 + sy] + (CD[p0 + 2 + sy + sx] - CD[p0 + 2 + sy]) * ux; c01 = CD[p0 + 2 + sz] + (CD[p0 + 2 + sz + sx] - CD[p0 + 2 + sz]) * ux; c11 = CD[p0 + 2 + sz + sy] + (CD[p0 + 2 + sz + sy + sx] - CD[p0 + 2 + sz + sy]) * ux;
        e0 = c00 + (c10 - c00) * uy; eb = e0 + (c01 + (c11 - c01) * uy - e0) * uz;
      }
      const dt = (((x * 7) & 7) ^ dRow) / 8 - 0.4375;
      let r8 = er * 255 + dt, g8 = eg * 255 + dt, b8 = eb * 255 + dt;
      if (mix) { r8 = r0 + (r8 - r0) * amt; g8 = g0 + (g8 - g0) * amt; b8 = b0 + (b8 - b0) * amt; }
      d[i] = r8; d[i + 1] = g8; d[i + 2] = b8;
    }
  }
  // النسيج والحدّة (تفاصيل صغيرة) — الوضوح صار ضمن الطبقة القاعدية أعلاه
  if (p.texture || p.sharp) localContrast(img, { ...p, clarity: 0 }, amt);
  if (p.vignette) vignette(img, p.vignette / 100 * amt);
  return img;
}

function applyAdjustLegacy(img, p) {
  if (isZero(p)) return img;
  p = { ...ZERO, ...p };
  if (p.auto) Object.assign(p, autoStats(img, p.auto / 100, p.autoWb !== 0));
  const [R, G, B] = buildLUT(p), d = img.data, n = d.length;
  const sat = 1 + (p.saturation || 0) / 100, vib = (p.vibrance || 0) / 100;
  const T = hslTables(p);
  // تدرج الألوان
  const cg = [["sh", 0], ["mid", 1], ["hi", 2]].map(([k]) => { const s = (p[`cg_${k}_s`] || 0) / 100; return s ? hueRGB(p[`cg_${k}_h`] || 0).map(v => v * s * 0.32) : null; });
  const cgl = p.cg_gl_s ? hueRGB(p.cg_gl_h || 0).map(v => v * p.cg_gl_s / 100 * 0.25) : null;
  const [c0, c1, c2] = cg, doCG = cg.some(Boolean) || !!cgl, blend = 0.5 + ((p.cg_blend ?? 50) - 50) / 100, bal = (p.cg_bal || 0) / 200;
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
        if (cgl) { r += cgl[0]; g += cgl[1]; b += cgl[2]; }
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
  if (p.texture || p.clarity || p.sharp) localContrast(img, p, amt);
  if (p.vignette) vignette(img, p.vignette / 100 * amt);
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
  a.contrast += num("Dehaze") * 0.5;
  a.clarity = num("Clarity2012"); a.texture = num("Texture"); a.sharp = num("Sharpness"); a.vignette = num("PostCropVignetteAmount");
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
  for (const [k, n] of [["tcR", "Red"], ["tcG", "Green"], ["tcB", "Blue"]]) {
    const m = text.match(new RegExp(`<crs:ToneCurvePV2012${n}>[\\s\\S]*?<\\/crs:ToneCurvePV2012${n}>`));
    if (m) { const pts = [...m[0].matchAll(/<rdf:li>\s*(\d+)\s*,\s*(\d+)\s*<\/rdf:li>/g)].map(x => [+x[1], +x[2]]); if (pts.length >= 2 && pts.some(([x, y]) => x !== y)) a[k] = pts; }
  }
  a.cg_gl_h = num("ColorGradeGlobalHue"); a.cg_gl_s = num("ColorGradeGlobalSat");
  const tcm = text.match(/<crs:ToneCurvePV2012>[\s\S]*?<\/crs:ToneCurvePV2012>/);
  if (tcm) { const pts = [...tcm[0].matchAll(/<rdf:li>\s*(\d+)\s*,\s*(\d+)\s*<\/rdf:li>/g)].map(m => [+m[1], +m[2]]); if (pts.length >= 2 && pts.some(([x, y]) => x !== y)) a.tc = pts; }
  const name = (text.match(/<crs:Name>[\s\S]*?<rdf:li[^>]*>([^<]+)</) || [])[1] || "";
  const unsupported = ["RedPrimaryHue", "ShadowTint", "LuminanceSmoothing"].filter(k => v(k) != null && num(k) !== 0);
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
      // كلما ابتعد اللون عن ألوان الصورة يخفت التعديل نحو «بلا تغيير» حتى لا تُخترع ألوان غريبة
      if (k) { off[c * 3] = s0 / k * 0.8; off[c * 3 + 1] = s1 / k * 0.8; off[c * 3 + 2] = s2 / k * 0.8; known[c] = 2; changed++; }
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


/* ============ تصحيح تلقائي محافظ: توازن الأبيض + التعريض لكل صورة ============ */
function autoStats(img, k, wb = true) {
  const d = img.data, n = d.length / 4, step = Math.max(1, Math.floor(n / 60000)) * 4;
  const Ys = [], neu = [0, 0, 0]; let nw = 0;
  for (let i = 0; i < d.length; i += step) {
    const r = s2l(d[i] / 255), g = s2l(d[i + 1] / 255), b = s2l(d[i + 2] / 255), Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    Ys.push(Y);
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (Y > 0.12 && Y < 0.9 && mx - mn < 0.25 * mx + 8) { const w = Y * Y; neu[0] += r * w; neu[1] += g * w; neu[2] += b * w; nw += w; }
  }
  Ys.sort((a, b) => a - b);
  const q = f => Ys[Math.min(Ys.length - 1, Math.floor(f * Ys.length))] || 1e-4;
  // التعريض: وسط الصورة نحو 0.18 دون حرق الإضاءات
  let ev = Math.log2(0.18 / Math.max(q(0.5), 1e-4)); const evHi = Math.log2(0.95 / Math.max(q(0.985), 1e-4));
  ev = ev > 0 ? Math.max(0, Math.min(ev, evHi)) : Math.max(ev, Math.min(0, evHi));
  ev = Math.max(-0.8, Math.min(0.8, ev)) * k;
  // الأبيض: تحييد لون الرماديات (بحدود محافظة)
  let g = [1, 1, 1];
  if (nw > 0 && wb) { const m = neu.map(v => v / nw); g = m.map(v => Math.max(0.82, Math.min(1.22, m[1] / Math.max(v, 1e-5)))); g = g.map(v => 1 + (v - 1) * k * 0.85); }
  return { _ev: ev, _g: g };
}

/* ============ النسيج + الوضوح + الحدّة (تباين موضعي على الإضاءة) ============ */
function boxBlur(src, w, h, r, tmp, out) {
  // ثلاث مرات صندوقية ≈ غاوسي
  let a = src, b = out;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) { const o = y * w; let acc = 0; const L = r * 2 + 1;
      for (let x = -r; x <= r; x++) acc += a[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { tmp[o + x] = acc / L; acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let acc = 0; const L = r * 2 + 1;
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { b[y * w + x] = acc / L; acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
    a = b;
  }
  return b;
}
function localContrast(img, p, amt) {
  const w = img.width, h = img.height, d = img.data, N = w * h;
  if (!w || !h) return;
  const Y = new Float32Array(N), add = new Float32Array(N);
  for (let i = 0, j = 0; j < N; i += 4, j++) Y[j] = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
  // الوضوح والنسيج: ضبابية على نسخة مصغّرة ثم استيفاء — نفس الأثر بسرعة أكبر بكثير
  const big = (r, k, mid) => {
    const f = Math.max(1, Math.floor(r / 3)), sw = Math.ceil(w / f), sh = Math.ceil(h / f), sm = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      let acc = 0, c = 0; const y0 = y * f, x0 = x * f;
      for (let yy = y0; yy < Math.min(h, y0 + f); yy++) { const o = yy * w; for (let xx = x0; xx < Math.min(w, x0 + f); xx++) { acc += Y[o + xx]; c++; } }
      sm[y * sw + x] = acc / c;
    }
    const rr = Math.max(1, Math.round(r / f)), tmp = new Float32Array(sw * sh), bl = new Float32Array(sw * sh);
    boxBlur(sm, sw, sh, rr, tmp, bl);
    for (let y = 0; y < h; y++) {
      const fy = Math.min(sh - 1.001, Math.max(0, (y + 0.5) / f - 0.5)), y0 = fy | 0, dy = fy - y0, r0 = y0 * sw, r1 = (y0 + 1) * sw;
      for (let x = 0; x < w; x++) {
        const fx = Math.min(sw - 1.001, Math.max(0, (x + 0.5) / f - 0.5)), x0 = fx | 0, dx = fx - x0;
        const bv = (bl[r0 + x0] * (1 - dx) + bl[r0 + x0 + 1] * dx) * (1 - dy) + (bl[r1 + x0] * (1 - dx) + bl[r1 + x0 + 1] * dx) * dy;
        const j = y * w + x, yv = Y[j], m = mid ? 1 - (2 * yv - 1) ** 2 : 1;
        add[j] += (yv - bv) * k * m;
      }
    }
  };
  if (p.texture) big(Math.max(1, Math.round(w * 0.0025)), p.texture / 100 * CAL.tex * amt, true);
  if (p.clarity) big(Math.max(2, Math.round(w * 0.012)), p.clarity / 100 * 0.45 * amt, true);
  // الحدّة: قناع حاد صغير 3×3 على الإضاءة
  if (p.sharp) {
    const k = p.sharp / 100 * 0.9 * amt * (w > 3500 ? 1 : 0.8);
    for (let y = 1; y < h - 1; y++) { const o = y * w; for (let x = 1; x < w - 1; x++) {
      const j = o + x, b = (Y[j - 1] + Y[j + 1] + Y[j - w] + Y[j + w]) * 0.125 + (Y[j - w - 1] + Y[j - w + 1] + Y[j + w - 1] + Y[j + w + 1]) * 0.0625 + Y[j] * 0.25;
      add[j] += (Y[j] - b) * k * 2;
    } }
  }
  for (let i = 0, j = 0; j < N; i += 4, j++) { const v = add[j] * 255; if (v) { d[i] += v; d[i + 1] += v; d[i + 2] += v; } }
}
function vignette(img, v) {
  const w = img.width, h = img.height, d = img.data, cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) { const dy = (y - cy) / cy;
    for (let x = 0; x < w; x++) { const dx = (x - cx) / cx, rr = Math.sqrt(dx * dx + dy * dy) / Math.SQRT2;
      const t = rr < 0.35 ? 0 : rr > 1 ? 1 : (rr - 0.35) / 0.65, m = t * t * (3 - 2 * t), f = 1 + v * 0.75 * m;
      if (f !== 1) { const i = (y * w + x) * 4; d[i] *= f; d[i + 1] *= f; d[i + 2] *= f; } } }
}

/* ============ مطابقة صورة مرجعية: تحليل كل صورة وحساب تصحيح مستقل لها ============ */
// تُفصل الإضاءة عن اللون: الأبيض من الرماديات، التعريض من الوجوه (أو وسط مشذّب)، التباين من أطراف التوزيع المشذّب، التشبع من الألوان الواضحة فقط.
export function imageStats(img, faces = [], opt = {}) {
  const d = img.data, W = img.width, H = img.height, step = Math.max(1, Math.floor(Math.sqrt((W * H) / 90000)));
  // للمرجع: تجاهل شريط الشعارات أعلى الصورة ومنطقة تذييل الحقوق أسفلها إن وُجدت
  const y0 = opt.skipRights ? Math.round(H * 0.14) : 0, y1 = opt.skipRights ? Math.round(H * 0.66) : H;
  const inFace = (x, y) => faces.some(f => x >= (f.x + f.w * 0.2) * W && x <= (f.x + f.w * 0.8) * W && y >= (f.y + f.h * 0.2) * H && y <= (f.y + f.h * 0.8) * H);
  const Yall = [], faceY = [], sats = [], neu = [0, 0, 0]; let nw = 0;
  for (let y = y0; y < y1; y += step) for (let x = 0; x < W; x += step) {
    const i = (y * W + x) * 4, R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255;
    const rl = s2l(R), gl = s2l(G), bl = s2l(B), Yl = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl, Yg = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B), ch = mx - mn;
    if (faces.length && inFace(x, y)) { faceY.push(Yl); continue; }
    if (Yg > 0.03 && Yg < 0.97) Yall.push(Yg);
    // رماديات متوسطة السطوع (لا البياض المحروق ولا السواد) لتقدير لون الإضاءة
    if (Yg > 0.18 && Yg < 0.92 && ch < 0.1 + 0.12 * mx) { const w = Yg; neu[0] += rl * w; neu[1] += gl * w; neu[2] += bl * w; nw += w; }
    if (ch > 0.1 && Yg > 0.08 && Yg < 0.95) sats.push(ch / Math.max(mx, 1e-3));
  }
  const pct = (a, f) => { if (!a.length) return null; a.sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(f * a.length))]; };
  const Ys = Yall.sort((a, b) => a - b), q = f => Ys.length ? Ys[Math.min(Ys.length - 1, Math.floor(f * Ys.length))] : 0.5;
  return {
    neutral: nw > 0 ? neu.map(v => v / nw) : null,
    face: faceY.length > 40 ? pct(faceY, 0.5) : null,
    p05: q(0.05), p10: q(0.1), p50: q(0.5), p90: q(0.9), p98: q(0.98),
    sat: pct(sats, 0.5)
  };
}

/** يحسب تصحيح صورة واحدة لتقترب من المرجع — بحدود تحمي البشرة والأبيض والظلال */
export function matchAdj(t, r) {
  const a = { ...ZERO };
  // 1) الأبيض/الميل اللوني: نقل لون الرماديات إلى لون رماديات المرجع
  let g = [1, 1, 1];
  if (t.neutral && r.neutral) {
    const tn = t.neutral.map(v => v / t.neutral[1]), rn = r.neutral.map(v => v / r.neutral[1]);
    g = [rn[0] / tn[0], 1, rn[2] / tn[2]].map(v => Math.max(0.8, Math.min(1.25, v)));
  }
  a._g = g;
  // 2) التعريض: من سطوع الوجوه إن وُجدت في الاثنين، وإلا من الوسط المشذّب
  const lin = v => s2l(Math.max(0, Math.min(1, v)));
  // بدون وجوه: نرسو على أفتح المساحات (الجدران/الثياب البيضاء) لأنها أثبت من الوسط أمام اختلاف المحتوى
  const evW = Math.log2(lin(r.p90) / Math.max(lin(t.p90), 1e-4)) * 0.85;
  let ev = t.face && r.face ? 0.6 * Math.log2(r.face / t.face) + 0.4 * evW : evW;
  ev = Math.max(-1, Math.min(1, ev));
  // حماية الأبيض: لا نرفع أعلى الصورة فوق 0.97
  const hiLin = lin(t.p98) * Math.pow(2, ev); if (ev > 0 && hiLin > 0.86) ev = Math.max(0, Math.log2(0.86 / Math.max(lin(t.p98), 1e-4)));
  a.exposure = Math.round(ev * 100) / 100;
  // 3) التباين: منحنى بثلاث نقاط يقرّب ظلال/إضاءات الصورة (بعد التعريض) من المرجع — نصف المسافة وبحدود
  const k = Math.pow(2, ev), after = v => l2s(Math.min(1, lin(v) * k));
  const t10 = after(t.p10), t90 = after(t.p90), t50 = after(t.p50);
  const mv = (from, to, lim) => from + Math.max(-lim, Math.min(lim, (to - from) * 0.5));
  let o10 = mv(t10, r.p10, 0.06), o90 = mv(t90, r.p90, 0.06), o50 = t50;
  o10 = Math.max(0.01, Math.min(o10, o50 - 0.05)); o90 = Math.min(0.99, Math.max(o90, o50 + 0.05));
  if (t90 > 0.9) o90 = Math.max(o90, t90 - 0.02);         // لا نطفئ الأبيض
  if (t10 < 0.06) o10 = Math.max(Math.min(o10, t10 + 0.04), t10 - 0.01); // لا نسحق الظلال
  a.tc = [[0, 0], [Math.round(t10 * 255), Math.round(o10 * 255)], [Math.round(t50 * 255), Math.round(o50 * 255)], [Math.round(t90 * 255), Math.round(o90 * 255)], [255, 255]];
  // 4) التشبع: نسبة تشبع الألوان الواضحة (70% من الفرق، بحدود)؛ الزيادة بالحيوية لأنها تحمي البشرة
  if (t.sat && r.sat) {
    const ratio = Math.max(0.8, Math.min(1.25, 1 + (r.sat / t.sat - 1) * 0.7));
    if (ratio >= 1) a.vibrance = Math.round((ratio - 1) * 140); else a.saturation = Math.round((ratio - 1) * 100);
  }
  return a;
}

/* ============ ثلاث معاينات بدون مرجع خارجي ============ */
// تُبنى «إحصاءات مرجع افتراضي» من الصورة الممثلة نفسها: تصحيح نحو تعريض وتباين متوازنين، ثم ثلاثة أهداف للون الإضاءة.
// المعاينة المختارة تصبح مرجعاً، ويُحسب لكل صورة تصحيح مستقل نحوها عبر matchAdj.
export const LOOKS = {
  neutral: { label: "متوازن ومحايد", tint: [1, 1, 1], sat: 1.0 },
  warm:    { label: "أدفأ قليلاً",   tint: [1.085, 1, 0.87], sat: 1.08 },
  cool:    { label: "أبرد قليلاً",   tint: [0.94, 0.995, 1.1], sat: 0.95 }
};
export function lookRef(t, kind) {
  const L = LOOKS[kind] || LOOKS.neutral, lin = v => s2l(Math.max(0, Math.min(1, v)));
  // شدة الاختلاف تتناسب مع حياد الصورة: الصورة المائلة لوناً أصلاً تحتاج ميلاً أخف حتى لا يتضاعف
  let cast = 0; if (t.neutral) { const n = t.neutral.map(v => v / t.neutral[1]); cast = Math.min(1, (Math.abs(n[0] - 1) + Math.abs(n[2] - 1)) * 2); }
  const k = 1 - cast * 0.3, tint = L.tint.map(v => 1 + (v - 1) * k);
  // التعريض: البشرة نحو مدى طبيعي، وإلا الأبيض نحو 0.88 دون حرق
  const face = t.face ? Math.min(0.26, Math.max(0.14, t.face + (0.19 - t.face) * 0.6)) : null;
  const p90 = Math.min(0.92, Math.max(0.84, t.p90 + (0.88 - t.p90) * 0.6));
  const p10 = Math.min(0.12, Math.max(0.05, t.p10 + (0.07 - t.p10) * 0.6));
  return { neutral: tint.map(v => v * 0.5), face, p05: p10 * 0.8, p10, p50: t.p50, p90, p98: Math.min(0.97, p90 + 0.05), sat: t.sat ? t.sat * L.sat : null, look: kind };
}
