/* توازي أطوال الأسطر بالكشيدة: يكسر العبارة على أسطر متوازنة، ثم يمدّ كل سطر أقصر بإضافة «ـ» في مواضع الوصل
   حتى يساوي أطول سطر. لا يغيّر الكلمات ولا يمسّ النص المحفوظ — يعمل على العرض فقط. */
(function(){
 const DUAL="بتثجحخسشصضطظعغفقكلمنهيئ";            // حروف تتصل بما بعدها
 const AR=/[ء-ي]/, MARK=/[ً-ٰٟ]/;
 // مواضع الكشيدة في كلمة: بعد حرف يتصل بما بعده وقبل حرف عربي، مع تجنّب «لا» وأول حرف في الكلمة؛ الأفضل قبل آخر حرف
 function spots(w){const out=[];for(let i=1;i<w.length;i++){const c=w[i];if(DUAL.indexOf(c)<0)continue;let j=i+1;while(j<w.length&&MARK.test(w[j]))j++;
   if(j>=w.length||!AR.test(w[j]))continue;if(c==="ل"&&"اأإآ".indexOf(w[j])>-1)continue;out.push(j)}return out.reverse()}
 function stretch(line,target){const words=line.textContent.split(" ");let guard=0;
  const W=()=>line.getBoundingClientRect().width;let w=W();if(target-w<.5)return;
  // ترتيب الكلمات: الأطول أولاً، وكشيدة واحدة لكل كلمة في كل جولة
  const order=words.map((x,i)=>i).sort((a,b)=>words[b].length-words[a].length);
  const used=words.map(()=>0);
  while(w<target-.5&&guard++<240){let did=false;
   for(const i of order){const sp=spots(words[i].replace(/ـ/g,""));if(!sp.length||used[i]>=Math.min(3,sp.length*2))continue;
    const base=words[i].replace(/ـ/g,""),k=sp[used[i]%sp.length],n=Math.floor(used[i]/sp.length)+1;
    // إعادة بناء الكلمة بعدد الكشيدات المتراكم في كل موضع
    const cnt={};for(let u=0;u<=used[i];u++){const kk=sp[u%sp.length];cnt[kk]=(cnt[kk]||0)+1}
    let nw="";for(let q=0;q<base.length;q++){if(cnt[q])nw+="ـ".repeat(cnt[q]);nw+=base[q]}
    const prev=words[i];words[i]=nw;line.textContent=words.join(" ");const nwW=W();
    if(nwW>target+.5){words[i]=prev;line.textContent=words.join(" ");used[i]=99;continue}
    used[i]++;w=nwW;did=true;if(w>=target-.5)break}
   if(!did)break}}
 window.kashidaJustify=function(el){const text=el.textContent.replace(/ـ/g,"").replace(/\s+/g," ").trim();if(!text)return;
  el.style.textWrap="balance";el.textContent=text;
  el.innerHTML=text.split(" ").map(x=>`<span class="kw">${x}</span>`).join(" ");
  const lines=[];el.querySelectorAll(".kw").forEach(s=>{const t=Math.round(s.offsetTop);let L=lines.find(l=>Math.abs(l.top-t)<3);if(!L){L={top:t,w:[]};lines.push(L)}L.w.push(s.textContent)});
  if(lines.length<2){el.textContent=text;return}
  el.innerHTML=lines.map(l=>`<span class="kl" style="display:block;white-space:nowrap;width:max-content">${l.w.join(" ")}</span>`).join("");
  const ls=[...el.querySelectorAll(".kl")],target=Math.max(...ls.map(x=>x.getBoundingClientRect().width));ls.forEach(l=>stretch(l,target))};
 // سطران منفصلان (كعبارة الصورة: سطر عريض وسطر تحته) يُشدّ الأقصر منهما ليساوي الأطول
 window.kashidaPair=function(a,b){[a,b].forEach(e=>{e.textContent=e.textContent.replace(/ـ/g,"");e.style.width="max-content";e.style.whiteSpace="nowrap"});
  const wa=a.getBoundingClientRect().width,wb=b.getBoundingClientRect().width;stretch(wa<wb?a:b,Math.max(wa,wb))};
})();
