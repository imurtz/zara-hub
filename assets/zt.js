/* إحصائيات زوار بوابة زارة — مجهولة الهوية: رقم عشوائي للجهاز فقط، بلا أسماء ولا جوالات ولا نصوص مكتوبة في الحقول.
   يسجّل: فتح الصفحة، النقرات على الأزرار والروابط، مدة البقاء ونسبة التمرير، وأحداثاً مخصصة عبر window.zt(اسم، قيمة) */
(function(){
  if(window.__zt || navigator.webdriver || /localhost|127\.0\.0\.1/.test(location.hostname) && !/[?&]zt=1/.test(location.search)) return;
  window.__zt = 1;
  var API = "https://zara-cv.murtada-ud.workers.dev/api/t";
  function rid(){ return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  var v = "", s = "", isNew = false;
  try{ v = localStorage.getItem("zt_v") || ""; if(!v){ v = rid(); isNew = true; localStorage.setItem("zt_v", v); } }catch(e){ v = rid(); }
  try{ s = sessionStorage.getItem("zt_s") || ""; if(!s){ s = rid(); sessionStorage.setItem("zt_s", s); } }catch(e){ s = rid(); }
  var P = location.pathname.replace(/index\.html$/, "").replace(/\/+$/, "") || "/";
  if(/^\/s\//.test(P)) P = "/s";
  var q = [], t0 = Date.now(), vis = 0, lastVis = Date.now(), maxSc = 0;
  function push(k, l, x){ q.push({ p: P, k: k, l: l || "", x: x == null ? "" : String(x) }); }
  function flush(){
    if(!q.length) return;
    var body = JSON.stringify({ v: v, s: s, e: q.splice(0, 40) });
    try{ if(navigator.sendBeacon && navigator.sendBeacon(API, new Blob([body], { type: "text/plain" }))) return; }catch(e){}
    try{ fetch(API, { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } }); }catch(e){}
  }
  var ref = ""; try{ var r = document.referrer ? new URL(document.referrer) : null; ref = !r ? "" : r.hostname === location.hostname ? "داخلي" : r.hostname.replace(/^www\./, ""); }catch(e){}
  var src = (location.search.match(/[?&](?:utm_source|src)=([^&]+)/) || [])[1]; if(src) try{ ref = decodeURIComponent(src).slice(0, 40); }catch(e){}
  q.push({ p: P, k: "view", l: document.title.slice(0, 60), x: isNew ? "new" : "", r: ref });
  // النقرات: نص الزر/الرابط بدون أرقام (حتى تتجمّع «محاسب 5» و«محاسب 7» في سطر واحد)
  function label(el){
    var l = el.getAttribute("data-zt") || el.getAttribute("aria-label") || el.getAttribute("title") || (el.innerText || el.textContent || "");
    l = l.replace(/[0-9٠-٩]+/g, "").replace(/[\s·•|]+/g, " ").trim();
    if(!l && el.tagName === "A") l = (el.getAttribute("href") || "").replace(/^https?:\/\//, "").slice(0, 60);
    return l.slice(0, 50);
  }
  document.addEventListener("click", function(e){
    var el = e.target && e.target.closest && e.target.closest("a,button,[role=button],[data-zt],summary,label,.tile,.card[onclick]");
    if(!el || el.closest("[data-zt-off]")) return;
    var l = label(el); if(l) push("click", l);
    if(q.length >= 10) flush();
  }, true);
  window.addEventListener("scroll", function(){
    var h = document.documentElement, m = h.scrollHeight - h.clientHeight;
    if(m > 0) maxSc = Math.max(maxSc, Math.round(h.scrollTop / m * 100));
  }, { passive: true });
  // نبضة كل 45 ثانية ما دامت الصفحة ظاهرة — لعدّاد «الآن على الموقع»
  setInterval(function(){ if(document.visibilityState === "visible"){ push("ping"); flush(); } }, 45000);
  setTimeout(flush, 1500);
  document.addEventListener("visibilitychange", function(){
    if(document.visibilityState === "hidden"){ vis += Date.now() - lastVis; push("leave", String(Math.round(vis / 1000)), String(maxSc)); flush(); vis = 0; }
    else lastVis = Date.now();
  });
  window.zt = function(name, val){ push("ev", String(name || "").slice(0, 40), String(val == null ? "" : val).slice(0, 80)); setTimeout(flush, 800); };
})();
