/* ضبط نصوص ظهر التقويم «صفحة الموسم» بعد رسمه — كل عنصر في موضع ومقاس ثابتين في الصفحات الاثنتي عشرة:
   • اسم الموسم: سطر واحد؛ يصغر خطه فقط إن تجاوز عرضه، وارتفاع سطره ثابت فلا يتحرك ما تحته
   • جملة الموسم ورسالة الزائر: سطران دائماً، متساويا الطول بالكشيدة؛ يصغر الخط فقط إن تجاوزا العرض المتاح
   • عنوان الحملة بجانب الرمز: سطر واحد يصغر عند الحاجة */
function fitE(root){if(!window.kashidaTwo||!root)return;
 // القياس يتم على المقاس الطبيعي للصفحة: المعاينة مصغّرة (وقد تكون بمقياس صفر وهي مخفية) فيُلغى التصغير لحظة القياس
 const rig=root.closest&&root.closest("#rig"),rigT=rig?rig.style.transform:null;if(rig)rig.style.transform="none";
 try{fitE2(root)}finally{if(rig)rig.style.transform=rigT}}
function fitE2(root){
 const fitW=(el,max,min)=>{el.style.fontSize="";let fs=parseFloat(getComputedStyle(el).fontSize),n=0;const lim=el.parentElement.getBoundingClientRect().width+.5;
  while(el.scrollWidth>el.clientWidth+.5&&fs>min&&n++<40){fs*=.97;el.style.fontSize=fs+"px"}};
 root.querySelectorAll(".d-e.gift").forEach(pg=>{
  const h=pg.querySelector(".ssn h2");if(h){h.style.fontSize="";let fs=parseFloat(getComputedStyle(h).fontSize),n=0;while(h.scrollWidth>h.clientWidth+.5&&n++<40){fs*=.97;h.style.fontSize=fs+"px"}}
  pg.querySelectorAll(".vis p,.ssn p").forEach(p=>{p.style.fontSize="";let fs=parseFloat(getComputedStyle(p).fontSize),n=0;const W=p.getBoundingClientRect().width;
   try{while(kashidaTwo(p)>W+.5&&n++<20){fs*=.96;p.style.fontSize=fs+"px"}}catch(_){}});
  const b=pg.querySelector(".vis .vt b");if(b){b.style.fontSize="";let fs=parseFloat(getComputedStyle(b).fontSize),n=0;while(b.scrollWidth>b.clientWidth+.5&&n++<30){fs*=.96;b.style.fontSize=fs+"px"}}
 })}
