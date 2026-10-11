// مشغِّل مزامنة الوفيات — يحمل مفتاح GitHub عنده (سر GH_TOKEN) ويشغّل مهمة «مزامنة أخبار الوفيات» عند الطلب،
// حتى يعمل زر «مزامنة الآن» في لوحة الموظفين من أي جهاز ولأي موظف دون إدخال مفتاح في المتصفح.
//
// لا يفعل إلا شيئاً واحداً: تشغيل ملف sync-deaths.yml على الفرع main بلا أي مدخلات. لا يقرأ ولا يكتب غير ذلك،
// فأقصى ما يستطيعه من يستدعيه من خارج الموقع هو بدء مزامنة عادية — والمهلة أدناه تمنع تكرارها.
//
// الأسرار (Settings ← Variables and Secrets):
//   GH_TOKEN  مفتاح GitHub من نوع Fine-grained: مستودع zara-hub فقط، صلاحية Actions: Read and write

const REPO = "imurtz/zara-hub";
const WORKFLOW = "sync-deaths.yml";
const ALLOWED_ORIGINS = ["https://gzara.org", "https://www.gzara.org"];
const COOLDOWN_SECONDS = 60;

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}
function reply(status, body, origin) {
  return new Response(JSON.stringify(body), { status, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors(origin)) });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "POST") return reply(405, { error: "method_not_allowed" }, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "origin_not_allowed" }, origin);
    if (!env.GH_TOKEN) return reply(501, { error: "not_configured" }, origin);

    // مهلة بين تشغيل وآخر: ضغطات متتالية (أو استدعاء عابث) لا تُنشئ أكثر من تشغيل واحد في الدقيقة
    const cache = caches.default;
    const mark = new Request("https://sync-trigger.internal/last-run");
    if (await cache.match(mark)) return reply(429, { error: "cooldown" }, origin);

    const gh = await fetch("https://api.github.com/repos/" + REPO + "/actions/workflows/" + WORKFLOW + "/dispatches", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.GH_TOKEN,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "zara-sync-trigger"
      },
      body: JSON.stringify({ ref: "main" })
    });
    if (gh.status === 204) {
      await cache.put(mark, new Response("1", { headers: { "Cache-Control": "max-age=" + COOLDOWN_SECONDS } }));
      return reply(200, { ok: true }, origin);
    }
    // المفتاح منتهٍ أو ينقصه الصلاحية: الخطأ يعود للّوحة برقمه دون كشف أي تفاصيل
    return reply(502, { error: "github_" + gh.status }, origin);
  }
};
