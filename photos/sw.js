// يخزّن كل أصول الأداة لتعمل بدون إنترنت بعد أول فتح. لا يلمس أي طلب خارج /photos/.
const V = "zara-photos-v7";
const ASSETS = ["./", "index.html", "app.js", "footer.js", "adjust.js", "worker.js", "manifest.webmanifest",
  "assets/mark.png", "assets/founding.svg", "assets/presets.json", "/assets/logo.png", "/assets/favicon.svg?v=4", "/apple-touch-icon.png",
  "vendor/jsquash/encode.js", "vendor/jsquash/meta.js", "vendor/jsquash/utils.js", "vendor/jsquash/codec/enc/mozjpeg_enc.js", "vendor/jsquash/codec/enc/mozjpeg_enc.wasm",
  "vendor/mediapipe/vision_bundle.mjs", "vendor/mediapipe/wasm/vision_wasm_internal.js", "vendor/mediapipe/wasm/vision_wasm_internal.wasm",
  "vendor/models/blaze_face_short_range.tflite", "vendor/client-zip/index.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("zara-photos-") && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// الشبكة أولاً (لتصل التحديثات) ثم النسخة المخزّنة عند انقطاع الإنترنت
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: false }).then(r => r || caches.match(e.request, { ignoreSearch: true }))));
});
