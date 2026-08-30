// بروكسي رفع الصور إلى Cloudflare R2 — بديل تخزين الصور كـ base64 داخل مستندات Firestore
// (كان يضخّم حجم كل سجل ويبطّئ تحميل كل اللوحة). يستقبل بايتات الصورة الخام، يرفعها لحاوية
// R2، ويرجّع رابطها العام (يُخزَّن هذا الرابط بالسجل بدل الصورة نفسها).

const ALLOWED_ORIGINS = [
  "https://gzara.org",
  "https://imurtz.github.io",
  "http://localhost:3000" // للاختبار المحلي فقط
];

// النطاق العام المربوط بحاوية R2 (خطوة "Custom Domain" من إعدادات R2 — انظر README.md)
const PUBLIC_BASE_URL = "https://media.gzara.org";

// المجلدات المسموح الرفع إليها — يمنع تخزين ملفات بمسارات عشوائية غير متوقعة
const ALLOWED_FOLDERS = ["events", "logos", "templates", "fonts"];

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 ميقابايت

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Folder",
    "Vary": "Origin"
  };
}

function extFromContentType(ct) {
  if (ct === "image/png") return "png";
  if (ct === "image/jpeg") return "jpg";
  if (ct === "font/woff2") return "woff2";
  if (ct === "font/woff") return "woff";
  return "bin";
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

    const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim();
    const allowedTypes = ["image/png", "image/jpeg", "font/woff2", "font/woff"];
    if (!allowedTypes.includes(contentType)) {
      return json({ error: "unsupported_type" }, 400, headers);
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength && contentLength > MAX_UPLOAD_BYTES) {
      return json({ error: "file_too_large" }, 413, headers);
    }

    let folder = (request.headers.get("X-Folder") || "events").trim();
    if (!ALLOWED_FOLDERS.includes(folder)) folder = "events";

    const ext = extFromContentType(contentType);
    const key = folder + "/" + crypto.randomUUID() + "." + ext;

    try {
      await env.BUCKET.put(key, request.body, {
        httpMetadata: { contentType: contentType }
      });
      return json({ url: PUBLIC_BASE_URL + "/" + key, key: key }, 200, headers);
    } catch (e) {
      return json({ error: "upload_failed", detail: String((e && e.message) || e).slice(0, 300) }, 502, headers);
    }
  }
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json" }, headers)
  });
}
