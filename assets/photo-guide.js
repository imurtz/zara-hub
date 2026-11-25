/* دليل الصورة المقبولة — أمثلة مرسومة لما نقبله وما يؤخّر النشر، لكل المناسبات.
   الاستخدام: <script src="/assets/photo-guide.js"></script> ثم photoGuide.open("graduates") أو زر ‎data-photo-guide="graduates"‎ */
(function () {
  if (window.photoGuide) return;
  var G = "#517670", B = "#b8926d", SK = "#e9c9a8", HAIR = "#3b3b3b", BG = "#eef3f2";
  // شخص بسيط: رأس + كتفان (cx,cy مركز الرأس، s مقياس)
  function person(cx, cy, s, o) {
    o = o || {};
    var r = 13 * s, sh = o.shirt || G;
    var head = '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + r * 0.86 + '" ry="' + r + '" fill="' + SK + '"/>' +
      (o.ghutra ? '<path d="M' + (cx - r * 1.05) + ' ' + (cy + r * 0.2) + ' Q' + cx + ' ' + (cy - r * 1.9) + ' ' + (cx + r * 1.05) + ' ' + (cy + r * 0.2) + ' L' + (cx + r * 1.25) + ' ' + (cy + r * 1.6) + ' L' + (cx - r * 1.25) + ' ' + (cy + r * 1.6) + 'Z" fill="#fff" stroke="#d9d9d9" stroke-width="' + s + '"/><ellipse cx="' + cx + '" cy="' + (cy - r * 0.62) + '" rx="' + r * 0.95 + '" ry="' + r * 0.22 + '" fill="#222"/>'
        : '<path d="M' + (cx - r * 0.86) + ' ' + (cy - r * 0.1) + ' Q' + cx + ' ' + (cy - r * 1.55) + ' ' + (cx + r * 0.86) + ' ' + (cy - r * 0.1) + ' Q' + cx + ' ' + (cy - r * 0.75) + ' ' + (cx - r * 0.86) + ' ' + (cy - r * 0.1) + 'Z" fill="' + HAIR + '"/>') +
      (o.glasses ? '<rect x="' + (cx - r * 0.72) + '" y="' + (cy - r * 0.18) + '" width="' + r * 0.62 + '" height="' + r * 0.36 + '" rx="' + r * 0.12 + '" fill="#1d1d1d"/><rect x="' + (cx + r * 0.1) + '" y="' + (cy - r * 0.18) + '" width="' + r * 0.62 + '" height="' + r * 0.36 + '" rx="' + r * 0.12 + '" fill="#1d1d1d"/>'
        : '<circle cx="' + (cx - r * 0.32) + '" cy="' + cy + '" r="' + r * 0.09 + '" fill="#333"/><circle cx="' + (cx + r * 0.32) + '" cy="' + cy + '" r="' + r * 0.09 + '" fill="#333"/>') +
      '<path d="M' + (cx - r * 0.3) + ' ' + (cy + r * 0.45) + ' Q' + cx + ' ' + (cy + r * 0.65) + ' ' + (cx + r * 0.3) + ' ' + (cy + r * 0.45) + '" stroke="#9c5d45" stroke-width="' + 1.4 * s + '" fill="none" stroke-linecap="round"/>';
    var body = '<path d="M' + (cx - r * 2.1) + ' ' + (cy + r * 3.6) + ' Q' + (cx - r * 2) + ' ' + (cy + r * 1.35) + ' ' + cx + ' ' + (cy + r * 1.3) + ' Q' + (cx + r * 2) + ' ' + (cy + r * 1.35) + ' ' + (cx + r * 2.1) + ' ' + (cy + r * 3.6) + 'Z" fill="' + sh + '"/>';
    return body + head;
  }
  var frame = function (inner, bg) { return '<svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><clipPath id="pgc"><rect width="120" height="90" rx="8"/></clipPath></defs><g clip-path="url(#pgc)"><rect width="120" height="90" fill="' + (bg || BG) + '"/>' + inner + '</g></svg>'; };
  var SC = {
    good: function () { return frame(person(60, 36, 1.25, { ghutra: true, shirt: "#fff" }) + '<rect x="0" y="0" width="120" height="90" fill="none"/>', "#e7efee"); },
    selfie: function () { return frame('<g transform="rotate(-12 60 45)">' + person(66, 44, 1.9, { shirt: G }) + '</g><path d="M8 92 L34 56 Q38 50 44 52" stroke="' + SK + '" stroke-width="11" stroke-linecap="round" fill="none"/>', "#dfe8f1"); },
    far: function () { return frame('<rect y="58" width="120" height="32" fill="#d8cdb8"/><rect x="10" y="22" width="34" height="36" fill="#cfd8d6"/><rect x="74" y="16" width="38" height="42" fill="#c6d1cf"/>' + person(58, 52, 0.28, { ghutra: true, shirt: "#fff" }), "#e8eef5"); },
    blurry: function () { return frame('<g style="filter:blur(2.6px)">' + person(60, 36, 1.25, { ghutra: true, shirt: "#fff" }) + '</g>', "#e7efee"); },
    dark: function () { return frame('<g opacity=".55">' + person(60, 36, 1.25, { ghutra: true, shirt: "#fff" }) + '</g><rect width="120" height="90" fill="#0b1416" opacity=".55"/>', "#25302f"); },
    backlight: function () { return frame('<circle cx="60" cy="34" r="30" fill="#fff6d8"/><g opacity=".9">' + person(60, 38, 1.2, { shirt: "#2a2a2a" }).replace(new RegExp(SK, "g"), "#3a3330") + '</g>', "#fff2c4"); },
    group: function () { return frame(person(30, 42, 0.95, { ghutra: true, shirt: "#fff" }) + person(60, 38, 0.95, { shirt: B }) + person(90, 42, 0.95, { ghutra: true, shirt: "#fff" }), "#e7efee"); },
    cropped: function () { return frame(person(60, 6, 1.9, { ghutra: true, shirt: "#fff" }), "#e7efee"); },
    stickers: function () { return frame(person(60, 36, 1.25, { shirt: G }) + '<text x="44" y="38" font-size="18">😎</text><text x="12" y="24" font-size="14">✨</text><text x="90" y="80" font-size="14">❤️</text><rect x="8" y="64" width="54" height="14" rx="4" fill="#ffde59"/><rect x="12" y="69" width="40" height="3" rx="1.5" fill="#333"/>', "#f6e7f3"); },
    glasses: function () { return frame(person(60, 36, 1.25, { ghutra: true, shirt: "#fff", glasses: true }), "#e7efee"); },
    screen: function () { return frame('<rect x="22" y="6" width="76" height="80" rx="9" fill="#1f2526"/><rect x="27" y="14" width="66" height="62" fill="#e7efee"/>' + '<g transform="translate(0 4)">' + person(60, 34, 0.95, { ghutra: true, shirt: "#fff" }) + '</g><rect x="27" y="14" width="66" height="9" fill="#cfd8d6"/><path d="M14 0 L40 90" stroke="#fff" stroke-width="7" opacity=".35"/>', "#c9cfd0"); }
  };
  var BAD = [
    ["selfie", "سيلفي", "الذراع ظاهرة والوجه مشوّه من قرب الكاميرا"],
    ["far", "بعيدة جداً", "الشخص صغير ولا تظهر ملامحه"],
    ["blurry", "مهزوزة أو غير واضحة", "تفاصيل الوجه ضائعة"],
    ["dark", "مظلمة", "إضاءة ضعيفة لا تُظهر الوجه"],
    ["backlight", "الضوء من الخلف", "الوجه معتم أمام نافذة أو شمس"],
    ["group", "صورة جماعية", "نحتاج صاحب المناسبة وحده"],
    ["cropped", "مقصوصة", "الرأس أو الوجه مقطوع من الإطار"],
    ["stickers", "فلاتر وملصقات وكتابة", "إيموجي أو نصوص أو فلاتر تطبيقات"],
    ["glasses", "نظارة شمسية أو وجه مغطى", "العينان أو الوجه غير ظاهرين"],
    ["screen", "تصوير شاشة أو لقطة شاشة", "صورة من جوال أو صورة مطبوعة"]
  ];
  var CAT = {
    graduates: ["صورة الخريج", "صورة شخصية للخريج وحده — يُفضّل بالزي الرسمي أو روب التخرج، والوجه واضح."],
    births: ["صورة الأب", "صورة الأب الشخصية — لا نحتاج صورة المولود."],
    marriages: ["صورة الزوج", "صورة الزوج وحده — ليست صورة الزفاف أو الصور الجماعية."],
    congrats: ["صورة صاحب التهنئة", "صورة صاحب التهنئة وحده، واضحة وحديثة."],
    deaths: ["صورة المتوفى", "صورة شخصية واضحة للمتوفى — لا صور من المستشفى ولا صور جماعية."]
  };
  var CSS = '.pg-bg{position:fixed;inset:0;z-index:10080;background:rgba(15,25,23,.55);display:flex;align-items:center;justify-content:center;padding:14px;font-family:inherit}' +
    '.pg{background:#fff;border-radius:22px;width:min(860px,100%);max-height:92vh;overflow:auto;direction:rtl;text-align:right;box-shadow:0 24px 70px rgba(0,0,0,.3);color:#2b3532}' +
    '.pg-h{position:sticky;top:0;background:#fff;padding:16px 20px 12px;border-bottom:1px solid #e4e9e8;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;z-index:1}' +
    '.pg-h b{font-size:18px;display:block}.pg-h small{display:block;color:#6b7876;font-size:13px;margin-top:3px;line-height:1.6}' +
    '.pg-x{border:0;background:#eef3f2;color:#3d5b56;width:34px;height:34px;border-radius:50%;font-size:16px;cursor:pointer;flex:none}' +
    '.pg-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:12px 20px 0}.pg-tabs button{border:1px solid #dfe5e4;background:#fff;border-radius:20px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer;color:#3d5b56}.pg-tabs button[aria-pressed=true]{background:#517670;color:#fff;border-color:#517670}' +
    '.pg-good{display:flex;gap:16px;align-items:center;margin:14px 20px 4px;padding:14px;border-radius:16px;background:#eef6f1;border:1.5px solid #bfe0cd}' +
    '.pg-good svg,.pg-good img{width:170px !important;flex:none;border-radius:10px;border:3px solid #2f9e5b}.pg-good b{color:#1f6b40;font-size:15px}.pg-good p{margin:4px 0 0;font-size:13.5px;line-height:1.8}' +
    '.pg-sec{margin:14px 20px 6px;font-weight:700;font-size:14px;color:#a33a3a}' +
    '.pg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:0 20px 20px}' +
    '.pg-c{border:1px solid #f0d6d6;background:#fff;border-radius:14px;padding:6px;position:relative}' +
    '.pg-c svg{display:block;width:100%;border-radius:8px}.pg-c i{position:absolute;top:10px;left:10px;width:22px;height:22px;border-radius:50%;background:#c0392b;color:#fff;font-style:normal;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #fff}' +
    '.pg-c b{display:block;font-size:13.5px;margin:6px 4px 0}.pg-c span{display:block;font-size:12px;color:#6b7876;margin:2px 4px 4px;line-height:1.5}' +
    '.pg-f{margin:0 20px 18px;padding:10px 14px;border-radius:12px;background:#f8f1ea;color:#8f6a4b;font-size:13px;line-height:1.8}' +
    '.pg-open{display:inline-flex;align-items:center;gap:6px;margin-top:8px;border:1px dashed #b8926d;background:#fbf6f1;color:#8f6a4b;border-radius:12px;padding:7px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}' +
    '@media(max-width:520px){.pg-good{flex-direction:column;align-items:stretch}.pg-good svg,.pg-good img{width:100% !important}}';
  var el = null, cur = "graduates";
  // صور حقيقية (إن وُجدت في /assets/photo-guide/) وإلا الرسم البديل
  var REAL = { good: 1, selfie: 1, far: 1, blurry: 1, dark: 1, backlight: 1, group: 1, cropped: 1, stickers: 1, glasses: 1, screen: 1 };
  function pic(k) { return REAL[k] ? '<img src="/assets/photo-guide/' + k + '.webp?v=' + REAL[k] + '" alt="" loading="lazy" style="display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px">' : SC[k](); }
  function render() {
    
    el.innerHTML = '<div class="pg" role="dialog" aria-modal="true" aria-label="دليل الصورة المقبولة"><div class="pg-h"><div><b>دليل الصورة المقبولة</b><small>الصور غير المناسبة نضطر نطلب بدلها، وهذا يؤخّر النشر. اختر صورة مثل المثال الأخضر.</small></div><button type="button" class="pg-x" data-pg-x aria-label="إغلاق">✕</button></div>' +
      '<div class="pg-good">' + pic("good") + '<div><b>✓ الصورة المناسبة لكل المناسبات</b><p>صورة شخصية لصاحب المناسبة وحده: من الصدر للأعلى، الوجه واضح وينظر للكاميرا، إضاءة جيدة من الأمام، خلفية هادئة، وبدون فلاتر.</p></div></div>' +
      '<div class="pg-sec">✗ صور يُفضّل ما ترسلها — عشان ما يتأخر النشر</div>' +
      '<div class="pg-grid">' + BAD.map(function (b) { return '<div class="pg-c">' + pic(b[0]) + '<i>✗</i><b>' + b[1] + '</b><span>' + b[2] + '</span></div>'; }).join("") + '</div>' +
      '<div class="pg-f">نصيحة: اطلب من أحد يصوّرك من مسافة متر تقريباً، في مكان مضيء، والجوال بمستوى العين — أو أرسل صورة شخصية رسمية جاهزة.</div></div>';
  }
  function open(cat) {
    if (!document.getElementById("pg-css")) { var st = document.createElement("style"); st.id = "pg-css"; st.textContent = CSS; document.head.appendChild(st); }
    cur = CAT[cat] ? cat : "graduates";
    if (!el) {
      el = document.createElement("div"); el.className = "pg-bg";
      el.addEventListener("click", function (e) {
        if (e.target === el || e.target.closest("[data-pg-x]")) return close();
        var t = e.target.closest("[data-pg-cat]"); if (t) { cur = t.getAttribute("data-pg-cat"); render(); }
      });
    }
    render(); document.body.appendChild(el); document.addEventListener("keydown", esc);
  }
  function close() { if (el && el.parentNode) el.parentNode.removeChild(el); document.removeEventListener("keydown", esc); }
  function esc(e) { if (e.key === "Escape") close(); }
  // زر جاهز يُوضع تحت خانة الصورة
  function button(cat) { return '<button type="button" class="pg-open" data-photo-guide="' + (cat || "") + '">📷 شيّك أوضاع الصور غير المقبولة قبل الرفع</button>'; }
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-photo-guide]"); if (b) { e.preventDefault(); open(b.getAttribute("data-photo-guide")); } });
  if (!document.getElementById("pg-css")) { var st0 = document.createElement("style"); st0.id = "pg-css"; st0.textContent = CSS; (document.head || document.documentElement).appendChild(st0); }
  window.photoGuide = { open: open, close: close, button: button };
})();
