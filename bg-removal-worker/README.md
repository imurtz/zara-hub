# بروكسي إزالة خلفية الصور — Cloudflare Worker

يستخدم ميزة **Cloudflare Images Transformations** (نموذج BiRefNet) — نفس حسابك على Cloudflare
المستخدم فعلاً لبروكسي جيمناي، **بدون أي منصة استضافة جديدة**. مشمولة ضمن 5,000 عملية تحويل
مجانية شهرياً لكل زون (رأيتها بنفسك بلوحة `gzara.org` تحت "Images → Transformations").

## خطوة أولى: تفعيل Transformations لزون gzara.org

من نفس الصفحة اللي كنت فيها (`dash.cloudflare.com → Images → Transformations`)، اضغط
**"..."** بجانب `gzara.org` واختر تفعيلها (Enable) إذا كانت لسا "Disabled".

## خطوة ثانية: إنشاء الـ Worker (نفس أسلوب بروكسي جيمناي بالضبط)

1. من القائمة الجانبية: **Compute (Workers)** ← **Workers & Pages** ← **Create**.
2. اختر **Create Worker**، واختر اسم مثل `zara-bg-removal`.
3. بعد الإنشاء، افتح محرر الكود (Edit Code)، امسح المحتوى الافتراضي، والصق محتوى ملف
   [`worker.js`](worker.js) كاملاً، واضغط **Deploy**.

## خطوة ثالثة (المهمة والمختلفة عن بروكسي جيمناي): ربط Images بالـ Worker

1. من صفحة الـ Worker نفسه، اذهب لـ **Settings** ← **Bindings** (أو "Variables and Bindings").
2. اضغط **Add Binding** ← اختر نوع **Images**.
3. اسم المتغيّر (Variable name) اكتب بالضبط: `IMAGES`
4. احفظ (Save/Deploy).

## التأكد إنه شغّال

جرّب استدعاء الرابط اللي يعطيك إياه Worker (`https://zara-bg-removal.<حسابك>.workers.dev`) — أرسل
لي هذا الرابط وأنا أربطه بالواجهتين مباشرة وأتحقق بنفسي عبر اختبار فعلي.

## ملاحظة مهمة

لو ظهر أي خطأ متعلق بالفوترة أو "Images غير مفعّلة" عند أول استدعاء فعلي، أرسل لي نص الرسالة
كاملاً — هذا بالضبط النوع اللي نحله بسرعة من رسالة الخطأ نفسها، بدون تخمين إضافي.
