# JS/HTML/CSS fragments injected into Edsora #8 to produce index.html
AUTH_NEW = r'''/* ---------- Auth state (plan, role and seats come ONLY from the backend) ---------- */
const Auth=window.EdsoraAuth={user:null,srv:null,
  get role(){return this.user&&this.srv?this.srv.role:'free'},
  get plan(){return this.role==='free'?'free':'pro'},
  get seats(){return this.srv&&this.srv.seats||[]},
  get seat(){const s=this.seats.find(x=>x.state==='you');return s?s.slot:0},
  get members(){return this.srv&&this.srv.members||[]},
  get sub(){return this.srv&&this.srv.sub||null},
  setMe(me){this.srv=me;render();if(window.EdsoraExtras)EdsoraExtras.paint()}
};
'''
SETUSER_NEW = r'''async function setUser(u,announce){
  const was=!!Auth.user;Auth.user=norm(u);
  if(Auth.user&&!was){hideSignup();try{edmDemoSheet.close()}catch(e){}hideDone();try{if(window.EdsoraDemo&&EdsoraDemo.applied)EdsoraDemo.reset()}catch(e){}S.returning=true;save();paintWording();if(announce)say('Signed in');render();await EdsoraSync.boot();seatPopSoon();return}
  if(!Auth.user&&was){hideDone();try{hideCamp()}catch(e){}stopCampaign(true);C.run=null;EdsoraSync.clear();closeSeatPop()}
  render();
}
'''
PAY_NEW = r'''/* ---------- Checkout (PhonePe UPI AutoPay): Pro is unlocked ONLY by the backend, after PhonePe confirms the payment ---------- */
const PP_KEY='edsora.ppOrder',ppStore={get(){try{return sessionStorage.getItem(PP_KEY)||''}catch(e){return ''}},set(v){try{v?sessionStorage.setItem(PP_KEY,v):sessionStorage.removeItem(PP_KEY)}catch(e){}}};
let ppUrlOrder='';try{const q=new URLSearchParams(location.search).get('pp');if(q&&/^EDSO-[a-z0-9]{9}$/.test(q)){ppUrlOrder=q;const u=new URL(location.href);u.searchParams.delete('pp');history.replaceState(null,'',u.pathname+(u.search||'')+u.hash)}}catch(e){}
const Pay={busy:false,async start(){
  if(!Auth.user){try{window.closePaywall()}catch(e){}showSignup();return}
  if(Auth.plan==='pro'){toastX('Your Pro plan is already active.',6000);return}
  if(this.busy)return;this.busy=true;
  try{
    const o=await EdsoraApi.post('/api/pay/order');
    if(o.free){await EdsoraSync.refresh();try{window.closePaywall()}catch(e){}say('Pro Plan activated');setTimeout(showPwa,2000);return}
    if(!o.redirectUrl||!/^https:\/\//.test(o.redirectUrl)){toastX('The payment window could not be opened. Please try again.',7000);return}
    ppStore.set(o.orderId);try{window.closePaywall()}catch(e){}
    toastX('Opening PhonePe AutoPay…',6000);
    location.assign(o.redirectUrl)
  }catch(e){if(e.code==='already_active'){await EdsoraSync.refresh().catch(()=>{});toastX(e.message,6000)}else if(e.code==='subscription_pending'||e.code==='pay_unconfigured'||e.code==='pay_provider_error')toastX(e.message,8000);else EdsoraApi.fail(e)}
  finally{this.busy=false}},
  /* back from PhonePe (or reopened later): ask the backend to confirm with PhonePe, then unlock */
  async finish(id){
    if(!id||this.fin)return;this.fin=true;
    try{
      for(let i=0;i<8;i++){
        try{const r=await EdsoraApi.post('/api/pay/verify',{orderId:id});EdsoraSync.setMe(r.me);await EdsoraSync.refresh();ppStore.set('');toastX('Payment successful • Pro unlocked • renews automatically every 29 days',9000);setTimeout(showPwa,2000);return}
        catch(e){
          if(e.code==='payment_pending'||e.code==='rate_limited'){await new Promise(r=>setTimeout(r,4000));continue}
          if(e.code==='offline')return;
          ppStore.set('');if(e.code==='payment_failed'||e.code==='subscription_not_active'){toastX('Payment was not completed. You have not been charged — you can try again anytime.',9000)}else if(e.code!=='wrong_user')toastX(e.message||'We could not confirm your payment.',9000);return}}
      toastX('We are still confirming your payment. If money was deducted, Pro unlocks automatically within a minute.',10000);setTimeout(()=>EdsoraSync.refresh().catch(()=>{}),20000)
    }finally{this.fin=false}}};
document.addEventListener('edsora:synced',()=>{const id=ppUrlOrder||ppStore.get();ppUrlOrder='';if(id&&Auth.plan!=='pro')Pay.finish(id);else if(id)ppStore.set('')});
$('#pwPro').addEventListener('click',e=>{e.stopImmediatePropagation();Pay.start()},true);
window.EdsoraPay=Pay;
'''
CAMPAIGN_NEW = r'''C.run=null;
const SAME_DAY_MSG="Only newly modified messages will be ready to send. A full-scale mass campaign, like the one conducted previously, will begin tomorrow. Sending the same message on the same day is not allowed.";
const cardIdxOf=key=>pendingRows().findIndex(r=>r.skey===key);
function addRings(){[$('#homeMessages'),$('#sendMessages')].forEach(t=>t&&[...t.children].forEach(card=>{if(card.classList.contains('empty-msg')||card.querySelector('.sr'))return;card.insertAdjacentHTML('afterbegin',SR_SVG);card.classList.add('sr-on')}))}
function resumeToast(){const R=C.run;if(!R||R.done)return;toastX('',15000,{top:true,html:'<button type="button" class="tx-actbtn"><b><u>Resume</u></b> Campaign</button>',onClick:()=>resumeCampaign()})}
function campaignError(e){
  if(!e||e.code==='offline')return;
  if(e.code==='seat_same_day'){toastX(e.message,15000,{top:true});return}
  if(e.code==='paylink_required'){showPayPrompt();return}
  if(e.code==='blank'){say(e.message);return}
  if(e.code==='wa_unconfigured'){toastX('WhatsApp sending is not connected yet. Please try again later.',8000,{top:true});return}
  EdsoraApi.fail(e)}
async function proStart(){
  if(C.on)return;
  if(isBlankState()){say('Blank Excel files cannot start a campaign.');return}
  if(!window.hasPayLink()){showPayPrompt();return}
  if(!store.rows.length){say('Add a file first');return}
  C.on=true;let st;
  try{st=await EdsoraApi.post('/api/campaign/start')}catch(e){C.on=false;campaignError(e);return}
  if(st.notice==='same_day')toastX(SAME_DAY_MSG,15000,{top:true});
  if(!st.total){C.on=false;if(st.notice!=='same_day')say('No pending reminders to send');return}
  C.run={id:st.id,total:st.total,cursor:0,keys:st.keys||[],done:false};
  await driveCampaign()}
async function resumeCampaign(){
  const R=C.run;if(!R||C.on)return;C.on=true;
  try{const r=await EdsoraApi.post('/api/campaign/resume',{id:R.id});R.cursor=r.cursor;R.total=r.total;R.keys=r.keys||R.keys}catch(e){C.on=false;campaignError(e);return}
  await driveCampaign()}
async function driveCampaign(){
  const R=C.run,tk=++C.tok;addRings();const l=$('[data-live="reminders"]');C.before=l?l.textContent:'';showP(camp);const tr=[$('#homeMessages'),$('#sendMessages')].filter(Boolean);
  while(C.on&&tk===C.tok&&R.cursor<R.total){
    const from=R.cursor;let r;
    try{r=await EdsoraApi.post('/api/campaign/step',{id:R.id,n:5})}catch(e){if(tk===C.tok){C.on=false;hideCamp();campaignError(e);if(e&&(e.code==='wa_unconfigured'||e.code==='offline'))resumeToast()}return}
    if(tk!==C.tok)return;if(r.busy){await new Promise(z=>setTimeout(z,400));continue}
    for(let i=from;i<r.cursor;i++){const ci=cardIdxOf(R.keys[i]);if(ci>=0){mark(ci,'go');setTimeout(()=>mark(ci,'done'),600)}}
    R.cursor=r.cursor;if(l)l.textContent=Math.max(0,R.total-R.cursor);
    const nx=cardIdxOf(R.keys[Math.min(R.cursor,R.total-1)]);tr.forEach(t=>{const c=t.children[Math.max(0,nx)];if(c)t.scrollTo({left:c.offsetLeft-t.children[0].offsetLeft,behavior:'smooth'})});
    if(r.done||r.cursor>=r.total){R.done=true;break}
    await new Promise(z=>setTimeout(z,350))}
  if(!C.on||tk!==C.tok)return;
  C.on=false;hideCamp();if(R.done){say('Campaign complete \u2022 '+R.total+' reminders sent');if(l)l.textContent='0';try{await EdsoraSync.refresh()}catch(e){}}}
$('#dmCampGo').onclick=async()=>{if(!C.on)return;C.on=false;C.tok++;hideCamp();const R=C.run;try{if(R)await EdsoraApi.post('/api/campaign/abort',{id:R.id})}catch(e){}say('Campaign aborted');resumeToast()};
document.addEventListener('edsora:synced',ev=>{const c=ev.detail&&ev.detail.state&&ev.detail.state.campaign;if(c&&!C.on&&(c.status==='paused'||c.status==='running')){C.run={id:c.id,total:c.total,cursor:c.cursor,keys:[],done:false};resumeToast()}});
'''
SEATS_NEW = r'''/* ---------- Join / seats (the backend owns every seat; the plan owner holds Seat 1) ---------- */
const RESTRICT='You can\u2019t view or access other users\u2019 seat links.';
let linkSeat=0;
const refUrl=n=>{const base=EdsoraSync.refBase||location.href.split(/[?#]/)[0];return base+(base.includes('?')?'&':'?')+'ref=premium'+n};
const seatRef=slot=>{const s=Auth.seats.find(x=>x.slot===slot);return s&&s.ref};
function renderSeats(){
  const role=Auth.role,pro=role!=='free',seats=Auth.seats;
  $('#seatGrid').innerHTML=[1,2,3,4].map(n=>{const s=seats.find(x=>x.slot===n)||{state:'free'},you=pro&&s.state==='you',taken=pro&&s.state!=='free',locked=!pro,label=you?'Taken (you)':taken?'Taken':'Seat '+n;
    return '<button type="button" class="seat'+(taken?' taken':'')+(locked?' locked':'')+(linkSeat===n?' sel':'')+'" data-seat="'+n+'" aria-label="'+(locked?'Seat '+n+', locked until you upgrade':label)+'"><span class="seat-tile">'+IC.chair+'<span class="lockmark">'+IC.lock+'</span></span><span class="seat-pill">'+label+'</span></button>'}).join('');
  $('#seatNote').textContent=!pro?'Seats unlock after you upgrade to Pro.':role==='owner'?'Seat 1 is yours. Tap a seat to get its invite link.':'You joined your admin\u2019s Pro plan.';
  const L=$('#seatLink'),ok=role==='owner'&&linkSeat>1&&!!seatRef(linkSeat);if(!ok)linkSeat=0;L.hidden=!ok;
  if(ok){$('#slTitle').textContent='Seat '+linkSeat+' link';$('#slUrl').value=refUrl(seatRef(linkSeat))}
}
$('#seatGrid').addEventListener('click',e=>{const b=e.target.closest('.seat');if(!b)return;const n=+b.dataset.seat,role=Auth.role;
  if(role==='free'){window.openPaywall(null);return}
  if(Auth.seat===n){linkSeat=0;renderSeats();say('Seat '+n+' is yours');return}
  if(role==='member'){toastX(RESTRICT,8000);return}                       /* only the subscription owner can see seat links */
  if(n===1)return;
  linkSeat=linkSeat===n?0:n;renderSeats()});
async function copyText(t){try{await navigator.clipboard.writeText(t);return true}catch(e){try{const i=$('#slUrl');i.focus();i.select();return document.execCommand('copy')}catch(_){return false}}}
$('#slCopy').onclick=async()=>{say(await copyText($('#slUrl').value)?'Link copied':'Could not copy. Select the link and copy it.')};
$('#slShare').onclick=async()=>{const url=$('#slUrl').value;if(navigator.share){try{await navigator.share({title:'Edsora Pro seat',text:'Join my Edsora Pro plan:',url});return}catch(e){if(e&&e.name==='AbortError')return}}say(await copyText(url)?'Link copied':'Could not share. Select the link and copy it.')};

/* ---------- Billing ---------- */
function renderBilling(){
  const role=Auth.role,sub=Auth.sub;$('#blPlan').textContent=role==='free'?'Free':'Pro Plan';
  $('#blCancel').hidden=!(role==='owner'&&sub&&sub.source==='phonepe_subscription'&&sub.status==='active');
  const hn=$('#blHint');hn.hidden=role!=='member';hn.textContent=role==='member'?'Your Pro access is shared by your institute\u2019s admin. Only the admin can cancel the plan.':'';
  if(window.EdsoraExtras)EdsoraExtras.paintBilling()}
$('#blCancel').onclick=()=>confirmPop({icon:IC.billing,title:'Cancel Pro Plan?',sub:'Pro stays active until the end of your current 29-day period and will not renew.',ok:'Cancel Plan',no:'Keep Plan',onOk:async()=>{try{const r=await EdsoraApi.post('/api/pay/cancel');EdsoraSync.setMe(r.me);say('Plan cancelled')}catch(e){EdsoraApi.fail(e)}}});

'''
REF_NEW = r'''/* ---------- Referral: "Knock knock... Admin?" → buyer's email → seat (reminds every 15 min until grabbed) ---------- */
const sp=$('#seatPop'),REF_RE=/^premium(\d{1,9})$/i;let spAt=0;
(function(){try{const u=new URL(location.href),v=u.searchParams.get('ref');if(!v)return;const m=REF_RE.exec(v.trim());if(m){S.pending={ref:+m[1]};S.pendingShown=0;save()}u.searchParams.delete('ref');history.replaceState(null,'',u.pathname+(u.search||'')+u.hash)}catch(e){}})();
function spStep(step){$('#spForm').hidden=step!=='email';sp.querySelector('.sp-line').hidden=step==='email';sp.classList.toggle('emailstep',step==='email')}
function openSeatPop(){spAt=Date.now();spStep('grab');sp.classList.add('open');sp.setAttribute('aria-hidden','false');document.documentElement.style.overflow='hidden';setTimeout(()=>{try{sp.querySelector('.sp-card').focus({preventScroll:true})}catch(e){}},40)}
function closeSeatPop(){if(!sp.classList.contains('open'))return;sp.classList.remove('open');sp.setAttribute('aria-hidden','true');document.documentElement.style.overflow=''}
function seatPopMaybe(force){
  const p=S.pending;if(!p||!Auth.user)return;
  if(Auth.role!=='free'){S.pending=null;save();return}                     /* premium already unlocked: never show again */
  if(sp.classList.contains('open')||sgn.classList.contains('open')||cnt.classList.contains('open'))return;
  if(!force&&Date.now()-(S.pendingShown||0)<900000)return;
  S.pendingShown=Date.now();save();openSeatPop();
}
function seatPopSoon(){setTimeout(()=>seatPopMaybe(true),700)}
$('#spX').onclick=closeSeatPop;
$('#spGrab').onclick=()=>{if(!S.pending){closeSeatPop();return}spStep('email');setTimeout(()=>{try{$('#spEmail').focus()}catch(e){}},60)};
async function spConnect(){const p=S.pending,em=$('#spEmail').value.trim();if(!p){closeSeatPop();return}
  if(!/^\S+@\S+\.\S+$/.test(em)){toastX('Please enter your subscription buyer\u2019s email address.',10000);return}
  const b=$('#spConnect');b.disabled=true;
  try{const r=await EdsoraApi.post('/api/seat/claim',{ref:'premium'+p.ref,email:em});S.pending=null;save();closeSeatPop();$('#spEmail').value='';EdsoraSync.setMe(r.me);await EdsoraSync.refresh();toastX('Premium Unlocked',10000)}
  catch(e){if(e.code!=='offline'){toastX(e.message||'Something went wrong. Please try again.',10000);if(['invalid_link','seat_taken','plan_inactive','already_pro','own_link'].includes(e.code)){S.pending=null;save();closeSeatPop()}}}
  finally{b.disabled=false}}
$('#spConnect').onclick=spConnect;$('#spEmail').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();spConnect()}});
sp.addEventListener('click',e=>{if(e.target===sp&&Date.now()-spAt>350)closeSeatPop()});
document.addEventListener('keydown',e=>{if(!sp.classList.contains('open'))return;if(e.key==='Escape')closeSeatPop();if(e.key==='Tab'){const f=[...sp.querySelectorAll('button,input')].filter(x=>x.offsetParent&&!x.disabled),i=f.indexOf(document.activeElement);e.preventDefault();if(f.length)f[(i+(e.shiftKey?-1:1)+f.length)%f.length].focus()}});
setInterval(()=>seatPopMaybe(false),30000);
if(S.pending){setTimeout(()=>{if(Auth.user)seatPopMaybe(false);else showSignup()},900)}
'''
SEATPOP_FORM = '<div class="sp-form" id="spForm" hidden><label class="sp-lab" for="spEmail">Subscription buyer\u2019s email</label><input class="sp-input" id="spEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="name@school.com"><button type="button" class="sp-grab sp-connect" id="spConnect">Connect &amp; Unlock</button></div>'
EXTRA_CSS = r'''
<style id="edsora9-css">
/* top-placed toast + clickable action */
.toast-x.tx-top{bottom:auto;top:calc(16px + env(safe-area-inset-top,0px));transform:translate(-50%,-14px)}
.toast-x.tx-top.show{transform:translate(-50%,0)}
.toast-x .tx-actbtn{border:0;background:none;color:inherit;font:inherit;padding:0;cursor:pointer}
.toast-x .tx-actbtn u{text-underline-offset:3px}
/* offline toast */
.net-toast{bottom:auto;top:calc(16px + env(safe-area-inset-top,0px));transform:translate(-50%,-14px);padding-left:18px;z-index:2147483640}
.net-toast.show{transform:translate(-50%,0)}
.net-toast .nt-ic{flex:none;width:34px;height:34px;display:grid;place-items:center;color:inherit}
.net-toast .nt-ic svg{width:100%;height:100%;display:block}
.net-toast .nt-retry svg{width:18px;height:18px}.net-toast .nt-retry.spin svg{animation:ntSpin .7s linear infinite}
@keyframes ntSpin{to{transform:rotate(360deg)}}
/* avatar + subscription ring */
.acct-wrap{margin-left:auto;flex:none;position:relative;display:inline-grid;place-items:center;padding:5px}
.acct-wrap .acct-avatar{margin-left:0}
.sub-ring{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none;transform:rotate(-90deg)}
.acct-wrap.has-ring .sub-ring{display:block}
.sub-ring circle{fill:none;stroke:var(--text);stroke-width:2.4;stroke-linecap:round;transition:stroke-dasharray .6s cubic-bezier(.32,.72,0,1)}
/* seats: taken tiles look identical for "you" and for others */
.seat.taken .seat-tile{background:#1C1C1E;color:#EDEDF0}:root.dark .seat.taken .seat-tile{background:#EDEDF0;color:#1C1C1E}
/* joined accounts avatar group (info only) */
.ac-members{display:flex;align-items:center;justify-content:center;gap:12px;margin:2px auto 18px;padding:0 16px}
.ac-av-stack{display:flex;align-items:center}
.ac-av{width:38px;height:38px;border-radius:50%;margin-left:-11px;border:3px solid var(--ac-page,var(--bg));background:var(--carrier);display:grid;place-items:center;overflow:hidden;font-family:Clash,sans-serif;font-weight:600;font-size:15px;color:var(--text);box-sizing:border-box;position:relative}
.ac-av:first-child{margin-left:0}.ac-av img{width:100%;height:100%;object-fit:cover;display:block}
.ac-av-count{font-family:Gambetta,serif;font-size:15px;color:var(--ac-sub,var(--muted))}
/* join bubble */
.join-bubble{position:relative;margin:4px 14px 26px;padding:22px 22px 20px;border-radius:28px;background:#795CFF;color:#fff;box-shadow:0 14px 34px rgba(121,92,255,.32);animation:jbIn .4s cubic-bezier(.32,.72,0,1)}
.join-bubble::after{content:"";position:absolute;left:34px;bottom:-9px;width:20px;height:20px;background:#795CFF;border-radius:4px;transform:rotate(45deg)}
.join-bubble p{margin:0 28px 16px 0;font-family:Gambetta,serif;font-size:16px;line-height:1.45;color:#fff}
.join-bubble .jb-x{position:absolute;top:12px;right:12px;width:32px;height:32px;border:0;border-radius:50%;background:rgba(255,255,255,.18);color:#fff;display:grid;place-items:center;padding:0}
.join-bubble .jb-x svg{width:15px;height:15px}
.join-bubble .jb-never{height:42px;padding:0 20px;border-radius:999px;border:1px solid #fff;background:#795CFF;color:#fff;font-family:Gambetta,serif;font-weight:700;font-size:15.5px}
.join-bubble[hidden]{display:none}
@keyframes jbIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
@media(min-width:760px){.join-bubble{border-radius:64px;padding:34px 56px 30px;margin:4px auto 34px;max-width:640px}.join-bubble p{font-size:19px;margin-right:36px}.join-bubble::after{left:70px}.join-bubble .jb-never{height:48px;font-size:17px;padding:0 26px}.join-bubble .jb-x{top:24px;right:34px}}
/* billing info */
.bl-info,.bl-clock{margin:14px 4px 0;font-family:Gambetta,serif;font-size:15px;line-height:1.5;color:var(--muted)}
.bl-clock{font-variant-numeric:tabular-nums}
/* seat popover email step */
.sp-form{display:flex;flex-direction:column;align-items:stretch;gap:12px;margin-top:4px}
.sp-lab{font-family:Gambetta,serif;font-size:clamp(17px,4.8vw,21px)}
.sp-input{height:52px;border:0;border-radius:999px;padding:0 22px;background:rgba(0,0,0,.07);color:var(--spInk);font-family:Gambetta,serif;font-size:18px;outline:none;-webkit-appearance:none;appearance:none;width:100%;box-sizing:border-box}
.sp-input:focus-visible{box-shadow:0 0 0 2px var(--spInk)}
:root.dark .sp-input{background:rgba(255,255,255,.1)}
.sp-connect{width:100%;height:54px;font-size:20px}.sp-connect:disabled{opacity:.6}
.sp-card .sp-line[hidden]{display:none}
.pay-input+.pay-input{margin-top:0}
:root.dark .ac-av{border-color:var(--ac-page,#0A0A12)}
@media(prefers-reduced-motion:reduce){.sub-ring circle,.join-bubble{transition:none;animation:none}}
</style>
'''
