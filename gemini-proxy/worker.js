// بروكسي آمن لاستدعاء Gemini API من صفحة التسجيل العامة (submit.html)
// الهدف: صياغة مقترحة لنص التهنئة دون كشف مفتاح Gemini في المتصفح.
// مفتاح GEMINI_API_KEY يُحفظ كسر (secret) في إعدادات الـ Worker على Cloudflare — لا يظهر هنا إطلاقاً.

const ALLOWED_ORIGINS = [
  "https://imurtz.github.io",
  "http://localhost:3000" // للاختبار المحلي فقط
];

const WORDING_POLICY = `أنت مساعد صياغة لجمعية العوامية الخيرية. مهمتك صياغة "بيان المناسبة" الذي يُستخدم داخل منشور تهنئة جاهز التصميم (الاسم والصورة والقالب الرسومي جاهزون مسبقاً؛ نصك هو فقط جملة وصف المناسبة).

قواعد صارمة يجب الالتزام بها دائماً:
1. يبدأ النص حرفياً بعبارة "وذلك بمناسبة" ثم يليها وصف المناسبة والإنجاز مباشرة.
2. راعِ صيغة المذكر أو المؤنث في كل الأفعال والضمائر حسب جنس المحتفى به المُعطى (مثال مذكر: حصوله، تخرجه، حصوله على — مثال مؤنث: حصولها، تخرجها، حصولها على). إن لم يُذكر الجنس استخدم صيغة عامة تتفادى الضمير قدر الإمكان.
3. لا يقل النص الكامل عن 210 حرفاً فعلياً (بالعدّ الحرفي الدقيق، بما فيها المسافات وعلامات الترقيم) — هذا حد أدنى إلزامي. يمكن أن يكون النص أطول من ذلك إن احتاج وصف المناسبة تفصيلاً إضافياً، فأعطِ وصفاً وافياً وغنياً بالتفاصيل المتاحة بدل الاختصار المخل.
4. لا تخترع أي تفاصيل غير مذكورة صراحة في المعطيات المُرسلة (لا أسماء جهات، لا تواريخ، لا إنجازات إضافية).
5. لا تستخدم أي مقدمة مثل "تتقدم الجمعية بالتهنئة" ولا أي خاتمة أو دعاء ختامي — النص يقتصر حصراً على وصف المناسبة بدءاً من "وذلك بمناسبة" وحتى نهاية وصف الإنجاز.
6. لا عنوان، لا رموز تعبيرية، لا علامات اقتباس، لا شرح أو تعليق منك — أعد نص البيان فقط كما سيُنشر حرفياً.

مثال توضيحي (مذكر) على الشكل المطلوب وأقل حد مقبول للطول (يمكنك أن تكتب أطول منه):
"وذلك بمناسبة حصوله على شهادة مدرّب معتمد من مؤسسة الملك عبدالعزيز ورجاله للموهبة، لتدريب الطلاب في أولمبياد نسمو بتخصص الأحياء، وكذلك برنامج الأولمبياد العالمي للأحياء (iBO)، على المستويين المحلي والدولي."`;

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, headers);
    }
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: "forbidden_origin" }, 403, headers);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "invalid_json" }, 400, headers);
    }

    const fullName = clean(body.fullName, 200);
    const gender = clean(body.gender, 20);
    const title = clean(body.title, 100);
    const occasionType = clean(body.occasionType, 200);
    const details = clean(body.details, 800);

    if (!details) {
      return json({ error: "missing_details" }, 400, headers);
    }

    const userPrompt =
      "الاسم: " + (fullName || "غير مذكور") + "\n" +
      "الجنس: " + (gender || "غير محدد") + "\n" +
      "اللقب/المسمى الوظيفي: " + (title || "لا يوجد") + "\n" +
      "نوع المناسبة: " + (occasionType || "غير مذكور") + "\n" +
      "تفاصيل من صاحب المناسبة: " + details;

    let text;
    try {
      text = await callGemini(env, userPrompt);
    } catch (e) {
      return json({ error: e.message === "gemini_bad_status" ? "gemini_error" : "gemini_unreachable" }, 502, headers);
    }

    if (!text) {
      return json({ error: "empty_suggestion" }, 502, headers);
    }

    // إن جاء النص أقصر من الحد الأدنى (210)، حاول مرة واحدة إضافية بتذكير صريح بالتوسّع
    if (text.length < 210) {
      try {
        const retryPrompt = userPrompt + "\n\n(تنبيه: المحاولة السابقة جاءت " + text.length + " حرفاً فقط، وهذا أقل من الحد الأدنى 210 حرفاً. أعد الصياغة بوصف أوفى وأكثر تفصيلاً ليصل النص إلى 210 حرفاً على الأقل.)";
        const retryText = await callGemini(env, retryPrompt);
        if (retryText && retryText.length > text.length) text = retryText;
      } catch (e) {
        // تجاهل فشل المحاولة الإضافية — نُبقي أفضل نص متوفر لدينا
      }
    }

    return json({ suggestion: trimToLimit(text, 700) }, 200, headers);
  }
};

async function callGemini(env, promptText) {
  const geminiRes = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" + env.GEMINI_API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        systemInstruction: { parts: [{ text: WORDING_POLICY }] },
        generationConfig: { temperature: 0.6, maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: "low" } }
      })
    }
  );
  if (!geminiRes.ok) {
    throw new Error("gemini_bad_status");
  }
  const data = await geminiRes.json();
  const text = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text ? data.candidates[0].content.parts[0].text.trim() : "";
  return text;
}

function clean(v, maxLen) {
  return (v == null ? "" : String(v)).trim().slice(0, maxLen);
}
// شبكة أمان فقط — سقف معقول لمنع نص طويل جداً بشكل غير معتاد، وليس الحد الأدنى المطلوب من سياسة الصياغة
function trimToLimit(text, limit) {
  if (text.length <= limit + 15) return text;
  var cut = text.slice(0, limit);
  var lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json" }, headers)
  });
}
