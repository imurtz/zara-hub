/**
 * تقييم الورشة — بوابة زارة (gzara.org/live/eval)
 * يُلصق داخل نموذج Google نفسه (⋮ ← محرر النص البرمجي)، ثم: نشر ← نشر جديد ← تطبيق ويب
 *   التنفيذ باسم: أنا  ·  من يمكنه الوصول: أي شخص  ← انسخ رابط /exec وأرسله.
 * يعيد أرقاماً مجمّعة فقط: عدد الردود، وتوزيع إجابات كل سؤال، ونص الملاحظات المكتوبة (بعد حذف أي رقم أو بريد).
 * لا يعيد اسماً ولا بريد المجيب ولا وقت كل ردّ منفرداً.
 */
const TZ = "Asia/Riyadh";

function doGet() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get("zara-eval");
  if (hit) return json_(hit);

  // يعمل سواء فُتح المحرر من النموذج نفسه أو من جدول ردوده
  let form = null;
  try { form = FormApp.getActiveForm(); } catch (e) {}
  if (!form) form = FormApp.openByUrl(SpreadsheetApp.getActiveSpreadsheet().getFormUrl());
  const T = FormApp.ItemType;
  const items = form.getItems().filter(function (it) {
    return [T.MULTIPLE_CHOICE, T.LIST, T.CHECKBOX, T.SCALE, T.TEXT, T.PARAGRAPH_TEXT, T.RATING].indexOf(it.getType()) > -1;
  });

  const qs = items.map(function (it) {
    const t = it.getType(), q = { id: it.getId(), title: it.getTitle(), help: it.getHelpText(), kind: "choice", options: [], counts: {}, texts: [], answered: 0 };
    if (t === T.MULTIPLE_CHOICE) q.options = it.asMultipleChoiceItem().getChoices().map(function (c) { return c.getValue(); });
    else if (t === T.LIST) q.options = it.asListItem().getChoices().map(function (c) { return c.getValue(); });
    else if (t === T.CHECKBOX) { q.kind = "multi"; q.options = it.asCheckboxItem().getChoices().map(function (c) { return c.getValue(); }); }
    else if (t === T.SCALE) { const s = it.asScaleItem(); q.kind = "scale"; for (let v = s.getUpperBound(); v >= s.getLowerBound(); v--) q.options.push(String(v)); }
    else if (t === T.RATING) { q.kind = "scale"; for (let v = 5; v >= 1; v--) q.options.push(String(v)); }
    else q.kind = "text";
    return q;
  });
  const byId = {};
  qs.forEach(function (q) { byId[q.id] = q; });

  const clean = function (s) {
    return String(s).replace(/\S+@\S+/g, "…").replace(/[0-9٠-٩]{6,}/g, "…").replace(/\s+/g, " ").trim();
  };

  const responses = form.getResponses();
  const byDay = {}, byHour = {};
  let lastAt = 0, firstAt = 0;
  responses.forEach(function (r) {
    const ts = r.getTimestamp(), ms = ts.getTime();
    const d = Utilities.formatDate(ts, TZ, "yyyy-MM-dd"), h = Utilities.formatDate(ts, TZ, "yyyy-MM-dd HH");
    byDay[d] = (byDay[d] || 0) + 1; byHour[h] = (byHour[h] || 0) + 1;
    if (ms > lastAt) lastAt = ms; if (!firstAt || ms < firstAt) firstAt = ms;
    r.getItemResponses().forEach(function (ir) {
      const q = byId[ir.getItem().getId()]; if (!q) return;
      const a = ir.getResponse();
      if (a === null || a === "" || (Array.isArray(a) && !a.length)) return;
      q.answered++;
      if (q.kind === "text") { const c = clean(a); if (c.length > 1) q.texts.push(c); return; }
      (Array.isArray(a) ? a : [a]).forEach(function (v) { v = String(v); q.counts[v] = (q.counts[v] || 0) + 1; if (q.options.indexOf(v) < 0) q.options.push(v); });
    });
  });
  qs.forEach(function (q) { if (q.kind === "text") q.texts = shuffle_(q.texts); delete q.id; });

  const out = JSON.stringify({
    title: form.getTitle(),
    accepting: form.isAcceptingResponses(),
    total: responses.length,
    firstAt: firstAt, lastAt: lastAt,
    byDay: byDay, byHour: byHour,
    questions: qs,
    updatedAt: Date.now()
  });
  cache.put("zara-eval", out, 20);
  return json_(out);
}

// ترتيب عشوائي للملاحظات حتى لا يُستدلّ على صاحبها من ترتيب وصولها
function shuffle_(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

function json_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON); }
