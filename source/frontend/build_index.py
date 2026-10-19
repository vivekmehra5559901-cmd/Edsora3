import re,sys,os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).resolve().parent))
from parts import *
SRC=str(ROOT/'reference_inputs'/'Edsora__8.html');OUT=str(ROOT/'DEPLOYABLE'/'index.html')
h=open(SRC,encoding='utf8').read()
def rep(old,new,count=1):
    global h
    n=h.count(old);assert n==count,(n,old[:90]);h=h.replace(old,new)
def between(a,b,new,keep_b=True):
    global h
    i=h.index(a);j=h.index(b,i);assert h.count(a)==1,(h.count(a),a[:60]);h=h[:i]+new+(h[j:] if keep_b else h[j+len(b):])
X='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>'
# ---------- head / PWA ----------
rep('<meta name="theme-color" content="#ffffff">','<meta name="theme-color" content="#ffffff">\n<link rel="manifest" href="/manifest.json">\n<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">\n<link rel="apple-touch-icon" href="/icons/icon-180.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="Edsora">')
# ---------- Firebase: config now comes from the backend (nothing hard-coded in the page) ----------
between('const firebaseConfig={','\nconst authState=', '''let firebaseConfig={};
try{const c=await Promise.race([fetch("/api/public-config",{cache:"no-store"}).then(r=>r.json()),new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),7000))]);firebaseConfig=c.firebase||{};window.edsoraPublicConfig=c}catch(e){firebaseConfig={}}
''')
rep('window.edsoraFirebaseAuth=auth;','window.edsoraFirebaseAuth=auth;window.edsoraGetIdToken=async f=>auth.currentUser?auth.currentUser.getIdToken(!!f):null;')
# ---------- paywall close + old auto video sheet ----------
rep('window.openPaywall=open;','window.openPaywall=open;window.closePaywall=function(){pending=null;close()};')

# ---------- dark account background ----------
rep(':root.dark body.acct-mode,:root.dark:has(body.acct-mode){background:#1A1918}',':root.dark body.acct-mode,:root.dark:has(body.acct-mode){background:#0A0A12}')
rep('--ac-page:#1A1918;--ac-row:#262524;--ac-text:#F1EFEA;--ac-sub:#9A968F;--ac-press:#302F2D;--ac-gap:#1A1918}','--ac-page:#0A0A12;--ac-row:#262524;--ac-text:#F1EFEA;--ac-sub:#9A968F;--ac-press:#302F2D;--ac-gap:#0A0A12}')
rep('background:linear-gradient(to bottom,rgba(26,25,24,0),#1A1918)}','background:linear-gradient(to bottom,rgba(10,10,18,0),#0A0A12)}')
# ---------- markup ----------
rep('<button class="acct-avatar" id="acctBtn" type="button" aria-label="Account &amp; Management" hidden><img alt="" decoding="async"></button>',
 '<span class="acct-wrap" id="acctWrap" hidden><svg class="sub-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" pathLength="100" stroke-dasharray="100 100"/></svg><button class="acct-avatar" id="acctBtn" type="button" aria-label="Account &amp; Management" hidden><img alt="" decoding="async"></button></span>')
rep('<div class="ac-groups" id="acGroups"></div>','<div class="ac-members" id="acMembers" hidden></div>\n      <div class="ac-groups" id="acGroups"></div>')
rep('<p class="bl-hint" id="blHint" hidden></p>','<p class="bl-hint" id="blHint" hidden></p>\n<p class="bl-info" id="blInfo" hidden></p><p class="bl-clock" id="blClock" hidden aria-live="off"></p>')
rep('<button class="pay-save" id="paySave" type="button">Save My Link</button>','<input class="pay-input" id="schoolInput" type="text" maxlength="80" autocomplete="organization" placeholder="Your school name (shown in messages)" aria-label="School name">\n      <button class="pay-save" id="paySave" type="button">Save My Link</button>')
rep('<p class="sp-line"><span>Had a seat link,</span><button type="button" class="sp-grab" id="spGrab">grab!</button></p>','<p class="sp-line"><span>Had a seat link,</span><button type="button" class="sp-grab" id="spGrab">grab!</button></p>'+SEATPOP_FORM)
# ---------- payment-link / fees → server ----------
rep('async function saveLinkToBackend(url){localStorage.setItem(KEY,url)}',"async function saveLinkToBackend(url){const sc=document.querySelector('#schoolInput'),r=await EdsoraApi.put('/api/settings',{payLink:url,school:sc?sc.value:''});localStorage.setItem(KEY,r.settings.payLink);localStorage.setItem('edsora.school',r.settings.school||'');await EdsoraSync.refresh().catch(()=>{})}")
rep('async function saveFeesToBackend(data){localStorage.setItem(KEY,JSON.stringify(data))}',"async function saveFeesToBackend(data){const r=await EdsoraApi.put('/api/settings',{fees:data});localStorage.setItem(KEY,JSON.stringify(r.settings.fees));await EdsoraSync.refresh().catch(()=>{})}")
# ---------- account module ----------
rep('const ALLOW_PREVIEW_SIGNIN=true;','const ALLOW_PREVIEW_SIGNIN=false;')
between('/* ---------- Auth state ---------- */','const norm=',AUTH_NEW)
between('async function setUser(u,announce){' if 'async function setUser' in h else 'function setUser(u,announce){','window.edsoraAuthChanged=',SETUSER_NEW)
rep("if(S.mock)Auth.user=norm(S.mock);\n","")
rep("    S.mock={uid:'preview-admin',displayName:'Edsora Admin',email:'admin@gmail.com',photoURL:'',mock:true};save();\n    setUser(S.mock,true);\n","    return;\n")
rep("  try{if(window.edsoraSignOut&&!(Auth.user&&Auth.user.mock))await window.edsoraSignOut()}catch(e){console.error(e)}","  try{await EdsoraSync.signOut()}catch(e){}\n  try{if(window.edsoraSignOut)await window.edsoraSignOut()}catch(e){console.error(e)}")
rep("$('#pwPro').addEventListener('click',()=>{if(Auth.user&&Auth.plan!=='pro'){Auth.setPlan('pro');say('Pro Plan activated');setTimeout(showPwa,2000)}},true);   /* payment backend later */",PAY_NEW)
i=h.index('function proStart(){');j=h.index("$('#dmCampX').onclick=hideCamp;");h=h[:i]+CAMPAIGN_NEW+h[j:]
between('/* ---------- Join / seats','/* ---------- Sign-up popover extras',SEATS_NEW)
between('/* ---------- Referral:',"$('#blBack').onclick=",REF_NEW)
rep("su.hidden=!!u;ab.hidden=!u;","su.hidden=!!u;ab.hidden=!u;const aw=$('#acctWrap');if(aw)aw.hidden=!u;")
rep("let dip=null,giftState='idle'","const pwaInstalled=()=>{try{return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true||localStorage.getItem('edsora.pwa.installed')==='1'}catch(e){return false}};\nlet dip=null,giftState='idle'")
rep("function showPwa(){\n  if(pwaOpen)return;","function showPwa(){\n  if(pwaOpen||pwaInstalled())return;")
rep("addEventListener('appinstalled',()=>{dip=null;closePwa();say('Edsora installed')});","addEventListener('appinstalled',()=>{dip=null;try{localStorage.setItem('edsora.pwa.installed','1')}catch(e){}closePwa();say('Edsora installed')});")
# ---------- inject scripts ----------
nc=open(ROOT/'reference_inputs'/'netconnect.html',encoding='utf8').read();svg=re.search(r'<svg.*?</svg>',nc,re.S).group(0)
svg=svg.replace('#2f2d33','currentColor').replace('class="icon"','class="nc-ic"')
for k in ['cut','halo','neg','pos','underB','underA','lowA','highA']:
    svg=svg.replace('id="%s"'%k,'id="nc_%s"'%k).replace('url(#%s)'%k,'url(#nc_%s)'%k).replace('href="#%s"'%k,'href="#nc_%s"'%k)
svg=re.sub(r'\s+',' ',svg);assert 'nc_cut' in svg
BE=open(ROOT/'source'/'frontend'/'backend.js',encoding='utf8').read();SH=open(ROOT/'source'/'src'/'shared.js',encoding='utf8').read().replace("if(typeof module!=='undefined')module.exports={edNorm,edFindVal,edParseCsv,edParseDue,edDigits,edStdOf,edFeeFor,edSkey,edFp,edCanonicalRows,edEffective,edOverdueDays,edTone,edTodayUTC,edStats,edWords};","")
EX=open(ROOT/'source'/'frontend'/'extras.js',encoding='utf8').read()
rep('<script id="edsora5-js">','<script id="edsora-shared">\n'+SH+'\n</script>\n<script id="edsora-backend">\nwindow.__NC_SVG='+repr(svg)+';\n'+BE+'\n</script>\n<script id="edsora5-js">')
rep('</body>','<script id="edsora-extras">\n'+EX+'\n</script>\n'+EXTRA_CSS.replace('.ac-av img{width:100%;height:100%;object-fit:cover;display:block}','.ac-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}')+'\n</body>')
rep('.ac-av:first-child{margin-left:0}.ac-av img{width:100%;height:100%;object-fit:cover;display:block}','.ac-av:first-child{margin-left:0}.ac-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}') if '.ac-av:first-child{margin-left:0}.ac-av img{width:100%' in h else None
open(OUT,'w',encoding='utf8').write(h);print('index.html',len(h))
