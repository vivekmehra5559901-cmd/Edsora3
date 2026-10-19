/* ================= Edsora backend client — the server is the source of truth ================= */
(function(){'use strict';
const $=s=>document.querySelector(s);
/* anything an older build kept on this device is purged: files never live in the browser */
try{['edsora.files','edsora.rows'].forEach(k=>localStorage.removeItem(k))}catch(e){}
store.files=[];store.rows=[];
function deviceId(){try{let d=localStorage.getItem('edsora.device');if(!d){d=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));localStorage.setItem('edsora.device',d)}return d}catch(e){return 'nodevice'}}
const tz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch(e){return 'UTC'}};

/* ---- toast: optional top placement, one clickable action, up to 15 s ---- */
toastX=function(msg,ms,o){o=o||{};const t=$('#toastX'),tx=$('#toastXText');
  if(o.html)tx.innerHTML=o.html;else tx.textContent=msg;
  t.classList.toggle('two-line',!o.html&&String(msg).indexOf('\n')>-1);t.classList.toggle('tx-top',!!o.top);t.classList.toggle('tx-act',!!o.onClick);
  window._txAct=o.onClick||null;t.classList.add('show');t.setAttribute('aria-hidden','false');clearTimeout(window._toastX);window._toastX=setTimeout(hideToastX,Math.min(15000,ms||5000))};
$('#toastX').addEventListener('click',e=>{const b=e.target.closest('.tx-actbtn');if(b&&window._txAct){const f=window._txAct;window._txAct=null;hideToastX();f()}});

/* ---- offline toast (stays until the connection is back) ---- */
const Net={el:null,shown:false,
  build(){if(this.el)return;const d=document.createElement('div');d.className='toast-x net-toast';d.setAttribute('role','alert');d.setAttribute('aria-live','assertive');d.setAttribute('aria-hidden','true');
    d.innerHTML='<span class="nt-ic">'+window.__NC_SVG+'</span><span class="tx-text">You\u2019re offline. Check your internet connection and try again.</span><button type="button" class="tx-close nt-retry" aria-label="Retry connection"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg></button>';
    document.body.appendChild(d);this.el=d;d.querySelector('.nt-retry').onclick=()=>this.retry()},
  show(){this.build();this.shown=true;this.el.classList.add('show');this.el.setAttribute('aria-hidden','false')},
  hide(){if(!this.el)return;this.shown=false;this.el.classList.remove('show');this.el.setAttribute('aria-hidden','true')},
  fail(){this.show()},ok(){if(this.shown&&navigator.onLine!==false)this.hide()},
  async retry(){const b=this.el&&this.el.querySelector('.nt-retry');if(b)b.classList.add('spin');
    try{const r=await fetch('/api/health',{cache:'no-store'});if(r.ok){this.hide();if(Sync.active)Sync.refresh().catch(()=>{})}}catch(e){}finally{if(b)setTimeout(()=>b.classList.remove('spin'),700)}}};
addEventListener('offline',()=>Net.show());addEventListener('online',()=>Net.retry());

/* ---- API ---- */
const Api={
  async token(force){try{return window.edsoraGetIdToken?await window.edsoraGetIdToken(force):null}catch(e){return null}},
  async req(method,path,body){
    for(let n=0;n<2;n++){
      const t=await this.token(n>0),h={'x-device-id':deviceId(),'x-tz':tz()};if(t)h.authorization='Bearer '+t;if(body!==undefined)h['content-type']='application/json';
      let r;try{r=await fetch(path,{method,headers:h,body:body!==undefined?JSON.stringify(body):undefined,cache:'no-store'})}catch(e){Net.fail();throw Object.assign(new Error('offline'),{code:'offline'})}
      Net.ok();
      if(r.status===401&&n===0&&t)continue;                                     /* token expired → refresh once and retry */
      const j=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(j.message||'Request failed'),{status:r.status,code:j.error,data:j});return j}},
  get:p=>Api.req('GET',p),post:(p,b)=>Api.req('POST',p,b||{}),put:(p,b)=>Api.req('PUT',p,b),patch:(p,b)=>Api.req('PATCH',p,b),del:p=>Api.req('DELETE',p),
  /* turns a failed request into the right message; returns true when it was handled */
  fail(e){if(!e)return false;if(e.code==='offline')return true;
    if(e.code==='pro_required'||e.status===402){try{window.openPaywall(null)}catch(_){toastX(e.message,6000)}return true}
    if(e.code==='unchanged_limit'){toastX(e.message,5000);return true}
    if(e.status===401){toastX('Please sign in again to continue.',6000);return true}
    toastX(e.message||'Something went wrong. Please try again.',6000);return true}};

/* ---- client-side rows use the SAME shared logic as the server (fee structure aware) ---- */
canonicalRows=function(raw){return edCanonicalRows(raw,store.fees)};
store.fees=null;store.stats=null;

/* ---- Sync ---- */
const KEYS={link:'edsora.paymentLink',fees:'edsora.feeStructure',school:'edsora.school'};
const Sync={active:false,version:0,me:null,state:null,skew:0,refBase:'',meta:new Map(),_m:null,q:Promise.resolve(),
  now(){return Date.now()+this.skew},
  enqueue(fn){const p=this.q.then(fn,fn);this.q=p.catch(()=>{});return p},
  setMe(me){this.me=me;this.skew=me.now-Date.now();const A=window.EdsoraAuth;if(A)A.setMe(me)},
  mirror(st){try{const s=st.settings||{};localStorage.setItem(KEYS.link,s.payLink||'');if(s.fees)localStorage.setItem(KEYS.fees,JSON.stringify(s.fees));else localStorage.removeItem(KEYS.fees);localStorage.setItem(KEYS.school,s.school||'')}catch(e){}},
  apply(st){
    this.state=st;this.version++;this._m=null;this.mirror(st);
    if(window.EdsoraDemo&&EdsoraDemo.applied)return;                              /* a running demo owns the screen */
    store.files=st.files.map(f=>({id:f.id,title:f.title,name:f.name,created:f.created,raw:f.raw,count:f.count,pinned:!!f.pinned}));
    store.rows=st.rows.map(r=>Object.assign({},r));store.fees=(st.settings&&st.settings.fees)||null;store.stats=st.stats;
    this.meta=new Map(store.files.map(f=>[f.id,{title:f.title,pinned:f.pinned}]));rebuild()},
  async boot(){
    try{const r=await Api.get('/api/state');this.active=true;this.setMe(r.me);this.apply(r.state);
      try{const ref=await Api.get('/api/referral');this.refBase=ref.url||''}catch(e){}
      document.dispatchEvent(new CustomEvent('edsora:synced',{detail:r}))}
    catch(e){if(e.code!=='offline')Api.fail(e)}},
  async refresh(){const r=await Api.get('/api/state');this.setMe(r.me);this.apply(r.state);return r},
  clear(){this.active=false;this.me=null;this.state=null;this._m=null;this.version++;store.files=[];store.rows=[];store.fees=null;store.stats=null;this.meta=new Map();
    try{Object.values(KEYS).forEach(k=>localStorage.removeItem(k))}catch(e){}
    const A=window.EdsoraAuth;if(A)A.srv=null;try{rebuild()}catch(e){}},
  async signOut(){try{await Api.post('/api/auth/signout')}catch(e){}},
  messages(){const v=this.version;if(this._m&&this._m.v===v)return Promise.resolve(this._m.list);
    return this.q.then(()=>Api.post('/api/messages')).then(r=>{this._m={v,list:r.messages};return r.messages})},
  pushEdit(id,text){return this.enqueue(async()=>{try{const r=await Api.put('/api/files/'+encodeURIComponent(id),{text});if(r.state)this.apply(r.state)}catch(e){Api.fail(e);try{await this.refresh()}catch(_){}}})},
  pushDelete(id){return this.enqueue(async()=>{try{const r=await Api.del('/api/files/'+encodeURIComponent(id));if(r.state)this.apply(r.state)}catch(e){Api.fail(e);try{await this.refresh()}catch(_){}}})},
  pushMeta(){if(!this.active)return Promise.resolve();return this.enqueue(async()=>{for(const f of store.files){if(f.demo)continue;const m=this.meta.get(f.id);if(!m)continue;const d={};if(f.title!==m.title)d.title=f.title;if(!!f.pinned!==!!m.pinned)d.pinned=!!f.pinned;
      if(Object.keys(d).length){try{await Api.patch('/api/files/'+encodeURIComponent(f.id),d);this.meta.set(f.id,{title:f.title,pinned:!!f.pinned})}catch(e){Api.fail(e)}}}})}};
window.EdsoraApi=Api;window.EdsoraSync=Sync;window.EdsoraNet=Net;

/* ---- file operations → server (client keeps its instant optimistic feel, server result always wins) ---- */
saveStore=function(){try{localStorage.setItem('edsora.theme',store.theme)}catch(e){}Sync.pushMeta()};
const _apply=applyFileEdit;applyFileEdit=function(id,text){const ok=_apply(id,text);if(ok&&Sync.active)Sync.pushEdit(id,text);return ok};
const _del=deleteFile;deleteFile=function(id){_del(id);if(Sync.active)Sync.pushDelete(id)};
importFile=async function(file){
  if(!Sync.active){toast('Please sign in first');return}
  try{
    const raw=await parseFile(file);if(!raw.length){toast('No readable rows found');return}
    const rawText=file.name.toLowerCase().endsWith('.xlsx')?JSON.stringify(raw,null,2):await file.text().catch(()=>'');
    const r=await Sync.enqueue(()=>Api.post('/api/files',{name:file.name,table:raw,raw:rawText}));
    if(r.unchanged){toast('File unchanged \u2014 nothing new to update');return}
    Sync.apply(r.state);
    toast(r.merged?`${r.changed} record${r.changed===1?'':'s'} updated`:(r.state.files.find(f=>f.id===r.fileId)||{}).count?`${r.state.files.find(f=>f.id===r.fileId).count} listings imported`:'Blank file uploaded');route('home')
  }catch(e){if(e&&e.code!=='offline'){if(!Api.fail(e))console.error(e)}else if(!e)toast('Import could not be completed')}};
/* signed-in live numbers come from the server's de-duplicated stats */
liveStats=function(){
  if(window.EdsoraDemo&&EdsoraDemo.applied)return;
  const s=store.stats,rows=store.rows,pend=rows.filter(r=>Number(r.pending)>0);
  const v=s?{processed:s.students,pending:s.pending,overdue:s.overdue,payments:s.paid,reminders:s.remaining}:{processed:rows.length,pending:pend.length,overdue:0,payments:rows.filter(r=>Number(r.paid)>0&&!(Number(r.pending)>0)).length,reminders:pend.length};
  Object.keys(v).forEach(k=>{const e=document.querySelector('[data-live="'+k+'"]');if(e)tweenEl(e,v[k],x=>String(Math.round(x)),700)})};
/* messages for signed-in real data are the approved WhatsApp template filled by the server */
const _gen=window.edsoraGenerateMessages;
window.edsoraGenerateMessages=function(rows){const D=window.EdsoraDemo;if((D&&D.wantMsgs())||!Sync.active||!store.rows.length||isBlankState())return _gen.apply(this,arguments);return Sync.messages().catch(e=>{if(e&&e.code!=='offline')Api.fail(e);return localMessages()})};
})();
