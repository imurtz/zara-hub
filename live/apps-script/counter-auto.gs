/**
 * عدّاد بوابة زارة — نسخة تلقائية تصلح لأي نموذج (المتطوعون، المدربون…)
 * تختار التوزيعات بنفسها: أي سؤال إجاباته خيارات محدودة (مثل الجنس، الفئة العمرية، المجال).
 * وتستبعد دائماً: الأسماء، الهوية، الجوال، البريد، والإجابات النصية الحرة.
 * تعيد أرقاماً مجمّعة فقط — لا اسم ولا رقم ولا إجابة فردية.
 */
const MAX_CHOICES = 12;   // السؤال الذي له أكثر من هذا العدد من الإجابات المختلفة يُعدّ نصاً حراً ولا يُعرض
const DAYS = 14;
const TZ = "Asia/Riyadh";
const PRIVATE = /اسم|هوي|جوال|هاتف|موبايل|واتس|بريد|ايميل|إيميل|email|e-mail|phone|mobile|رقم|عنوان|تاريخ الميلاد|ملاحظ|تعليق|اقتراح|سبب|لماذا|نبذة|خبر/i;

function doGet() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get("zara-counter");
  if (hit) return json_(hit);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const head = (values.shift() || []).map(function (h) { return String(h).trim(); });
  const rows = values.filter(function (r) { return r[0] !== "" && r[0] !== null; });
  const cell = function (r, c) { return String(r[c] === null || r[c] === undefined ? "" : r[c]).trim(); };

  const dayKey = function (d) { return Utilities.formatDate(new Date(d), TZ, "yyyy-MM-dd"); };
  const byDay = {};
  let lastAt = 0;
  rows.forEach(function (r) {
    const t = new Date(r[0]);
    if (isNaN(t.getTime())) return;
    const k = dayKey(t);
    byDay[k] = (byDay[k] || 0) + 1;
    if (t.getTime() > lastAt) lastAt = t.getTime();
  });
  const series = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d);
    series.push({ d: k, n: byDay[k] || 0 });
  }

  const clean = function (s) { return String(s).replace(/[:：؟?]\s*$/, "").trim(); };
  const norm = function (s) {
    return String(s).replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/^ال/, "").replace(/\s+/g, " ").trim();
  };
  const isDetail = function (h) { return /غير ذلك|يرجى تحديد|حدد|أخرى/.test(h); };

  const breakdowns = [];
  for (let c = 1; c < head.length; c++) {
    const h = head[c];
    if (!h || PRIVATE.test(h) || isDetail(h)) continue;
    const m = {};
    rows.forEach(function (r) { const v = cell(r, c); if (v) m[v] = (m[v] || 0) + 1; });
    const keys = Object.keys(m);
    if (keys.length < 2 || keys.length > MAX_CHOICES) continue;
    breakdowns.push({ label: clean(h), items: keys.map(function (k) { return { k: k, n: m[k] }; }) });

    // خيار «غير ذلك»: إن تلاه سؤال لتحديده، يُعرض ما كُتب فيه توزيعاً مستقلاً
    const next = head[c + 1] || "";
    if (m["غير ذلك"] && isDetail(next)) {
      const groups = {};
      rows.forEach(function (r) {
        if (cell(r, c) !== "غير ذلك") return;
        const raw = cell(r, c + 1) || "لم يُحدَّد", k = norm(raw) || "لم يُحدَّد";
        const g = groups[k] = groups[k] || { n: 0, names: {} };
        g.n++; g.names[raw] = (g.names[raw] || 0) + 1;
      });
      breakdowns.push({ label: "تفصيل «غير ذلك» في " + clean(h), items: Object.keys(groups).map(function (k) {
        const g = groups[k]; return { k: Object.keys(g.names).sort(function (a, b) { return g.names[b] - g.names[a]; })[0], n: g.n };
      }) });
    }
  }

  const out = JSON.stringify({
    total: rows.length,
    today: byDay[dayKey(new Date())] || 0,
    lastAt: lastAt,
    series: series,
    breakdowns: breakdowns,
    updatedAt: Date.now()
  });
  cache.put("zara-counter", out, 10);
  return json_(out);
}

function json_(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}
