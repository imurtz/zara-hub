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
    '<div class="stage" id="stage"><div class="mk-shade"></div><div class="mk-body" id="mkbody"></div><div class="rig" id="rig"><div class="pagebox" id="pagebox"></div></div><div id="mockcells"></div><div class="mk-over" id="mkover"></div></div><div class="mockbar"><button class="btn" id="mkdl">تنزيل صورة الموك أب</button><label class="btn" id="mkuplbl" hidden>رفع صورة خلفية<input type="file" id="mkup" accept="image/png,image/jpeg,image/webp" hidden></label><button class="btn" id="mkreset" hidden>الخلفية الافتراضية</button><span class="mkhint" id="mkhint" hidden>مقاس صورة الخلفية: 2400 × 1920 بكسل (أفقية، نسبة 5:4) بصيغة JPG أو PNG — والتقويم يقف في منتصف الصورة وقاعدته في ثلثها السفلي.</span><span class="mkmsg" id="mkmsg" role="status"></span></div>')
rep('function fit(){const st=$("#stage"),w=st.clientWidth,s=w/PXW;st.style.height=PXH*s+"px";$("#pagebox").style.transform="scale("+s+")"}',
    """function fit(){const st=$("#stage"),rig=$("#rig"),w=st.clientWidth;st.classList.toggle("mock",SEC==="mockup");
 if(SEC!=="mockup"){const s=w/PXW;st.style.height=PXH*s+"px";rig.style.transformOrigin="0 0";rig.style.transform="scale("+s+")";mockRender(w);return}
 mockRender(w)}
/* ---------- الموك أب: إسقاط الصفحة على سطح التقويم كما في ملف الـPSD تماماً ----------
   السطح ليس مستوياً: الكائن الذكي في الملف يمرّ بشبكة انحناء 4×4 (Bezier) ثم بمنظور. القيم أدناه منقولة من الملف:
   MK.PX/PY نقاط الشبكة مطبَّعة (0..1)، MK.Q أركان المنظور نسبةً لأبعاد الصورة، MK.U0/V0 إزاحة التصميم داخل اللوحة
   (لوحة الكائن الذكي تتجاوز الورقة يساراً بنحو 3%، وغلاف 2026 موضوع فيها بهذه الإزاحة — تُحقِّق من ذلك بمطابقته).
   الصفحة تُقسَّم خلايا، ولكل خلية نسخة من الصفحة بمصفوفة منظور خاصة، فتتبع الانحناء. */
const MK={PX:[[0,.3118,.6427,1],[-.0266,.272,.5939,.9942],[-.0318,.2534,.5994,.9969],[0,.2957,.6441,1]],
 PY:[[0,-.0012,-.0062,0],[.3376,.3389,.3251,.3278],[.6717,.6731,.6544,.641],[1,1.0017,1.0068,1]],
 Q:[[.21171,.18163],[.77191,.24343],[.70593,.83317],[.1497,.70797]],U0:.03,V0:.006,NU:4,NV:7};
const mkB=t=>[(1-t)**3,3*t*(1-t)**2,3*t*t*(1-t),t**3];
function mkFwd(up,vp,w,h){const u=MK.U0+(1-MK.U0)*up,v=MK.V0+(1-MK.V0)*vp,bu=mkB(u),bv=mkB(v);let sx=0,sy=0;
 for(let r=0;r<4;r++)for(let c=0;c<4;c++){const k=bv[r]*bu[c];sx+=k*MK.PX[r][c];sy+=k*MK.PY[r][c]}
 const q=MK.Q,x0=q[0][0]*w,y0=q[0][1]*h,x1=q[1][0]*w,y1=q[1][1]*h,x2=q[2][0]*w,y2=q[2][1]*h,x3=q[3][0]*w,y3=q[3][1]*h;
 const dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3,dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3,den=dx1*dy2-dx2*dy1,g=(dx3*dy2-dx2*dy3)/den,k=(dx1*dy3-dx3*dy1)/den;
 const d=g*sx+k*sy+1;return[((x1-x0+g*x1)*sx+(x3-x0+k*x3)*sy+x0)/d,((y1-y0+g*y1)*sx+(y3-y0+k*y3)*sy+y0)/d]}
/* مصفوفة منظور تنقل أربع نقاط مصدر إلى أربع نقاط هدف (حل 8 معادلات) */
function mkH(src,dst){const A=[],B=[];for(let i=0;i<4;i++){const [x,y]=src[i],[X,Y]=dst[i];A.push([x,y,1,0,0,0,-X*x,-X*y]);B.push(X);A.push([0,0,0,x,y,1,-Y*x,-Y*y]);B.push(Y)}
 for(let c=0;c<8;c++){let m=c;for(let r=c+1;r<8;r++)if(Math.abs(A[r][c])>Math.abs(A[m][c]))m=r;[A[c],A[m]]=[A[m],A[c]];[B[c],B[m]]=[B[m],B[c]];
  for(let r=c+1;r<8;r++){const f=A[r][c]/A[c][c];for(let k=c;k<8;k++)A[r][k]-=f*A[c][k];B[r]-=f*B[c]}}
 const X=new Array(8);for(let r=7;r>=0;r--){let t=B[r];for(let k=r+1;k<8;k++)t-=A[r][k]*X[k];X[r]=t/A[r][r]}
 return "matrix3d("+[X[0],X[3],0,X[6],X[1],X[4],0,X[7],0,0,1,0,X[2],X[5],0,1].join(",")+")"}
function mockRender(w){const box=$("#mockcells"),st=$("#stage");if(SEC!=="mockup"){if(box.innerHTML)box.innerHTML="";return}
 const h=Math.round(w*.8);st.style.height=h+"px";const html=$("#pagebox").innerHTML;let out="";
 for(let j=0;j<MK.NV;j++)for(let i=0;i<MK.NU;i++){const ua=i/MK.NU,ub=(i+1)/MK.NU,va=j/MK.NV,vb=(j+1)/MK.NV;
  const src=[[ua*PXW,va*PXH],[ub*PXW,va*PXH],[ub*PXW,vb*PXH],[ua*PXW,vb*PXH]],dst=[mkFwd(ua,va,w,h),mkFwd(ub,va,w,h),mkFwd(ub,vb,w,h),mkFwd(ua,vb,w,h)];
  // تداخل بسيط بين الخلايا المتجاورة يمنع ظهور خطوط شعرية بينها
  const o=1.2;out+=`<div class="mcell" style="transform:${mkH(src,dst)};clip-path:inset(${Math.max(0,va*PXH-o)}px ${Math.max(0,PXW-ub*PXW-o)}px ${Math.max(0,PXH-vb*PXH-o)}px ${Math.max(0,ua*PXW-o)}px)">${html}</div>`}
 box.innerHTML=out;mockBgApply()}
/* ---------- خلفية الموك أب (يرفعها المحرِّر وتُحفظ مع تقويم السنة) وتنزيل المشهد صورةً ---------- */
let MOCKBG="";const MKW=2400,MKH=1920,MKBG0="mockup/bg2.jpg";
const mkEl=id=>document.getElementById(id),mkMsg=(t,bad)=>{const e=mkEl("mkmsg");e.textContent=t||"";e.classList.toggle("bad",!!bad)};
function mockBgApply(){const st=mkEl("stage");if(MOCKBG)st.style.setProperty("--mkbg",'url("'+MOCKBG+'")');else st.style.removeProperty("--mkbg");
 const w=CANW===true&&typeof ASSETS!=="undefined"&&!!ASSETS;mkEl("mkuplbl").hidden=!w;mkEl("mkhint").hidden=!w;mkEl("mkreset").hidden=!w||!MOCKBG}
async function mockUpload(file){if(!file)return;try{mkMsg("جارٍ رفع الخلفية…");
  // تُقصّ الصورة من الوسط إلى المقاس المعتمد كي تطابق المشهد أياً كان مقاسها الأصلي
  const bmp=await createImageBitmap(file),c=document.createElement("canvas");c.width=MKW;c.height=MKH;
  const k=Math.max(MKW/bmp.width,MKH/bmp.height),w=bmp.width*k,h=bmp.height*k;c.getContext("2d").drawImage(bmp,(MKW-w)/2,(MKH-h)/2,w,h);
  const b=await new Promise(r=>c.toBlob(r,"image/jpeg",.9)),r=await ASSETS.upload(b);
  MOCKBG=r.id;mockBgApply();await DB.doc("cal/_mock").set({bg:MOCKBG});mkMsg("تم اعتماد الخلفية الجديدة.")}
 catch(e){mkMsg("تعذّر رفع الخلفية، أعد المحاولة.",true)}}
async function mockBgReset(){try{MOCKBG="";mockBgApply();await DB.doc("cal/_mock").set({bg:""});mkMsg("عادت الخلفية الافتراضية.")}catch(e){mkMsg("تعذّر الحفظ.",true)}}
const mkBlob=u=>{const g=(x,m)=>fetch(x,{mode:"cors",cache:m}).then(r=>{if(!r.ok)throw 0;return r.blob()});return g(u,"default").catch(()=>g(u,"reload")).catch(()=>g(u+(u.indexOf("?")<0?"?":"&")+"cors=1","reload"))};
const mkPic=u=>mkBlob(u).then(b=>createImageBitmap(b));
async function mockDownload(){const btn=mkEl("mkdl");if(btn.disabled)return;btn.disabled=true;mkMsg("جارٍ تجهيز الصورة…");let hold=null;
 try{if(!window.htmlToImage)await new Promise((ok,no)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.13/html-to-image.min.js";s.onload=ok;s.onerror=no;document.head.appendChild(s)});
  // الصفحة المسطّحة تُرسم أولاً صورةً (خارج الشاشة)، ثم تُسقط على سطح التقويم بنفس شبكة الانحناء والمنظور
  hold=document.createElement("div");hold.style.cssText="position:fixed;left:0;top:0;width:210mm;height:150mm;overflow:hidden;z-index:-1;opacity:0;pointer-events:none;direction:rtl";
  hold.innerHTML=viewHtml();mkEl("app").appendChild(hold);const page=hold.firstElementChild;
  await Promise.all([...hold.querySelectorAll("img")].filter(i=>!i.complete).map(i=>new Promise(r=>{i.onload=i.onerror=r})));
  if(document.fonts&&document.fonts.ready)await document.fonts.ready;
  const opt={pixelRatio:2.2,width:PXW,height:PXH,backgroundColor:"#ffffff",fetchRequestInit:{mode:"cors"},style:{opacity:"1"}};
  await htmlToImage.toCanvas(page,opt);const flat=await htmlToImage.toCanvas(page,opt);
  const [bg,body,rings]=await Promise.all([mkPic(MOCKBG||MKBG0).catch(()=>mkPic(MKBG0)),mkPic("mockup/body.webp"),mkPic("mockup/rings.png")]);
  const cv=document.createElement("canvas");cv.width=MKW;cv.height=MKH;const x=cv.getContext("2d");x.imageSmoothingQuality="high";
  const k=Math.max(MKW/bg.width,MKH/bg.height);x.drawImage(bg,(MKW-bg.width*k)/2,(MKH-bg.height*k)/2,bg.width*k,bg.height*k);x.drawImage(body,0,0,MKW,MKH);
  const NX=48,NY=34,fw=flat.width,fh=flat.height,P=[];for(let j=0;j<=NY;j++){P.push([]);for(let i=0;i<=NX;i++)P[j].push(mkFwd(i/NX,j/NY,MKW,MKH))}
  const tri=(s0,s1,s2,d0,d1,d2)=>{const cx=(d0[0]+d1[0]+d2[0])/3,cy=(d0[1]+d1[1]+d2[1])/3,ex=p=>{const dx=p[0]-cx,dy=p[1]-cy,l=Math.hypot(dx,dy)||1;return[p[0]+dx/l*1.1,p[1]+dy/l*1.1]};
   const e0=ex(d0),e1=ex(d1),e2=ex(d2);x.save();x.beginPath();x.moveTo(e0[0],e0[1]);x.lineTo(e1[0],e1[1]);x.lineTo(e2[0],e2[1]);x.closePath();x.clip();
   const den=(s1[0]-s0[0])*(s2[1]-s0[1])-(s2[0]-s0[0])*(s1[1]-s0[1]);
   const a=((d1[0]-d0[0])*(s2[1]-s0[1])-(d2[0]-d0[0])*(s1[1]-s0[1]))/den,c=((d2[0]-d0[0])*(s1[0]-s0[0])-(d1[0]-d0[0])*(s2[0]-s0[0]))/den;
   const b=((d1[1]-d0[1])*(s2[1]-s0[1])-(d2[1]-d0[1])*(s1[1]-s0[1]))/den,d=((d2[1]-d0[1])*(s1[0]-s0[0])-(d1[1]-d0[1])*(s2[0]-s0[0]))/den;
   x.transform(a,b,c,d,d0[0]-a*s0[0]-c*s0[1],d0[1]-b*s0[0]-d*s0[1]);x.drawImage(flat,0,0);x.restore()};
  for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){const sa=[i/NX*fw,j/NY*fh],sb=[(i+1)/NX*fw,j/NY*fh],sc=[(i+1)/NX*fw,(j+1)/NY*fh],sd=[i/NX*fw,(j+1)/NY*fh];
   tri(sa,sb,sc,P[j][i],P[j][i+1],P[j+1][i+1]);tri(sa,sc,sd,P[j][i],P[j+1][i+1],P[j+1][i])}
  x.drawImage(rings,0,0,MKW,MKH);
  const blob=await new Promise(r=>cv.toBlob(r,"image/jpeg",.94));if(!blob)throw 0;window.__mkLast=cv;
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="موك-أب-تقويم-"+YEAR+"-"+(cur.kind==="g"?"الإهداء":MONTH_AR[cur.mo-1])+".jpg";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),8000);mkMsg("تم تنزيل الصورة.")}
 catch(e){console.error("mock download",e);mkMsg("تعذّر تجهيز الصورة، أعد المحاولة.",true)}
 finally{if(hold)hold.remove();btn.disabled=false}}
mkEl("mkdl").addEventListener("click",mockDownload);mkEl("mkreset").addEventListener("click",mockBgReset);
mkEl("mkup").addEventListener("change",e=>{const f=e.target.files[0];e.target.value="";mockUpload(f)});
""")
rep('function applySnap(snap){let touched=false;snap.docs.forEach(d=>{const id=d.id,v=d.data();',
    'function applySnap(snap){let touched=false;snap.docs.forEach(d=>{const id=d.id,v=d.data();if(id==="_mock"){MOCKBG=(v&&v.bg)||"";mockBgApply();return}')
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
# ورقة خطوط Google تُحمَّل بصلاحية CORS حتى يستطيع «تنزيل صورة الموك أب» قراءة قواعدها وتضمين الخطوط داخل الصورة
assert doc.count('<link rel="stylesheet" href="https://fonts.googleapis.com') == 1
doc = doc.replace('<link rel="stylesheet" href="https://fonts.googleapis.com', '<link rel="stylesheet" crossorigin="anonymous" href="https://fonts.googleapis.com')
doc = doc.replace("</style>\n<div id=\"app\"", "</style>\n</head>\n<body>\n<div id=\"app\"", 1) + "\n</body>\n</html>\n"
logo = "data:image/png;base64," + base64.b64encode(open(os.path.join(HERE, "logo_web.png"), "rb").read()).decode()
out = doc.replace("/*@DESIGNS@*/", rd("designs.css") + "\n" + rd("design-e.css")).replace("/*@DEMO@*/", rd("demo.js")).replace("/*@EVENTS@*/", rd("events.js")).replace("/*@MARK@*/", rd("logo-mark.js")).replace("/*@HERITAGE@*/", rd("heritage.js")).replace("/*@QR@*/", rd("qrcode.js").replace("</script", "<\\/script")).replace("/*@LOGO@*/", logo)
dest = os.path.join(HERE, "..", "Login", "calendar", "index.html")
os.makedirs(os.path.dirname(dest), exist_ok=True)
io.open(dest, "w", encoding="utf-8").write(out)
print("built", len(out))
