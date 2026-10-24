/* بوابة زارة — حفظ الصور في تطبيق «الصور» على آيفون/آيباد بدل تطبيق «الملفات».
   يعمل تلقائياً لكل تنزيل صورة في الموقع (رابط تنزيل بامتداد صورة، أو ملف ZIP كل محتواه صور حتى 60 صورة):
   تُفتح نافذة المشاركة فيُختار «حفظ الصورة/الصور». إن انتهت صلاحية لمسة المستخدم أثناء تجهيز الصورة
   (سفاري يشترطها للمشاركة) يظهر زر واحد للحفظ بلمسة جديدة. على الأجهزة الأخرى لا يتغيّر شيء. */
(function(){
  var IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if(!IOS || !navigator.share || !navigator.canShare || window.__zsave) return;
  window.__zsave = true;
  var IMG = /\.(png|jpe?g|webp|gif|heic)$/i, MAX = 60;
  var MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", heic: "image/heic" };
  var mime = function(n){ return MIME[(n.split(".").pop() || "").toLowerCase()] || "image/png"; };

  // ربط رابط blob: بالملف نفسه، وملف ZIP بقائمة محتواه — لنعرف ما الذي يُنزَّل لحظة الضغط
  var urls = new Map(), zips = new WeakMap();
  var cou = URL.createObjectURL, rou = URL.revokeObjectURL;
  URL.createObjectURL = function(o){ var u = cou.call(URL, o); try { if(o instanceof Blob) urls.set(u, o); } catch(e){} return u; };
  URL.revokeObjectURL = function(u){ setTimeout(function(){ urls.delete(u); }, 60000); return rou.call(URL, u); };
  window.zsaveRegisterZip = function(blob, files){ try { zips.set(blob, files); } catch(e){} return blob; };

  function canShare(files){ try { return navigator.canShare({ files: files }); } catch(e){ return false; } }
  function share(files){
    if(!canShare(files)) return Promise.resolve(false);
    return navigator.share({ files: files }).then(function(){ return true; }, function(e){
      if(e && e.name === "AbortError") return true;
      if(e && e.name === "NotAllowedError") return tap(files);
      return false;
    });
  }
  function tap(files){
    return new Promise(function(res){
      var many = files.length > 1, o = document.createElement("div");
      o.setAttribute("dir", "rtl");
      o.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(15,21,23,.45);display:flex;align-items:flex-end;justify-content:center;padding:18px;font-family:'IBM Plex Sans Arabic',system-ui,sans-serif";
      o.innerHTML = '<div style="background:#fff;border-radius:22px;padding:18px;width:100%;max-width:420px;text-align:center;box-shadow:0 20px 60px -20px rgba(0,0,0,.5)">' +
        '<div style="font-size:15px;font-weight:700;color:#324C4B;margin-bottom:4px">' + (many ? files.length + " صور جاهزة" : "الصورة جاهزة") + '</div>' +
        '<div style="font-size:12.5px;color:#6B7775;margin-bottom:14px">اضغط ثم اختر «حفظ ' + (many ? "الصور" : "الصورة") + '» لتُحفظ في تطبيق الصور</div>' +
        '<button type="button" data-z="go" style="width:100%;border:0;border-radius:14px;background:#4B7071;color:#fff;font:inherit;font-size:15px;font-weight:700;padding:13px">📥 حفظ في الصور</button>' +
        '<button type="button" data-z="x" style="margin-top:8px;border:0;background:none;color:#6B7775;font:inherit;font-size:13px;padding:6px">إلغاء</button></div>';
      document.body.appendChild(o);
      o.addEventListener("click", function(e){
        var b = e.target.closest("[data-z]"); if(!b) return;
        o.remove();
        if(b.dataset.z === "x"){ res(true); return; }
        navigator.share({ files: files }).then(function(){ res(true); }, function(err){ res(!!(err && err.name === "AbortError")); });
      });
    });
  }
  window.zsaveShare = share;

  // ما الذي يُنزّله هذا الرابط؟ صورة واحدة، أو ZIP صوره معروفة — وإلا null (تنزيل عادي)
  function filesFor(a){
    var name = a.getAttribute("download") || "", href = a.href || "";
    if(!name) return null;
    if(IMG.test(name)){
      var b = urls.get(href);
      if(b) return Promise.resolve([new File([b], name, { type: b.type || mime(name) })]);
      if(/^(data:|blob:)/.test(href)) return fetch(href).then(function(r){ return r.blob(); }).then(function(bl){ return [new File([bl], name, { type: bl.type || mime(name) })]; });
      return null;
    }
    if(/\.zip$/i.test(name)){
      var zb = urls.get(href), list = zb && zips.get(zb);
      if(!list || !list.length || list.length > MAX || !list.every(function(f){ return IMG.test(f.name); })) return null;
      return Promise.resolve(list.map(function(f){ var n = f.name.split("/").pop(); return new File([f.data], n, { type: mime(n) }); }));
    }
    return null;
  }

  var origClick = HTMLAnchorElement.prototype.click;
  function handle(a, fallback){
    var p = filesFor(a); if(!p) return false;
    p.then(share).then(function(ok){ if(!ok) fallback(); }, fallback);
    return true;
  }
  HTMLAnchorElement.prototype.click = function(){
    var self = this;
    if(self.hasAttribute("download") && !self.__zDirect && handle(self, function(){ self.__zDirect = true; origClick.call(self); })) return;
    return origClick.call(this);
  };
  // روابط تنزيل مكتوبة في الصفحة ويضغطها المستخدم مباشرة
  document.addEventListener("click", function(e){
    var a = e.target && e.target.closest && e.target.closest("a[download]");
    if(!a || a.__zDirect || e.defaultPrevented) return;
    if(handle(a, function(){ a.__zDirect = true; origClick.call(a); })) e.preventDefault();
  }, true);
})();
