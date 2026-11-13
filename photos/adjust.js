// تعديل الألوان — نفس الدالة للمعاينة وللتصدير (ما تراه هو ما يُصدَّر).
// الضوء والتوازن اللوني في جداول لكل قناة (سريعة جداً)، والتشبع والحيوية لكل بكسل.

export const ADJ = [
  { g: "الضوء", k: "exposure",   l: "التعريض",       min: -3,   max: 3,   step: 0.05, unit: "EV" },
  { g: "الضوء", k: "contrast",   l: "التباين",       min: -100, max: 100, step: 1 },
  { g: "الضوء", k: "highlights", l: "الإضاءات",      min: -100, max: 100, step: 1 },
  { g: "الضوء", k: "shadows",    l: "الظلال",        min: -100, max: 100, step: 1 },
  { g: "الضوء", k: "whites",     l: "الأبيض",        min: -100, max: 100, step: 1 },
  { g: "الضوء", k: "blacks",     l: "الأسود",        min: -100, max: 100, step: 1 },
  { g: "اللون", k: "temp",       l: "الحرارة",       min: -100, max: 100, step: 1, ends: ["بارد", "دافئ"] },
  { g: "اللون", k: "tint",       l: "الصبغة",        min: -100, max: 100, step: 1, ends: ["أخضر", "أرجواني"] },
  { g: "اللون", k: "vibrance",   l: "الحيوية",       min: -100, max: 100, step: 1 },
  { g: "اللون", k: "saturation", l: "التشبع",        min: -100, max: 100, step: 1 }
];
export const ZERO = Object.fromEntries(ADJ.map(a => [a.k, 0]));
export const isZero = p => !p || ADJ.every(a => !p[a.k]);

const s2l = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const l2s = v => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
const bell = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
const clamp = v => v < 0 ? 0 : v > 1 ? 1 : v;

/** جداول القنوات الثلاث (256 قيمة لكل قناة) */
export function buildLUT(p) {
  const t = (p.temp || 0) / 100, ti = (p.tint || 0) / 100;
  // توازن الأبيض: مكاسب للقنوات في الفضاء الخطي
  const gains = [1 + 0.22 * t + 0.04 * ti, 1 - 0.16 * ti, 1 - 0.26 * t + 0.04 * ti];
  const ev = Math.pow(2, p.exposure || 0);
  const c = (p.contrast || 0) / 100, h = (p.highlights || 0) / 100, sh = (p.shadows || 0) / 100, w = (p.whites || 0) / 100, b = (p.blacks || 0) / 100;
  const out = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  for (let ch = 0; ch < 3; ch++) {
    let prev = 0;
    for (let i = 0; i < 256; i++) {
      let x = l2s(clamp(s2l(i / 255) * gains[ch] * ev));
      // الأبيض والأسود: نهايتا المنحنى
      x = x + w * 0.16 * bell(x, 0.93, 0.13) + b * 0.12 * bell(x, 0.06, 0.12);
      // الإضاءات والظلال
      x = x + h * 0.2 * bell(x, 0.76, 0.17) + sh * 0.22 * bell(x, 0.24, 0.17);
      // التباين: منحنى S حول المنتصف
      if (c) { const s = x - 0.5; x = 0.5 + s * (1 + c * 0.9 * (1 - Math.min(1, Math.abs(s) * 2) ** 2)); }
      x = clamp(x);
      if (x < prev) x = prev; prev = x;
      out[ch][i] = Math.round(x * 255);
    }
  }
  return out;
}

/** يطبّق التعديل على ImageData في مكانه */
export function applyAdjust(img, p) {
  if (isZero(p)) return img;
  const [R, G, B] = buildLUT(p), d = img.data, n = d.length;
  const sat = 1 + (p.saturation || 0) / 100, vib = (p.vibrance || 0) / 100, doSat = sat !== 1 || vib !== 0;
  for (let i = 0; i < n; i += 4) {
    let r = R[d[i]], g = G[d[i + 1]], bb = B[d[i + 2]];
    if (doSat) {
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * bb;
      const mx = r > g ? (r > bb ? r : bb) : (g > bb ? g : bb), mn = r < g ? (r < bb ? r : bb) : (g < bb ? g : bb);
      const cs = (mx - mn) / 255;
      // الحيوية: تقوّي الألوان الباهتة أكثر من المشبعة، وتخفف أثرها على درجات البشرة
      const skin = r > g && g > bb && (r - bb) / 255 < 0.45 ? 0.5 : 1;
      const k = sat * (1 + vib * (1 - cs) * skin);
      r = L + (r - L) * k; g = L + (g - L) * k; bb = L + (bb - L) * k;
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = bb;
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
