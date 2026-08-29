// بروكسي إزالة خلفية الصور — يستخدم ميزة Cloudflare Images "Transformations" (نموذج BiRefNet
// عبر Workers AI، مدمج بربط Images داخل الـ Worker) — مجاني ضمن 5,000 عملية تحويل شهرياً
// لكل زون (gzara.org)، بدون أي منصة استضافة جديدة أو تكلفة إضافية.
// يعمل مباشرة على البايتات الخام للصورة المرفوعة (POST body) — بدون حاجة لرابط عام مسبق للصورة.

const ALLOWED_ORIGINS = [
  "https://gzara.org",
  "https://imurtz.github.io",
  "http://localhost:3000" // للاختبار المحلي فقط
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12 ميقابايت — أعلى من أي صورة مضغوطة تُرسَل فعلياً من الواجهة

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

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.startsWith("image/png") && !contentType.startsWith("image/jpeg")) {
      return json({ error: "unsupported_type" }, 400, headers);
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength && contentLength > MAX_UPLOAD_BYTES) {
      return json({ error: "file_too_large" }, 413, headers);
    }

    try {
      const result = await env.IMAGES.input(request.body)
        .transform({ segment: "foreground" })
        .output({ format: "image/png" });
      const response = result.response();
      const outHeaders = new Headers(response.headers);
      Object.entries(headers).forEach(([k, v]) => outHeaders.set(k, v));
      return new Response(response.body, { status: response.status, headers: outHeaders });
    } catch (e) {
      return json({ error: "processing_failed", detail: String((e && e.message) || e).slice(0, 300) }, 502, headers);
    }
  }
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json" }, headers)
  });
}
