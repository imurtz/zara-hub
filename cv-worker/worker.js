// خدمة «سيرتي» (مفاتيح الفرص) — حلقة وصل بين حضور ورشة «مفاتيح التوظيف 2» وخبراء الموارد البشرية
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
  return { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Vary": "Origin" };
}
// تصحيح مفردات معتمدة عند العرض فقط (الأصل يبقى): ضابط عمليات موارد بشرية/علاقات عامة → أخصائي، دعم فني → دعم تقني
const fixW = t => String(t).replace(/ضابطة?(\s+)(ال)?عمليات(\s+)(ال)?موارد(\s+)(ال)?بشرية/g, (m, s1, b, s2, c, s3, d) => "أخصائي" + s1 + (b || "") + "عمليات" + s2 + (c || "") + "موارد" + s3 + (d || "") + "بشرية").replace(/ضابطة?(\s+)(ال)?علاقات(\s+)(ال)?عامة/g, (m, s1, b, s2, c) => "أخصائي" + s1 + (b || "") + "علاقات" + s2 + (c || "") + "عامة").replace(/(ال)?دعم(\s+)(ال)?فني/g, (m, a, s1, b) => (a || "") + "دعم" + s1 + (b || "") + "تقني");
// المسميات تُعرض بصيغة المذكر دائماً، وتوحيد مسميات معتمدة (مطابقة كاملة للمسمى) — العرض فقط، الأصل يبقى
const MASC = /(^|[\s(/،-])(أخصائية|اخصائية|إخصائية|منسقة|مساعدة|موظفة|مسؤولة|مسئولة|مديرة|مشرفة|سكرتيرة|معلمة|مدربة|ممرضة|مصممة|مطورة|مهندسة|محللة|مستشارة|باحثة|مندوبة|كاتبة|ضابطة|متخصصة|مختصة|محاسبة|مبرمجة|مراقبة|مدققة|مسوقة|منفذة|رئيسة|عاملة|فنية|إدارية|ادارية|أمينة(?=\s+(?:سجلات|صندوق|مكتبة|مستودع)))(?=$|[\s)/،-])/g;
const T_MAP = [
  [/^(?:مساعد\s+[إا]داري\s+(?:لل|ال)?موارد\s+(?:ال)?بشرية|[إا]داري|مساعد\s+[إا]داري)$/, "منسق موارد بشرية"],
  [/^(?:ضابط\s+)?(?:ال)?علاقات\s+(?:ال)?عامة$/, "أخصائي علاقات عامة"],
  [/^(?:متخصص\s+(?:في\s+)?(?:ال)?موارد\s+(?:ال)?بشرية|أمين\s+سجلات\s+(?:ال)?موارد\s+(?:ال)?بشرية|مسؤول\s+(?:ال)?موارد\s+(?:ال)?بشرية|ضابط\s+عمليات\s+(?:ال)?موارد\s+(?:ال)?بشرية)$/, "أخصائي عمليات الموارد البشرية"],
];
const fixT = t => { let x = fixW(String(t || "").trim()).replace(MASC, (m, p, w) => p + w.slice(0, -1)).replace(/\s+/g, " "); for (const [re, to] of T_MAP) if (re.test(x)) return to; return x; };
const TKEYS = { title: 1, label: 1, job: 1 };
const jsonRaw = (o, s, h) => new Response(JSON.stringify(o), { status: s || 200, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, h) });
const json = (o, s, h) => new Response(fixW(JSON.stringify(o, (k, v) => (k === "titles" || k === "alsoIn") && Array.isArray(v) ? v.map(x => typeof x === "string" ? fixT(x) : x) : TKEYS[k] && typeof v === "string" ? fixT(v) : v)), { status: s || 200, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, h) });
const tok = n => { const a = new Uint8Array(n || 18); crypto.getRandomValues(a); return Array.from(a, b => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join(""); };
const now = () => Date.now();
function digits(s) { return String(s || "").replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x0660).replace(/[\u06F0-\u06F9]/g, d => d.charCodeAt(0) - 0x06F0); }
function phoneNorm(s) { let d = digits(s).replace(/\D/g, "").replace(/^00/, ""); if (/^9665\d{8}$/.test(d)) d = "0" + d.slice(3); else if (/^5\d{8}$/.test(d)) d = "0" + d; return d; }
const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

const VAC_SEED = [{"id": "vac-abre-metro", "title": "أخصائي قياس الأبعاد", "title_en": "Metrologist", "company": "ABRE Business Solutions — لصالح شركة صناعية رائدة", "city": "الرياض", "tags": ["للسعوديين فقط", "صناعة السيارات"], "intro": "فرصة لمن يحب الدقة في القياس وضبط الجودة في قطاع صناعة السيارات والصناعة المتقدمة، والعمل على أحدث أجهزة القياس ودعم عمليات الجودة الحرجة.", "duties": ["برمجة وتشغيل أجهزة القياس الإحداثي (CMM) وأنظمة المسح", "قياس أبعاد القطع المصبوبة والمطلية والمجمّعة", "قراءة الرسومات الهندسية ومتطلبات GD&T", "إعداد قياسات PPAP ودراسات القدرة واعتماد المنتجات", "تحليل بيانات القياس وإعداد تقارير الأبعاد", "دعم تحسين العمليات وضبط القوالب بناءً على نتائج القياس", "إجراء دراسات Gauge R&R وتحليل نظام القياس (MSA)", "متابعة سجلات المعايرة والتزام أجهزة القياس"], "quals": ["دبلوم أو بكالوريوس في الهندسة الميكانيكية أو علم القياس أو تقنية التصنيع أو ما يعادلها", "تدريب أو خبرة في برمجة وتشغيل CMM (مثل PC-DMIS أو Calypso)", "فهم جيد لـ GD&T وMSA وSPC ومتطلبات IATF 16949"], "exp": "من سنتين إلى 4 سنوات في قياس الأبعاد، ويُفضّل في صناعة السيارات — ويُشجَّع حديثو التخرج المتميزون تقنياً على التقديم."}, {"id": "vac-abre-recv", "title": "مشغّل استلام وفك الشحنات الواردة", "title_en": "Inbound Receiving & Unboxing Operator", "company": "ABRE Business Solutions — لصالح شركة صناعية رائدة", "city": "الرياض", "tags": ["للسعوديين فقط", "مستودعات ولوجستيات", "تدريب متوفر"], "intro": "فرصة لمن يهتم بالخدمات اللوجستية وعمليات المستودعات ومناولة المواد في بيئة تصنيع سريعة — الدور: استلام المواد الواردة وفحصها وترميزها وتجهيزها للإنتاج بدقة.", "duties": ["استلام الشحنات وتنزيلها وعدّها وفحصها مقابل أوامر الشراء ومذكرات التسليم", "فك الشحنات المستوردة وإعادة تعبئتها في حاويات المصنع", "فحص القطع من التلف أو التلوث أو أخطاء الملصقات والإبلاغ عن أي اختلاف", "وضع الملصقات الداخلية وتسجيل الاستلام في نظام ERP/WMS", "تطبيق مبدأ FIFO والمحافظة على تتبّع المواد", "معالجة مخلفات التغليف ودعم إعادة التدوير", "المحافظة على النظافة وتنظيم بيئة العمل (5S)", "مساندة فريق المستودع في أوقات الذروة"], "quals": ["الثانوية العامة أو دبلوم تقني", "القدرة على قراءة مستندات التسليم وملصقات القطع بالإنجليزية", "مهارات حاسب أساسية لإدخال البيانات", "يُوفَّر تدريب على المناولة اليدوية والسلامة"], "exp": "سنة إلى سنتين في المستودعات أو الاستلام أو اللوجستيات (مفضّلة) — ويُشجَّع حديثو التخرج الراغبون في التعلّم، فالتدريب متوفر."}, {"id": "vac-abre-line", "title": "مشغّل إمداد خطوط الإنتاج", "title_en": "Inbound Line Supply Operator", "company": "ABRE Business Solutions — لصالح شركة صناعية رائدة", "city": "الرياض", "tags": ["للسعوديين فقط", "بدون خبرة", "تدريب كامل"], "intro": "فرصة لبناء مسار مهني في اللوجستيات وعمليات المستودعات ودعم الإنتاج في بيئة تصنيع عالمية — مع تدريب كامل للمقبولين.", "duties": ["توصيل المواد الخام والقطع والتغليف من المستودع إلى خطوط الإنتاج في الوقت وبالكمية الصحيحة", "تشغيل مسارات القاطرات (Tugger) والإمداد الدوري وفق الجداول", "صرف المواد باستخدام بطاقات كانبان وقوائم الصرف وأجهزة المسح", "تعبئة مخزون خطوط الإنتاج مع الالتزام بمبدأ FIFO", "التحقق من أرقام القطع والكميات والملصقات", "الإبلاغ الفوري عن النقص أو التلف أو أي اختلاف", "فحص المعدات يومياً والمحافظة على بيئة عمل آمنة", "دعم تغيير خطوط الإنتاج والالتزام بمعايير 5S"], "quals": ["الثانوية العامة (مفضّلة)", "مهارات أساسية في القراءة والحساب", "لياقة بدنية للمشي والرفع ومناولة المواد", "الاستعداد للحصول على شهادة تشغيل القاطرات ومعدات النقل عبر تدريب الشركة"], "exp": "لا تُشترط خبرة سابقة والتدريب كامل — وخبرة المستودعات أو المخزون أو التجزئة أو التصنيع ميزة إضافية."}];
let SCHEMA_DONE = false;
async function schema(db) {
  if (SCHEMA_DONE) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS seekers (id TEXT PRIMARY KEY, token TEXT UNIQUE, phone TEXT, name TEXT, gender TEXT, roster_id TEXT, reg_no TEXT,
      file_key TEXT, file_name TEXT, file_type TEXT, text TEXT, field TEXT, titles TEXT, tasks TEXT, years INTEGER, degree TEXT, skills TEXT, city TEXT,
      ai TEXT, consent INTEGER DEFAULT 0, status TEXT DEFAULT 'active', created INTEGER, updated INTEGER, expires INTEGER)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS seekers_phone ON seekers(phone)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS seekers_field ON seekers(field)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS experts (id TEXT PRIMARY KEY, token TEXT UNIQUE, name TEXT, org TEXT, phone TEXT, active INTEGER DEFAULT 1, created INTEGER, last_seen INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, expert_id TEXT, seeker_id TEXT, job TEXT, created INTEGER, outcome TEXT, outcome_at INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS log (t INTEGER, who TEXT, act TEXT, ref TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS hires (id TEXT PRIMARY KEY, seeker_id TEXT, roster_id TEXT, name TEXT, phone TEXT, org TEXT, title TEXT, src TEXT, created INTEGER, seen INTEGER DEFAULT 0)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, expert_id TEXT, title TEXT, nkey TEXT, field TEXT, note TEXT, status TEXT DEFAULT 'open', created INTEGER, closed INTEGER)`)
  ]);
  const v = await db.prepare("SELECT v FROM meta WHERE k = 'schema'").first();
  if (!v || !["2", "3", "4", "5"].includes(v.v)) { // رمز دخول الخبراء: يُولَّد من لوحة المؤسس ويُرسل بالواتساب
    for (const c of ["pin_hash TEXT", "pin_at INTEGER", "fails INTEGER DEFAULT 0", "lock_until INTEGER DEFAULT 0"]) { try { await db.prepare(`ALTER TABLE experts ADD COLUMN ${c}`).run(); } catch (e) {} }
    await db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('schema', '2')").run();
  }
  if (!v || !["3", "4", "5"].includes(v.v)) { // ملخص السيرة في 3 أسطر للمدربين (يُولَّد مرة ويُحفظ)
    try { await db.prepare("ALTER TABLE seekers ADD COLUMN summary TEXT").run(); } catch (e) {}
    await db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('schema', '3')").run();
  }
  if (!v || !["4", "5"].includes(v.v)) { // جنس الخبير للتحية «الأستاذ / الأستاذة»
    try { await db.prepare("ALTER TABLE experts ADD COLUMN gender TEXT").run(); } catch (e) {}
    await db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('schema', '4')").run();
  }
  if (!v || v.v !== "5") { // سيرة ثانية بتخصص مختلف لنفس الشخص (slot 1 أو 2)
    try { await db.prepare("ALTER TABLE seekers ADD COLUMN slot INTEGER DEFAULT 1").run(); } catch (e) {}
    await db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('schema', '5')").run();
  }  try { // إحصائيات زوار الصفحات العامة — مجهولة الهوية (بلا IP ولا أسماء)، تُحذف بعد 120 يوماً
    await db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS hits (t INTEGER, v TEXT, s TEXT, p TEXT, k TEXT, l TEXT, x TEXT, d TEXT, r TEXT)"),
      db.prepare("CREATE INDEX IF NOT EXISTS hits_t ON hits(t)")
    ]);
  } catch (e) {}
  try { // وظائف معلنة للتقديم من المدربين + طلبات التقديم عليها
    await db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS vacancies (id TEXT PRIMARY KEY, expert_id TEXT, title TEXT, title_en TEXT, company TEXT, city TEXT, tags TEXT, intro TEXT, duties TEXT, quals TEXT, exp TEXT, status TEXT DEFAULT 'open', created INTEGER, closed INTEGER)"),
      db.prepare("CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, vacancy_id TEXT, seeker_id TEXT, phone TEXT, created INTEGER, status TEXT DEFAULT 'new', note TEXT, seen INTEGER DEFAULT 0, updated INTEGER)"),
      db.prepare("CREATE INDEX IF NOT EXISTS applications_v ON applications(vacancy_id)")
    ]);
    const sd = await db.prepare("SELECT v FROM meta WHERE k = 'vacseed1'").first();
    if (!sd) { // أول 3 وظائف — أعلنتها الأستاذة زينب آل الشيخ (ABRE، الرياض)
      const t = now();
      await db.batch(VAC_SEED.map((x, i) => db.prepare("INSERT OR IGNORE INTO vacancies (id, expert_id, title, title_en, company, city, tags, intro, duties, quals, exp, status, created) VALUES (?,?,?,?,?,?,?,?,?,?,?,'open',?)").bind(x.id, "rp-mw8hizdxoqf8m", x.title, x.title_en, x.company, x.city, JSON.stringify(x.tags), x.intro, JSON.stringify(x.duties), JSON.stringify(x.quals), x.exp, t - i)).concat([db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('vacseed1', '1')")]));
    }
  } catch (e) {}
  SCHEMA_DONE = true;

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
// رفع السير لمن حضر ورشة «مفاتيح التوظيف 2» فقط (حضور مسجّل في اليوم الأول أو الثاني) — يُحدَّث كل 5 دقائق
const ATT_DOCS = ["rg-mw8ep8ahrc0qn__s-mw8ep8ahcbogz", "rg-mw8ep8ahrc0qn__s-mw8ep8ahfbc9x"];
let ATT = null, ATT_AT = 0;
async function attendees() {
  if (ATT && now() - ATT_AT < 5 * 6e4) return ATT;
  const set = new Set(); let ok = true;
  for (const d of ATT_DOCS) {
    const r = await fetch(`${FS_BASE}/rosterAttendance/${d}?key=${FS_KEY}`);
    if (!r.ok) { ok = false; continue; }
    const m = (((await r.json()).fields || {}).marks || {}).mapValue;
    Object.entries((m && m.fields) || {}).forEach(([id, v]) => { const f = (v.mapValue || {}).fields || {}; if (!f.s || f.s.stringValue === "p") set.add(id); });
  }
  if (!ok && ATT) return ATT; // خلل مؤقت: نبقي آخر نسخة
  if (!ok && !set.size) return null;
  ATT = set; ATT_AT = now(); return set;
}
const attendedOk = (set, id) => !set || String(id || "").startsWith("zz-") || set.has(id);
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
    if (all.includes("hr") || all.includes("trainer")) return { id: x.document.name.split("/").pop(), name: g("name"), org: g("org"), gender: g("gender") };
  }
  return null;
}
// خبراء الموارد البشرية في «مطابقة البيانات» — للوحة المؤسس (إرسال رمز الدخول)
async function rosterExperts() {
  const body = { structuredQuery: { from: [{ collectionId: "rosterPeople" }], where: { fieldFilter: { field: { fieldPath: "roles" }, op: "ARRAY_CONTAINS_ANY", value: { arrayValue: { values: [{ stringValue: "hr" }, { stringValue: "trainer" }] } } } }, limit: 300 } };
  const r = await fetch(`${FS_BASE}:runQuery?key=${FS_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) return null;
  return (await r.json()).filter(x => x.document).map(x => { const f = x.document.fields || {}, g = k => f[k] ? Object.values(f[k])[0] : ""; return { id: x.document.name.split("/").pop(), name: g("name"), phone: phoneNorm(g("phone")), regNo: g("regNo"), gender: g("gender"), mergedInto: g("mergedInto"), status: g("status") }; })
    .filter(p => !p.mergedInto && p.status !== "inactive");
}
// مطابقة مرنة للمسميات: «المحاسب» = «محاسب» = «محاسبة»، و«محاسب» تطابق «محاسب عام»
const nk = t => fixW(t || "").toLowerCase().replace(/[ًٌٍَُِّْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة(?=\s|$)/g, "ه").replace(/ى(?=\s|$)/g, "ي").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).map(w => w.length > 4 && w.startsWith("ال") ? w.slice(2) : w).join(" ");
const tMatch = (a, b) => { const A = nk(a), B = nk(b); if (!A || !B) return false; if (A === B) return true; const s = A.length < B.length ? A : B, l = s === A ? B : A; return s.length >= 3 && (" " + l + " ").includes(" " + s) ; };
const normT = t => fixW(clip(t, 60)).replace(/^ال(?=\S)/, "").replace(/[ًٌٍَُِّْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة\b/g, "ه").replace(/ى\b/g, "ي");
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

// ملخص 3 أسطر للمدرب: المؤهل · الخبرة · أبرز مهارة — Workers AI، وإن تعذّر يُركَّب من البيانات المستخرجة
function sumFallback(s) {
  const L = [];
  if (s.degree) L.push("المؤهل: " + s.degree);
  L.push(s.years ? "الخبرة: " + s.years + (s.years > 10 ? " سنة" : s.years > 2 ? " سنوات" : s.years === 2 ? " سنتين" : " سنة") + (s.tasks ? " — " + clip(s.tasks, 90) : "") : "الخبرة: " + (s.tasks ? clip(s.tasks, 100) : "حديث تخرّج / بدون خبرة مذكورة"));
  const sk = Array.isArray(s.skills) ? s.skills : JSON.parse(s.skills || "[]");
  if (sk.length) L.push("أبرز المهارات: " + sk.slice(0, 3).join("، "));
  return L.slice(0, 3);
}
async function aiSummary(env, s) {
  if (!env.AI || String(s.text || "").trim().length < 120) return null;
  const prompt = `لخّص السيرة الذاتية التالية لمسؤول توظيف في 3 أسطر قصيرة بالعربية فقط، بدون اسم الشخص أو رقمه أو أي بيانات تواصل. أعد JSON فقط: {"lines": ["المؤهل: ...", "الخبرة: ...", "أبرز ما يميّزه: ..."]} — كل سطر أقل من 90 حرفاً، ولا تخترع معلومة غير موجودة.
السيرة:
"""${clip(s.text, 5000)}"""`;
  for (const model of AI_MODELS) {
    try {
      const r = await env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: 300, temperature: 0.1 });
      let out = r && (r.response !== undefined ? r.response : r.result), j = null;
      if (out && typeof out === "object") j = out; else { const m = String(out || "").match(/\{[\s\S]*\}/); if (m) j = JSON.parse(m[0]); }
      const lines = j && Array.isArray(j.lines) ? j.lines.map(x => clip(x, 110)).filter(x => x && !/05\d{8}|@|\+966/.test(x)).slice(0, 3) : [];
      if (lines.length >= 2) return lines;
    } catch (e) {}
  }
  return null;
}
async function fillSummaries(env, ids) {
  for (const id of ids.slice(0, 6)) {
    const s = await env.DB.prepare("SELECT id, text, degree, years, tasks, skills FROM seekers WHERE id = ?").bind(id).first();
    if (!s) continue;
    const lines = (await aiSummary(env, s)) || sumFallback(s);
    await env.DB.prepare("UPDATE seekers SET summary = ? WHERE id = ?").bind(JSON.stringify(lines), id).run();
  }
}

function pub(s) { // ما يراه صاحب السيرة عن نفسه
  return { name: s.name, phone: s.phone, field: s.field, fieldName: FIELD_NAME[s.field] || "", titles: JSON.parse(s.titles || "[]"), tasks: s.tasks, years: s.years, degree: s.degree, skills: JSON.parse(s.skills || "[]"), city: s.city, fileName: s.file_name, consent: !!s.consent, status: s.status, updated: s.updated, expires: s.expires, slot: s.slot || 1 };
}
async function sha(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join(""); }
// سطر في جرس «ما صار اليوم» بالبوابة (hubFeed) — يظهر لمن له صلاحية السير (cv.view) والأدمن
async function feed(ic, text, by) {
  try {
    const at = now(), id = "f-cv-" + at.toString(36) + tok(5), day = new Date(at + 3 * 36e5).toISOString().slice(0, 10); // يوم الرياض
    await fetch(`${FS_BASE}/hubFeed/${id}?key=${FS_KEY}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { id: { stringValue: id }, at: { integerValue: String(at) }, day: { stringValue: day }, perm: { stringValue: "cv.view" }, sec: { stringValue: "cv" }, ic: { stringValue: ic }, text: { stringValue: text }, by: { stringValue: by || "مفاتيح الفرص" }, byId: { stringValue: "ext" } } }) });
  } catch (e) {}
}
const isTest = id => String(id || "").startsWith("zz-");
// إشعار داخل البوابة (جرس مساحة العمل) لكل أدمن ومن له صلاحية السير — Firestore wsNotifs
async function hubNotify(text) {
  try {
    const r = await fetch(`${FS_BASE}/employees?key=${FS_KEY}&pageSize=300&mask.fieldPaths=role&mask.fieldPaths=perms`);
    const docs = ((await r.json()).documents || []).filter(d => { const f = d.fields || {}; return (f.role || {}).stringValue === "admin" || (((f.perms || {}).arrayValue || {}).values || []).some(v => v.stringValue === "cv.view"); });
    const at = now();
    await Promise.all(docs.map(d => { const to = d.name.split("/").pop(), id = "ntf-cv-" + tok(10);
      return fetch(`${FS_BASE}/wsNotifs/${id}?key=${FS_KEY}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { id: { stringValue: id }, to: { stringValue: to }, type: { stringValue: "cv-hired" }, text: { stringValue: text }, ref: { nullValue: null }, from: { stringValue: "مفاتيح الفرص" }, at: { integerValue: String(at) }, read: { booleanValue: false } } }) }); }));
  } catch (e) {}
}
// دخول المؤسس بحساب البوابة: يتحقق من توقيع رمز Firebase ثم من سجل الموظف (أدمن أو صلاحية cv.view)
let JWKS = null, JWKS_AT = 0; const STAFF = new Map();
function b64u(x) { x = x.replace(/-/g, "+").replace(/_/g, "/"); while (x.length % 4) x += "="; return Uint8Array.from(atob(x), c => c.charCodeAt(0)); }
async function staffOk(t) {
  if (!t) return false;
  const c = STAFF.get(t); if (c && c.exp > Date.now()) return c.ok;
  try {
    const [h, pl, sg] = t.split("."); if (!sg) return false;
    const hd = JSON.parse(new TextDecoder().decode(b64u(h))), P = JSON.parse(new TextDecoder().decode(b64u(pl)));
    const now = Date.now() / 1000;
    if (P.aud !== "awamia-zara" || P.iss !== "https://securetoken.google.com/awamia-zara" || !(P.exp > now) || !P.email) return false;
    if (!JWKS || Date.now() - JWKS_AT > 3600e3) { JWKS = (await (await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")).json()).keys || []; JWKS_AT = Date.now(); }
    const jwk = JWKS.find(k => k.kid === hd.kid); if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(sg), new TextEncoder().encode(h + "." + pl))) return false;
    const body = { structuredQuery: { from: [{ collectionId: "employees" }], where: { fieldFilter: { field: { fieldPath: "email" }, op: "EQUAL", value: { stringValue: String(P.email).toLowerCase() } } }, limit: 1 } };
    const r = await fetch(`${FS_BASE}:runQuery?key=${FS_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const f = (((await r.json())[0] || {}).document || {}).fields || {};
    const perms = ((f.perms || {}).arrayValue || {}).values || [];
    const ok = (f.role || {}).stringValue === "admin" || perms.some(v => v.stringValue === "cv.view");
    STAFF.set(t, { ok, admin: (f.role || {}).stringValue === "admin", exp: Math.min(P.exp * 1000, Date.now() + 300e3) });
    return ok;
  } catch (e) { return false; }
}
async function staffAdmin(t) { if (!await staffOk(t)) return false; const c = STAFF.get(t); return !!(c && c.admin); }
// ---------- إحصائيات الزوار ----------
const PAGES = { "/": "الصفحة الرئيسية", "/bayanat": "تسجيل بيانات المناسبات", "/submit.html": "تسجيل بيانات المناسبات", "/policy": "سياسة النشر", "/cv": "رفع السيرة الذاتية", "/cv/hired": "بلاغ التوظيف", "/hr": "بوابة المدربين", "/sponsor": "رعاية التقويم", "/live": "عدّاد التسجيل" };
const RIY = 3 * 3600e3, DAY = 864e5;
async function trackIn(raw, ua, env) {
  if (/bot|crawl|spider|preview|facebookexternalhit|whatsapp|slurp|headless/i.test(ua)) return;
  let b; try { b = JSON.parse(raw); } catch (e) { return; }
  const v = clip(b.v, 24), sid = clip(b.s, 24); if (!v || !sid || !Array.isArray(b.e) || v.startsWith("zz")) return;
  const d = /mobile|android|iphone|ipad/i.test(ua) ? "m" : "d", t0 = now();
  const st = b.e.slice(0, 40).map(e => env.DB.prepare("INSERT INTO hits (t, v, s, p, k, l, x, d, r) VALUES (?,?,?,?,?,?,?,?,?)").bind(t0, v, sid, clip(e.p, 80).replace(/\/+$/, "") || "/", clip(e.k, 12), clip(e.l, 60), clip(e.x, 120), d, clip(e.r, 60)));
  if (st.length) await env.DB.batch(st);
  if (Math.random() < 0.01) await env.DB.prepare("DELETE FROM hits WHERE t < ? OR p LIKE '/zz%'").bind(t0 - 120 * DAY).run();
}
async function statsLive(db) {
  const t = now(), live = (await db.prepare("SELECT p, COUNT(DISTINCT s) AS n FROM hits WHERE t > ? GROUP BY p ORDER BY n DESC").bind(t - 120e3).all()).results || [];
  const feed = (await db.prepare("SELECT t, p, k, l, x, d FROM hits WHERE t > ? AND k IN ('view','click','ev') ORDER BY t DESC LIMIT 40").bind(t - DAY).all()).results || [];
  const d0 = Math.floor((t + RIY) / DAY) * DAY - RIY;
  const today = await db.prepare("SELECT SUM(k='view') AS views, COUNT(DISTINCT v) AS visitors, COUNT(DISTINCT s) AS sessions FROM hits WHERE t >= ?").bind(d0).first();
  return { now: t, live: { total: (await db.prepare("SELECT COUNT(DISTINCT s) AS n FROM hits WHERE t > ?").bind(t - 120e3).first()).n || 0, pages: live }, today, feed };
}
async function statsFull(db, days, page) {
  const t = now(), from = Math.floor((t + RIY) / DAY) * DAY - RIY - (days - 1) * DAY, pf = page ? " AND p = ?" : "", pa = page ? [page] : [];
  const q = (sql, ...a) => db.prepare(sql).bind(from, ...pa, ...a).all().then(r => r.results || []);
  const [daily, pages, clicks, refs, devs, hours, evs, newv, durs] = await Promise.all([
    q(`SELECT CAST((t + ${RIY}) / ${DAY} AS INTEGER) AS day, SUM(k='view') AS views, COUNT(DISTINCT v) AS visitors FROM hits WHERE t >= ?${pf} GROUP BY day ORDER BY day`),
    q(`SELECT p, SUM(k='view') AS views, COUNT(DISTINCT v) AS visitors, SUM(k='click') AS clicks FROM hits WHERE t >= ?${pf} GROUP BY p ORDER BY views DESC LIMIT 30`),
    q(`SELECT p, l, COUNT(*) AS n, COUNT(DISTINCT v) AS u FROM hits WHERE t >= ?${pf} AND k = 'click' AND l != '' GROUP BY p, l ORDER BY n DESC LIMIT 60`),
    q(`SELECT r, COUNT(*) AS n FROM hits WHERE t >= ?${pf} AND k = 'view' GROUP BY r ORDER BY n DESC LIMIT 12`),
    q(`SELECT d, COUNT(DISTINCT v) AS n FROM hits WHERE t >= ?${pf} GROUP BY d`),
    q(`SELECT CAST(((t + ${RIY}) % ${DAY}) / 3600000 AS INTEGER) AS h, SUM(k='view') AS n FROM hits WHERE t >= ?${pf} GROUP BY h`),
    q(`SELECT p, l, x, COUNT(*) AS n FROM hits WHERE t >= ?${pf} AND k = 'ev' GROUP BY p, l, x ORDER BY n DESC LIMIT 80`),
    q(`SELECT COUNT(DISTINCT v) AS n FROM hits WHERE t >= ?${pf} AND k = 'view' AND x = 'new'`),
    q(`SELECT p, AVG(CAST(l AS INTEGER)) AS sec, AVG(CAST(x AS INTEGER)) AS scroll, COUNT(*) AS n FROM hits WHERE t >= ?${pf} AND k = 'leave' GROUP BY p`)
  ]);
  return { from, days, daily, pages, clicks, refs, devs, hours, evs, newVisitors: (newv[0] || {}).n || 0, durs };
}
const vacPub = v => ({ id: v.id, title: v.title, title_en: v.title_en, company: v.company, city: v.city, tags: JSON.parse(v.tags || "[]"), intro: v.intro, duties: JSON.parse(v.duties || "[]"), quals: JSON.parse(v.quals || "[]"), exp: v.exp, status: v.status, created: v.created });
const lines = (x, n) => (Array.isArray(x) ? x : String(x || "").split(/\n+/)).map(l => clip(String(l).replace(/^[-•*\d.)\s]+/, ""), 200)).filter(Boolean).slice(0, n || 12);
async function adminOk(db, k) { if (!k) return false; const r = await db.prepare("SELECT v FROM meta WHERE k = 'admin'").first(); return !!r && r.v === await sha(k); }
async function logAct(db, who, act, ref) { try { await db.prepare("INSERT INTO log (t, who, act, ref) VALUES (?, ?, ?, ?)").bind(now(), who, act, ref || "").run(); } catch (e) {} }

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get("Origin") || "", H = cors(origin), url = new URL(req.url), p = url.pathname.replace(/\/+$/, "");
    if (req.method === "OPTIONS") return new Response(null, { headers: H });
    try {
      await schema(env.DB);

      if (p === "/api/t" && req.method === "POST") { const raw = (await req.text()).slice(0, 20000); ctx.waitUntil(trackIn(raw, req.headers.get("User-Agent") || "", env).catch(() => {})); return new Response(null, { status: 204, headers: H }); }

      if (p === "/api/vacancies") { // الوظائف المفتوحة للتقديم — تظهر أعلى صفحة رفع السيرة
        const vs = ((await env.DB.prepare("SELECT * FROM vacancies WHERE status = 'open' ORDER BY created DESC LIMIT 50").all()).results || []).map(vacPub);
        let applied = []; const t = url.searchParams.get("t") || "";
        if (t) { const sk = await env.DB.prepare("SELECT phone FROM seekers WHERE token = ? AND status = 'active'").bind(t).first(); if (sk) applied = ((await env.DB.prepare("SELECT vacancy_id FROM applications WHERE phone = ?").bind(sk.phone).all()).results || []).map(x => x.vacancy_id); }
        return jsonRaw({ ok: true, vacancies: vs, applied }, 200, H);
      }
      if (p === "/api/apply" && req.method === "POST") { // التقديم على وظيفة: سيرة مؤكَّدة فقط، ومرة واحدة لكل وظيفة
        const b = await req.json(); let sk = b.t && await env.DB.prepare("SELECT * FROM seekers WHERE token = ? AND status = 'active'").bind(b.t).first();
        if (!sk && b.phone) { // تقديم مباشر برقم الجوال: نفس تحقق الرفع (سجل الورشة + الحضور)، وبسيرته المؤكدة المحفوظة
          const ph = phoneNorm(b.phone); if (!/^05\d{8}$/.test(ph)) return json({ ok: false, err: "phone" }, 200, H);
          const r = await rosterByPhone(ph); if (!r) return json({ ok: false, err: "notfound" }, 200, H);
          const att = await attendees(); if (att && !attendedOk(att, r.id)) return json({ ok: false, err: "notattended" }, 200, H);
          const all = (await env.DB.prepare("SELECT * FROM seekers WHERE phone = ? AND status = 'active' ORDER BY consent DESC, updated DESC").bind(ph).all()).results || [];
          if (!all.length) return json({ ok: false, err: "nocv", name: r.name }, 200, H);
          sk = all[0];
        }
        if (!sk) return json({ ok: false, err: "token" }, 200, H);
        if (!sk.consent) return json({ ok: false, err: "confirm" }, 200, H);
        const v = await env.DB.prepare("SELECT * FROM vacancies WHERE id = ? AND status = 'open'").bind(b.id || "").first();
        if (!v) return json({ ok: false, err: "closed" }, 200, H);
        const ex = await env.DB.prepare("SELECT id FROM applications WHERE vacancy_id = ? AND phone = ?").bind(v.id, sk.phone).first();
        if (ex) return json({ ok: true, already: true }, 200, H);
        await env.DB.prepare("INSERT INTO applications (id, vacancy_id, seeker_id, phone, created, status, seen) VALUES (?,?,?,?,?,'new',0)").bind("ap-" + tok(12), v.id, sk.id, sk.phone, now()).run();
        await logAct(env.DB, "seeker:" + sk.id, "apply", v.id);
        if (!isTest(sk.roster_id)) ctx.waitUntil(feed("📨", "تقديم على وظيفة «" + v.title + "»: " + sk.name, "صفحة الباحثين"));
        return json({ ok: true }, 200, H);
      }

      // ---------- الباحث ----------
      if (p === "/api/fields") return json({ fields: FIELDS.map(f => ({ k: f[0], l: f[1] })) }, 200, H);

      if (p === "/api/check" && req.method === "POST") {
        const { phone } = await req.json(); const ph = phoneNorm(phone);
        if (!/^05\d{8}$/.test(ph)) return json({ ok: false, err: "phone" }, 200, H);
        const r = await rosterByPhone(ph);
        if (!r) return json({ ok: false, err: "notfound" }, 200, H);
        const att = await attendees(); if (att && !attendedOk(att, r.id)) return json({ ok: false, err: "notattended" }, 200, H);
        const exs = (await env.DB.prepare("SELECT COALESCE(slot, 1) AS slot FROM seekers WHERE phone = ? AND status = 'active'").bind(ph).all()).results || [];
        return json({ ok: true, name: r.name, existing: exs.length > 0, slots: exs.map(x => x.slot) }, 200, H);
      }

      if (p === "/api/upload" && req.method === "POST") {
        const fd = await req.formData(); const ph = phoneNorm(fd.get("phone")); const file = fd.get("file"); const text = clip(fd.get("text"), 20000);
        if (!/^05\d{8}$/.test(ph)) return json({ ok: false, err: "phone" }, 400, H);
        const r = await rosterByPhone(ph); if (!r) return json({ ok: false, err: "notfound" }, 403, H);
        const att = await attendees(); if (att && !attendedOk(att, r.id)) return json({ ok: false, err: "notattended" }, 403, H);
        if (!file || typeof file === "string") return json({ ok: false, err: "nofile" }, 400, H);
        if (file.size > MAX_FILE) return json({ ok: false, err: "size" }, 413, H);
        const name = String(file.name || "cv"), type = /\.pdf$/i.test(name) || file.type === "application/pdf" ? "application/pdf" : /\.docx$/i.test(name) ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "";
        if (!type) return json({ ok: false, err: "type" }, 415, H);
        const slot = String(fd.get("slot")) === "2" ? 2 : 1;
        const cls = await aiClassify(env, text);
        const ex = await env.DB.prepare("SELECT * FROM seekers WHERE phone = ? AND status = 'active' AND COALESCE(slot, 1) = ?").bind(ph, slot).first();
        const id = ex ? ex.id : "cv-" + tok(10), token = ex ? ex.token : tok(22), key = `cv/${id}/${now()}-${type === "application/pdf" ? "cv.pdf" : "cv.docx"}`;
        await env.CV_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: type } });
        if (ex && ex.file_key) { try { await env.CV_BUCKET.delete(ex.file_key); } catch (e) {} }
        const t = now(), vals = [token, ph, r.name, r.gender || "", r.id, r.regNo || "", key, clip(name, 120), type, text, cls.field, JSON.stringify(cls.titles), cls.tasks, cls.years, cls.degree, JSON.stringify(cls.skills), cls.city, cls.src, t, t + KEEP_DAYS * 864e5];
        if (ex) await env.DB.prepare(`UPDATE seekers SET token=?, phone=?, name=?, gender=?, roster_id=?, reg_no=?, file_key=?, file_name=?, file_type=?, text=?, field=?, titles=?, tasks=?, years=?, degree=?, skills=?, city=?, ai=?, updated=?, expires=?, summary=NULL WHERE id=?`).bind(...vals, id).run();
        else await env.DB.prepare(`INSERT INTO seekers (token, phone, name, gender, roster_id, reg_no, file_key, file_name, file_type, text, field, titles, tasks, years, degree, skills, city, ai, updated, expires, id, created, slot) VALUES (${Array(23).fill("?").join(",")})`).bind(...vals, id, t, slot).run();
        await logAct(env.DB, "seeker:" + id, ex ? "reupload" : "upload", cls.field);
        if (!isTest(r.id)) ctx.waitUntil(feed("📄", (ex ? "حدّث سيرته: " : slot === 2 ? "سيرة ثانية: " : "سيرة جديدة: ") + r.name + " — " + (FIELD_NAME[cls.field] || ""), "صفحة الباحثين"));
        const s = await env.DB.prepare("SELECT * FROM seekers WHERE id = ?").bind(id).first();
        return jsonRaw({ ok: true, token, profile: pub(s) }, 200, H);
      }

      if (p === "/api/hired" && req.method === "POST") { // الباحث يبلغنا أنه توظّف عن طريق «مفاتيح الفرص»
        const b = await req.json(); const ph = phoneNorm(b.phone), org = clip(b.org, 80), title = clip(b.title, 80);
        if (!/^05\d{8}$/.test(ph)) return json({ ok: false, err: "phone" }, 200, H);
        if (!org || !b.confirm) return json({ ok: false, err: "fields" }, 200, H);
        const r = await rosterByPhone(ph); if (!r) return json({ ok: false, err: "notfound" }, 200, H);
        const sk = await env.DB.prepare("SELECT id FROM seekers WHERE phone = ? ORDER BY updated DESC").bind(ph).first();
        const ex = await env.DB.prepare("SELECT id FROM hires WHERE phone = ? AND src = 'self'").bind(ph).first();
        if (ex) await env.DB.prepare("UPDATE hires SET org=?, title=?, created=?, seen=0 WHERE id=?").bind(org, title, now(), ex.id).run();
        else await env.DB.prepare("INSERT INTO hires (id, seeker_id, roster_id, name, phone, org, title, src, created, seen) VALUES (?,?,?,?,?,?,?,?,?,0)").bind("h-" + tok(10), sk ? sk.id : "", r.id, r.name, ph, org, title, "self", now()).run();
        await logAct(env.DB, "seeker:" + (sk ? sk.id : r.id), "hired", org);
        if (!isTest(r.id)) ctx.waitUntil(feed("🎉", "أبلغ بتوظيفه: " + r.name + " — " + org + (title ? " (" + title + ")" : ""), "صفحة الباحثين"));
        if (!String(r.id).startsWith("zz-")) ctx.waitUntil(hubNotify("🎉 " + r.name + (/^(f|أنثى|انثى)/i.test(r.gender || "") ? " حصلت" : " حصل") + " على وظيفة" + (title ? " «" + title + "»" : "") + " في " + org + " — عن طريق مفاتيح الفرص"));
        return json({ ok: true, name: r.name }, 200, H);
      }

      if (p === "/api/me") {
        const t = url.searchParams.get("t") || ""; const s = t && await env.DB.prepare("SELECT * FROM seekers WHERE token = ? AND status = 'active'").bind(t).first();
        if (!s) return json({ ok: false, err: "token" }, 404, H);
        if (req.method === "GET") { // صاحب السيرة يرى سيرته الأخرى (إن وُجدت) ليتنقّل بينهما
          const o = await env.DB.prepare("SELECT token, field, titles, COALESCE(slot, 1) AS slot FROM seekers WHERE phone = ? AND status = 'active' AND id != ?").bind(s.phone, s.id).first();
          return jsonRaw({ ok: true, profile: pub(s), other: o ? { token: o.token, slot: o.slot, fieldName: FIELD_NAME[o.field] || "", titles: JSON.parse(o.titles || "[]") } : null }, 200, H);
        }
        if (req.method === "POST") {
          const b = await req.json(); const field = FIELD_NAME[b.field] ? b.field : s.field;
          const titles = (Array.isArray(b.titles) ? b.titles : JSON.parse(s.titles || "[]")).map(x => clip(x, 60)).filter(Boolean).slice(0, 4);
          await env.DB.prepare("UPDATE seekers SET field=?, titles=?, city=?, consent=?, updated=?, expires=? WHERE id=?").bind(field, JSON.stringify(titles), clip(b.city ?? s.city, 40), b.consent ? 1 : 0, now(), now() + KEEP_DAYS * 864e5, s.id).run();
          await logAct(env.DB, "seeker:" + s.id, b.consent ? "confirm" : "update", field);
          if (!isTest(s.roster_id)) ctx.waitUntil(feed("✔️", (b.consent && !s.consent ? "أكّد سيرته وصارت ظاهرة للمدربين: " : "عدّل بيانات سيرته: ") + s.name, "صفحة الباحثين"));
          return jsonRaw({ ok: true, profile: pub(await env.DB.prepare("SELECT * FROM seekers WHERE id = ?").bind(s.id).first()) }, 200, H);
        }
        if (req.method === "DELETE") { // حذف نهائي بطلب صاحب السيرة
          if (s.file_key) { try { await env.CV_BUCKET.delete(s.file_key); } catch (e) {} }
          await env.DB.prepare("UPDATE seekers SET status='withdrawn', text='', file_key='', titles='[]', skills='[]', token=?, updated=? WHERE id=?").bind("x-" + tok(12), now(), s.id).run();
          await logAct(env.DB, "seeker:" + s.id, "withdraw", "");
          if (!isTest(s.roster_id)) ctx.waitUntil(feed("🗑️", "حذف سيرته بنفسه: " + s.name, "صفحة الباحثين"));
          return json({ ok: true }, 200, H);
        }
      }

      // ---------- الخبراء: رابط واحد للجميع + تعريف بالجوال مرة واحدة ----------
      if (p === "/api/hr/login" && req.method === "POST") {
        const b = await req.json(); const ph = phoneNorm(b.phone), code = digits(b.code).replace(/\D/g, "");
        if (!/^05\d{8}$/.test(ph)) return json({ ok: false, err: "phone" }, 200, H);
        const e = await expertByPhone(ph); if (!e) return json({ ok: false, err: "notexpert" }, 200, H);
        let ex = await env.DB.prepare("SELECT * FROM experts WHERE id = ?").bind(e.id).first();
        if (!ex || !ex.pin_hash) return json({ ok: false, err: "nocode" }, 200, H);
        if (!ex.active) return json({ ok: false, err: "disabled" }, 200, H);
        if ((ex.lock_until || 0) > now()) return json({ ok: false, err: "locked", mins: Math.ceil((ex.lock_until - now()) / 6e4) }, 200, H);
        if (!code || await sha(e.id + ":" + code) !== ex.pin_hash) {
          const f = (ex.fails || 0) + 1;
          await env.DB.prepare("UPDATE experts SET fails=?, lock_until=? WHERE id=?").bind(f >= 6 ? 0 : f, f >= 6 ? now() + 15 * 6e4 : 0, e.id).run();
          return json({ ok: false, err: f >= 6 ? "locked" : "badcode", mins: 15 }, 200, H);
        }
        const token = ex.token && !String(ex.token).startsWith("x-") ? ex.token : tok(24); // نفس الجلسة على كل أجهزته
        await env.DB.prepare("UPDATE experts SET token=?, name=?, org=?, phone=?, last_seen=?, fails=0, lock_until=0, gender=? WHERE id=?").bind(token, e.name, e.org || ex.org || "", ph, now(), e.gender || "", e.id).run();
        await logAct(env.DB, "expert:" + e.id, "login", "");
        if (!isTest(e.id)) ctx.waitUntil(feed("🔓", "دخل المدرب " + e.name + " لصفحة المرشحين", "صفحة المدربين"));
        return json({ ok: true, token, name: e.name }, 200, H);
      }
      if (p.startsWith("/api/hr/")) {
        const t = url.searchParams.get("t") || ""; const ex = t && await env.DB.prepare("SELECT * FROM experts WHERE token = ? AND active = 1").bind(t).first();
        if (!ex) return json({ ok: false, err: "token" }, 401, H);
        await env.DB.prepare("UPDATE experts SET last_seen=? WHERE id=?").bind(now(), ex.id).run();
        const ATTX = await attendees();
        const pool = ((await env.DB.prepare("SELECT id, roster_id, reg_no, field, titles, years, degree, skills, city, gender, updated, created, tasks, summary, COALESCE(slot, 1) AS slot FROM seekers WHERE status='active' AND consent=1 AND phone NOT IN (SELECT phone FROM hires) AND id NOT IN (SELECT seeker_id FROM requests WHERE outcome='hired') AND (roster_id NOT LIKE 'zz-%' OR ? = 1)").bind(ex.id.startsWith("zz-") ? 1 : 0).all()).results || []).filter(s => attendedOk(ATTX, s.roster_id)).map(s => Object.assign(s, { titles: [...new Set(JSON.parse(s.titles || "[]").map(fixT))], skills: JSON.parse(s.skills || "[]"), code: ((String(s.reg_no || "").match(/(\d+)$/) || [])[1] || s.id.slice(-4).toUpperCase()) + (s.slot === 2 ? "-2" : "") }));
        if (p === "/api/hr/vacs") { // لوحة المدرب: وظائفه المعلنة وعدد المتقدمين
          if (req.method === "POST") {
            const b = await req.json();
            if (b.close || b.open) { await env.DB.prepare("UPDATE vacancies SET status = ?, closed = ? WHERE id = ? AND expert_id = ?").bind(b.close ? "closed" : "open", b.close ? now() : null, b.close || b.open, ex.id).run(); return json({ ok: true }, 200, H); }
            const title = clip(b.title, 80); if (!title) return json({ ok: false, err: "title" }, 200, H);
            const id = b.id && (await env.DB.prepare("SELECT id FROM vacancies WHERE id = ? AND expert_id = ?").bind(b.id, ex.id).first()) ? b.id : "vac-" + tok(10);
            await env.DB.prepare("INSERT OR REPLACE INTO vacancies (id, expert_id, title, title_en, company, city, tags, intro, duties, quals, exp, status, created) VALUES (?,?,?,?,?,?,?,?,?,?,?,'open',COALESCE((SELECT created FROM vacancies WHERE id = ?), ?))")
              .bind(id, ex.id, title, clip(b.title_en, 80), clip(b.company, 100), clip(b.city, 40), JSON.stringify(lines(b.tags, 4)), clip(b.intro, 600), JSON.stringify(lines(b.duties)), JSON.stringify(lines(b.quals)), clip(b.exp, 300), id, now()).run();
            await logAct(env.DB, "expert:" + ex.id, "vacancy", id);
            if (!isTest(ex.id)) ctx.waitUntil(feed("📢", "المدرب " + ex.name + " أعلن وظيفة: " + title, "صفحة المدربين"));
            return json({ ok: true, id }, 200, H);
          }
          const vs = (await env.DB.prepare("SELECT v.*, (SELECT COUNT(*) FROM applications a WHERE a.vacancy_id = v.id) AS n, (SELECT COUNT(*) FROM applications a WHERE a.vacancy_id = v.id AND a.seen = 0) AS nnew FROM vacancies v WHERE v.expert_id = ? ORDER BY v.status = 'open' DESC, v.created DESC").bind(ex.id).all()).results || [];
          return jsonRaw({ ok: true, vacancies: vs.map(v => Object.assign(vacPub(v), { n: v.n, nnew: v.nnew })) }, 200, H);
        }
        if (p === "/api/hr/apps") { // المتقدمون على وظيفة — بالاسم والجوال لأنهم قدّموا بأنفسهم
          if (req.method === "POST") {
            const b = await req.json(); const st = ["new", "fit", "interview", "no", "hired"].includes(b.status) ? b.status : null;
            const a = await env.DB.prepare("SELECT a.id, a.seeker_id, v.title FROM applications a JOIN vacancies v ON v.id = a.vacancy_id WHERE a.id = ? AND v.expert_id = ?").bind(b.id || "", ex.id).first();
            if (!a) return json({ ok: false, err: "notfound" }, 404, H);
            await env.DB.prepare("UPDATE applications SET status = COALESCE(?, status), note = COALESCE(?, note), updated = ? WHERE id = ?").bind(st, b.note == null ? null : clip(b.note, 300), now(), a.id).run();
            if (st === "hired") { const sk = await env.DB.prepare("SELECT * FROM seekers WHERE id = ?").bind(a.seeker_id).first(); if (sk && !(await env.DB.prepare("SELECT id FROM hires WHERE phone = ?").bind(sk.phone).first())) { await env.DB.prepare("INSERT INTO hires (id, seeker_id, roster_id, name, phone, org, title, src, created, seen) VALUES (?,?,?,?,?,?,?,?,?,0)").bind("h-" + tok(10), sk.id, sk.roster_id, sk.name, sk.phone, ex.org || "", a.title, "expert", now()).run(); if (!isTest(ex.id)) ctx.waitUntil(hubNotify("🎉 " + sk.name + " توظّف في «" + a.title + "» — عن طريق المدرب " + ex.name)); } }
            await logAct(env.DB, "expert:" + ex.id, "app:" + (st || "note"), a.id);
            return json({ ok: true }, 200, H);
          }
          const v = await env.DB.prepare("SELECT * FROM vacancies WHERE id = ? AND expert_id = ?").bind(url.searchParams.get("id") || "", ex.id).first();
          if (!v) return json({ ok: false, err: "notfound" }, 404, H);
          const rows = (await env.DB.prepare("SELECT a.id, a.created, a.status, a.note, a.seen, s.id AS sid, s.name, s.phone, s.gender, s.field, s.titles, s.years, s.degree, s.city, s.summary, s.status AS sst FROM applications a JOIN seekers s ON s.id = a.seeker_id WHERE a.vacancy_id = ? ORDER BY a.created DESC").bind(v.id).all()).results || [];
          await env.DB.prepare("UPDATE applications SET seen = 1 WHERE vacancy_id = ? AND seen = 0").bind(v.id).run();
          return json({ ok: true, vacancy: vacPub(v), apps: rows.map(r => ({ id: r.id, created: r.created, status: r.status, note: r.note || "", isNew: !r.seen, sid: r.sid, name: r.name, phone: r.phone, gender: r.gender, fieldName: FIELD_NAME[r.field] || "", titles: JSON.parse(r.titles || "[]"), years: r.years, degree: r.degree, city: r.city, summary: r.summary ? JSON.parse(r.summary) : [], active: r.sst === "active" })) }, 200, H);
        }
        if (p === "/api/hr/home") { // مربعات المسميات + أسئلة المتابعة المستحقة
          const tiles = {};
          pool.forEach(s => { const seen = {}; s.titles.forEach(ti => { const k = normT(ti); if (!k || seen[k]) return; seen[k] = 1; const tl = (tiles[k] = tiles[k] || { label: ti, n: 0, field: s.field, codes: [] }); tl.n++; tl.codes.push(s.code); }); });
          const due = ((await env.DB.prepare("SELECT r.id, r.job, r.created, s.name FROM requests r LEFT JOIN seekers s ON s.id = r.seeker_id WHERE r.expert_id = ? AND (r.outcome IS NULL OR r.outcome = '') AND r.created < ? ORDER BY r.created LIMIT 5").bind(ex.id, now() - FOLLOW_DAYS * 864e5).all()).results || []);
          const jobs = ((await env.DB.prepare("SELECT id, expert_id, title, note, created FROM jobs WHERE status = 'open' ORDER BY created DESC LIMIT 300").all()).results || []);
          const mine = jobs.filter(j => j.expert_id === ex.id).map(j => ({ id: j.id, title: j.title, note: j.note, created: j.created, n: pool.filter(s => s.titles.some(x => tMatch(x, j.title))).length }));
          const others = [...new Set(jobs.filter(j => j.expert_id !== ex.id).map(j => j.title))].slice(0, 150);
          if (!ex.gender && ex.phone) { const rp = await expertByPhone(ex.phone).catch(() => null); if (rp && rp.gender) { ex.gender = rp.gender; await env.DB.prepare("UPDATE experts SET gender=? WHERE id=?").bind(rp.gender, ex.id).run(); } }
          const st = await env.DB.prepare("SELECT COUNT(*) AS o, SUM(CASE WHEN outcome='hired' THEN 1 ELSE 0 END) AS h FROM requests WHERE expert_id = ?").bind(ex.id).first();
          return json({ ok: true, name: ex.name, gender: ex.gender || "", stats: { opened: (st && st.o) || 0, hired: (st && st.h) || 0 }, total: pool.length, jobs: mine, others, tiles: Object.values(tiles).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "ar")), fields: FIELDS.map(f => ({ k: f[0], l: f[1], n: pool.filter(s => s.field === f[0]).length })).filter(f => f.n), due, ages: pool.map(s => [s.code, s.field, s.created || s.updated || 0]) }, 200, H);
        }
        if (p === "/api/hr/list") { // بطاقات بلا اسم ولا جوال حتى يطلب الخبير السيرة
          const title = url.searchParams.get("title") || "", field = url.searchParams.get("field") || "", job = url.searchParams.get("job") || "", k = normT(title);
          const mine = {}; ((await env.DB.prepare("SELECT seeker_id FROM requests WHERE expert_id = ?").bind(ex.id).all()).results || []).forEach(r => mine[r.seeker_id] = 1);
          const rows = pool.filter(s => job ? s.titles.some(x => tMatch(x, job)) : title ? s.titles.some(x => normT(x) === k) : field ? s.field === field : true)
            .sort((a, b) => (b.years || 0) - (a.years || 0) || b.updated - a.updated)
            .map(s => ({ id: s.id, code: s.code, fieldName: FIELD_NAME[s.field] || "", titles: s.titles, alsoIn: title ? s.titles.filter(x => normT(x) !== k) : [], years: s.years, degree: s.degree, city: s.city, skills: s.skills.slice(0, 5), gender: s.gender, taken: !!mine[s.id], created: s.created || s.updated || 0, summary: s.summary ? JSON.parse(s.summary) : sumFallback(s), sumAi: !!s.summary }));
          const miss = rows.filter(r => !r.sumAi).map(r => r.id); if (miss.length) ctx.waitUntil(fillSummaries(env, miss).catch(() => {}));
          return json({ ok: true, rows }, 200, H);
        }
        if (p === "/api/hr/open" && req.method === "POST") { // كشف السيرة: يُسجَّل باسم الخبير فوراً
          const b = await req.json(); const s = await env.DB.prepare("SELECT * FROM seekers WHERE id = ? AND status='active' AND consent=1").bind(b.id || "").first();
          if (!s) return json({ ok: false, err: "gone" }, 404, H);
          let r = await env.DB.prepare("SELECT * FROM requests WHERE expert_id = ? AND seeker_id = ?").bind(ex.id, s.id).first();
          const isNew = !r;
          if (!r) { r = { id: "rq-" + tok(16) }; await env.DB.prepare("INSERT INTO requests (id, expert_id, seeker_id, job, created) VALUES (?, ?, ?, ?, ?)").bind(r.id, ex.id, s.id, clip(b.job, 80), now()).run(); r.created = now(); await logAct(env.DB, "expert:" + ex.id, "open", s.id); }
          if (!isTest(ex.id) && isNew) ctx.waitUntil(feed("👁️", "المدرب " + ex.name + " فتح سيرة " + s.name + (b.job ? " — لوظيفة " + clip(b.job, 60) : ""), "صفحة المدربين"));
          return json({ ok: true, rid: r.id, name: s.name, phone: s.phone, fieldName: FIELD_NAME[s.field] || "", titles: JSON.parse(s.titles || "[]"), file: `${url.origin}/f/${r.id}`, fileName: s.file_name }, 200, H);
        }
        if (p === "/api/hr/job" && req.method === "POST") { // إضافة وظيفة مطلوبة بأبسط شكل: مسمى + ملاحظة اختيارية
          const b = await req.json();
          if (b.close) { await env.DB.prepare("UPDATE jobs SET status='closed', closed=? WHERE id=? AND expert_id=?").bind(now(), b.close, ex.id).run(); await logAct(env.DB, "expert:" + ex.id, "job:close", b.close); if (!isTest(ex.id)) ctx.waitUntil(feed("📪", "المدرب " + ex.name + " أغلق وظيفة مطلوبة", "صفحة المدربين")); return json({ ok: true }, 200, H); }
          const title = clip(b.title, 60); if (title.length < 2) return json({ ok: false, err: "title" }, 200, H);
          const dup = ((await env.DB.prepare("SELECT id, title FROM jobs WHERE expert_id = ? AND status = 'open'").bind(ex.id).all()).results || []).find(j => nk(j.title) === nk(title));
          if (dup) return json({ ok: true, dup: true, id: dup.id }, 200, H);
          const id = "jb-" + tok(12), field = keywordClassify(title).field;
          await env.DB.prepare("INSERT INTO jobs (id, expert_id, title, nkey, field, note, status, created) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)").bind(id, ex.id, title, nk(title), field, clip(b.note, 140), now()).run();
          await logAct(env.DB, "expert:" + ex.id, "job:add", title);
          if (!isTest(ex.id)) ctx.waitUntil(feed("➕", "المدرب " + ex.name + " أضاف وظيفة مطلوبة: " + title, "صفحة المدربين"));
          return json({ ok: true, id, n: pool.filter(s => s.titles.some(x => tMatch(x, title))).length }, 200, H);
        }
        if (p === "/api/hr/outcome" && req.method === "POST") {
          const b = await req.json(); const o = ["hired", "cv_no", "int_no", "view"].includes(b.outcome) ? b.outcome : "no";
          await env.DB.prepare("UPDATE requests SET outcome=?, outcome_at=? WHERE id=? AND expert_id=?").bind(o, now(), b.rid || "", ex.id).run();
          await logAct(env.DB, "expert:" + ex.id, "outcome:" + o, b.rid || "");
          if (!isTest(ex.id)) { const rq = await env.DB.prepare("SELECT s.name FROM requests r LEFT JOIN seekers s ON s.id = r.seeker_id WHERE r.id = ?").bind(b.rid || "").first(); const OUTL = { view: " اطّلع فقط على سيرة: ", hired: " قابل وتوظّف: ", cv_no: " اطّلع على السيرة وهي غير مناسبة: ", int_no: " قابل وغير مناسب: ", no: " لم يتم التوظيف: " }; ctx.waitUntil(feed(o === "hired" ? "🎉" : "➖", "المدرب " + ex.name + OUTL[o] + ((rq && rq.name) || "مرشح"), "صفحة المدربين")); }
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
        const bt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        if (!await staffOk(bt) && !await adminOk(env.DB, k)) return json({ ok: false, err: "key" }, 401, H);
        if (p === "/api/admin/stats" || p === "/api/admin/live") { // إحصائيات الزوار — للأدمن فقط
          if (!await staffAdmin(bt) && !await adminOk(env.DB, k)) return json({ ok: false, err: "key" }, 403, H);
          if (p === "/api/admin/live") return jsonRaw(Object.assign({ ok: true }, await statsLive(env.DB)), 200, H);
          const days = Math.max(1, Math.min(90, +url.searchParams.get("days") || 7));
          const extra = { experts: await env.DB.prepare("SELECT COUNT(*) AS n, SUM(last_seen > ?) AS active7 FROM experts WHERE id NOT LIKE 'zz-%' AND pin_at IS NOT NULL").bind(now() - 7 * DAY).first(),
            seekers: await env.DB.prepare("SELECT COUNT(*) AS n, SUM(consent = 1) AS shown, SUM(created > ?) AS recent FROM seekers WHERE status = 'active' AND roster_id NOT LIKE 'zz-%'").bind(now() - days * DAY).first(),
            opened: await env.DB.prepare("SELECT COUNT(*) AS n FROM requests WHERE created > ? AND expert_id NOT LIKE 'zz-%'").bind(now() - days * DAY).first() };
          return jsonRaw(Object.assign({ ok: true, extra, names: PAGES }, await statsFull(env.DB, days, url.searchParams.get("page") || "")), 200, H);
        }
        if (p === "/api/admin/list") {
          const ATTA = await attendees();
          const rows = (await env.DB.prepare("SELECT id, roster_id, name, phone, reg_no, gender, field, titles, years, degree, city, consent, status, ai, created, updated, COALESCE(slot, 1) AS slot FROM seekers WHERE roster_id NOT LIKE 'zz-%' ORDER BY updated DESC").all()).results || [];
          const reqs = (await env.DB.prepare("SELECT r.*, e.name AS expert, e.org AS org, s.name AS seeker FROM requests r LEFT JOIN experts e ON e.id = r.expert_id LEFT JOIN seekers s ON s.id = r.seeker_id WHERE r.expert_id NOT LIKE 'zz-%' ORDER BY r.created DESC LIMIT 500").all()).results || [];
          const dx = (await env.DB.prepare("SELECT id, name, org, phone, active, created, last_seen, pin_at FROM experts WHERE id NOT LIKE 'zz-%' ORDER BY created").all()).results || [];
          const ro = await rosterExperts(), byId = Object.fromEntries(dx.map(x => [x.id, x]));
          const experts = (ro || []).map(p => Object.assign({ id: p.id, name: p.name, phone: p.phone, reg_no: p.regNo, active: 1, created: null, last_seen: null, pin_at: null }, byId[p.id] ? { org: byId[p.id].org, active: byId[p.id].active, created: byId[p.id].created, last_seen: byId[p.id].last_seen, pin_at: byId[p.id].pin_at } : {}, { name: p.name, phone: p.phone }));
          dx.forEach(x => { if (!experts.some(y => y.id === x.id)) experts.push(Object.assign({ gone: true }, x)); });
          const pool = ((await env.DB.prepare("SELECT titles FROM seekers WHERE status='active' AND consent=1 AND phone NOT IN (SELECT phone FROM hires) AND id NOT IN (SELECT seeker_id FROM requests WHERE outcome='hired') AND roster_id NOT LIKE 'zz-%'").all()).results || []).map(s => JSON.parse(s.titles || "[]"));
          const jobs = ((await env.DB.prepare("SELECT j.*, e.name AS expert FROM jobs j LEFT JOIN experts e ON e.id = j.expert_id WHERE j.expert_id NOT LIKE 'zz-%' ORDER BY j.created DESC LIMIT 500").all()).results || []).map(j => Object.assign(j, { n: pool.filter(ts => ts.some(x => tMatch(x, j.title))).length }));
          const hires = (await env.DB.prepare("SELECT * FROM hires WHERE roster_id NOT LIKE 'zz-%' ORDER BY created DESC LIMIT 500").all()).results || [];
          return json({ ok: true, rosterOk: !!ro, jobs, hires, seekers: rows.map(r => Object.assign(r, { attended: attendedOk(ATTA, r.roster_id), fieldName: FIELD_NAME[r.field] || "", titles: JSON.parse(r.titles || "[]") })), requests: reqs, experts, fields: FIELDS.map(f => ({ k: f[0], l: f[1] })) }, 200, H);
        }
        if (p === "/api/admin/code" && req.method === "POST") { // رمز دخول جديد من 6 أرقام — يُعرض للمؤسس مرة واحدة ليرسله بالواتساب
          const b = await req.json(); const ro = await rosterExperts(); const pr = ro && ro.find(x => x.id === b.id);
          if (!pr) return json({ ok: false, err: "notexpert" }, 200, H);
          if (!/^05\d{8}$/.test(pr.phone)) return json({ ok: false, err: "phone" }, 200, H);
          const a = new Uint32Array(1); crypto.getRandomValues(a); const code = String(100000 + a[0] % 900000), hash = await sha(pr.id + ":" + code);
          const ex = await env.DB.prepare("SELECT id FROM experts WHERE id = ?").bind(pr.id).first();
          if (ex) await env.DB.prepare("UPDATE experts SET pin_hash=?, pin_at=?, fails=0, lock_until=0, name=?, phone=?, active=1 WHERE id=?").bind(hash, now(), pr.name, pr.phone, pr.id).run();
          else await env.DB.prepare("INSERT INTO experts (id, token, name, org, phone, active, created, pin_hash, pin_at) VALUES (?, ?, ?, '', ?, 1, ?, ?, ?)").bind(pr.id, "x-" + tok(12), pr.name, pr.phone, now(), hash, now()).run();
          await logAct(env.DB, "admin", "code", pr.id);
          return json({ ok: true, code, phone: pr.phone, name: pr.name }, 200, H);
        }
        if (p === "/api/admin/edit" && req.method === "POST") { // تحكم كامل للمؤسس: تعديل السيرة، نتيجة الطلب، حالة الوظيفة
          const b = await req.json();
          if (b.t === "seeker") {
            const sk = await env.DB.prepare("SELECT * FROM seekers WHERE id = ?").bind(b.id || "").first(); if (!sk) return json({ ok: false, err: "notfound" }, 404, H);
            const field = FIELD_NAME[b.field] ? b.field : sk.field;
            const titles = (Array.isArray(b.titles) ? b.titles : JSON.parse(sk.titles || "[]")).map(x => clip(x, 60)).filter(Boolean).slice(0, 6);
            await env.DB.prepare("UPDATE seekers SET field=?, titles=?, city=?, updated=? WHERE id=?").bind(field, JSON.stringify(titles), clip(b.city ?? sk.city, 40), now(), sk.id).run();
          } else if (b.t === "req") {
            const o = ["hired", "no", "cv_no", "int_no", "view", ""].includes(b.outcome) ? b.outcome : "";
            await env.DB.prepare("UPDATE requests SET outcome=?, outcome_at=? WHERE id=?").bind(o || null, o ? now() : null, b.id || "").run();
          } else if (b.t === "job") {
            await env.DB.prepare("UPDATE jobs SET status=?, closed=? WHERE id=?").bind(b.status === "open" ? "open" : "closed", b.status === "open" ? null : now(), b.id || "").run();
          } else return json({ ok: false, err: "bad" }, 400, H);
          await logAct(env.DB, "admin", "edit:" + b.t, b.id || "");
          return json({ ok: true }, 200, H);
        }
        if (p === "/api/admin/row-del" && req.method === "POST") { // حذف سطر من «من وصلته فرصة» أو «الوظائف المطلوبة»
          const b = await req.json(); const t = b.t === "job" ? "jobs" : b.t === "req" ? "requests" : "";
          if (!t || !b.id) return json({ ok: false, err: "bad" }, 400, H);
          await env.DB.prepare(`DELETE FROM ${t} WHERE id = ?`).bind(b.id).run();
          await logAct(env.DB, "admin", "del:" + b.t, b.id);
          return json({ ok: true }, 200, H);
        }
        if (p === "/api/admin/backup") { // نسخة احتياطية كاملة لجداول D1 (للمؤسس فقط)
          const out = {};
          for (const t of ["seekers", "experts", "requests", "jobs", "hires", "log", "meta"]) out[t] = (await env.DB.prepare(`SELECT * FROM ${t}`).all()).results || [];
          return json({ ok: true, at: now(), tables: out }, 200, H);
        }
        if (p === "/api/admin/seeker-del" && req.method === "POST") { // حذف سيرة من لوحة المؤسس: الملف يُحذف نهائياً
          const b = await req.json(); const sk = await env.DB.prepare("SELECT * FROM seekers WHERE id = ?").bind(b.id).first();
          if (!sk) return json({ ok: false, err: "notfound" }, 404, H);
          if (sk.file_key) { try { await env.CV_BUCKET.delete(sk.file_key); } catch (e) {} }
          await env.DB.prepare("UPDATE seekers SET status='deleted', text='', file_key='', titles='[]', skills='[]', token=?, updated=? WHERE id=?").bind("x-" + tok(12), now(), sk.id).run();
          await logAct(env.DB, "admin", "delete", sk.id);
          return json({ ok: true }, 200, H);
        }
        if (p === "/api/admin/hire" && req.method === "POST") { // تسجيل توظيف من المؤسس / حذفه / تعليم المقروء
          const b = await req.json();
          if (b.seen) { await env.DB.prepare("UPDATE hires SET seen=1 WHERE seen=0").run(); return json({ ok: true }, 200, H); }
          if (b.del) { await env.DB.prepare("DELETE FROM hires WHERE id=?").bind(b.del).run(); return json({ ok: true }, 200, H); }
          if (b.restore) { // إرجاع الشخص لقائمة المدربين: يُلغى كل تسجيل توظيف له (بلاغه، تسجيل المؤسس، تأكيد الخبير)
            const ph = phoneNorm(b.phone || ""), sid = String(b.seeker || "");
            await env.DB.prepare("DELETE FROM hires WHERE (phone = ? AND ? != '') OR (seeker_id = ? AND ? != '')").bind(ph, ph, sid, sid).run();
            if (sid) await env.DB.prepare("UPDATE requests SET outcome='returned', outcome_at=? WHERE seeker_id = ? AND outcome = 'hired'").bind(now(), sid).run();
            await logAct(env.DB, "admin", "hire:restore", sid || ph);
            return json({ ok: true }, 200, H);
          }
          const sk = await env.DB.prepare("SELECT * FROM seekers WHERE id = ?").bind(b.id).first();
          if (!sk) return json({ ok: false, err: "notfound" }, 404, H);
          await env.DB.prepare("INSERT INTO hires (id, seeker_id, roster_id, name, phone, org, title, src, created, seen) VALUES (?,?,?,?,?,?,?,?,?,1)").bind("h-" + tok(10), sk.id, sk.roster_id, sk.name, sk.phone, clip(b.org, 80), clip(b.title, 80), "admin", now()).run();
          await logAct(env.DB, "admin", "hire", sk.id);
          return json({ ok: true }, 200, H);
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
