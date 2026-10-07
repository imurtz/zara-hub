# -*- coding: utf-8 -*-
"""يبني Login/calendar/index.html (صفحة «التقاويم الميلادية» المضمَّنة في لوحة الموظفين).

المصدر: النموذج الأولي المسلَّم في awamia-2027-handoff (app.src.html + designs.css + qrcode.js + الشعار).
هذا السكربت يطبّق عليه تعديلات البوابة دون تغيير تصاميم الصفحات A–D:
  - طبقة claude.* تُستبدل بجسر إلى لوحة الموظفين (window.parent.__zaraCal): Firestore + رفع الصور + الصلاحيات.
  - السنة من الرابط (?year=)، والحفظ تلقائي أولاً بأول، وطباعة كل الصفحات 210×150 مم.
  - واجهة التحرير بأسلوب البوابة (portal.css).
التشغيل من جذر المستودع:  python3 calendar-src/build.py
"""
import base64, io, os

HERE = os.path.dirname(os.path.abspath(__file__))
rd = lambda n: io.open(os.path.join(HERE, n), encoding="utf-8").read()
src = rd("app.src.html")

def rep(a, b, cnt=1):
    global src
    assert src.count(a) == cnt, (a[:70], src.count(a))
    src = src.replace(a, b)

def cut(start, end, new):
    global src
    assert src.count(start) == 1, (start[:60], src.count(start))
    a = src.index(start); b = src.index(end, a) + len(end)
    src = src[:a] + new + src[b:]

# ---------- الرأس والخطوط ----------
rep('<title>منصة تقويم العوامية</title>', '<title>التقاويم الميلادية | بوابة زارة</title>')
rep('family=Alexandria:wght@400;500;600;700&family=Cairo', 'family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Alexandria:wght@400;500;600;700&family=Cairo')
# البوابة فاتحة دائماً — يُلغى الوضع الداكن
cut('@media (prefers-color-scheme: dark){:root:not([data-theme="light"])', 'color-scheme:dark}}\n', '')
cut(':root[data-theme="dark"]{', 'color-scheme:dark}\n', '')
rep('/* ---- the four designs (generated from the print templates) ---- */', rd("portal.css") + '\n/* ---- the four designs (generated from the print templates) ---- */')

# ---------- الهيكل: شريط أدوات + حاوية الطباعة ----------
rep('''      <label class="fontsel">الخط
        <select id="fontsel"><option value="1">Alexandria + Readex Pro</option><option value="2">Readex Pro</option><option value="3">Cairo</option></select>
      </label>
    </div>
  </header>''', '''      <label class="fontsel">الخط
        <select id="fontsel"><option value="1">Alexandria + Readex Pro</option><option value="2">Readex Pro</option><option value="3">Cairo</option></select>
      </label>
    </div>
    <div class="calbar" style="margin-inline-start:auto"><button class="btn" id="printbtn">طباعة / حفظ PDF لكل الصفحات</button></div>
  </header>''')
rep('''>تصميم التقويم الميلادي للعام ٢٠٢٧</button></nav>''', '''>تصميم التقويم الميلادي للعام</button></nav>''')
rep('''    </section>
  </div>
</div>
<script>''', '''    </section>
  </div>
  <div id="printall" dir="rtl"></div>
</div>
<script>''')

# ---------- التصاميم المتاحة: A (أثر الخير) و C (الهدوء) فقط — أُلغي B و D بطلب صاحب المشروع (2026-10-07) ----------
rep('const DESIGNS=[["a","أثر الخير","قوس وصورة"],["b","الأفق","صورة بانورامية"],["c","الهدوء","فراغ وبساطة"],["d","الدفء","رمال ونحاس"]];',
    'const DESIGNS=[["e","الرحابة","صورة جانبية ومتنفَّس"]];')
# أي إعداد محفوظ على تصميم ملغى يُعرض بالتصميم A
rep('const R={a:[aMonth,aGift],b:[bMonth,bGift],c:[cMonth,cGift],d:[dMonth,dGift]};', r'''/* ---------- design E «الرحابة»: شبكة وأرقام A + صورة جانبية كاملة الارتفاع، بفراغات أوسع ---------- */
/* نقش الخلفية: أيقونة الشعار نفسها مكبَّرة وشفافة في أطراف الصفحة (على نهج تقويم 2026) */
/*@MARK@*/
/*@HERITAGE@*/
const mkSvg=c=>`<svg class="mk ${c}" xmlns="http://www.w3.org/2000/svg" viewBox="-3 -3 256 242">${MARK_D.map(d=>`<path d="${d}"/>`).join("")}</svg>`;
const pat=k=>`<div class="pat ${k}">${mkSvg("a")}${mkSvg("b")}${mkSvg("c")}${mkSvg("d")}</div>`;
/* العبارة العلوية تُطابق عرض الشعار تماماً: كل سطر يُكبَّر أو يُصغَّر حتى يبدأ وينتهي مع حدَّي الشعار */
function fitE(root){}
function eMonth(mo,m){const g=gridData(mo),mt=monthMeta(mo);
 const body=trs(g,c=>c.v?`<td class="${c.fri?"fri":""}"></td>`:`<td class="${c.fri?"fri":""}">${c.ev?`<i class="ev" style="background:${c.ev[1]}">${c.d}</i>`:`<i>${c.d}</i>`}<s>${c.hj}</s></td>`);
 const chips=g.legend.map(l=>`<span><b style="background:${l.c}">${l.d}</b>${esc(l.t)}</span>`).join("");
 const q=k=>`<div class="q"><div class="qrbox">${qrEl(m["q"+k+"u"],16,m["q"+k+"img"])}</div><div class="qt"><b>${esc(m["q"+k+"a"])}</b><span>${esc(m["q"+k+"b"])}</span></div></div>`;
 return `<section class="page d-e month">${pat("m")}<div class="photo">${photoEl(m,mo,"e")}</div><div class="credit">${esc(S().lblArtist)}: ${esc(m.artist)}</div>${logo()}
 <div class="sp"><em>${esc(S().lblSponsor)}</em><div class="sb">${spBox(m)}</div></div>
 <h1>${MONTH_AR[mo-1]}</h1><div class="ghost">${pad(mo)}</div><div class="meta"><i>${mt.label}</i><span>${YEAR} م &nbsp;·&nbsp; ${hy(mt.year)} هـ</span></div>
 <div class="slogan"><b>${esc(m.s1)}</b><span>${esc(m.s2)}</span></div>
 <table class="grid" style="--rh:${(50/g.rows).toFixed(2)}mm"><thead><tr>${head()}</tr></thead><tbody>${body}</tbody></table><div class="legend">${chips}</div>
 <div class="dock">${q(1)}${q(2)}${q(3)}</div><div class="her" style="--hm:url(heritage/${pad(mo)}.png)"></div></section>`}
function eGift(g){return `<section class="page d-e gift">${pat("g")}${logo()}
 <div class="gtitle">${g.titleImg?`<img src="${blob(g.titleImg)}" alt="">`:`<h2><b>${esc(g.h1)}</b><span>${esc(g.h2)}</span></h2>`}</div>${form()}
 <div class="bigqr"><div class="qrbox">${qrEl(g.url,44,g.qrImg)}</div><div class="cname">${esc(g.camp)}</div><div class="go">${esc(S().lblGo)}</div></div>
 <div class="spt">${esc(S().lblSponsors)}</div><div class="sponsors">${allSp()}</div><div class="handle">${esc(draft.settings.handle)}</div></section>`}
/*@DEMO@*/
const R={e:[eMonth,eGift]};''')
rep('return cur.kind==="m"?f[0](cur.mo,draft["m"+pad(cur.mo)]):f[1](draft["g"+pad(cur.mo)])}', 'return cur.kind==="m"?f[0](cur.mo,demo(cur.mo,draft["m"+pad(cur.mo)])):f[1](draft["g"+pad(cur.mo)])}')
rep('h+=`<div class="s">${spBox(draft["m"+pad(i)])}</div>`', 'h+=`<div class="s">${spBox(demo(i,draft["m"+pad(i)]))}</div>`')
rep('let h=`<h2>${isM?"صفحة شهر "+name:"صفحة الإهداء قبل "+name}</h2>`;', 'let h=`<h2>${isM?"صفحة شهر "+name:"صفحة الإهداء قبل "+name}</h2>`;if(isM&&(!draft[id].sponsorImg||!draft[id].photo))h+=`<p class="hint" style="background:#F6EEE5;border-radius:14px;padding:9px 14px;color:#8F6A45">الشعار والصورة واسم الفنان الظاهرة في المعاينة بيانات توضيحية لتخيّل الشكل، وتختفي عند رفع الحقيقية. لا تُحفظ، وقائمة المراجعة تعدّها ناقصة.</p>`;')
rep('b.setAttribute("aria-pressed",b.dataset.d===draft.settings.design)', 'b.setAttribute("aria-pressed",b.dataset.d===(R[draft.settings.design]?draft.settings.design:"e"))')

# ---------- صورة عبارة الإهداء (تصميم «الرحابة») ----------
rep('camp:CAMP[i][0],url:"https://example.com/awamia/2027/gift-"+pad(i+1),qrImg:""}', 'camp:CAMP[i][0],url:"https://example.com/awamia/2027/gift-"+pad(i+1),qrImg:"",titleImg:""}')
rep('const GF=[["h1","عنوان الإهداء — السطر الأول","t"],', 'const GF=[["titleImg","صورة عبارة الإهداء — تحلّ محل العنوان المكتوب (في تصميم «الرحابة»)","i"],["h1","عنوان الإهداء — السطر الأول","t"],')

# العمل على «الرحابة» فقط (أُلغي «أثر الخير» و«الهدوء» بطلب صاحب المشروع 2026-10-07): أي تصميم محفوظ آخر يُعرض بها، وشريط اختيار التصميم يختفي
rep('function pageHtml(){const f=R[draft.settings.design]||R.a;', 'function pageHtml(){const f=R[draft.settings.design]||R.e;')
rep('<div class="tabs" id="designs" role="group" aria-label="التصميم"></div>', '<div class="tabs" id="designs" role="group" aria-label="التصميم" hidden></div>')

# ---------- قسم ثالث: موك أب التقويم المكتبي — صفحة الشهر مُسقطة على تقويم مكتبي مجسَّم ----------
rep('<div class="stage" id="stage"><div class="pagebox" id="pagebox"></div></div>',
    '<div class="stage" id="stage"><div class="rig" id="rig"><div class="pagebox" id="pagebox"></div></div><div class="mk-over"></div></div>')
rep('function fit(){const st=$("#stage"),w=st.clientWidth,s=w/PXW;st.style.height=PXH*s+"px";$("#pagebox").style.transform="scale("+s+")"}',
    """function fit(){const st=$("#stage"),rig=$("#rig"),w=st.clientWidth;st.classList.toggle("mock",SEC==="mockup");
 if(SEC!=="mockup"){const s=w/PXW;st.style.height=PXH*s+"px";rig.style.transformOrigin="0 0";rig.style.transform="scale("+s+")";return}
 // الموك أب: صورة تقويم مكتبي حقيقية (mockup/desk.jpg من ملف PSD الجمعية)، والصفحة تُسقط على سطحه بمصفوفة منظور تطابق أركانه الأربعة
 const h=Math.round(w*.8);st.style.height=h+"px";rig.style.transformOrigin="0 0";
 rig.style.transform=quadMatrix(PXW,PXH,MOCK_QUAD.map(q=>[q[0]*w,q[1]*h]))}
/* أركان سطح التقويم في الصورة (نسبةً إلى عرضها وارتفاعها): أعلى-يسار، أعلى-يمين، أسفل-يمين، أسفل-يسار */
/* المصدر: مصفوفة تحويل الكائن الذكي المخزّنة داخل ملف الـPSD نفسه (أعلى/يمين/أسفل السطح)، والحافة اليسرى مأخوذة من حد الورقة الظاهر
   لأن لوحة الكائن الذكي تتجاوز الورقة يساراً فيُقصّ منها جزء في الملف الأصلي — هنا تظهر الصفحة كاملة على الورقة. */
const MOCK_QUAD=[[.2306,.18369],[.77191,.24343],[.70593,.83317],[.16493,.71141]];
function quadMatrix(W,H,q){const x0=q[0][0],y0=q[0][1],x1=q[1][0],y1=q[1][1],x2=q[2][0],y2=q[2][1],x3=q[3][0],y3=q[3][1];
 const dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3,dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3,den=dx1*dy2-dx2*dy1,g=(dx3*dy2-dx2*dy3)/den,k=(dx1*dy3-dx3*dy1)/den;
 const a=x1-x0+g*x1,b=x3-x0+k*x3,d=y1-y0+g*y1,e=y3-y0+k*y3;
 return "matrix3d("+[a/W,d/W,0,g/W,b/H,e/H,0,k/H,0,0,1,0,x0,y0,0,1].join(",")+")"}""")
rep('function viewHtml(){if(SEC!=="approved")return pageHtml();', 'function viewHtml(){if(SEC==="design"||(SEC==="mockup"&&!APPROVED))return pageHtml();')

# ---------- السنة والمسارات ----------
rep('const YEAR=2027, G=', 'const YEAR=(function(){const y=+new URLSearchParams(location.search).get("year");return y>=2026&&y<=2040?y:2027})(), G=')
# المناسبات: القائمة المرجعية من تقويم 2026 (events.js) تُحسب لكل عام، واليوم الواحد يقبل أكثر من مناسبة
cut('(function(){const add=(m,d,t,c)=>{const k=YEAR+"-"+pad(m)+"-"+pad(d);if(!EVENTS[k])EVENTS[k]=[[t,c]]};', 'FIX.forEach(e=>add(e[0],e[1],e[2],e[3]))})();',
    """(function(){const add=(m,d,t,c)=>{const k=YEAR+"-"+pad(m)+"-"+pad(d),a=EVENTS[k]||(EVENTS[k]=[]);if(!a.some(x=>x[0]===t))a.push([t,c])};
/*@EVENTS@*/
 for(let m=1;m<=12;m++){const nd=new Date(Date.UTC(YEAR,m,0)).getUTCDate();for(let d=1;d<=nd;d++){const h=hij(m,d);HJ.forEach(e=>{if(h.month===e[0]&&h.day===e[1])add(m,d,e[2],e[3])})}}
 FIX.forEach(e=>add(e[0],e[1],e[2],e[3]));MOV.forEach(e=>add(e[0],nth(e[0],e[1],e[2]),e[3],e[4]));(SCHOOL[YEAR]||[]).forEach(e=>add(e[0],e[1],e[2],"#d9822b"))})();""")
# يناير لم يعد قائمة ثابتة: كل مناسباته صارت في القوائم المرجعية (events.js)
cut('const EVENTS={"2027-01-04"', '};', 'const EVENTS={};')
rep('if(ev)legend.push({d,t:ev[0][0],c:ev[0][1]});', 'if(ev)legend.push({d,t:ev.map(x=>x[0]).join(" · "),c:ev[0][1]});')
rep('requestAnimationFrame(()=>{$("#pagebox").innerHTML=viewHtml();fit()})}', 'requestAnimationFrame(()=>{$("#pagebox").innerHTML=viewHtml();fit();fitE($("#pagebox"))})}\nif(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>drawPreview());')
rep('const blob=id=>"/_blob/"+id;', 'const blob=id=>/^(https?:|data:|blob:)/.test(id)?id:"/_blob/"+id;')
rep('lblGo:"${esc(S().lblGo)}"', 'lblGo:"ابدأ خَيْرَكَ الآن"')
rep('${APPROVED.year||2027}', '${APPROVED.year||YEAR}')
rep('await DB.doc("approved/y2027").set({year:2027,approvedAt:new Date().toISOString(),data});approveOpen=false;APPROVED={year:2027,approvedAt:new Date().toISOString(),data};',
    'const stamp={year:YEAR,approvedAt:new Date().toISOString(),approvedBy:(BRIDGE&&BRIDGE.userName)||"",data};await DB.doc("approved/y"+YEAR).set(stamp);approveOpen=false;APPROVED=stamp;')
rep('DL.save({filename:"awamia-calendar-2027.json"', 'DL.save({filename:"awamia-calendar-"+YEAR+".json"')
rep('اعتُمد في ${fmtDate(APPROVED.approvedAt)}. هذه نسخة للقراءة فقط.', 'اعتُمد في ${fmtDate(APPROVED.approvedAt)}${APPROVED.approvedBy?" بواسطة "+esc(APPROVED.approvedBy):""}. هذه نسخة للقراءة فقط.')

# ---------- الحفظ التلقائي أولاً بأول ----------
rep('let DB=null,ASSETS=null,DL=null,CANW=null,CANEDIT=null;', '''let DB=null,ASSETS=null,DL=null,CANW=null,CANEDIT=null,BRIDGE=null;
let autoT=0;
// كل تعديل يُحفظ بعد لحظات من التوقف عن الكتابة — لا حاجة لضغط «حفظ»
function autosaveSoon(){clearTimeout(autoT);if(!DB||CANW===false)return;autoT=setTimeout(()=>{const ids=IDS.filter(dirty);if(ids.length)doSave(ids,(m,b)=>{status(m,b);const g=$("#gstatus");if(g){g.textContent=m;g.style.color=b?"var(--bad)":""}})},1200)}''')
rep('function onInput(id,k,v){draft[id][k]=v;drawPreview();refreshUi()}', 'function onInput(id,k,v){draft[id][k]=v;drawPreview();refreshUi();autosaveSoon()}')
rep('else if(t.dataset.gk){draft.settings[t.dataset.gk]=t.value;drawPreview();refreshUi()}});', 'else if(t.dataset.gk){draft.settings[t.dataset.gk]=t.value;drawPreview();refreshUi();autosaveSoon()}});')
rep('status("تم رفع الصورة — اضغط «حفظ» لتثبيتها.")}', 'status("تم رفع الصورة.");autosaveSoon()}')
rep('else if(t.dataset.d){draft.settings.design=t.dataset.d;renderAll()}', 'else if(t.id==="printbtn")printAll();\n else if(t.dataset.d){if(SEC==="approved"||CANW===false)return;draft.settings.design=t.dataset.d;renderAll();autosaveSoon()}')
rep('else if(t.dataset.rm){draft[t.dataset.id][t.dataset.rm]="";renderEditor();renderGen();drawPreview();refreshUi()}', 'else if(t.dataset.rm){draft[t.dataset.id][t.dataset.rm]="";renderEditor();renderGen();drawPreview();refreshUi();autosaveSoon()}')
rep('$("#fontsel").addEventListener("change",e=>{draft.settings.font=e.target.value;renderAll()});', '$("#fontsel").addEventListener("change",e=>{draft.settings.font=e.target.value;renderAll();autosaveSoon()});')
rep('''else if(t.id==="apreopen"&&APPROVED){IDS.forEach''', '''else if(t.id==="apreopen"&&APPROVED){if(!confirm("سيُستبدل ما في قسم التصميم بنسخة من التقويم المعتمد. متابعة؟"))return;IDS.forEach''')
rep('status("تم فتح نسخة من المعتمد للتعديل — اضغط «حفظ» لتثبيت أي تعديل.")}', 'status("تم فتح نسخة من المعتمد للتعديل.");autosaveSoon();if(BRIDGE&&BRIDGE.onSection)BRIDGE.onSection("design")}')
rep('''const ERR={invalid_argument:''', '''const ERR={"permission-denied":"لا تملك صلاحية الكتابة على هذه البيانات.","invalid-argument":"تعذّر الحفظ: صيغة البيانات غير مقبولة.","resource-exhausted":"استُنفد رصيد قاعدة البيانات اليوم، أعد المحاولة لاحقاً.",invalid_argument:''')

# ---------- طباعة كل الصفحات ----------
rep('''/* ---------- navigation ---------- */''', '''/* ---------- print all (24 pages, 210×150mm) ---------- */
function printAll(){const keep={mo:cur.mo,kind:cur.kind};let h="";
 for(let mo=1;mo<=12;mo++)for(const k of ["g","m"]){cur.mo=mo;cur.kind=k;h+=viewHtml()}
 cur.mo=keep.mo;cur.kind=keep.kind;const box=$("#printall");box.innerHTML=h;
 box.style.cssText="display:block;position:absolute;left:-99999px;top:0;width:210mm";fitE(box);
 const imgs=[...box.querySelectorAll("img")].filter(i=>!i.complete);
 // نقوش التراث تُستخدم كأقنعة CSS لا كصور، فلا ينتظرها المتصفح قبل الطباعة — تُحمَّل هنا صراحةً أولاً وإلا خرجت الصفحات بلا نقش
 const masks=[...new Set([...box.querySelectorAll(".her")].map(e=>(/url\\(["']?([^"')]+)/.exec(e.getAttribute("style")||"")||[])[1]).filter(Boolean))];
 const pre=masks.map(u=>new Promise(r=>{const im=new Image();im.onload=im.onerror=r;im.src=u;if(im.decode)im.decode().then(r,r)}));
 Promise.all(imgs.map(i=>new Promise(r=>{i.onload=i.onerror=r})).concat(pre)).then(()=>(document.fonts&&document.fonts.ready)||0).then(()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,250)))).then(()=>{window.print();setTimeout(()=>{box.innerHTML="";box.style.cssText=""},1500)})}

/* ---------- navigation ---------- */''')

# ---------- الإقلاع: جسر لوحة الموظفين بدل claude.* ----------
cut('(async function(){if(typeof claude==="undefined"||!claude.use)return;', ' renderAll()})();', r'''(function(){
 // الصفحة تعمل داخل لوحة الموظفين فقط: اللوحة تمرّر قاعدة البيانات والصلاحيات والرفع عبر __zaraCal
 let P=null;try{P=window.parent&&window.parent!==window&&window.parent.__zaraCal}catch(_){}
 if(!P||!P.db){$("#app").innerHTML='<div class="notice"><b>التقاويم الميلادية</b>تُفتح هذه الصفحة من لوحة موظفي بوابة زارة ← تبويب «التقاويم الميلادية».</div>';return}
 BRIDGE=P;document.body.classList.add("embedded");
 CANW=!!P.canEdit;CANEDIT=!!P.canApprove;
 const fs=P.db,base=fs.collection("calendars").doc(String(YEAR));
 // cal/<id> ← calendars/<السنة>/pages/<id> ،  approved/y<السنة> ← calendarsApproved/<السنة>
 const ref=path=>{const p=path.split("/");return p[0]==="approved"?fs.collection("calendarsApproved").doc(String(YEAR)):base.collection("pages").doc(p[1])};
 DB={doc:path=>({set:d=>Promise.resolve().then(()=>ref(path).set(P.plain(JSON.stringify(d)))).catch(e=>{console.error("calendar save",e);throw{code:e&&e.code}}),onSnapshot:(a,b)=>ref(path).onSnapshot(a,b)}),
     collection:()=>({onSnapshot:(a,b)=>base.collection("pages").onSnapshot(a,b)})};
 if(P.canEdit&&P.upload)ASSETS={upload:b=>P.upload(b).then(url=>({id:url}))};
 DL={save:o=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([o.data],{type:"application/json"}));a.download=o.filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);return Promise.resolve()}};
 window.__calSetSection=s=>{if(s!=="approved"&&s!=="design"&&s!=="mockup")return;if(s==="design"&&!P.canEdit)s="approved";SEC=s;renderSec()};
 {const qs=new URLSearchParams(location.search).get("sec");SEC=qs==="mockup"?"mockup":(qs==="design"&&P.canEdit)?"design":"approved"}
 try{DB.collection("cal").onSnapshot(applySnap,()=>{})}catch(_){}
 try{DB.doc("approved/y"+YEAR).onSnapshot(sn=>{APPROVED=sn.exists?sn.data():null;renderApprove();renderApBox();if(SEC==="approved"){syncNav();drawPreview()}},()=>{})}catch(_){}
 renderAll()})();''')

doc = '<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex">\n' + src
assert "</style>" in doc
doc = doc.replace("</style>\n<div id=\"app\"", "</style>\n</head>\n<body>\n<div id=\"app\"", 1) + "\n</body>\n</html>\n"
logo = "data:image/png;base64," + base64.b64encode(open(os.path.join(HERE, "logo_web.png"), "rb").read()).decode()
out = doc.replace("/*@DESIGNS@*/", rd("designs.css") + "\n" + rd("design-e.css")).replace("/*@DEMO@*/", rd("demo.js")).replace("/*@EVENTS@*/", rd("events.js")).replace("/*@MARK@*/", rd("logo-mark.js")).replace("/*@HERITAGE@*/", rd("heritage.js")).replace("/*@QR@*/", rd("qrcode.js").replace("</script", "<\\/script")).replace("/*@LOGO@*/", logo)
dest = os.path.join(HERE, "..", "Login", "calendar", "index.html")
os.makedirs(os.path.dirname(dest), exist_ok=True)
io.open(dest, "w", encoding="utf-8").write(out)
print("built", len(out))
