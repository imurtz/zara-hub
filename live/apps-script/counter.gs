/**
 * عدّاد بوابة زارة — نموذج المشاركين في ورشة مفاتيح التوظيف
 * يعيد أرقاماً مجمّعة فقط (العدد، اليومي، التوزيعات) — لا يعيد الاسم ولا الهوية ولا الجوال ولا البريد.
 */
const BREAKDOWNS = ["الجنس:", "الفئة العمرية:", "منطقة السكن:"];

// تفصيل خيار «غير ذلك»: يُقرأ ما كتبه المسجّل في خانة التحديد ويُعرض توزيعاً مستقلاً.
// detail: جزء من عنوان خانة التحديد (لا يلزم العنوان كاملاً).
const OTHER_DETAILS = [
  { from: "منطقة السكن:", detail: "يرجى تحديد منطقة سكنك", label: "تفصيل «غير ذلك» في منطقة السكن" }
];

const DAYS = 14;
const TZ = "Asia/Riyadh";

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

  const clean = function (s) { return String(s).replace(/[:：]\s*$/, "").trim(); };
  const breakdowns = BREAKDOWNS.map(function (label) {
    const col = head.indexOf(String(label).trim());
    if (col < 0) return null;
    const m = {};
    rows.forEach(function (r) { const v = cell(r, col) || "غير محدد"; m[v] = (m[v] || 0) + 1; });
    return { label: clean(label), items: Object.keys(m).map(function (k) { return { k: k, n: m[k] }; }) };
  }).filter(Boolean);

  // ما تحت «غير ذلك»: تُجمع الكتابات المتقاربة (همزات، ة/ه، «ال»، مسافات) تحت أكثر صيغة تكراراً
  const norm = function (s) {
    return String(s).replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/^ال/, "").replace(/\s+/g, " ").trim();
  };
  OTHER_DETAILS.forEach(function (o) {
    const base = head.indexOf(String(o.from).trim());
    const det = head.findIndex(function (h) { return h.indexOf(o.detail) > -1; });
    if (base < 0 || det < 0) return;
    const groups = {};
    rows.forEach(function (r) {
      if (cell(r, base) !== "غير ذلك") return;
      const raw = cell(r, det) || "لم يُحدَّد";
      const k = norm(raw) || "لم يُحدَّد";
      const g = groups[k] = groups[k] || { n: 0, names: {} };
      g.n++; g.names[raw] = (g.names[raw] || 0) + 1;
    });
    const items = Object.keys(groups).map(function (k) {
      const g = groups[k], name = Object.keys(g.names).sort(function (a, b) { return g.names[b] - g.names[a]; })[0];
      return { k: name, n: g.n };
    });
    if (items.length) breakdowns.push({ label: o.label, items: items });
  });

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
