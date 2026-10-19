function eGift(g){const mo=GIDX(g),mn=MONTH_AR[mo];return `<section class="page d-e gift">${pat("g")}${logo()}
 <div class="ssn"><div class="kick">موسم ${esc(mn)}</div><h2>${esc(g.sTitle)}</h2>${g.sWhen?`<div class="when">${esc(g.sWhen)}</div>`:""}<p>${esc(g.sLine)}</p>${g.proverb?`<blockquote>«${esc(g.proverb)}»</blockquote>`:""}</div>
 <div class="vis"><p>${esc(g.vLine)}</p><div class="vq"><div class="qrbox">${qrEl(g.url,22.5,g.qrImg)}</div><div class="vt"><b>${esc(g.camp)}</b><span>${esc(S().lblGo)}</span></div></div></div>
 <div class="spt">${esc(S().lblSponsors)}</div><div class="sponsors">${allSp()}</div><div class="handle">${esc(draft.settings.handle)}</div></section>`}
const GIDX=g=>{for(let i=1;i<=12;i++)if(draft["g"+pad(i)]===g)return i-1;return Math.max(0,cur.mo-1)};
