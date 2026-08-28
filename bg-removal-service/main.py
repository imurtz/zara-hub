# -*- coding: utf-8 -*-
"""
خدمة إزالة خلفية الصور — بوابة زارة (جمعية العوامية الخيرية)

تشغّل rembg (نموذج u2net_human_seg — مدرَّب خصيصاً على صور الأشخاص، وهو الغالبية
الساحقة من الصور المرفوعة هنا: خريجون، آباء مواليد، أزواج...) على Google Cloud Run.

- النموذج مُحمَّل مسبقاً وقت بناء الحاوية (انظر Dockerfile) بدل وقت التشغيل، لتفادي
  زمن تحميل شبكي إضافي عند "برود" الخدمة (أول طلب بعد فترة خمول).
- جلسة rembg تُنشأ مرة واحدة فقط عند إقلاع الخدمة (متغيّر عام)، لا لكل طلب — أسرع بكثير.
- حماية من الاستخدام المباشر خارج الموقع عبر فحص Origin (نفس أسلوب بروكسي جيمناي)،
  بالإضافة إلى CORSMiddleware القياسي لضمان رؤوس CORS صحيحة على كل الردود شاملة الأخطاء.
"""
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from rembg import new_session, remove

ALLOWED_ORIGINS = [
    "https://gzara.org",
    "https://imurtz.github.io",
    "http://localhost:3000",  # للاختبار المحلي فقط
]

MAX_UPLOAD_BYTES = 12 * 1024 * 1024  # 12 ميقابايت — أعلى من أي صورة مضغوطة تُرسَل فعلياً من الواجهة

# جلسة واحدة تُعاد استخدامها لكل الطلبات طوال عمر الحاوية — النموذج نفسه محمّل مسبقاً بالحاوية
session = new_session("u2net_human_seg")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/")
def health():
    return {"status": "ok", "service": "bawabat-zara-bg-removal"}


@app.post("/remove-bg")
async def remove_bg(request: Request, image: UploadFile = File(...)):
    # فحص إضافي مباشر بالخادم (وليس فقط CORSMiddleware) — يحمي من استدعاء مباشر خارج
    # المتصفح (curl/سكربت) يزوّر رأس Origin أو يتجاهله كلياً، بنفس أسلوب بروكسي جيمناي
    origin = request.headers.get("origin", "")
    if origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=403, detail="forbidden_origin")

    if image.content_type not in ("image/png", "image/jpeg"):
        raise HTTPException(status_code=400, detail="unsupported_type")

    raw = await image.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="file_too_large")
    if not raw:
        raise HTTPException(status_code=400, detail="empty_file")

    try:
        result = remove(raw, session=session)
    except Exception:
        raise HTTPException(status_code=502, detail="processing_failed")

    return Response(content=result, media_type="image/png")
