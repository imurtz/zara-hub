# zara-sync-trigger — مشغِّل مزامنة الوفيات

يجعل زر «مزامنة الآن» في لوحة الموظفين يعمل من أي جهاز ولأي موظف، دون إدخال مفتاح GitHub في المتصفح:
المفتاح يُحفظ هنا مرة واحدة كسرّ، واللوحة تستدعي هذه الخدمة فقط.

## النشر (مرة واحدة)

1. Cloudflare ← Workers & Pages ← Create ← Worker، والاسم بالضبط: `zara-sync-trigger`
   (فيصير عنوانه `https://zara-sync-trigger.murtada-ud.workers.dev/` وهو المكتوب في اللوحة).
2. Edit code ← الصق محتوى `worker.js` كاملاً ← Deploy.
3. Settings ← Variables and Secrets ← Add ← النوع **Secret**، الاسم `GH_TOKEN`، والقيمة مفتاح GitHub
   (Fine-grained، مستودع zara-hub فقط، صلاحية Actions: Read and write) ← Deploy.

## السلوك

- يقبل POST من `https://gzara.org` فقط، ويشغّل `sync-deaths.yml` على `main` بلا مدخلات.
- مهلة 60 ثانية بين تشغيل وآخر (الرد 429 أثناءها).
- قبل ضبط السر يرد 501، واللوحة عندها ترجع للطريقة القديمة (مفتاح محفوظ في المتصفح).
- عند انتهاء صلاحية المفتاح يرد 502؛ يُستبدل السر بمفتاح جديد.
