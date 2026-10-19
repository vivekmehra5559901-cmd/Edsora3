/* ===== Edsora extras: subscription ring, live clock, joined accounts, daily "Join" bubble ===== */
(function(){'use strict';
const $=s=>document.querySelector(s),Auth=window.EdsoraAuth,Sync=window.EdsoraSync;
const X='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>';
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const deviceTz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch(e){return 'UTC'}};
const fmt=(ms,o)=>{try{return new Intl.DateTimeFormat(undefined,o).format(new Date(ms))}catch(e){return new Date(ms).toString()}};
/* the ring: full on day 1 of the 29-day cycle, shrinking from the top as days pass. Time = device clock corrected by the server's UTC clock. */
function frac(){const sub=Auth.sub;if(!Auth.user||!sub||Auth.plan!=='pro')return null;if(sub.source==='admin_grant')return 1;return Math.max(0,Math.min(1,(sub.expires-Sync.now())/((sub.cycleDays||29)*864e5)))}
function paintRing(){const w=$('#acctWrap'),c=w&&w.querySelector('.sub-ring circle');if(!c)return;const f=frac();w.classList.toggle('has-ring',f!==null);if(f===null)return;
  c.setAttribute('stroke-dasharray',(f*100).toFixed(2)+' 100');const d=Math.max(0,Math.ceil(f*(Auth.sub.cycleDays||29)));w.setAttribute('title',Auth.sub.source==='admin_grant'?'Complimentary Pro':d+' day'+(d===1?'':'s')+' of Pro left')}
function paintBilling(){const sub=Auth.sub,info=$('#blInfo'),clk=$('#blClock');if(!info||!clk)return;if(!sub||!Auth.user){info.hidden=clk.hidden=true;return}
  const ends=fmt(sub.expires,{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}),days=Math.max(0,Math.ceil((sub.expires-Sync.now())/864e5));
  info.textContent=sub.source==='admin_grant'?'Complimentary Pro access for administrators.':(sub.status==='cancelled'?'Pro ends on ':'Pro is active until ')+ends+' ('+deviceTz()+') \u2022 '+days+' day'+(days===1?'':'s')+' left'+(sub.status==='cancelled'?'. It will not renew.':'.');
  info.hidden=false;clk.hidden=false;tick()}
function tick(){const c=$('#blClock');if(c&&!c.hidden)c.textContent='Your time: '+fmt(Sync.now(),{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'})}
setInterval(()=>{tick();paintRing()},1000);
function paintMembers(){const el=$('#acMembers');if(!el)return;const m=Auth.members;if(!Auth.user||Auth.plan!=='pro'||!m.length){el.hidden=true;return}
  el.hidden=false;el.innerHTML='<span class="ac-av-stack" role="img" aria-label="'+m.length+' joined accounts">'+m.map(x=>'<span class="ac-av">'+esc(x.initial)+(x.photo?'<img alt="" referrerpolicy="no-referrer" src="'+esc(x.photo)+'" onerror="this.remove()">':'')+'</span>').join('')+'</span><span class="ac-av-count">'+m.length+' of 4 seats joined</span>'}
/* the Join bubble: first time Accounts & Management opens each day (owner only), stays 30 s */
const JB='Invite multiple Google accounts to join your active subscription. Simply share your registered email address and referral link with the person you want to invite, allowing them to join your subscription as an admin.';
let jbT=0;const dayKey=()=>new Intl.DateTimeFormat('en-CA').format(new Date());
function hideBubble(){const b=$('#joinBubble');if(b)b.hidden=true;clearTimeout(jbT)}
function showBubble(){if(!Auth.user||Auth.role!=='owner')return;const k='edsora.jb.'+Auth.user.uid;let st={};try{st=JSON.parse(localStorage.getItem(k)||'{}')}catch(e){}if(st.never||st.day===dayKey())return;
  let b=$('#joinBubble');if(!b){b=document.createElement('div');b.id='joinBubble';b.className='join-bubble';b.setAttribute('role','note');b.innerHTML='<button type="button" class="jb-x" aria-label="Dismiss for today">'+X+'</button><p></p><button type="button" class="jb-never">Never show again</button>';
    $('#acGroups').parentNode.insertBefore(b,$('#acGroups'));b.querySelector('.jb-x').onclick=hideBubble;b.querySelector('.jb-never').onclick=()=>{try{localStorage.setItem(k,JSON.stringify({never:true,day:dayKey()}))}catch(e){}hideBubble()}}
  b.querySelector('p').textContent=JB;b.hidden=false;try{localStorage.setItem(k,JSON.stringify(Object.assign(st,{day:dayKey()})))}catch(e){}clearTimeout(jbT);jbT=setTimeout(hideBubble,30000)}
const _route=window.route;window.route=function(n){const r=_route.apply(this,arguments);
  if(n==='account'){paintMembers();setTimeout(showBubble,350)}else hideBubble();
  if(n==='billing')paintBilling();if(n==='payment'){const s=$('#schoolInput');if(s)s.value=localStorage.getItem('edsora.school')||''}return r};
function paint(){paintRing();paintMembers();paintBilling()}
document.addEventListener('edsora:synced',()=>{paint();const a=document.querySelector('.page.active');if(a&&a.id==='accountPage')setTimeout(showBubble,350)});
window.EdsoraExtras={paint,paintBilling,paintRing};paint();
})();
