/* ضبط نصوص ظهر التقويم بعد رسمه: رسالة الزائر تصغُر تلقائياً إن طالت حتى لا تتجاوز مساحتها فوق الرمز،
   ثم تُشدّ أسطر رسالة الزائر وجملة الموسم بالكشيدة لتتوازى أطوالها */
function fitE(root){if(!window.kashidaJustify||!root)return;
 root.querySelectorAll(".d-e.gift .vis").forEach(v=>{const p=v.querySelector("p"),q=v.querySelector(".vq");if(!p||!q)return;p.style.fontSize="";p.textContent=p.textContent.replace(/ـ/g,"");
  const H=v.getBoundingClientRect().height,mm=H/74,room=H-q.getBoundingClientRect().height-16*mm;let fs=5.6,n=0;
  while(p.getBoundingClientRect().height>room&&fs>4&&n++<12){fs-=.2;p.style.fontSize=fs.toFixed(1)+"mm"}});
 root.querySelectorAll(".d-e.gift .vis p,.d-e.gift .ssn p").forEach(e=>{try{kashidaJustify(e)}catch(_){}})}
