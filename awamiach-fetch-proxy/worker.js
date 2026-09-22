// بروكسي جلب لموقع الجمعية (awamiach.sa) — يُستخدم فقط من سكربت مزامنة الوفيات (scripts/sync_deaths.py)
// الذي يعمل على GitHub Actions. لاحظنا أن استضافة awamiach.sa بدأت تسقط (تُعلّق بلا استجابة) أي
// اتصال قادم من نطاق عناوين GitHub Actions تحديداً (Azure) بينما الموقع يفتح طبيعياً من أي مكان
// آخر — على الأغلب حجب جماعي لمزوّدي الاستضافة السحابية من طرف جدار حماية الموقع. تمرير الطلب من
// هنا (شبكة Cloudflare) يتفادى هذا الحجب لأن الطلب يصل لموقع الجمعية من عنوان Cloudflare لا Azure.
//
// يقبل GET فقط، ولا يمرّر إلا روابط على نطاق awamiach.sa نفسه (لا يعمل كبروكسي عام مفتوح).

const ALLOWED_HOSTS = ["www.awamiach.sa", "awamiach.sa"];

export default {
  async fetch(request, env) {
    if (request.method !== "GET") {
      return new Response("method_not_allowed", { status: 405 });
    }

    // مفتاح مشترك اختياري لمنع أي استخدام عشوائي للبروكسي من خارج سكربت المزامنة — إن ضُبط
    // السر PROXY_KEY بإعدادات الـWorker، لازم يصل نفسه بترويسة X-Proxy-Key
    if (env.PROXY_KEY && request.headers.get("X-Proxy-Key") !== env.PROXY_KEY) {
      return new Response("forbidden", { status: 403 });
    }

    const reqUrl = new URL(request.url);
    const target = reqUrl.searchParams.get("url");
    if (!target) {
      return new Response("missing_url", { status: 400 });
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch (e) {
      return new Response("bad_url", { status: 400 });
    }
    if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
      return new Response("host_not_allowed", { status: 403 });
    }

    try {
      const upstream = await fetch(targetUrl.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ZaraDeathsSync/1.0; +https://gzara.org)",
          "Accept-Language": "ar,en;q=0.8"
        },
        // لا نستخدم كاش Cloudflare هنا — المحتوى (قائمة الأخبار وصفحاتها) يتغيّر ولازم يُقرأ حياً
        cf: { cacheTtl: 0, cacheEverything: false }
      });
      const headers = new Headers();
      const ct = upstream.headers.get("Content-Type");
      if (ct) headers.set("Content-Type", ct);
      headers.set("X-Upstream-Status", String(upstream.status));
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (e) {
      return new Response("upstream_fetch_failed: " + (e && e.message || e), { status: 502 });
    }
  }
};
