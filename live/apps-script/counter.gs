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
    dups: findDups_(head, rows),
    updatedAt: Date.now()
  });
  cache.put("zara-counter", out, 10);
  return json_(out);
}

function json_(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}

/**
 * كشف التسجيل المكرر — يعيد أعداداً فقط (لا اسم ولا رقم):
 * تطابق قوي: نفس رقم الجوال أو الهوية أو البريد (بعد توحيد الصيغة: 05… = 9665… = ٠٥…).
 * تطابق محتمل: نفس الاسم الكامل (ثلاثي فأكثر) دون تطابق قوي.
 */
function findDups_(head, rows) {
  const cell = function (r, c) { return String(r[c] === null || r[c] === undefined ? "" : r[c]).trim(); };
  const ar2en = function (s) { return String(s).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }).replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); }); };
  const digits = function (s) { return ar2en(s).replace(/\D/g, ""); };
  const nName = function (s) {
    return String(s).replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/\s+(بن|بنت)\s+/g, " ").replace(/\s+/g, " ").trim();
  };
  const kinds = [
    { key: "phone", re: /جوال|هاتف|موبايل|واتس|تواصل|phone|mobile/i, f: function (v) { const d = digits(v); return d.length >= 9 ? d.slice(-9) : ""; } },
    { key: "id", re: /هوي|سجل مدني|السجل المدني|إقامة|اقامة|national/i, f: function (v) { const d = digits(v); return d.length >= 8 ? d : ""; } },
    { key: "email", re: /بريد|ايميل|إيميل|email|e-mail/i, f: function (v) { v = String(v).trim().toLowerCase(); return /@/.test(v) ? v : ""; } }
  ];
  const nameCols = [];
  head.forEach(function (h, c) { if (c && /اسم|الاسم|name/i.test(h) && !/مستخدم|جهة|منشأة|مدرسة|جامعة/.test(h)) nameCols.push(c); });
  const cols = [];
  head.forEach(function (h, c) { if (!c) return; kinds.forEach(function (k) { if (k.re.test(h)) cols.push({ c: c, k: k }); }); });

  const parent = rows.map(function (_, i) { return i; });
  const find = function (i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = function (a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const by = { phone: 0, id: 0, email: 0, name: 0 };

  cols.forEach(function (col) {
    const seen = {};
    rows.forEach(function (r, i) {
      const v = col.k.f(cell(r, col.c)); if (!v) return;
      if (seen[v] !== undefined) { if (find(seen[v]) !== find(i)) by[col.k.key]++; union(seen[v], i); } else seen[v] = i;
    });
  });
  const strong = {};
  rows.forEach(function (_, i) { const p = find(i); strong[p] = (strong[p] || 0) + 1; });
  let extra = 0, groups = 0;
  Object.keys(strong).forEach(function (p) { if (strong[p] > 1) { groups++; extra += strong[p] - 1; } });

  // الاسم: يُعدّ احتمالاً فقط إن لم يكن الصفّان مرتبطين أصلاً بتطابق قوي
  let maybe = 0, maybeGroups = 0;
  if (nameCols.length) {
    const seenN = {};
    rows.forEach(function (r, i) {
      const n = nName(nameCols.map(function (c) { return cell(r, c); }).join(" "));
      if (n.split(" ").length < 3) return;
      (seenN[n] = seenN[n] || []).push(i);
    });
    Object.keys(seenN).forEach(function (n) {
      const ids = seenN[n]; if (ids.length < 2) return;
      const roots = {}; ids.forEach(function (i) { roots[find(i)] = 1; });
      const k = Object.keys(roots).length; if (k > 1) { maybe += k - 1; maybeGroups++; by.name += k - 1; }
    });
  }
  return { extra: extra, groups: groups, maybe: maybe, maybeGroups: maybeGroups, by: by, checked: cols.map(function (x) { return x.k.key; }).concat(nameCols.length ? ["name"] : []) };
}
