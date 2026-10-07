/* بيانات توضيحية للأشهر الاثني عشر (راعٍ وشعاره، صورة الشهر، اسم الفنان) — كلها افتراضية ومرسومة هنا.
   تظهر في المعاينة والطباعة ما دامت الخانة فارغة، ولا تُحفظ في القاعدة، وقائمة المراجعة تعدّها ناقصة. */
const svgUri=x=>"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(x);
const DEMO_SP=[["مؤسسة الواحة","للتجارة والمقاولات"],["شركة النخيل","للصناعات الغذائية"],["مجموعة الساحل","للتطوير العقاري"],["صيدليات الشفاء","رعاية تثق بها"],["مخابز السنابل","خبز كل يوم"],["مركز الرؤية","للبصريات"],["مطبعة البيان","طباعة ونشر"],["شركة الميناء","للخدمات اللوجستية"],["معرض الدانة","للمجوهرات"],["مطاعم الديوان","مذاق أصيل"],["مكتبة المنار","كتب وقرطاسية"],["مياه الغدير","نقاء من المنبع"]];
const DEMO_ART=["سارة علي الزاهر","حسن محمد الفرج","زينب أحمد آل ربح","علي حسين النمر","فاطمة جعفر الصفار","محمد عبدالله اللباد","مريم سعيد المرهون","أحمد علي آل مطرود","نور حسن الخباز","حسين علي آل سعيد","ليلى محمد الشيخ","عبدالله أحمد الزاير"];
const DEMO_MARK=[
 `<path d="M225 12l22 23-22 23-22-23z" fill="none" stroke="#b8926d" stroke-width="4" stroke-linejoin="round"/><path d="M225 24l11 11-11 11-11-11z" fill="#517670"/>`,
 `<path d="M225 58V30" stroke="#517670" stroke-width="4" stroke-linecap="round"/><path d="M225 32c-16-16-28-12-30-4M225 32c16-16 28-12 30-4M225 30c-8-18-2-22 0-22s8 4 0 22" fill="none" stroke="#b8926d" stroke-width="4" stroke-linecap="round"/>`,
 `<path d="M200 44c8-8 16-8 24 0s16 8 24 0M200 30c8-8 16-8 24 0s16 8 24 0" fill="none" stroke="#517670" stroke-width="4" stroke-linecap="round"/><circle cx="238" cy="16" r="6" fill="#b8926d"/>`,
 `<rect x="204" y="14" width="42" height="42" rx="12" fill="#517670"/><path d="M225 24v22M214 35h22" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`,
 `<path d="M225 58V22" stroke="#b8926d" stroke-width="4" stroke-linecap="round"/><path d="M225 26c-10-2-14-10-12-16 8 2 12 8 12 16zm0 12c-10-2-14-10-12-16 8 2 12 8 12 16zm0-12c10-2 14-10 12-16-8 2-12 8-12 16zm0 12c10-2 14-10 12-16-8 2-12 8-12 16z" fill="#517670"/>`,
 `<path d="M198 35c14-20 40-20 54 0-14 20-40 20-54 0z" fill="none" stroke="#517670" stroke-width="4"/><circle cx="225" cy="35" r="9" fill="#b8926d"/>`,
 `<rect x="203" y="16" width="44" height="38" rx="5" fill="none" stroke="#517670" stroke-width="4"/><path d="M212 28h26M212 36h26M212 44h16" stroke="#b8926d" stroke-width="4" stroke-linecap="round"/>`,
 `<path d="M225 12v40M210 52c8 8 22 8 30 0M210 26h30" fill="none" stroke="#517670" stroke-width="4" stroke-linecap="round"/><circle cx="225" cy="14" r="6" fill="#b8926d"/>`,
 `<path d="M205 28l10-12h20l10 12-20 28z" fill="none" stroke="#b8926d" stroke-width="4" stroke-linejoin="round"/><path d="M205 28h40M215 16l10 12 10-12" fill="none" stroke="#517670" stroke-width="3"/>`,
 `<path d="M202 46h46M208 46c0-22 34-22 34 0" fill="none" stroke="#517670" stroke-width="4" stroke-linecap="round"/><circle cx="225" cy="20" r="4" fill="#b8926d"/><path d="M204 54h42" stroke="#b8926d" stroke-width="4" stroke-linecap="round"/>`,
 `<path d="M225 20c-8-6-18-6-24-2v36c6-4 16-4 24 2 8-6 18-6 24-2V18c-6-4-16-4-24 2zM225 20v36" fill="none" stroke="#517670" stroke-width="4" stroke-linejoin="round"/>`,
 `<path d="M225 10c12 16 18 26 18 34a18 18 0 01-36 0c0-8 6-18 18-34z" fill="#517670"/><path d="M216 44a9 9 0 009 9" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>`
];
const demoLogo=i=>svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 70" width="520" height="140">${DEMO_MARK[i]}<text x="190" y="33" text-anchor="end" font-family="Tahoma,Arial,sans-serif" font-size="25" font-weight="700" fill="#517670">${DEMO_SP[i][0]}</text><text x="190" y="57" text-anchor="end" font-family="Tahoma,Arial,sans-serif" font-size="15" fill="#b8926d">${DEMO_SP[i][1]}</text></svg>`);
/* مشهد لكل شهر: [أعلى السماء، وسطها، أسفلها، لون القرص، أفقي القرص، عمودي القرص، ثلاث طبقات أرض، نوع المشهد] */
const DEMO_SCN=[
 ["#2f4a47","#7fa39b","#e9c9a0","#f6e3c3",430,930,"#b8926d","#8f6a45","#3d5b56","palm"],
 ["#1f2f3d","#4b6a80","#c9b6a0","#f1ead9",200,420,"#6f8a8f","#4b6a70","#2c4347","sea"],
 ["#3b2f4a","#8a6f9a","#f0c7a8","#fbe6c8",320,1000,"#c79a72","#a5754f","#5a3f4f","dune"],
 ["#3f6f73","#9cc3bd","#e6efe2","#ffffff",470,360,"#9bb58f","#6f9173","#3d5b56","hill"],
 ["#27504d","#6fa39a","#f3dcae","#fff1cf",330,820,"#c8a56e","#9a7a4c","#35524c","palm"],
 ["#16242e","#2f4b5c","#7c8f96","#e9eef0",440,300,"#536b73","#3a5058","#22343a","sea"],
 ["#5a3a2a","#c7774d","#f3c58f","#ffe9bf",220,960,"#c98a55","#9c6238","#5b3a2a","dune"],
 ["#2d4f6b","#7fb0c9","#f2e2c4","#fff6dd",430,520,"#d9c08e","#b59a66","#5f7f86","sea"],
 ["#2f5b3a","#8fbf8a","#eef0cf","#ffffff",190,340,"#88a86f","#5f8452","#2f5b3a","hill"],
 ["#4a2f2a","#a8684a","#f0c08a","#ffdfae",350,900,"#b8825a","#8f5f3c","#4a342c","palm"],
 ["#2a2f45","#5f6f93","#d6c2b4","#f3ece4",460,400,"#8a8fa8","#5f6682","#34384f","hill"],
 ["#1d2a3a","#3f5873","#a9b9c6","#f4f7fa",230,300,"#7f95a6","#5a7184","#2a3b4b","dune"]
];
function demoPhoto(i){const s=DEMO_SCN[i],k=s[9];
 const palm=x=>`<g stroke="#1f3233" stroke-width="14" stroke-linecap="round" fill="none"><path d="M${x} 1340c10-150 0-300-20-430"/><path d="M${x-20} 910c-60-50-120-50-170-10M${x-20} 910c-30-70-90-100-150-90M${x-20} 910c40-70 110-90 170-70M${x-20} 910c70-30 140-10 180 40M${x-20} 910c10-70-20-130-70-160"/></g>`;
 const land=k==="sea"?`<path d="M0 1050h640v450H0z" fill="${s[6]}"/><path d="M0 1120c80-20 160 20 240 0s160-20 240 0 110 10 160 0v380H0z" fill="${s[7]}"/><path d="M0 1260c100-24 180 24 280 0s180-24 360 6v234H0z" fill="${s[8]}"/><path d="M${s[4]-70} 1085h140M${s[4]-45} 1150h90M${s[4]-25} 1215h50" stroke="${s[3]}" stroke-width="8" stroke-linecap="round" opacity=".55"/>`
  :k==="hill"?`<path d="M0 1120l150-210 130 150 120-250 240 330v360H0z" fill="${s[6]}"/><path d="M0 1240c120-90 240-60 340 0s200 60 300-20v280H0z" fill="${s[7]}"/><path d="M0 1360c160-60 300-30 420 10s160 10 220-20v150H0z" fill="${s[8]}"/>`
  :`<path d="M0 1080c120-70 250-60 380 0s200 40 260 10v410H0z" fill="${s[6]}"/><path d="M0 1200c160-80 300-30 420 20s160 20 220-10v290H0z" fill="${s[7]}"/><path d="M0 1330c140-50 280-20 400 10s180 10 240-10v170H0z" fill="${s[8]}"/>`;
 return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 1500" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s[0]}"/><stop offset=".5" stop-color="${s[1]}"/><stop offset=".8" stop-color="${s[2]}"/></linearGradient></defs><rect width="640" height="1500" fill="url(#s)"/><circle cx="${s[4]}" cy="${s[5]}" r="${k==="sea"||k==="hill"?80:118}" fill="${s[3]}" opacity=".92"/>${land}${k==="palm"?palm(i%2?470:150):""}</svg>`)}
const DEMO_LOGOS=DEMO_SP.map((_,i)=>demoLogo(i)),DEMO_PHOTOS=DEMO_SCN.map((_,i)=>demoPhoto(i));
const demo=(mo,m)=>Object.assign({},m,{sponsorImg:m.sponsorImg||DEMO_LOGOS[mo-1],photo:m.photo||DEMO_PHOTOS[mo-1],artist:m.artist==="اسم الفنان"?DEMO_ART[mo-1]:m.artist});
