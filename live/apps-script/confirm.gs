/**
 * عدّاد بوابة زارة — نموذج تأكيد الحضور
 * مثل العدّاد التلقائي، ويضيف: عدد «نعم أؤكد» و«أعتذر»، وتوزيع المؤكِّدين ذكور/إناث
 * بمطابقة الجوال/الهوية/البريد مع جدول ردود المشاركين (لا يُعاد أي اسم أو رقم — أعداد فقط).
 * تختار التوزيعات بنفسها: أي سؤال إجاباته خيارات محدودة (مثل الجنس، الفئة العمرية، المجال).
 * وتستبعد دائماً: الأسماء، الهوية، الجوال، البريد، والإجابات النصية الحرة.
 * تعيد أرقاماً مجمّعة فقط — لا اسم ولا رقم ولا إجابة فردية.
 */
const PARTICIPANTS_SHEET_ID = "1cjGNBGXKCcg45P8yyhllCd-OFtebkyTlP0hhJoZKKT8";   // جدول ردود المشاركين
const PARTICIPANTS_TAB_GID = 1870030208;   // ورقة الردود داخله (gid في الرابط)
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
  const rowsAll = values.filter(function (r) { return r[0] !== "" && r[0] !== null; });
  // كل الأرقام والتوزيعات تُحسب بعد استبعاد التسجيل المكرر (نفس الجوال/الهوية/البريد): يُعتمد أول تسجيل للشخص فقط
  const dupInfo = findDups_(head, rowsAll);
  const rows = rowsAll.filter(function (_, i) { return dupInfo.keep[i]; });
  delete dupInfo.keep;
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
    rawTotal: rowsAll.length,
    confirm: confirmInfo_(head, rows),
    dups: dupInfo,
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
  const strong = {}, firstOf = {}, keep = [];
  rows.forEach(function (_, i) { const p = find(i); strong[p] = (strong[p] || 0) + 1; if (firstOf[p] === undefined) { firstOf[p] = i; keep[i] = true; } else keep[i] = false; });
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
  return { keep: keep, extra: extra, groups: groups, maybe: maybe, maybeGroups: maybeGroups, by: by, checked: cols.map(function (x) { return x.k.key; }).concat(nameCols.length ? ["name"] : []) };
}

// المؤكِّدون (نعم) والمعتذرون، وجنس المؤكِّدين من جدول المشاركين
function confirmInfo_(head, rows) {
  const cell = function (r, c) { return String(r[c] === null || r[c] === undefined ? "" : r[c]).trim(); };
  const ans = head.findIndex(function (h, c) { return c && /تأكيد|الحضور/.test(h); });
  let yes = [], no = 0;
  rows.forEach(function (r) { const v = ans > 0 ? cell(r, ans) : ""; if (/أعتذر|اعتذر|لن |^لا/.test(v)) no++; else yes.push(r); });
  const out = { yes: yes.length, no: no };
  const keysOf = keyCols_(head);
  const gCol = head.findIndex(function (h, c) { return c && /الجنس|النوع/.test(h); });
  let map = {};
  if (PARTICIPANTS_SHEET_ID) {
    try {
      const v = (function () { const all = SpreadsheetApp.openById(PARTICIPANTS_SHEET_ID).getSheets(); return all.filter(function (x) { return x.getSheetId() === PARTICIPANTS_TAB_GID; })[0] || all[0]; })().getDataRange().getValues();
      const ph = (v.shift() || []).map(function (h) { return String(h).trim(); });
      const pg = ph.findIndex(function (h, c) { return c && /الجنس|النوع/.test(h); });
      const pk = keyCols_(ph);
      if (pg > 0) v.forEach(function (r) {
        const g = gender_(cell(r, pg)); if (!g) return;
        pk.forEach(function (k) { const x = k.f(cell(r, k.c)); if (x && !map[k.key + x]) map[k.key + x] = g; });
      });
    } catch (e) { out.error = "participants"; }
  }
  if (gCol < 0 && !Object.keys(map).length) return out;
  const g = { m: 0, f: 0, u: 0 };
  yes.forEach(function (r) {
    let x = gCol > 0 ? gender_(cell(r, gCol)) : "";
    if (!x) keysOf.some(function (k) { const v = k.f(cell(r, k.c)); return v && (x = map[k.key + v]); });
    g[x || "u"]++;
  });
  out.gender = g;
  return out;
}
function gender_(v) { return /أنث|انث|إناث|اناث|female/i.test(v) ? "f" : /ذكر|ذكور|male/i.test(v) ? "m" : ""; }
function keyCols_(head) {
  const digits = function (s) { return String(s).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }).replace(/\D/g, ""); };
  const kinds = [
    { key: "p", re: /جوال|هاتف|موبايل|واتس|تواصل|phone|mobile/i, f: function (v) { const d = digits(v); return d.length >= 9 ? d.slice(-9) : ""; } },
    { key: "i", re: /هوي|سجل مدني|السجل المدني|إقامة|اقامة|national/i, f: function (v) { const d = digits(v); return d.length >= 8 ? d : ""; } },
    { key: "e", re: /بريد|ايميل|إيميل|email|e-mail/i, f: function (v) { v = String(v).trim().toLowerCase(); return /@/.test(v) ? v : ""; } }
  ];
  const cols = [];
  head.forEach(function (h, c) { if (!c) return; kinds.forEach(function (k) { if (k.re.test(h)) cols.push({ c: c, key: k.key, f: k.f }); }); });
  return cols;
}
