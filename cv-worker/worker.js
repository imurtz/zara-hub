// خدمة «سيرتي» — حلقة وصل بين متدربي «مفاتيح التوظيف» وخبراء الموارد البشرية
// كل شيء على باقة Cloudflare المجانية: D1 (البيانات) + R2 خاص (ملفات السير — لا رابط عام) + Workers AI (الفرز)
// لا شيء من بيانات السير يُخزَّن في Firestore المفتوح؛ قراءة الملفات تتم فقط عبر هذا العامل وبمفتاح صالح.
//
// الربط المطلوب في إعدادات العامل (Bindings):
//   DB        → قاعدة D1 باسم zara-cv
//   CV_BUCKET → حاوية R2 خاصة باسم zara-cv (بدون نطاق عام)
//   AI        → Workers AI
//   مفتاح لوحة المؤسس: يُنشأ مرة واحدة من زر «تهيئة» في تبويب «السير الذاتية» ويُحفظ مُجزّأً (SHA-256) في D1 — لا يُكتب في أي إعداد

const ALLOWED_ORIGINS = ["https://gzara.org", "http://localhost:3000"];
const FS_KEY = "AIzaSyBPos-QSrnK_x5HS742FJkNJVhXwGdq8j8";
const FS_BASE = "https://firestore.googleapis.com/v1/projects/awamia-zara/databases/(default)/documents";
const MAX_FILE = 5 * 1024 * 1024;
const KEEP_DAYS = 365;
// تُجرَّب بالترتيب — إن أُوقف نموذج أو فشل ينتقل للتالي تلقائياً، وإن فشلت كلها يُستخدم القاموس
const AI_MODELS = ["@cf/meta/llama-4-scout-17b-16e-instruct", "@cf/google/gemma-3-12b-it", "@cf/mistralai/mistral-small-3.1-24b-instruct", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"];

// المجالات الثابتة (يُختار منها دائماً — لا مجالات عشوائية)
const FIELDS = [
  ["accounting", "المحاسبة والمالية", ["محاسب", "محاسبة", "مالية", "مالي", "تدقيق", "مراجع", "ضرائب", "زكاة", "خزينة", "accountant", "accounting", "finance", "audit", "cpa", "socpa", "payroll", "erp", "sap"]],
  ["hr", "الموارد البشرية والإدارة", ["موارد بشرية", "شؤون الموظفين", "توظيف", "استقطاب", "رواتب", "تطوير إداري", "human resources", "hr ", "recruitment", "talent", "personnel"]],
  ["it", "تقنية المعلومات والبرمجة", ["برمجة", "مبرمج", "مطور", "شبكات", "تقنية المعلومات", "دعم فني", "أمن سيبراني", "قواعد بيانات", "developer", "software", "programming", "network", "it support", "cyber", "python", "java", "sql", "web", "data"]],
  ["engineering", "الهندسة", ["مهندس", "هندسة", "مدني", "كهربائي", "ميكانيك", "كيميائي", "صناعي", "معماري", "engineer", "engineering", "civil", "mechanical", "electrical", "autocad"]],
  ["sales", "المبيعات والتسويق", ["مبيعات", "تسويق", "مندوب", "تسويق رقمي", "علاقات عامة", "sales", "marketing", "brand", "social media", "seo"]],
  ["customer", "خدمة العملاء", ["خدمة عملاء", "خدمة العملاء", "استقبال", "كول سنتر", "مركز اتصال", "customer service", "call center", "reception"]],
  ["admin", "الإدارة والسكرتارية", ["سكرتير", "سكرتارية", "إداري", "اداري", "مدخل بيانات", "إدارة مكتب", "مساعد إداري", "secretary", "administrative", "office", "data entry"]],
  ["business", "إدارة الأعمال والمشاريع", ["إدارة أعمال", "ادارة اعمال", "إدارة مشاريع", "مدير مشروع", "تخطيط", "business administration", "project management", "pmp", "operations"]],
  ["education", "التعليم والتدريب", ["معلم", "معلمة", "تدريس", "تعليم", "مدرب", "رياض أطفال", "teacher", "teaching", "education", "trainer", "tutor"]],
  ["health", "الصحة والتمريض", ["تمريض", "ممرض", "ممرضة", "طبيب", "صحي", "علاج طبيعي", "أشعة", "nurse", "nursing", "doctor", "physio", "medical", "radiology"]],
  ["pharmacy", "الصيدلة والمختبرات", ["صيدلي", "صيدلة", "مختبر", "مختبرات", "تحاليل", "pharmacist", "pharmacy", "laboratory", "lab "]],
  ["logistics", "اللوجستيات والمشتريات", ["مشتريات", "لوجستي", "مستودع", "مخازن", "سلاسل إمداد", "شحن", "procurement", "logistics", "warehouse", "supply chain", "purchasing"]],
  ["safety", "السلامة والجودة", ["سلامة", "جودة", "صحة مهنية", "hse", "safety", "quality", "iso"]],
  ["legal", "القانون", ["قانون", "محامي", "محاماة", "قانوني", "أنظمة", "legal", "lawyer", "law"]],
  ["media", "الإعلام والتصميم", ["تصميم", "مصمم", "جرافيك", "إعلام", "مونتاج", "تصوير", "محتوى", "designer", "graphic", "media", "content", "photograph", "video"]],
  ["technical", "الفنيون والحرف", ["فني", "كهربائي سيارات", "تكييف", "صيانة", "لحام", "سباكة", "technician", "maintenance", "hvac"]],
  ["hospitality", "الضيافة والسياحة والتجزئة", ["فندق", "ضيافة", "سياحة", "مطعم", "كاشير", "بائع", "تجزئة", "hotel", "hospitality", "tourism", "cashier", "retail", "barista"]],
  ["science", "العلوم", ["كيمياء", "فيزياء", "أحياء", "رياضيات", "chemistry", "physics", "biology", "mathematics"]],
  ["other", "مجالات أخرى", []]
];
const FIELD_NAME = Object.fromEntries(FIELDS.map(f => [f[0], f[1]]));

function cors(origin) {
  const o = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
}
const json = (o, s, h) => new Response(JSON.stringify(o), { status: s || 200, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, h) });
const tok = n => { const a = new Uint8Array(n || 18); crypto.getRandomValues(a); return Array.from(a, b => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join(""); };
const now = () => Date.now();
function digits(s) { return String(s || "").replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x0660).replace(/[\u06F0-\u06F9]/g, d => d.charCodeAt(0) - 0x06F0); }
function phoneNorm(s) { let d = digits(s).replace(/\D/g, "").replace(/^00/, ""); if (/^9665\d{8}$/.test(d)) d = "0" + d.slice(3); else if (/^5\d{8}$/.test(d)) d = "0" + d; return d; }
const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

async function schema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS seekers (id TEXT PRIMARY KEY, token TEXT UNIQUE, phone TEXT, name TEXT, gender TEXT, roster_id TEXT, reg_no TEXT,
      file_key TEXT, file_name TEXT, file_type TEXT, text TEXT, field TEXT, titles TEXT, tasks TEXT, years INTEGER, degree TEXT, skills TEXT, city TEXT,
      ai TEXT, consent INTEGER DEFAULT 0, status TEXT DEFAULT 'active', created INTEGER, updated INTEGER, expires INTEGER)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS seekers_phone ON seekers(phone)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS seekers_field ON seekers(field)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS experts (id TEXT PRIMARY KEY, token TEXT UNIQUE, name TEXT, org TEXT, phone TEXT, active INTEGER DEFAULT 1, created INTEGER, last_seen INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, expert_id TEXT, seeker_id TEXT, job TEXT, created INTEGER, outcome TEXT, outcome_at INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS log (t INTEGER, who TEXT, act TEXT, ref TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`)
  ]);
}

// التحقق من أن الجوال لمتدرب في «مطابقة البيانات» (rosterPeople) — آلياً بلا تدخل بشري
async function rosterByPhone(phone) {
  const body = { structuredQuery: { from: [{ collectionId: "rosterPeople" }], where: { fieldFilter: { field: { fieldPath: "phone" }, op: "EQUAL", value: { stringValue: phone } } }, limit: 5 } };
  const r = await fetch(`${FS_BASE}:runQuery?key=${FS_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) return null;
  const rows = (await r.json()).filter(x => x.document).map(x => { const f = x.document.fields || {}, g = k => f[k] ? Object.values(f[k])[0] : ""; const roles = f.roles && f.roles.arrayValue && f.roles.arrayValue.values ? f.roles.arrayValue.values.map(v => v.stringValue) : [];
    return { id: x.document.name.split("/").pop(), name: g("name"), gender: g("gender"), regNo: g("regNo"), type: g("type"), roles, mergedInto: g("mergedInto"), status: g("status") }; });
  return rows.find(p => !p.mergedInto) || rows[0] || null;
}
// خبير موارد بشرية = من له صفة «موارد بشرية» (أو «مدرب» القديمة) في «مطابقة البيانات»
async function expertByPhone(phone) {
  const body = { structuredQuery: { from: [{ collectionId: "rosterPeople" }], where: { fieldFilter: { field: { fieldPath: "phone" }, op: "EQUAL", value: { stringValue: phone } } }, limit: 5 } };
  const r = await fetch(`${FS_BASE}:runQuery?key=${FS_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) return null;
  for (const x of await r.json()) {
    if (!x.document) continue;
    const f = x.document.fields || {}, g = k => f[k] ? Object.values(f[k])[0] : "";
    const roles = f.roles && f.roles.arrayValue && f.roles.arrayValue.values ? f.roles.arrayValue.values.map(v => v.stringValue) : [];
    const all = roles.concat([g("type")]);
    if (g("mergedInto") || g("status") === "inactive") continue;
    if (all.includes("hr") || all.includes("trainer")) return { id: x.document.name.split("/").pop(), name: g("name"), org: g("org") };
  }
  return null;
}
const normT = t => clip(t, 60).replace(/^ال(?=\S)/, "").replace(/[ًٌٍَُِّْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة\b/g, "ه").replace(/ى\b/g, "ي");
const FOLLOW_DAYS = 14, SHARE_DAYS = 7;

// الفرز: Workers AI أولاً، والقاموس احتياطاً — النتيجة دائماً مجال من القائمة الثابتة
function keywordClassify(text) {
  const t = " " + String(text || "").toLowerCase() + " ";
  let best = ["other", 0];
  for (const [k, , kws] of FIELDS) { let n = 0; for (const w of kws) { const i = t.split(w.toLowerCase()).length - 1; n += i; } if (n > best[1]) best = [k, n]; }
  const yrs = (t.match(/(\d{1,2})\s*(?:سنوات|سنة|عام|اعوام|أعوام|years?|yrs)/) || [])[1];
  const deg = /ماجستير|master|msc|mba/.test(t) ? "ماجستير" : /دكتوراه|phd/.test(t) ? "دكتوراه" : /بكالوريوس|bachelor|bsc|ba /.test(t) ? "بكالوريوس" : /دبلوم|diploma/.test(t) ? "دبلوم" : /ثانوي|high school/.test(t) ? "ثانوي" : "";
  return { field: best[0], titles: [], tasks: "", years: yrs ? Math.min(40, +yrs) : null, degree: deg, skills: [], city: "", src: "kw" };
}
async function aiClassify(env, text) {
  const kw = keywordClassify(text);
  if (!env.AI || String(text || "").trim().length < 80) return kw;
  const list = FIELDS.map(f => `${f[0]} = ${f[1]}`).join("\n");
  const prompt = `أنت مساعد توظيف. اقرأ السيرة الذاتية التالية وأعد JSON فقط بهذه المفاتيح:
{"field": "<رمز المجال من القائمة>", "titles": ["حتى 3 مسميات وظيفية مناسبة بالعربية"], "tasks": "جملة قصيرة عن طبيعة المهام المناسبة", "years": <سنوات الخبرة رقم أو null>, "degree": "أعلى مؤهل", "skills": ["حتى 6 مهارات"], "city": "المدينة إن ذُكرت"}
قائمة المجالات:
${list}
السيرة الذاتية:
"""${clip(text, 6000)}"""`;
  let j = null, errs = [];
  for (const model of AI_MODELS) {
    try {
      const r = await env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: 500, temperature: 0.1 });
      let out = r && (r.response !== undefined ? r.response : r.result);
      if (out && typeof out === "object") { j = out; break; }
      out = String(out || ""); const m = out.match(/\{[\s\S]*\}/);
      if (m) { j = JSON.parse(m[0]); break; }
      errs.push(model.split("/").pop() + ":nojson");
    } catch (e) { errs.push(model.split("/").pop() + ":" + clip(e && e.message, 60)); }
  }
  if (!j) return Object.assign(kw, { src: "kw:" + errs.join(" | ").slice(0, 300) });
  try {
    const field = FIELD_NAME[j.field] ? j.field : kw.field;
    return {
      field, src: "ai",
      titles: (Array.isArray(j.titles) ? j.titles : []).map(x => clip(x, 60)).filter(Boolean).slice(0, 3),
      tasks: clip(j.tasks, 200),
      years: Number.isFinite(+j.years) && j.years !== null && j.years !== "" ? Math.min(40, Math.max(0, Math.round(+j.years))) : kw.years,
      degree: clip(j.degree, 40) || kw.degree,
      skills: (Array.isArray(j.skills) ? j.skills : []).map(x => clip(x, 40)).filter(Boolean).slice(0, 6),
      city: clip(j.city, 40)
    };
  } catch (e) { return Object.assign(kw, { src: "kw:err:" + clip(e && e.message, 160) }); }
}

function pub(s) { // ما يراه صاحب السيرة عن نفسه
  return { name: s.name, field: s.field, fieldName: FIELD_NAME[s.field] || "", titles: JSON.parse(s.titles || "[]"), tasks: s.tasks, years: s.years, degree: s.degree, skills: JSON.parse(s.skills || "[]"), city: s.city, fileName: s.file_name, consent: !!s.consent, status: s.status, updated: s.updated, expires: s.expires };
}
async function sha(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join(""); }
async function adminOk(db, k) { if (!k) return false; const r = await db.prepare("SELECT v FROM meta WHERE k = 'admin'").first(); return !!r && r.v === await sha(k); }
async function logAct(db, who, act, ref) { try { await db.prepare("INSERT INTO log (t, who, act, ref) VALUES (?, ?, ?, ?)").bind(now(), who, act, ref || "").run(); } catch (e) {} }

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "", H = cors(origin), url = new URL(req.url), p = url.pathname.replace(/\/+$/, "");
    if (req.method === "OPTIONS") return new Response(null, { headers: H });
    try {
      await schema(env.DB);

      // ---------- الباحث ----------
      if (p === "/api/fields") return json({ fields: FIELDS.map(f => ({ k: f[0], l: f[1] })) }, 200, H);

      if (p === "/api/check" && req.method === "POST") {
        const { phone } = await req.json(); const ph = phoneNorm(phone);
        if (!/^05\d{8}$/.test(ph)) return json({ ok: false, err: "phone" }, 200, H);
        const r = await rosterByPhone(ph);
        if (!r) return json({ ok: false, err: "notfound" }, 200, H);
        const ex = await env.DB.prepare("SELECT token FROM seekers WHERE phone = ? AND status = 'active'").bind(ph).first();
        return json({ ok: true, name: r.name, existing: !!ex }, 200, H);
      }

      if (p === "/api/upload" && req.method === "POST") {
        const fd = await req.formData(); const ph = phoneNorm(fd.get("phone")); const file = fd.get("file"); const text = clip(fd.get("text"), 20000);
        if (!/^05\d{8}$/.test(ph)) return json({ ok: false, err: "phone" }, 400, H);
        const r = await rosterByPhone(ph); if (!r) return json({ ok: false, err: "notfound" }, 403, H);
        if (!file || typeof file === "string") return json({ ok: false, err: "nofile" }, 400, H);
        if (file.size > MAX_FILE) return json({ ok: false, err: "size" }, 413, H);
        const name = String(file.name || "cv"), type = /\.pdf$/i.test(name) || file.type === "application/pdf" ? "application/pdf" : /\.docx$/i.test(name) ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "";
        if (!type) return json({ ok: false, err: "type" }, 415, H);
        const cls = await aiClassify(env, text);
        const ex = await env.DB.prepare("SELECT * FROM seekers WHERE phone = ? AND status = 'active'").bind(ph).first();
        const id = ex ? ex.id : "cv-" + tok(10), token = ex ? ex.token : tok(22), key = `cv/${id}/${now()}-${type === "application/pdf" ? "cv.pdf" : "cv.docx"}`;
        await env.CV_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: type } });
        if (ex && ex.file_key) { try { await env.CV_BUCKET.delete(ex.file_key); } catch (e) {} }
        const t = now(), vals = [token, ph, r.name, r.gender || "", r.id, r.regNo || "", key, clip(name, 120), type, text, cls.field, JSON.stringify(cls.titles), cls.tasks, cls.years, cls.degree, JSON.stringify(cls.skills), cls.city, cls.src, t, t + KEEP_DAYS * 864e5];
        if (ex) await env.DB.prepare(`UPDATE seekers SET token=?, phone=?, name=?, gender=?, roster_id=?, reg_no=?, file_key=?, file_name=?, file_type=?, text=?, field=?, titles=?, tasks=?, years=?, degree=?, skills=?, city=?, ai=?, updated=?, expires=? WHERE id=?`).bind(...vals, id).run();
        else await env.DB.prepare(`INSERT INTO seekers (token, phone, name, gender, roster_id, reg_no, file_key, file_name, file_type, text, field, titles, tasks, years, degree, skills, city, ai, updated, expires, id, created) VALUES (${Array(22).fill("?").join(",")})`).bind(...vals, id, t).run();
        await logAct(env.DB, "seeker:" + id, ex ? "reupload" : "upload", cls.field);
        const s = await env.DB.prepare("SELECT * FROM seekers WHERE id = ?").bind(id).first();
        return json({ ok: true, token, profile: pub(s) }, 200, H);
      }

      if (p === "/api/me") {
        const t = url.searchParams.get("t") || ""; const s = t && await env.DB.prepare("SELECT * FROM seekers WHERE token = ? AND status = 'active'").bind(t).first();
        if (!s) return json({ ok: false, err: "token" }, 404, H);
        if (req.method === "GET") return json({ ok: true, profile: pub(s) }, 200, H);
        if (req.method === "POST") {
          const b = await req.json(); const field = FIELD_NAME[b.field] ? b.field : s.field;
          const titles = (Array.isArray(b.titles) ? b.titles : JSON.parse(s.titles || "[]")).map(x => clip(x, 60)).filter(Boolean).slice(0, 4);
          await env.DB.prepare("UPDATE seekers SET field=?, titles=?, city=?, consent=?, updated=?, expires=? WHERE id=?").bind(field, JSON.stringify(titles), clip(b.city ?? s.city, 40), b.consent ? 1 : 0, now(), now() + KEEP_DAYS * 864e5, s.id).run();
          await logAct(env.DB, "seeker:" + s.id, b.consent ? "confirm" : "update", field);
          return json({ ok: true, profile: pub(await env.DB.prepare("SELECT * FROM seekers WHERE id = ?").bind(s.id).first()) }, 200, H);
        }
        if (req.method === "DELETE") { // حذف نهائي بطلب صاحب السيرة
          if (s.file_key) { try { await env.CV_BUCKET.delete(s.file_key); } catch (e) {} }
          await env.DB.prepare("UPDATE seekers SET status='withdrawn', text='', file_key='', titles='[]', skills='[]', token=?, updated=? WHERE id=?").bind("x-" + tok(12), now(), s.id).run();
          await logAct(env.DB, "seeker:" + s.id, "withdraw", "");
          return json({ ok: true }, 200, H);
        }
      }

      // ---------- الخبراء: رابط واحد للجميع + تعريف بالجوال مرة واحدة ----------
      if (p === "/api/hr/login" && req.method === "POST") {
        const { phone } = await req.json(); const ph = phoneNorm(phone);
        if (!/^05\d{8}$/.test(ph)) return json({ ok: false, err: "phone" }, 200, H);
        const e = await expertByPhone(ph); if (!e) return json({ ok: false, err: "notexpert" }, 200, H);
        let ex = await env.DB.prepare("SELECT * FROM experts WHERE id = ?").bind(e.id).first();
        if (ex && !ex.active) return json({ ok: false, err: "disabled" }, 200, H);
        const token = tok(24);
        if (ex) await env.DB.prepare("UPDATE experts SET token=?, name=?, org=?, phone=?, last_seen=? WHERE id=?").bind(token, e.name, e.org || ex.org || "", ph, now(), e.id).run();
        else await env.DB.prepare("INSERT INTO experts (id, token, name, org, phone, active, created, last_seen) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").bind(e.id, token, e.name, e.org || "", ph, now(), now()).run();
        await logAct(env.DB, "expert:" + e.id, "login", "");
        return json({ ok: true, token, name: e.name }, 200, H);
      }
      if (p.startsWith("/api/hr/")) {
        const t = url.searchParams.get("t") || ""; const ex = t && await env.DB.prepare("SELECT * FROM experts WHERE token = ? AND active = 1").bind(t).first();
        if (!ex) return json({ ok: false, err: "token" }, 401, H);
        await env.DB.prepare("UPDATE experts SET last_seen=? WHERE id=?").bind(now(), ex.id).run();
        const pool = ((await env.DB.prepare("SELECT id, field, titles, years, degree, skills, city, gender, updated FROM seekers WHERE status='active' AND consent=1 AND (roster_id NOT LIKE 'zz-%' OR ? = 1)").bind(ex.id.startsWith("zz-") ? 1 : 0).all()).results || []).map(s => Object.assign(s, { titles: JSON.parse(s.titles || "[]"), skills: JSON.parse(s.skills || "[]") }));
        if (p === "/api/hr/home") { // مربعات المسميات + أسئلة المتابعة المستحقة
          const tiles = {};
          pool.forEach(s => { const seen = {}; s.titles.forEach(ti => { const k = normT(ti); if (!k || seen[k]) return; seen[k] = 1; (tiles[k] = tiles[k] || { label: ti, n: 0, field: s.field }).n++; }); });
          const due = ((await env.DB.prepare("SELECT r.id, r.job, r.created, s.name FROM requests r LEFT JOIN seekers s ON s.id = r.seeker_id WHERE r.expert_id = ? AND (r.outcome IS NULL OR r.outcome = '') AND r.created < ? ORDER BY r.created LIMIT 5").bind(ex.id, now() - FOLLOW_DAYS * 864e5).all()).results || []);
          return json({ ok: true, name: ex.name, total: pool.length, tiles: Object.values(tiles).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "ar")), fields: FIELDS.map(f => ({ k: f[0], l: f[1], n: pool.filter(s => s.field === f[0]).length })).filter(f => f.n), due }, 200, H);
        }
        if (p === "/api/hr/list") { // بطاقات بلا اسم ولا جوال حتى يطلب الخبير السيرة
          const title = url.searchParams.get("title") || "", field = url.searchParams.get("field") || "", k = normT(title);
          const mine = {}; ((await env.DB.prepare("SELECT seeker_id FROM requests WHERE expert_id = ?").bind(ex.id).all()).results || []).forEach(r => mine[r.seeker_id] = 1);
          const rows = pool.filter(s => title ? s.titles.some(x => normT(x) === k) : field ? s.field === field : true)
            .sort((a, b) => (b.years || 0) - (a.years || 0) || b.updated - a.updated)
            .map(s => ({ id: s.id, fieldName: FIELD_NAME[s.field] || "", titles: s.titles, years: s.years, degree: s.degree, city: s.city, skills: s.skills.slice(0, 5), gender: s.gender, taken: !!mine[s.id] }));
          return json({ ok: true, rows }, 200, H);
        }
        if (p === "/api/hr/open" && req.method === "POST") { // كشف السيرة: يُسجَّل باسم الخبير فوراً
          const b = await req.json(); const s = await env.DB.prepare("SELECT * FROM seekers WHERE id = ? AND status='active' AND consent=1").bind(b.id || "").first();
          if (!s) return json({ ok: false, err: "gone" }, 404, H);
          let r = await env.DB.prepare("SELECT * FROM requests WHERE expert_id = ? AND seeker_id = ?").bind(ex.id, s.id).first();
          if (!r) { r = { id: "rq-" + tok(16) }; await env.DB.prepare("INSERT INTO requests (id, expert_id, seeker_id, job, created) VALUES (?, ?, ?, ?, ?)").bind(r.id, ex.id, s.id, clip(b.job, 80), now()).run(); r.created = now(); await logAct(env.DB, "expert:" + ex.id, "open", s.id); }
          return json({ ok: true, rid: r.id, name: s.name, phone: s.phone, fieldName: FIELD_NAME[s.field] || "", titles: JSON.parse(s.titles || "[]"), file: `${url.origin}/f/${r.id}`, fileName: s.file_name }, 200, H);
        }
        if (p === "/api/hr/outcome" && req.method === "POST") {
          const b = await req.json(); const o = b.outcome === "hired" ? "hired" : "no";
          await env.DB.prepare("UPDATE requests SET outcome=?, outcome_at=? WHERE id=? AND expert_id=?").bind(o, now(), b.rid || "", ex.id).run();
          await logAct(env.DB, "expert:" + ex.id, "outcome:" + o, b.rid || "");
          return json({ ok: true }, 200, H);
        }
      }
      // رابط السيرة الآمن (للعرض أو الإرسال بالواتساب): صالح 7 أيام من أول طلب، ومسجَّل باسم الخبير
      if (p.startsWith("/f/")) {
        const r = await env.DB.prepare("SELECT r.created, s.file_key, s.file_type, s.file_name, s.name, s.status FROM requests r JOIN seekers s ON s.id = r.seeker_id WHERE r.id = ?").bind(p.slice(3)).first();
        if (!r || r.status !== "active" || !r.file_key) return new Response("الرابط غير صالح أو حُذفت السيرة", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        if (now() - r.created > SHARE_DAYS * 864e5) return new Response("انتهت صلاحية هذا الرابط — افتح السيرة من صفحة الخبراء مجدداً", { status: 410, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        const o = await env.CV_BUCKET.get(r.file_key); if (!o) return new Response("الملف غير موجود", { status: 404 });
        const ext = r.file_type === "application/pdf" ? "pdf" : "docx";
        return new Response(o.body, { headers: { "Content-Type": r.file_type, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent("سيرة " + (r.name || "") + "." + ext)}`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
      }

      // ---------- لوحة المؤسس ----------
      if (p === "/api/admin/init" && req.method === "POST") { // مرة واحدة فقط: ينشئ مفتاح اللوحة إن لم يوجد
        const ex = await env.DB.prepare("SELECT v FROM meta WHERE k = 'admin'").first();
        if (ex) return json({ ok: false, err: "exists" }, 409, H);
        const key = "cvk-" + tok(28);
        await env.DB.prepare("INSERT INTO meta (k, v) VALUES ('admin', ?)").bind(await sha(key)).run();
        await logAct(env.DB, "admin", "init", "");
        return json({ ok: true, key }, 200, H);
      }
      if (p === "/api/admin/status") { const ex = await env.DB.prepare("SELECT v FROM meta WHERE k = 'admin'").first(); return json({ ok: true, ready: !!ex }, 200, H); }
      if (p.startsWith("/api/admin")) {
        const k = url.searchParams.get("k") || "";
        if (!await adminOk(env.DB, k)) return json({ ok: false, err: "key" }, 401, H);
        if (p === "/api/admin/list") {
          const rows = (await env.DB.prepare("SELECT id, name, phone, reg_no, gender, field, titles, years, degree, city, consent, status, ai, created, updated FROM seekers WHERE roster_id NOT LIKE 'zz-%' ORDER BY updated DESC").all()).results || [];
          const reqs = (await env.DB.prepare("SELECT r.*, e.name AS expert, e.org AS org, s.name AS seeker FROM requests r LEFT JOIN experts e ON e.id = r.expert_id LEFT JOIN seekers s ON s.id = r.seeker_id WHERE r.expert_id NOT LIKE 'zz-%' ORDER BY r.created DESC LIMIT 500").all()).results || [];
          const experts = (await env.DB.prepare("SELECT id, name, org, phone, active, created, last_seen FROM experts WHERE id NOT LIKE 'zz-%' ORDER BY created").all()).results || [];
          return json({ ok: true, seekers: rows.map(r => Object.assign(r, { fieldName: FIELD_NAME[r.field] || "", titles: JSON.parse(r.titles || "[]") })), requests: reqs, experts, fields: FIELDS.map(f => ({ k: f[0], l: f[1] })) }, 200, H);
        }
        if (p === "/api/admin/expert" && req.method === "POST") { const b = await req.json(); await env.DB.prepare("UPDATE experts SET active=?, token=? WHERE id=?").bind(b.active ? 1 : 0, b.active ? tok(24) : "x-" + tok(12), b.id || "").run(); return json({ ok: true }, 200, H); }
        if (p === "/api/admin/file") {
          const s = await env.DB.prepare("SELECT file_key, file_type, file_name FROM seekers WHERE id = ?").bind(url.searchParams.get("id") || "").first();
          if (!s || !s.file_key) return json({ ok: false, err: "nofile" }, 404, H);
          const o = await env.CV_BUCKET.get(s.file_key); if (!o) return json({ ok: false, err: "nofile" }, 404, H);
          return new Response(o.body, { headers: Object.assign({ "Content-Type": s.file_type, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(s.file_name || "cv")}`, "Cache-Control": "no-store" }, H) });
        }
      }
      return json({ ok: false, err: "notfound" }, 404, H);
    } catch (e) {
      return json({ ok: false, err: "server", detail: String(e && e.message || e).slice(0, 200) }, 500, H);
    }
  }
};
