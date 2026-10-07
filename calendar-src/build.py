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
  <div id="printall" dir="ltr"></div>
</div>
<script>''')

# ---------- التصاميم المتاحة: A (أثر الخير) و C (الهدوء) فقط — أُلغي B و D بطلب صاحب المشروع (2026-10-07) ----------
rep('const DESIGNS=[["a","أثر الخير","قوس وصورة"],["b","الأفق","صورة بانورامية"],["c","الهدوء","فراغ وبساطة"],["d","الدفء","رمال ونحاس"]];',
    'const DESIGNS=[["a","أثر الخير","قوس وصورة"],["c","الهدوء","فراغ وبساطة"]];')
# أي إعداد محفوظ على تصميم ملغى يُعرض بالتصميم A
rep('const R={a:[aMonth,aGift],b:[bMonth,bGift],c:[cMonth,cGift],d:[dMonth,dGift]};', 'const R={a:[aMonth,aGift],c:[cMonth,cGift]};')
rep('b.setAttribute("aria-pressed",b.dataset.d===draft.settings.design)', 'b.setAttribute("aria-pressed",b.dataset.d===(R[draft.settings.design]?draft.settings.design:"a"))')

# ---------- السنة والمسارات ----------
rep('const YEAR=2027, G=', 'const YEAR=(function(){const y=+new URLSearchParams(location.search).get("year");return y>=2026&&y<=2040?y:2027})(), G=')
rep('for(let m=2;m<=12;m++){const nd=new Date(Date.UTC(YEAR,m,0))', 'for(let m=(YEAR===2027?2:1);m<=12;m++){const nd=new Date(Date.UTC(YEAR,m,0))')
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
 const imgs=[...box.querySelectorAll("img")].filter(i=>!i.complete);
 Promise.all(imgs.map(i=>new Promise(r=>{i.onload=i.onerror=r}))).then(()=>(document.fonts&&document.fonts.ready)||0).then(()=>{window.print();setTimeout(()=>{box.innerHTML=""},1500)})}

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
 window.__calSetSection=s=>{if(s!=="approved"&&s!=="design")return;if(s==="design"&&!P.canEdit)s="approved";SEC=s;renderSec()};
 SEC=(new URLSearchParams(location.search).get("sec")==="design"&&P.canEdit)?"design":"approved";
 try{DB.collection("cal").onSnapshot(applySnap,()=>{})}catch(_){}
 try{DB.doc("approved/y"+YEAR).onSnapshot(sn=>{APPROVED=sn.exists?sn.data():null;renderApprove();renderApBox();if(SEC==="approved"){syncNav();drawPreview()}},()=>{})}catch(_){}
 renderAll()})();''')

doc = '<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex">\n' + src
assert "</style>" in doc
doc = doc.replace("</style>\n<div id=\"app\"", "</style>\n</head>\n<body>\n<div id=\"app\"", 1) + "\n</body>\n</html>\n"
logo = "data:image/png;base64," + base64.b64encode(open(os.path.join(HERE, "logo_web.png"), "rb").read()).decode()
out = doc.replace("/*@DESIGNS@*/", rd("designs.css")).replace("/*@QR@*/", rd("qrcode.js").replace("</script", "<\\/script")).replace("/*@LOGO@*/", logo)
dest = os.path.join(HERE, "..", "Login", "calendar", "index.html")
os.makedirs(os.path.dirname(dest), exist_ok=True)
io.open(dest, "w", encoding="utf-8").write(out)
print("built", len(out))
