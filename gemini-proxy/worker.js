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
3. اجعل طول النص الكامل تقريباً بين 210 و240 حرفاً — أي فقرة متوسطة الطول من 3 إلى 4 جمل قصيرة مترابطة تصف المناسبة بتفصيل مناسب دون حشو ودون اختصار مخل. لا تحسب الأحرف حرفاً حرفاً ولا تُظهر أي عملية حساب — قدّر الطول تقديراً طبيعياً من عدد الجمل والكلمات فقط.
4. لا تخترع أي تفاصيل غير مذكورة صراحة في المعطيات المُرسلة أو غير ظاهرة بوضوح في الصورة المرفقة إن وُجدت (لا أسماء جهات، لا تواريخ، لا إنجازات إضافية). إن أُرفقت صورة (شهادة، جائزة، شهادة تقدير، تكريم)، استخرج منها تفاصيل المناسبة الظاهرة فيها (نوع الإنجاز، الجهة المانحة، الموضوع) واستخدمها مع أي تفاصيل نصية مرفقة لصياغة البيان.
5. لا تستخدم أي مقدمة مثل "تتقدم الجمعية بالتهنئة" ولا أي خاتمة أو دعاء ختامي — النص يقتصر حصراً على وصف المناسبة بدءاً من "وذلك بمناسبة" وحتى نهاية وصف الإنجاز.
6. أعد الجملة النهائية فقط، كنص متصل عادي جاهز للنشر مباشرة. ممنوع منعاً باتاً: عنوان، رموز تعبيرية، علامات اقتباس، أي شرح أو تعليق، وأي أثر لعملية العد أو الحساب مثل أرقام بين قوسين أو علامات + أو كلمة "حرف" أو "حروف" داخل النص — إن ظهر أي من ذلك فهو خطأ فادح.

مثال توضيحي (مذكر) على الشكل المطلوب وعلى طول يقع داخل النطاق المسموح (210 حرفاً تقريباً):
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
    const image = parseImageDataUrl(body.image);

    if (!details && !image) {
      return json({ error: "missing_details" }, 400, headers);
    }

    const userPrompt =
      "الاسم: " + (fullName || "غير مذكور") + "\n" +
      "الجنس: " + (gender || "غير محدد") + "\n" +
      "اللقب/المسمى الوظيفي: " + (title || "لا يوجد") + "\n" +
      "نوع المناسبة: " + (occasionType || "غير مذكور") + "\n" +
      "تفاصيل من صاحب المناسبة: " + (details || "(لا يوجد نص — استخرج التفاصيل من الصورة المرفقة)");

    let text;
    try {
      text = await callGemini(env, userPrompt, image);
    } catch (e) {
      const isQuota = e.message === "quota_exceeded";
      return json({ error: isQuota ? "quota_exceeded" : "gemini_error" }, isQuota ? 429 : 502, headers);
    }

    if (!text) {
      return json({ error: "empty_suggestion" }, 502, headers);
    }

    // إن خرج النص عن النطاق المطلوب (210-240 حرفاً)، أو تسرّب فيه أثر عملية عدّ/حساب، حاول مرة واحدة إضافية
    const outOfRange = text.length < 210 || text.length > 240;
    if (outOfRange || hasLeakedArithmetic(text)) {
      try {
        const direction = text.length < 210
          ? "أقصر من اللازم — أعد الصياغة بوصف أوفى وأكثر تفصيلاً ليقع الطول بين 210 و240 حرفاً"
          : (text.length > 240
            ? "أطول من اللازم — أعد الصياغة بإيجاز أكثر ليقع الطول بين 210 و240 حرفاً"
            : "يحتوي على أثر عملية عدّ أو حساب ظاهر في النص — أعد كتابته كجملة نهائية نظيفة بدون أي أرقام أو رموز حسابية");
        const retryPrompt = userPrompt + "\n\n(تنبيه: المحاولة السابقة " + direction + ".)";
        const retryText = await callGemini(env, retryPrompt, image);
        if (retryText && !hasLeakedArithmetic(retryText)) {
          const retryInRange = retryText.length >= 210 && retryText.length <= 240;
          const currentUsable = !outOfRange && !hasLeakedArithmetic(text);
          if (retryInRange || !currentUsable) text = retryText;
        }
      } catch (e) {
        // تجاهل فشل المحاولة الإضافية — نُبقي أفضل نص متوفر لدينا
      }
    }

    if (hasLeakedArithmetic(text)) {
      return json({ error: "invalid_generation" }, 502, headers);
    }
    return json({ suggestion: trimToLimit(text, 240) }, 200, headers);
  }
};

async function callGemini(env, promptText, image) {
  const parts = [{ text: promptText }];
  if (image) {
    parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
  }
  const geminiRes = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" + env.GEMINI_API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: parts }],
        systemInstruction: { parts: [{ text: WORDING_POLICY }] },
        generationConfig: { temperature: 0.6, maxOutputTokens: 1536, thinkingConfig: { thinkingLevel: "low" } }
      })
    }
  );
  if (!geminiRes.ok) {
    throw new Error(geminiRes.status === 429 ? "quota_exceeded" : "gemini_bad_status");
  }
  const data = await geminiRes.json();
  const text = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text ? data.candidates[0].content.parts[0].text.trim() : "";
  return text;
}
// يحوّل data URL (data:image/jpeg;base64,....) إلى {mimeType, base64} لإرساله لجيمناي — أو null إن كان غير صالح
function parseImageDataUrl(v) {
  if (!v || typeof v !== "string") return null;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(v.trim());
  if (!match) return null;
  return { mimeType: match[1], base64: match[2].slice(0, 4000000) };
}

function clean(v, maxLen) {
  return (v == null ? "" : String(v)).trim().slice(0, maxLen);
}
// يكتشف تسرّب عملية عدّ الأحرف داخل النص المُولَّد (مثل "(7) +فوزه (4)") بدل الجملة النهائية النظيفة
function hasLeakedArithmetic(text) {
  var parenNumbers = text.match(/\(\d+\)/g) || [];
  if (parenNumbers.length >= 2) return true;
  if (/[+]\s*\S+\s*\(\d+\)/.test(text)) return true;
  if (/\bحرفاً?\b|\bحروف\b/.test(text)) return true;
  return false;
}
// شبكة أمان أخيرة فقط — إن فشلت المحاولتان بالبقاء ضمن نطاق 210-240 حرفاً، نقصّ عند آخر مسافة قبل الحد بدل عرض نص أطول من المسموح
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
