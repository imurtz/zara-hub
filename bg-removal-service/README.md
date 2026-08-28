# خدمة إزالة خلفية الصور — Cloud Run

خدمة صغيرة تشغّل [rembg](https://github.com/danielgatis/rembg) (نموذج `u2net_human_seg`،
مخصص لصور الأشخاص) على Google Cloud Run. تنشر يدوياً من طرفيتك — تماماً مثل بروكسي
جيمناي (`gemini-proxy/`) — وليست جزءاً من نشر GitHub Pages التلقائي.

## قبل البدء: تثبيت أداة gcloud (مرة واحدة فقط)

```bash
brew install --cask google-cloud-sdk
```

بعد التثبيت:

```bash
gcloud init
```

اختر أو أنشئ مشروع Google Cloud (تقدر تستخدم نفس مشروع `awamia-zara` لو الفوترة مفعّلة
عليه فعلاً من إعداد جيمناي السابق، أو أي مشروع ثاني مفعّلة عليه الفوترة).

## الفوترة (خطوة لازمة حتى ضمن الحد المجاني)

Cloud Run يحتاج حساب فوترة مربوط بالمشروع — نفس المتطلب اللي واجهناه مع جيمناي، حتى لو
الاستخدام المتوقع يبقى ضمن الحد المجاني الشهري السخي. فعّلها من:
`console.cloud.google.com/billing` → اربطها بالمشروع اللي اخترته بـ`gcloud init`.

**نصيحة**: بعد التفعيل، أنشئ تنبيه ميزانية (Budget Alert) بمبلغ بسيط (مثلاً 5$) من نفس
صفحة الفوترة — يرسل لك إيميل تلقائي لو الاستخدام قارب يتجاوز المتوقع، بدل ما تكتشف مفاجأة
بالفاتورة لاحقاً.

## تفعيل الخدمات المطلوبة (مرة واحدة فقط)

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```

## النشر

من داخل هذا المجلد (`bg-removal-service/`):

```bash
cd bg-removal-service
gcloud run deploy bawabat-zara-bg-removal \
  --source . \
  --region me-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 60 \
  --max-instances 5 \
  --min-instances 0
```

- `--source .` يخلي Cloud Build يبني صورة Docker من الملفات هنا تلقائياً — ما تحتاج Docker
  مثبّت على جهازك إطلاقاً.
- `--region me-central1` (الدوحة) أقرب منطقة متاحة حالياً غالباً — تقدر تشوف مناطق ثانية
  بـ`gcloud run regions list` وتغيّرها لو حاب.
- `--allow-unauthenticated` ضروري عشان نموذج التسجيل العام (bayanat) يقدر يستدعيها بدون
  تسجيل دخول — الحماية من إساءة الاستخدام موجودة داخل الكود نفسه (فحص Origin).
- `--max-instances 5` سقف أمان يمنع تصاعد التكلفة لو صار استخدام غير طبيعي.
- `--min-instances 0` يخلي الخدمة تتوقف تماماً (تكلفة صفر) لما ما فيه استخدام — الكلفة
  المقابلة: أول طلب بعد فترة خمول قد ياخذ ثوانٍ إضافية ("برود" الخدمة) قبل لا يصير سريعاً.

بعد انتهاء الأمر، تطبع لك رابط الخدمة (Service URL) — شكله تقريباً:
`https://bawabat-zara-bg-removal-xxxxxxxxxx.me-central1.run.app`

**أرسل لي هذا الرابط** لأربطه بلوحة التحكم ونموذج التسجيل العام.

## التأكد إن الخدمة شغالة

افتح رابط الخدمة مباشرة بالمتصفح (بدون أي مسار إضافي) — المفروض يرجع:
```json
{"status": "ok", "service": "bawabat-zara-bg-removal"}
```

## تحديث الخدمة مستقبلاً

لو احتجت تعديل `main.py` أو أي ملف هنا لاحقاً، نفس أمر النشر بالضبط يكفي لإعادة البناء
والنشر من جديد — Cloud Run يحدّث الخدمة الحية تلقائياً بدون توقف.
