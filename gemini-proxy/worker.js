// بروكسي آمن لاستدعاء Gemini API من صفحة التسجيل العامة (submit.html)
// الهدف: صياغة مقترحة لنص التهنئة دون كشف مفتاح Gemini في المتصفح.
// مفتاح GEMINI_API_KEY يُحفظ كسر (secret) في إعدادات الـ Worker على Cloudflare — لا يظهر هنا إطلاقاً.

const ALLOWED_ORIGINS = [
  "https://imurtz.github.io",
  "http://localhost:3000" // للاختبار المحلي فقط
];

const WORDING_POLICY = `أنت مساعد صياغة لجمعية العوامية الخيرية، تُعِد نصاً مقترحاً لمنشور تهنئة اجتماعية يُنشر باسم الجمعية.
التزم بالتالي دائماً:
- اللغة عربية فصحى بسيطة، بصيغة الغائب (نتحدث عن صاحب المناسبة وليس معه).
- أسلوب رسمي دافئ يليق بجمعية خيرية، دون مبالغة أو ألفاظ عاطفية زائدة.
- لا تستخدم ألقاباً دينية أو نعوتاً لم يذكرها المستخدم صراحة.
- لا تخترع تفاصيل غير مذكورة في المعطيات (لا أسماء، لا تواريخ، لا إنجازات إضافية).
- النص المقترح فقرة واحدة قصيرة (٢-٤ جمل)، بدون عنوان وبدون رموز تعبيرية.
- اختم غالباً بدعاء مناسب موجز (مثل: "سائلين الله لهم دوام التوفيق والسداد").
- أعد نص الصياغة فقط، دون أي شرح أو مقدمة أو علامات اقتباس.`;

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
    const title = clean(body.title, 100);
    const occasionType = clean(body.occasionType, 200);
    const details = clean(body.details, 800);

    if (!details) {
      return json({ error: "missing_details" }, 400, headers);
    }

    const userPrompt =
      "الاسم: " + (fullName || "غير مذكور") + "\n" +
      "اللقب/المسمى الوظيفي: " + (title || "لا يوجد") + "\n" +
      "نوع المناسبة: " + (occasionType || "غير مذكور") + "\n" +
      "تفاصيل من صاحب المناسبة: " + details;

    let geminiRes;
    try {
      geminiRes = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" + env.GEMINI_API_KEY,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: WORDING_POLICY }] },
            generationConfig: { temperature: 0.6, maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: "low" } }
          })
        }
      );
    } catch (e) {
      return json({ error: "gemini_unreachable" }, 502, headers);
    }

    if (!geminiRes.ok) {
      return json({ error: "gemini_error", status: geminiRes.status }, 502, headers);
    }

    const data = await geminiRes.json();
    const text = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text ? data.candidates[0].content.parts[0].text.trim() : "";

    if (!text) {
      return json({ error: "empty_suggestion" }, 502, headers);
    }
    return json({ suggestion: text }, 200, headers);
  }
};

function clean(v, maxLen) {
  return (v == null ? "" : String(v)).trim().slice(0, maxLen);
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json" }, headers)
  });
}
