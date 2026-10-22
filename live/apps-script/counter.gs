/**
 * عدّاد بوابة زارة — يُلصق في جدول ردود نموذج Google (الإضافات ← Apps Script) ثم يُنشر «تطبيق ويب».
 * يعيد أرقاماً مجمّعة فقط: العدد الكلي، تسجيلات اليوم، وقت آخر تسجيل، التسجيل اليومي، والتوزيعات.
 * لا يعيد أي اسم أو رقم جوال أو إجابة فردية.
 *
 * عدّل السطر التالي فقط: أسماء أعمدة الجدول التي تريد توزيعاتها، مكتوبة كما في الصف الأول تماماً.
 */
const BREAKDOWNS = ["الجنس", "المؤهل"];

const DAYS = 14;              // عدد الأيام في رسم التسجيل اليومي
const TZ = "Asia/Riyadh";

function doGet() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get("zara-counter");
  if (hit) return json_(hit);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const head = (values.shift() || []).map(function (h) { return String(h).trim(); });
  const rows = values.filter(function (r) { return r[0] !== "" && r[0] !== null; });

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

  const breakdowns = BREAKDOWNS.map(function (label) {
    const col = head.indexOf(String(label).trim());
    if (col < 0) return null;
    const m = {};
    rows.forEach(function (r) {
      const v = String(r[col] === null || r[col] === undefined ? "" : r[col]).trim() || "غير محدد";
      m[v] = (m[v] || 0) + 1;
    });
    return { label: label, items: Object.keys(m).map(function (k) { return { k: k, n: m[k] }; }) };
  }).filter(Boolean);

  const out = JSON.stringify({
    total: rows.length,
    today: byDay[dayKey(new Date())] || 0,
    lastAt: lastAt,
    series: series,
    breakdowns: breakdowns,
    updatedAt: Date.now()
  });
  cache.put("zara-counter", out, 10);   // نسخة لعشر ثوانٍ: كثرة الزوار لا تثقل الجدول، والتحديث يبقى شبه فوري
  return json_(out);
}

function json_(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}
