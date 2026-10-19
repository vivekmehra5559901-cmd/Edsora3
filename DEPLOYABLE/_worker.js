/* Edsora backend — Cloudflare Pages _worker.js (generated). Edit ONLY the SECRETS block at the top. */

/* ═══ 00_secrets.js ═══ */
/* ╔══════════════════════════════════════════════════════════════════════════════════╗
   ║  EDSORA — SECRETS                                                                ║
   ║  This block is the ONLY thing you ever edit in this ZIP.                         ║
   ║  Paste each key between the quotes. Leave anything you do not have as ''.        ║
   ║  This file runs on Cloudflare's server — it is never sent to a visitor's browser.║
   ╚══════════════════════════════════════════════════════════════════════════════════╝ */
const SECRETS = {

  /* ── 1 · LLM APIs — 10 keys: Gemini ×5 + Groq ×5 ──────────────────────────────────────
     Paste each key between the quotes. Empty slots are simply skipped.
     Edsora routes between all pasted keys by itself: it spreads the load across Gemini and
     Groq in turns, and if a key is rate-limited, out of quota or invalid it moves to the next
     one automatically — you never have to do anything else. */
  GEMINI_API_KEYS: [
    '',   // Gemini key 1
    '',   // Gemini key 2
    '',   // Gemini key 3
    '',   // Gemini key 4
    '',   // Gemini key 5
  ],
  GROQ_API_KEYS: [
    '',   // Groq key 1
    '',   // Groq key 2
    '',   // Groq key 3
    '',   // Groq key 4
    '',   // Groq key 5
  ],

  /* ── 2 · Backend APIs — Backblaze B2 cloud storage (your uploaded Excel/CSV files live here) ── */
  BACKBLAZE: {
    applicationKeyId: '',
    applicationKey: '',
    bucketName: '',
    bucketId: '',
    s3Endpoint: '',            // e.g.  s3.us-west-004.backblazeb2.com
  },

  /* ── 3 · PhonePe Autopay (UPI mandate) ─────────────────────────────────────────────────
     PHONEPE_CLIENT_ID / PHONEPE_CLIENT_SECRET / PHONEPE_CLIENT_VERSION: PhonePe Business Dashboard → Developer Settings → API Keys.
     Price: ₹2,499 charged at sign-up, then AUTOMATICALLY every 29 days. PhonePe has no "29-day" frequency, so Edsora creates a
     FIXED ₹2,499 on-demand mandate and sends PhonePe's pre-debit notice + auto-debit by itself 2 days before each 29-day period ends.
     Webhook URL to register (optional but recommended):  https://YOUR-DOMAIN/webhook/phonepe
     (Edsora never trusts a webhook blindly — it always re-checks the real status with PhonePe's API.)
     Test mode: set the Cloudflare variable PHONEPE_ENV = sandbox  (leave unset for live/production). */
  PHONEPE_CLIENT_ID: '',
  PHONEPE_CLIENT_SECRET: '',
  PHONEPE_CLIENT_VERSION: '',

  /* ── 4 · WhatsApp Business API (Meta) ────────────────────────────────────────────────
     Messages are sent with your APPROVED TEMPLATE (Meta requires this for business-initiated messages).
     Template name: edsora_fee_reminder   ·   Language: en   ·   Category: Utility   ·   Body (exactly):

       Hello {{1}}, this is a fee payment reminder from {{2}} regarding {{3}}. An amount of ₹{{4}} remains
       outstanding, with a due date of {{5}}. Kindly complete your payment using the payment link provided
       below: {{6}}. If you have already paid, please disregard this reminder.

     {{1}} Parent/Guardian name · {{2}} School name · {{3}} Student name · {{4}} Pending amount ·
     {{5}} Due date · {{6}} the payment link of the school that is sending the message. */
  WA_ACCESS_TOKEN: '',
  WA_PHONE_NUMBER_ID: '',      // the Phone Number ID (pasting the full  .../v26.0/ID/messages  URL also works)
  WA_TEMPLATE_NAME: 'edsora_fee_reminder',   // already filled — change only if you named your template differently
  WA_TEMPLATE_LANGUAGE: 'en',                // already filled — the template's language code

  /* ── 5 · Google Auth sign-in API — your Firebase web config (already filled in) ───────── */
  /* ── 6 · Admin Google accounts — admin access does NOT grant a paid subscription ── */
  ADMIN_EMAILS: [
    'admin1@example.com',
    'admin2@example.com',
  ],

  FIREBASE_WEB_CONFIG: {
    apiKey: "AIzaSyDMJ6xO-t-m_q6e_YYfp8ewGngb-YU_AYU",
    authDomain: "edsora-8ee49.firebaseapp.com",
    projectId: "edsora-8ee49",
    storageBucket: "edsora-8ee49.firebasestorage.app",
    messagingSenderId: "750571126704",
    appId: "1:750571126704:web:2de4f79f28932aaddea075",
    measurementId: "G-1Z9KCRP45J",
  },
};
/* ═══════════════════════════ END OF SECRETS — nothing below needs editing ═══════════════════════════ */

const ADMIN_EMAILS = SECRETS.ADMIN_EMAILS; // optional Cloudflare ADMIN_EMAILS overrides this list
const PRICE_PAISE = 249900, CURRENCY = 'INR', CYCLE_DAYS = 29, SEATS_PER_PLAN = 4, DEFAULT_COUNTRY_CODE = '91';
/* the approved WhatsApp template (kept here ONLY so the app can preview exactly what parents receive) */
const WA_TEMPLATE_BODY = 'Hello {{1}}, this is a fee payment reminder from {{2}} regarding {{3}}. An amount of \u20B9{{4}} remains outstanding, with a due date of {{5}}. Kindly complete your payment using the payment link provided below: {{6}}. If you have already paid, please disregard this reminder.';
const SEAT_BLOCK_AFTER_SENT = 200;   // a seat admin cannot start another campaign the same day once more than this many were sent
const MAX_ROWS = 10000, MAX_BODY = 8 * 1024 * 1024, UNCHANGED_LIMIT = 5;

const WA_API_VERSION = 'v26.0';
function cfg(env) {
  const pick = (a, b) => (a !== undefined && a !== null && String(a).trim() !== '' ? String(a).trim() : String(b || '').trim());
  const list = (envV, arr) => (envV ? String(envV).split(',') : (arr || [])).map(x => String(x || '').trim()).filter(Boolean);
  const fb = SECRETS.FIREBASE_WEB_CONFIG || {}, bb = SECRETS.BACKBLAZE || {};
  let phoneId = pick(env.WA_PHONE_NUMBER_ID, SECRETS.WA_PHONE_NUMBER_ID), ver = WA_API_VERSION;
  const um = /graph\.facebook\.com\/(v[\d.]+)\/(\d+)/i.exec(phoneId); if (um) { ver = um[1]; phoneId = um[2]; }   // accepts the full URL too
  return {
    gemini: list(env.GEMINI_API_KEYS, SECRETS.GEMINI_API_KEYS), groq: list(env.GROQ_API_KEYS, SECRETS.GROQ_API_KEYS),
    b2: { keyId: pick(env.B2_KEY_ID, bb.applicationKeyId), key: pick(env.B2_KEY, bb.applicationKey), bucket: pick(env.B2_BUCKET, bb.bucketName), bucketId: pick(env.B2_BUCKET_ID, bb.bucketId), endpoint: pick(env.B2_ENDPOINT, bb.s3Endpoint) },
    ppId: pick(env.PHONEPE_CLIENT_ID, SECRETS.PHONEPE_CLIENT_ID), ppSecret: pick(env.PHONEPE_CLIENT_SECRET, SECRETS.PHONEPE_CLIENT_SECRET), ppVersion: pick(env.PHONEPE_CLIENT_VERSION, SECRETS.PHONEPE_CLIENT_VERSION), ppEnv: pick(env.PHONEPE_ENV, '').toLowerCase(), ppBase: pick(env.PHONEPE_API_BASE, ''),
    ppWhUser: pick(env.PHONEPE_WEBHOOK_USERNAME, ''), ppWhPass: pick(env.PHONEPE_WEBHOOK_PASSWORD, ''),
    wa: { token: pick(env.WA_ACCESS_TOKEN, SECRETS.WA_ACCESS_TOKEN), phoneId, template: pick(env.WA_TEMPLATE_NAME, SECRETS.WA_TEMPLATE_NAME), lang: pick(env.WA_TEMPLATE_LANGUAGE, SECRETS.WA_TEMPLATE_LANGUAGE) || 'en', version: ver },
    fb: { apiKey: pick(env.FIREBASE_API_KEY, fb.apiKey), authDomain: pick(env.FIREBASE_AUTH_DOMAIN, fb.authDomain), projectId: pick(env.FIREBASE_PROJECT_ID, fb.projectId), storageBucket: pick(env.FIREBASE_STORAGE_BUCKET, fb.storageBucket), messagingSenderId: pick(env.FIREBASE_SENDER_ID, fb.messagingSenderId), appId: pick(env.FIREBASE_APP_ID, fb.appId), measurementId: pick(env.FIREBASE_MEASUREMENT_ID, fb.measurementId) },
    waBase: pick(env.WA_API_BASE, 'https://graph.facebook.com'), llmBase: pick(env.LLM_BASE_URL_OVERRIDE, ''),
    jwksUrl: pick(env.FIREBASE_JWKS_URL, 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
  };
}

/* ═══ 10_util.js ═══ */
const enc = new TextEncoder();
class HttpError extends Error { constructor(status, code, msg, extra) { super(msg || code); this.status = status; this.code = code; this.extra = extra || {}; } }
const err = (status, code, msg, extra) => new HttpError(status, code, msg, extra);
const J = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function hmacHex(secret, data) { const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return hex(await crypto.subtle.sign('HMAC', k, typeof data === 'string' ? enc.encode(data) : data)); }
function safeEq(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function sha256Hex(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
const rid = (n = 12) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
function b64uToBytes(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
const b64uToStr = s => new TextDecoder().decode(b64uToBytes(s));
const normEmail = e => String(e || '').trim().toLowerCase();
const getAdminEmails = env => (env && env.ADMIN_EMAILS ? String(env.ADMIN_EMAILS).split(',') : ADMIN_EMAILS).map(normEmail).filter(Boolean);
const isAdminEmail = (e, env) => getAdminEmails(env).includes(normEmail(e));
const validTz = tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; } };
async function readJson(request, max = MAX_BODY) {
  const len = Number(request.headers.get('content-length') || 0); if (len > max) throw err(413, 'too_large', 'That file is too large.');
  const t = await request.text(); if (t.length > max) throw err(413, 'too_large', 'That file is too large.');
  try { return t ? JSON.parse(t) : {}; } catch (e) { throw err(400, 'bad_json', 'The request could not be read.'); }
}
const cleanUrl = (u, httpsOnly = true) => { try { const x = new URL(String(u || '').trim()); if (x.protocol !== 'https:' && (httpsOnly || x.protocol !== 'http:')) return ''; return x.href; } catch (e) { return ''; } };

/* ═══ shared.js ═══ */
/* ===== EDSORA SHARED LOGIC — the SAME code runs in the browser and in the Cloudflare Worker ===== */
function edNorm(v){return String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'')}
function edFindVal(r,keys){for(const k of keys){const key=Object.keys(r).find(x=>edNorm(x)===edNorm(k)||edNorm(x).includes(edNorm(k)));if(key&&r[key]!==''&&r[key]!=null)return r[key]}return ''}
function edParseCsv(text){let rows=[],row=[],cell='',quote=false;text=String(text||'').replace(/^\uFEFF/,'');for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++}else quote=!quote}else if(c===','&&!quote){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()!==''))rows.push(row);row=[]}else cell+=c}row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);if(!rows.length)return [];const headers=rows.shift().map(x=>x.trim());return rows.map(a=>Object.fromEntries(headers.map((h,i)=>[h,(a[i]??'').trim()])))}
/* calendar dates are stored as UTC-midnight milliseconds so they never shift with the viewer's time zone */
function edParseDue(v){const s=String(v??'').trim();if(!s)return 0;
  if(/^\d{4,6}(\.\d+)?$/.test(s)){const n=Number(s);if(n>20000&&n<80000){const d=new Date(Math.round(n-25569)*864e5);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())}}
  let m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);if(m){let y=+m[3];if(y<100)y+=2000;return Date.UTC(y,+m[2]-1,+m[1])}
  m=s.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);if(m)return Date.UTC(+m[1],+m[2]-1,+m[3]);
  const t=Date.parse(s+(/\d{4}/.test(s)&&!/[zZ+]|GMT|UTC/.test(s)?' UTC':''));if(isNaN(t))return 0;const d=new Date(t);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())}
function edDigits(v){return String(v??'').replace(/\D+/g,'')}
function edStdOf(v){const m=String(v??'').trim().match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s*[-\/ ]?\s*([A-Za-z])?\b/i);return m?{n:+m[1],sec:(m[2]||'').toUpperCase()}:null}
/* Fees page structure: {standards:[{standard:6,sections:[{section:'A',fee:'1800'}]}]} */
function edFeeFor(std,fees){if(!std||!fees||!Array.isArray(fees.standards))return 0;const st=fees.standards.find(x=>+x.standard===std.n);if(!st)return 0;
  const secs=(st.sections||[]).map(s=>({s:String(s.section||'').toUpperCase(),f:Number(String(s.fee??'').replace(/[^0-9.]/g,''))||0})).filter(x=>x.f>0);if(!secs.length)return 0;
  if(std.sec){const x=secs.find(y=>y.s===std.sec);if(x)return x.f}
  const u=[...new Set(secs.map(x=>x.f))];return u.length===1?u[0]:0}
function edSkey(r){const p=edDigits(r.phone).slice(-10);return edNorm(r.student)+'|'+(p||edNorm(r.parent))}
function edFp(r){return [r.skey,+r.pending||0,+r.due||0,edDigits(r.phone).slice(-10),edNorm(r.parent)].join('|')}
const ED_PAID_RE=/^(paid|complete|completed|cleared|settled|received|done)\b/i,ED_PEND_RE=/^(pending|due|unpaid|overdue|partial|balance|not paid|outstanding)/i;
function edCanonicalRows(raw,fees){if(!raw||!raw.length)return [];const out=[];for(const r of raw){
  if(Object.values(r).every(v=>String(v??'').trim()===''))continue;
  const student=edFindVal(r,['student name','student','child name','child']),parent=edFindVal(r,['parent name','parent','father name','mother name','guardian']),phone=edFindVal(r,['phone','mobile','whatsapp','contact']),month=edFindVal(r,['month','fee month','billing month'])||'current month';
  const pendingRaw=edFindVal(r,['pending fees','pending amount','due amount','balance','pending']),paidRaw=edFindVal(r,['paid fees','paid amount','paid']),totalRaw=edFindVal(r,['total fees','fee amount','fees','amount']);
  const cls=String(edFindVal(r,['standard/class','standard','class','grade','std'])||'').trim();
  const statusRaw=String(edFindVal(r,['payment status','status'])).trim(),isPaid=ED_PAID_RE.test(statusRaw);
  const parseN=v=>Number(String(v).replace(/[^0-9.-]/g,''))||0;let pending=parseN(pendingRaw),paid=parseN(paidRaw),total=parseN(totalRaw);
  const feeStd=edFeeFor(edStdOf(cls),fees);
  if(isPaid){if(!paid)paid=total||pending||feeStd;pending=0;total=paid}
  else{if(!pending&&total&&paid)pending=Math.max(0,total-paid);if(!pending&&!paid&&!total&&feeStd&&ED_PEND_RE.test(statusRaw))pending=feeStd;if(!total)total=paid+pending}
  if(!student&&!parent&&!phone&&!pending&&!paid&&!total)continue;
  const row={student:student||'Student',parent:parent||'Parent',phone:String(phone||''),month,paid,pending,total,due:edParseDue(edFindVal(r,['due date','due on','deadline'])),status:statusRaw,std:cls};row.skey=edSkey(row);out.push(row)}return out}
/* account-level de-duplication: the same person across many files counts ONCE, the most recently updated file wins */
function edEffective(filesOldestFirst){const m=new Map();for(const f of filesOldestFirst)for(const r of f.rows)m.set(r.skey,Object.assign({},r,{fileId:f.id}));return [...m.values()]}
function edOverdueDays(due,todayUTC){return due?Math.max(0,Math.round((todayUTC-due)/864e5)):0}
function edTone(days){return days<30?1:days<60?2:days<90?3:days<120?4:5}
function edTodayUTC(tz,now){let k;try{k=new Intl.DateTimeFormat('en-CA',{timeZone:tz||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now==null?Date.now():now))}catch(e){k=new Date(now==null?Date.now():now).toISOString().slice(0,10)}const p=k.split('-').map(Number);return {key:k,utc:Date.UTC(p[0],p[1]-1,p[2])}}
function edStats(rows,todayUTC,doneSet){const s={students:rows.length,pending:0,newlyPending:0,pendingMonth:0,paid:0,overdue:0,paidAmount:0,pendingAmount:0,remaining:0};
  for(const r of rows){s.paidAmount+=+r.paid||0;s.pendingAmount+=+r.pending||0;
    if(+r.pending>0){s.pending++;const d=edOverdueDays(r.due,todayUTC);if(d>0)s.overdue++;if(d>=30)s.pendingMonth++;else s.newlyPending++;if(!doneSet||!doneSet.has(r.skey+'#'+edFp(r)))s.remaining++}
    else if(+r.paid>0)s.paid++}return s}
function edWords(t){const m=String(t||'').trim().match(/\S+/g);return m?m.length:0}

/* ═══ 25_storage.js ═══ */
/* ───────── Backblaze B2 (S3-compatible API, AWS Signature V4) ───────── */
const b2On = env => { const b = cfg(env).b2; return !!(b.keyId && b.key && b.bucket && b.endpoint); };
async function hmacRaw(key, data) { const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data))); }
/* returns {signature, signedHeaders, scope, canonical} — generic so it can be checked against AWS's published test vector */
async function sigv4(o) {
  const names = Object.keys(o.headers).map(h => h.toLowerCase()).sort(), hv = Object.fromEntries(Object.entries(o.headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const canonical = [o.method, o.path, o.query || '', names.map(n => n + ':' + hv[n] + '\n').join(''), names.join(';'), o.payloadHash].join('\n');
  const day = o.amzDate.slice(0, 8), scope = `${day}/${o.region}/${o.service}/aws4_request`, sts = ['AWS4-HMAC-SHA256', o.amzDate, scope, await sha256Hex(canonical)].join('\n');
  let k = await hmacRaw('AWS4' + o.secret, day); k = await hmacRaw(k, o.region); k = await hmacRaw(k, o.service); k = await hmacRaw(k, 'aws4_request');
  return { signature: hex(await hmacRaw(k, sts)), signedHeaders: names.join(';'), scope, canonical };
}
const encKey = k => k.split('/').map(s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
async function b2Req(env, method, key, body) {
  const b = cfg(env).b2, ep = b.endpoint.replace(/\/+$/, ''), base = /^https?:\/\//i.test(ep) ? ep : 'https://' + ep, u = new URL(base), region = (u.hostname.match(/^s3\.([^.]+)\./) || [])[1] || 'us-west-004';
  const path = '/' + encodeURIComponent(b.bucket) + '/' + encKey(key), payload = body === undefined ? '' : body, ph = await sha256Hex(payload), amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const headers = { host: u.host, 'x-amz-content-sha256': ph, 'x-amz-date': amzDate }, s = await sigv4({ method, host: u.host, path, headers, payloadHash: ph, amzDate, region, service: 's3', secret: b.key });
  const auth = `AWS4-HMAC-SHA256 Credential=${b.keyId}/${s.scope}, SignedHeaders=${s.signedHeaders}, Signature=${s.signature}`;
  return fetch(base + path, { method, headers: { 'x-amz-content-sha256': ph, 'x-amz-date': amzDate, authorization: auth, ...(body !== undefined ? { 'content-type': 'application/octet-stream' } : {}) }, body: body === undefined ? undefined : payload });
}
const blobKey = (id, kind) => `files/${id}/${kind === 'rows' ? 'rows.json' : 'raw.txt'}`;
async function b2Put(env, key, str) { const r = await b2Req(env, 'PUT', key, str); if (!r.ok) throw err(502, 'storage_error', 'File storage is temporarily unavailable. Please try again.'); }
async function b2Get(env, key) { const r = await b2Req(env, 'GET', key); if (r.status === 404) return null; if (!r.ok) throw err(502, 'storage_error', 'File storage is temporarily unavailable. Please try again.'); return r.text(); }
async function b2Del(env, key) { const r = await b2Req(env, 'DELETE', key); if (!r.ok && r.status !== 404 && r.status !== 204) throw err(502, 'storage_error', 'File storage is temporarily unavailable.'); }

/* ═══ 20_db.js ═══ */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users(uid TEXT PRIMARY KEY,email TEXT,name TEXT,photo TEXT,tz TEXT,created INTEGER,last_seen INTEGER)`,
  `CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT)`,
  `CREATE TABLE IF NOT EXISTS orders(order_id TEXT PRIMARY KEY,uid TEXT,amount INTEGER,currency TEXT,status TEXT,created INTEGER,payment_id TEXT)`,
  `CREATE TABLE IF NOT EXISTS payments(payment_id TEXT PRIMARY KEY,order_id TEXT,uid TEXT,amount INTEGER,currency TEXT,status TEXT,method TEXT,refunded INTEGER DEFAULT 0,created INTEGER)`,
  `CREATE TABLE IF NOT EXISTS webhook_events(event_id TEXT PRIMARY KEY,type TEXT,received INTEGER)`,
  `CREATE TABLE IF NOT EXISTS subscriptions(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_uid TEXT,status TEXT,source TEXT,started INTEGER,expires INTEGER,payment_id TEXT UNIQUE,created INTEGER)`,
  `CREATE INDEX IF NOT EXISTS sub_owner ON subscriptions(owner_uid)`,
  `CREATE TABLE IF NOT EXISTS pp_orders(order_id TEXT PRIMARY KEY,sub_key TEXT,uid TEXT,kind TEXT,amount INTEGER,status TEXT,cycle_end INTEGER,created INTEGER,updated INTEGER)`,
  `CREATE INDEX IF NOT EXISTS pp_sub ON pp_orders(sub_key,kind)`,
  `CREATE TABLE IF NOT EXISTS seats(seat_no INTEGER PRIMARY KEY,owner_uid TEXT,slot INTEGER,uid TEXT,device_id TEXT,claimed INTEGER,UNIQUE(owner_uid,slot))`,
  `CREATE INDEX IF NOT EXISTS seat_uid ON seats(uid)`,
  `CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,uid TEXT,title TEXT,name TEXT,created INTEGER,updated INTEGER,pinned INTEGER DEFAULT 0,count INTEGER DEFAULT 0,size INTEGER DEFAULT 0,sig TEXT)`,
  `CREATE INDEX IF NOT EXISTS file_uid ON files(uid)`,
  `CREATE TABLE IF NOT EXISTS file_parts(file_id TEXT,kind TEXT,idx INTEGER,data TEXT,PRIMARY KEY(file_id,kind,idx))`,
  `CREATE TABLE IF NOT EXISTS settings(uid TEXT PRIMARY KEY,pay_link TEXT,fees TEXT,school TEXT,updated INTEGER)`,
  `CREATE TABLE IF NOT EXISTS acct_stats(uid TEXT PRIMARY KEY,students INTEGER DEFAULT 0,parents INTEGER DEFAULT 0,files INTEGER DEFAULT 0,uploads INTEGER DEFAULT 0,updated INTEGER)`,
  `CREATE TABLE IF NOT EXISTS msg_cache(k TEXT PRIMARY KEY,uid TEXT,text TEXT,src TEXT,created INTEGER)`,
  `CREATE TABLE IF NOT EXISTS sent_log(id INTEGER PRIMARY KEY AUTOINCREMENT,uid TEXT,day TEXT,skey TEXT,fp TEXT,phone TEXT,text TEXT,status TEXT,wa_id TEXT,error TEXT,campaign TEXT,created INTEGER,UNIQUE(uid,day,skey,fp))`,
  `CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY,uid TEXT,day TEXT,status TEXT,total INTEGER,cursor INTEGER,sent INTEGER,failed INTEGER,queue TEXT,created INTEGER,updated INTEGER)`,
  `CREATE TABLE IF NOT EXISTS upload_dupes(uid TEXT,day TEXT,n INTEGER,PRIMARY KEY(uid,day))`,
  `CREATE TABLE IF NOT EXISTS config(k TEXT PRIMARY KEY,v TEXT)`,
  `CREATE TABLE IF NOT EXISTS rate(k TEXT PRIMARY KEY,n INTEGER,reset INTEGER)`,
  `CREATE TABLE IF NOT EXISTS errors(id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER,scope TEXT,msg TEXT)`,
  `INSERT OR IGNORE INTO meta(k,v) VALUES('seat_counter','0')`,
];
let SCHEMA_READY = null;
function DB(env) { if (!env.DB) throw err(503, 'db_unconfigured', 'The database is not connected yet. Add a D1 database binding named DB in Cloudflare Pages → Settings → Functions.'); return env.DB; }
async function ensureSchema(env) { const db = DB(env); if (!SCHEMA_READY) SCHEMA_READY = db.batch(SCHEMA.map(s => db.prepare(s))).catch(e => { SCHEMA_READY = null; throw e; }); await SCHEMA_READY; return db; }
const one = async (env, sql, ...b) => (await DB(env).prepare(sql).bind(...b).first()) || null;
const rows = async (env, sql, ...b) => (await DB(env).prepare(sql).bind(...b).all()).results || [];
const exec = async (env, sql, ...b) => DB(env).prepare(sql).bind(...b).run();
const stmt = (env, sql, ...b) => DB(env).prepare(sql).bind(...b);
const batch = (env, list) => DB(env).batch(list);
const CHUNK = 300000;
/* file contents live in Backblaze B2 when it is configured, otherwise in the database (so nothing breaks before the keys are pasted) */
async function putParts(env, id, kind, str) {
  str = String(str || ''); if (b2On(env)) { await b2Put(env, blobKey(id, kind), str); await exec(env, 'DELETE FROM file_parts WHERE file_id=?1 AND kind=?2', id, kind); return; }
  const db = DB(env), list = [db.prepare('DELETE FROM file_parts WHERE file_id=?1 AND kind=?2').bind(id, kind)];
  for (let i = 0, n = 0; i < str.length || n === 0; i += CHUNK, n++) list.push(db.prepare('INSERT INTO file_parts(file_id,kind,idx,data) VALUES(?1,?2,?3,?4)').bind(id, kind, n, str.slice(i, i + CHUNK)));
  await db.batch(list);
}
async function getParts(env, id, kind) {
  if (b2On(env)) { const v = await b2Get(env, blobKey(id, kind)); if (v !== null) return v; }
  return (await rows(env, 'SELECT data FROM file_parts WHERE file_id=?1 AND kind=?2 ORDER BY idx', id, kind)).map(r => r.data).join('');
}
async function delParts(env, id) { if (b2On(env)) { await b2Del(env, blobKey(id, 'rows')); await b2Del(env, blobKey(id, 'raw')); } await exec(env, 'DELETE FROM file_parts WHERE file_id=?1', id); }
async function limit(env, key, max, windowSec) {
  const now = Date.now(), r = await one(env, 'SELECT n,reset FROM rate WHERE k=?1', key);
  if (!r || r.reset < now) { await exec(env, 'INSERT OR REPLACE INTO rate(k,n,reset) VALUES(?1,1,?2)', key, now + windowSec * 1000); if (Math.random() < 0.02) await exec(env, 'DELETE FROM rate WHERE reset<?1', now); return; }
  if (r.n >= max) throw err(429, 'rate_limited', 'Too many requests. Please wait a moment and try again.', { retryAfter: Math.ceil((r.reset - now) / 1000) });
  await exec(env, 'UPDATE rate SET n=n+1 WHERE k=?1', key);
}
async function logError(env, scope, e) { try { const msg = String(e && e.message || e).replace(/[A-Za-z0-9_\-\/+=.]{24,}/g, '[redacted]').slice(0, 300); await exec(env, 'INSERT INTO errors(at,scope,msg) VALUES(?1,?2,?3)', Date.now(), scope, msg); } catch (x) {} }

/* ═══ 30_auth.js ═══ */
let JWKS = null, JWKS_AT = 0;
async function getJwks(env, force) {
  if (!force && JWKS && Date.now() - JWKS_AT < 3600e3) return JWKS;
  const r = await fetch(cfg(env).jwksUrl); if (!r.ok) throw err(503, 'auth_keys_unavailable', 'Sign-in verification is temporarily unavailable.');
  JWKS = (await r.json()).keys || []; JWKS_AT = Date.now(); return JWKS;
}
async function verifyIdToken(env, token) {
  const c = cfg(env), pid = c.fb.projectId; if (!pid) throw err(503, 'auth_unconfigured', 'Google sign-in is not configured on the server yet.');
  const parts = String(token || '').split('.'); if (parts.length !== 3) throw err(401, 'invalid_token', 'Please sign in again.');
  let head, claims; try { head = JSON.parse(b64uToStr(parts[0])); claims = JSON.parse(b64uToStr(parts[1])); } catch (e) { throw err(401, 'invalid_token', 'Please sign in again.'); }
  if (head.alg !== 'RS256' || !head.kid) throw err(401, 'invalid_token', 'Please sign in again.');
  let key = (await getJwks(env)).find(k => k.kid === head.kid); if (!key) key = (await getJwks(env, true)).find(k => k.kid === head.kid);
  if (!key) throw err(401, 'invalid_token', 'Please sign in again.');
  const ck = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', ck, b64uToBytes(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) throw err(401, 'invalid_token', 'Please sign in again.');
  const now = Math.floor(Date.now() / 1000);
  if (!(claims.exp > now) || !(claims.iat <= now + 300) || claims.aud !== pid || claims.iss !== 'https://securetoken.google.com/' + pid || !claims.sub || typeof claims.sub !== 'string' || (claims.auth_time && claims.auth_time > now + 300))
    throw err(401, 'expired_token', 'Your session expired. Please sign in again.');
  if (!claims.email || claims.email_verified !== true) throw err(403, 'email_unverified', 'Your Google email address is not verified.');
  if (claims.firebase && claims.firebase.sign_in_provider && claims.firebase.sign_in_provider !== 'google.com') throw err(403, 'provider_not_allowed', 'Only Google sign-in is supported.');
  return { uid: claims.sub, email: normEmail(claims.email), name: claims.name || '', photo: claims.picture || '' };
}
async function requireUser(env, request) {
  const h = request.headers.get('authorization') || ''; const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) throw err(401, 'missing_token', 'Please sign in with Google.');
  const u = await verifyIdToken(env, m[1]); await ensureSchema(env);
  const tzH = request.headers.get('x-tz'); const tz = tzH && validTz(tzH) ? tzH : 'UTC', now = Date.now();
  const row = await one(env, 'SELECT uid,last_seen,tz FROM users WHERE uid=?1', u.uid);
  if (!row) await exec(env, 'INSERT INTO users(uid,email,name,photo,tz,created,last_seen) VALUES(?1,?2,?3,?4,?5,?6,?6)', u.uid, u.email, u.name, u.photo, tz, now);
  else if (now - row.last_seen > 300000 || row.tz !== tz) await exec(env, 'UPDATE users SET email=?2,name=?3,photo=?4,tz=?5,last_seen=?6 WHERE uid=?1', u.uid, u.email, u.name, u.photo, tz, now);
  u.tz = tz; u.admin = isAdminEmail(u.email, env); u.device = String(request.headers.get('x-device-id') || '').slice(0, 64); return u;
}
async function requireAdmin(env, request) {
  const u = await requireUser(env, request);
  if (!u.admin) throw err(403, 'forbidden', 'This account is not authorised for the Edsora admin panel.');
  await limit(env, 'adm:' + u.uid, 240, 60); return u;
}

/* ═══ 40_files.js ═══ */
/* ───────── settings (payment link, fee structure) ───────── */
async function getSettings(env, uid) { const r = await one(env, 'SELECT * FROM settings WHERE uid=?1', uid); let fees = null; try { fees = r && r.fees ? JSON.parse(r.fees) : null; } catch (e) {} return { payLink: r ? r.pay_link || '' : '', fees, school: r ? r.school || '' : '' }; }
async function putSettings(env, uid, patch) {
  const cur = await getSettings(env, uid), next = { payLink: 'payLink' in patch ? patch.payLink : cur.payLink, fees: 'fees' in patch ? patch.fees : cur.fees, school: 'school' in patch ? patch.school : cur.school };
  await exec(env, 'INSERT INTO settings(uid,pay_link,fees,school,updated) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(uid) DO UPDATE SET pay_link=?2,fees=?3,school=?4,updated=?5', uid, next.payLink, next.fees ? JSON.stringify(next.fees) : null, next.school, Date.now()); return next;
}
function cleanPayLink(v) { let s = String(v || '').trim(); if (!s) return ''; if (s.length > 500 || /\s/.test(s)) throw err(400, 'bad_link', 'That payment link does not look valid.'); if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s; try { const u = new URL(s); if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw 0; return u.href; } catch (e) { throw err(400, 'bad_link', 'That payment link does not look valid.'); } }
function cleanFees(f) {
  if (f === null) return null; if (!f || !Array.isArray(f.standards) || f.standards.length > 20) throw err(400, 'bad_fees', 'The fee structure could not be read.');
  return { version: 1, savedAt: new Date().toISOString(), standards: f.standards.map(s => ({ standard: Math.max(1, Math.min(20, +s.standard | 0)), name: String(s.name || '').slice(0, 20), sections: (Array.isArray(s.sections) ? s.sections : []).slice(0, 10).map(x => ({ section: String(x.section || '').slice(0, 2).toUpperCase(), fee: String(x.fee ?? '').replace(/[^0-9.]/g, '').slice(0, 9) })) })) };
}
/* ───────── file storage helpers (raw header-keyed rows are the source of truth; amounts are derived on read) ───────── */
const listFiles = (env, uid) => rows(env, 'SELECT * FROM files WHERE uid=?1 ORDER BY updated ASC, created ASC', uid);
async function loadRaw(env, id) { const s = await getParts(env, id, 'rows'); try { return s ? JSON.parse(s) : []; } catch (e) { return []; } }
const rowSig = r => JSON.stringify([r.student, r.parent, String(r.phone || ''), +r.paid || 0, +r.pending || 0, +r.total || 0, +r.due || 0, r.month, r.std || '', r.status || '']);
const pairsOf = (table, fees) => table.map(r => ({ r, c: edCanonicalRows([r], fees)[0] })).filter(p => p.c);
async function loadAll(env, uid, fees) { const out = []; for (const f of await listFiles(env, uid)) { const raw = await loadRaw(env, f.id); out.push({ f, raw, rows: edCanonicalRows(raw, fees) }); } return out; }
async function refreshAcctStats(env, uid, loaded) {
  const s = await getSettings(env, uid); loaded = loaded || await loadAll(env, uid, s.fees);
  const eff = edEffective(loaded.map(x => ({ id: x.f.id, rows: x.rows }))), parents = new Set(eff.map(r => edNorm(r.parent)).filter(Boolean));
  await exec(env, 'INSERT INTO acct_stats(uid,students,parents,files,uploads,updated) VALUES(?1,?2,?3,?4,0,?5) ON CONFLICT(uid) DO UPDATE SET students=?2,parents=?3,files=?4,updated=?5', uid, eff.length, parents.size, loaded.length, Date.now());
}
async function noteUnchanged(env, uid, day) {
  const r = await one(env, 'SELECT n FROM upload_dupes WHERE uid=?1 AND day=?2', uid, day), n = (r ? r.n : 0) + 1;
  await exec(env, 'INSERT INTO upload_dupes(uid,day,n) VALUES(?1,?2,?3) ON CONFLICT(uid,day) DO UPDATE SET n=?3', uid, day, n);
  if (n >= UNCHANGED_LIMIT) throw err(429, 'unchanged_limit', '5 unchanged files detected. You\u2019ve reached the limit.');
  return n;
}
/* ───────── POST /api/files : add / update with account-wide de-duplication ───────── */
async function postFile(env, u, body) {
  const name = String(body.name || 'Untitled').slice(0, 120), table = Array.isArray(body.table) ? body.table.filter(r => r && typeof r === 'object') : null;
  if (!table) throw err(400, 'bad_request', 'No rows were received.'); if (table.length > MAX_ROWS) throw err(413, 'too_many_rows', 'A file can hold up to 10,000 rows.');
  await limit(env, 'up:' + u.uid, 40, 60);
  const settings = await getSettings(env, u.uid), fees = settings.fees, loaded = await loadAll(env, u.uid, fees), day = edTodayUTC(u.tz).key;
  const incoming = edCanonicalRows(table, fees); let target = null;
  if (body.mode === 'update' && body.targetId) { target = loaded.find(x => x.f.id === body.targetId); if (!target) throw err(404, 'not_found', 'That file no longer exists.'); }
  if (!target) { const nm = name.trim().toLowerCase(); target = loaded.find(x => String(x.f.name || '').trim().toLowerCase() === nm) || null; }
  const eff = new Map(edEffective(loaded.map(x => ({ id: x.f.id, rows: x.rows }))).map(r => [r.skey, r]));
  const base = target ? new Map(target.rows.map(r => [r.skey, r])) : eff;
  const changed = incoming.filter(r => { const b = base.get(r.skey); return !b || rowSig(b) !== rowSig(r); });
  const now = Date.now();
  if (!incoming.length) { if (target || loaded.some(x => !x.rows.length && String(x.f.name).toLowerCase() === name.toLowerCase())) { await noteUnchanged(env, u.uid, day); return { unchanged: true }; } }
  else if (!changed.length) { await noteUnchanged(env, u.uid, day); return { unchanged: true }; }
  let id, title, raw, rawRows, created = now;
  if (target) {
    id = target.f.id; title = target.f.title; created = target.f.created;
    const m = new Map(pairsOf(target.raw, fees).map(p => [p.c.skey, p])); for (const p of pairsOf(table, fees)) m.set(p.c.skey, p);
    rawRows = [...m.values()].map(p => p.r); raw = JSON.stringify(rawRows, null, 2);
  } else {
    id = now.toString(36) + rid(5); const n = loaded.filter(x => /^First File CSV #\d+$/.test(x.f.title)).length + 1; title = 'First File CSV #' + n;
    rawRows = table; raw = typeof body.raw === 'string' && body.raw.length < MAX_BODY ? body.raw : JSON.stringify(table, null, 2);
  }
  const count = edCanonicalRows(rawRows, fees).length;
  await savePartsBoth(env, id, rawRows, raw);
  await exec(env, 'INSERT INTO files(id,uid,title,name,created,updated,pinned,count,size,sig) VALUES(?1,?2,?3,?4,?5,?6,0,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET updated=?6,count=?7,size=?8,sig=?9', id, u.uid, title, name, created, now, count, raw.length, await sha256Hex(raw));
  await exec(env, 'INSERT INTO acct_stats(uid,students,parents,files,uploads,updated) VALUES(?1,0,0,0,1,?2) ON CONFLICT(uid) DO UPDATE SET uploads=uploads+1', u.uid, now);
  await refreshAcctStats(env, u.uid); return { fileId: id, merged: !!target, changed: changed.length };
}
async function savePartsBoth(env, id, rawRows, raw) { await putParts(env, id, 'rows', JSON.stringify(rawRows)); await putParts(env, id, 'raw', raw); }
function parseEditorText(text) { text = String(text || ''); if (/^\s*[\[{]/.test(text)) { let j; try { j = JSON.parse(text); } catch (e) { throw err(400, 'bad_format', 'Invalid file format'); } if (!Array.isArray(j)) throw err(400, 'bad_format', 'Invalid file format'); return j.filter(r => r && typeof r === 'object'); } return edParseCsv(text); }
/* ───────── PUT /api/files/:id : inline edit (saves into the stored file itself) ───────── */
async function putFile(env, u, id, body) {
  const f = await one(env, 'SELECT * FROM files WHERE id=?1 AND uid=?2', id, u.uid); if (!f) throw err(404, 'not_found', 'That file no longer exists.');
  await limit(env, 'up:' + u.uid, 60, 60);
  const text = String(body.text ?? ''), table = parseEditorText(text); if (table.length > MAX_ROWS) throw err(413, 'too_many_rows', 'A file can hold up to 10,000 rows.');
  const settings = await getSettings(env, u.uid), rowsNew = edCanonicalRows(table, settings.fees);
  if (!rowsNew.length) throw err(422, 'empty', 'No readable rows found');
  const bad = rowsNew.findIndex(r => !(+r.paid > 0 || +r.pending > 0)); if (bad >= 0) throw err(422, 'fee_missing', 'Please edit both student sections. A student cannot have both \u20B90 pending and \u20B90 paid.', { index: bad });
  const old = edCanonicalRows(await loadRaw(env, id), settings.fees), sg = a => JSON.stringify(a.map(rowSig));
  if (old.length && sg(old) === sg(rowsNew)) return { unchanged: true };
  await savePartsBoth(env, id, table, text);
  await exec(env, 'UPDATE files SET updated=?2,count=?3,size=?4,sig=?5 WHERE id=?1', id, Date.now(), rowsNew.length, text.length, await sha256Hex(text));
  await refreshAcctStats(env, u.uid); return { fileId: id };
}
async function patchFile(env, u, id, body) {
  const f = await one(env, 'SELECT id FROM files WHERE id=?1 AND uid=?2', id, u.uid); if (!f) throw err(404, 'not_found', 'That file no longer exists.');
  if (typeof body.title === 'string') await exec(env, 'UPDATE files SET title=?2 WHERE id=?1', id, body.title.trim().slice(0, 60) || 'Untitled');
  if (typeof body.pinned === 'boolean') await exec(env, 'UPDATE files SET pinned=?2 WHERE id=?1', id, body.pinned ? 1 : 0);
}
async function deleteFileRec(env, u, id) {
  const f = await one(env, 'SELECT id FROM files WHERE id=?1 AND uid=?2', id, u.uid); if (!f) return;
  await delParts(env, id); await exec(env, 'DELETE FROM files WHERE id=?1', id); await refreshAcctStats(env, u.uid);
}
/* ───────── GET /api/state : everything the app shows, already de-duplicated and fee-resolved ───────── */
async function sentSet(env, uid, day) { return new Set((await rows(env, "SELECT skey,fp FROM sent_log WHERE uid=?1 AND day=?2 AND status='sent'", uid, day)).map(r => r.skey + '#' + r.fp)); }
async function buildState(env, u) {
  const settings = await getSettings(env, u.uid), loaded = await loadAll(env, u.uid, settings.fees), td = edTodayUTC(u.tz);
  const eff = edEffective(loaded.map(x => ({ id: x.f.id, rows: x.rows }))), done = await sentSet(env, u.uid, td.key);
  const camp = await one(env, "SELECT id,status,total,cursor,sent,failed FROM campaigns WHERE uid=?1 AND day=?2 AND status IN ('paused','running') ORDER BY created DESC LIMIT 1", u.uid, td.key);
  const sentToday = (await one(env, "SELECT count(*) c FROM sent_log WHERE uid=?1 AND day=?2 AND status='sent'", u.uid, td.key)).c;
  const files = []; for (const x of loaded) files.push({ id: x.f.id, title: x.f.title, name: x.f.name, created: x.f.created, pinned: !!x.f.pinned, count: x.rows.length, raw: await getParts(env, x.f.id, 'raw') });
  return { now: Date.now(), today: td.key, files, rows: eff, settings, stats: Object.assign(edStats(eff, td.utc, done), { sentToday }), blank: loaded.length > 0 && !eff.length, campaign: camp || null };
}
/* ───────── CSV / XLSX writers (admin downloads) ───────── */
function tableOf(rawRows) { const heads = []; for (const r of rawRows) for (const k of Object.keys(r)) if (!heads.includes(k)) heads.push(k); return { heads, body: rawRows.map(r => heads.map(h => r[h] ?? '')) }; }
const csvCell = v => { v = String(v ?? ''); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const toCsv = rawRows => { const t = tableOf(rawRows); return '\uFEFF' + [t.heads, ...t.body].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'; };
let CRC_T = null; function crc32(b) { if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } } let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files) {
  const parts = [], central = []; let off = 0; const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const f of files) { const nm = enc.encode(f.name), d = f.data, c = crc32(d);
    const lh = Uint8Array.from([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0x21, 0, 0, ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(nm.length), 0, 0, ...nm]); parts.push(lh, d);
    central.push(Uint8Array.from([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0x21, 0, 0, ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(nm.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(off), ...nm])); off += lh.length + d.length; }
  const cs = central.reduce((a, b) => a + b.length, 0), end = Uint8Array.from([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cs), ...u32(off), 0, 0]);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0; for (const a of all) { out.set(a, p); p += a.length; } return out;
}
const xmlEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
function colName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function toXlsx(rawRows) {
  const t = tableOf(rawRows), all = [t.heads, ...t.body];
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    all.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => { const ref = colName(ci) + (ri + 1); return typeof v === 'number' && isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`; }).join('') + '</row>').join('') + '</sheetData></worksheet>';
  const F = (name, str) => ({ name, data: enc.encode(str) });
  return zipStore([F('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    F('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    F('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    F('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    F('xl/worksheets/sheet1.xml', sheet)]);
}

/* ═══ 50_llm.js ═══ */
/* ───────── WhatsApp template messages ─────────
   Meta's rule: business-initiated messages must use the APPROVED template, so the wording is fixed. Each message is the template
   with six variables filled from the school's own data. The LLM never rewrites the template — it is only used to tidy a messy NAME
   (symbols, digits, "S/O …" tails). It may remove or re-case characters but can never add any, so it cannot invent anything. */
const TONE_NAMES = { 1: 'Newly pending', 2: 'Pending ~1 month', 3: 'Pending ~2 months', 4: 'Pending ~3 months', 5: 'Pending 4+ months' };
const NAME_SYSTEM = `You clean up person names found in a school's fee spreadsheet. For each item return only the person's clean name.
Rules: fix capitalisation and spacing; remove digits, symbols, honorific clutter and relationship text such as "S/O", "D/O", "W/O", "C/O" together with everything after it.
NEVER add, invent, translate, expand, reorder or guess any letters or words — the answer must be made only of characters already present in the input.
Output only a JSON array like [{"i":0,"name":"Clean Name"}] with one object per item, nothing else.`;
const inrPlain = n => Number(n || 0).toLocaleString('en-IN');
const dueText = due => due ? new Date(due).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) : null;
const titleCase = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s\-'\u2019.])([a-z\u00C0-\u024F])/g, (m, a, b) => a + b.toUpperCase());
const needsTidy = s => /[0-9_@#$%^&*()+=<>|\\\/]/.test(String(s || '')) || String(s || '').trim().length > 40;
const roughTidy = s => titleCase(String(s || '').replace(/\b[sdwc]\s*\/\s*o\b.*$/i, '').replace(/[0-9_@#$%^&*()+=<>|\\\/]/g, ' ').replace(/\s+/g, ' ')).slice(0, 60) || 'Parent';
const waClean = (t, max = 60) => String(t == null ? '' : t).replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max);
const renderTemplate = v => WA_TEMPLATE_BODY.replace(/\{\{(\d)\}\}/g, (m, i) => v[i - 1]);
/* ───────── LLM routing: Gemini ×5 + Groq ×5, interleaved, rotated per call, with automatic fail-over ───────── */
const LLM_PROVIDERS = {
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', models: ['gemini-2.5-flash', 'gemini-2.0-flash'] },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] },
};
const KEY_COOL = new Map(); let RR_POS = 0;
function llmPool(env) { const c = cfg(env), g = c.gemini.map((k, i) => ({ p: 'gemini', k, id: 'g' + i })), q = c.groq.map((k, i) => ({ p: 'groq', k, id: 'q' + i })), out = [];
  for (let i = 0; i < Math.max(g.length, q.length); i++) { if (g[i]) out.push(g[i]); if (q[i]) out.push(q[i]); } return out; }
const llmStatus = env => ({ gemini: cfg(env).gemini.length, groq: cfg(env).groq.length });
async function callLLM(env, system, userPayload) {
  const pool = llmPool(env), c = cfg(env); if (!pool.length) throw new Error('llm_unconfigured');
  const start = RR_POS++ % pool.length, order = pool.map((_, i) => pool[(start + i) % pool.length]), now = Date.now();
  const ready = order.filter(x => (KEY_COOL.get(x.id) || 0) <= now), tryList = ready.length ? ready : order; let last = '';
  for (const key of tryList) {
    const P = LLM_PROVIDERS[key.p], url = c.llmBase ? c.llmBase.replace(/\/$/, '') + '/' + key.p + '/v1/chat/completions' : P.url;
    for (const model of P.models) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + key.k, 'content-type': 'application/json' }, body: JSON.stringify({ model, temperature: 0.4, messages: [{ role: 'system', content: system }, { role: 'user', content: userPayload }] }) });
        if (r.status === 404 || r.status === 400) { last = key.p + ' ' + r.status; continue; }                       // model unavailable → next model
        if (r.status === 429) { const ra = Number(r.headers.get('retry-after')) || 60; KEY_COOL.set(key.id, Date.now() + Math.min(ra, 600) * 1000); last = key.p + ' 429'; break; }
        if (r.status === 401 || r.status === 403) { KEY_COOL.set(key.id, Date.now() + 3600e3); last = key.p + ' ' + r.status; break; }
        if (!r.ok) { KEY_COOL.set(key.id, Date.now() + 15e3); last = key.p + ' ' + r.status; break; }
        const j = await r.json(), text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '', m = /\[[\s\S]*\]/.exec(text);
        if (!m) { last = 'no json'; continue; } const arr = JSON.parse(m[0]); if (Array.isArray(arr)) return arr;
      } catch (e) { KEY_COOL.set(key.id, Date.now() + 15e3); last = e.message; break; }
    }
  }
  throw new Error('llm_failed:' + last);
}

async function tidyNames(env, u, names, plan) {
  const out = new Map(), todo = [];
  for (const n of new Set(names)) { if (!needsTidy(n)) { out.set(n, titleCase(n)); continue; }
    const k = 'nm|' + await sha256Hex(n), c = await one(env, 'SELECT text FROM msg_cache WHERE k=?1', k); if (c) { out.set(n, c.text); continue; } todo.push({ n, k }); }
  for (let b = 0; b < todo.length; b += 20) {
    const slice = todo.slice(b, b + 20); let got = {};
    if (plan === 'pro' && llmPool(env).length) { try { const arr = await callLLM(env, NAME_SYSTEM, JSON.stringify({ items: slice.map((x, i) => ({ i, name: x.n })) }));
      for (const o of arr) { const x = slice[o.i]; if (!x || typeof o.name !== 'string') continue; const a = edNorm(x.n), r = edNorm(o.name); if (o.name.length <= 60 && r.length >= 2 && a.includes(r)) got[o.i] = waClean(o.name); } } catch (e) { await logError(env, 'llm', e); } }
    for (let i = 0; i < slice.length; i++) { const v = got[i] || roughTidy(slice[i].n); out.set(slice[i].n, v); if (plan === 'pro') await exec(env, 'INSERT OR REPLACE INTO msg_cache(k,uid,text,src,created) VALUES(?1,?2,?3,?4,?5)', slice[i].k, u.uid, v, got[i] ? 'llm' : 'rule', Date.now()); }
  }
  return out;
}
/* returns [{text, vars, source, tone}] aligned with pendingRows — `vars` are the six template parameters sent to WhatsApp */
async function messagesFor(env, u, pendingRows, settings, plan) {
  const td = edTodayUTC(u.tz), names = await tidyNames(env, u, pendingRows.flatMap(r => [r.parent, r.student]), plan), school = waClean(settings.school || 'the school office');
  return pendingRows.map(r => {
    const days = edOverdueDays(r.due, td.utc), vars = [waClean(names.get(r.parent) || r.parent), school, waClean(names.get(r.student) || r.student), inrPlain(r.pending), dueText(r.due) || 'this month', waClean(settings.payLink || 'your school\u2019s payment link', 500)];
    return { text: renderTemplate(vars), vars, source: 'template', tone: edTone(days) };
  });
}

/* ═══ 60_campaign.js ═══ */
const waText = t => String(t || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 1000);
function e164(raw) { let d = edDigits(raw).replace(/^0+/, ''); if (d.length === 10) d = DEFAULT_COUNTRY_CODE + d; return d.length >= 11 && d.length <= 15 ? d : null; }
/* sends the APPROVED template with the six variables — Meta forbids rewriting a template per message */
async function waSend(env, phone, vars) {
  const k = cfg(env), w = k.wa; if (!w.token || !w.phoneId) throw err(503, 'wa_unconfigured', 'WhatsApp sending is not connected yet.'); if (!w.template) throw err(503, 'wa_unconfigured', 'Add your approved WhatsApp template name.');
  const body = { messaging_product: 'whatsapp', to: phone, type: 'template', template: { name: w.template, language: { code: w.lang }, components: [{ type: 'body', parameters: vars.map(v => ({ type: 'text', text: waClean(v, 1000) })) }] } };
  const r = await fetch(`${k.waBase}/${w.version}/${w.phoneId}/messages`, { method: 'POST', headers: { authorization: 'Bearer ' + w.token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) return { ok: false, error: String((j.error && j.error.message) || 'HTTP ' + r.status).slice(0, 200) };
  return { ok: true, id: j.messages && j.messages[0] && j.messages[0].id || '' };
}
async function proPlan(env, u) { const me = await buildMe(env, u, Date.now()); return me; }
async function pendingFor(env, u) {
  const settings = await getSettings(env, u.uid), loaded = await loadAll(env, u.uid, settings.fees), td = edTodayUTC(u.tz);
  const eff = edEffective(loaded.map(x => ({ id: x.f.id, rows: x.rows }))); return { settings, loaded, td, eff, pend: eff.filter(r => +r.pending > 0) };
}
/* POST /api/messages */
async function apiMessages(env, u) {
  await limit(env, 'msg:' + u.uid, 40, 60); const me = await buildMe(env, u, Date.now()), { settings, pend } = await pendingFor(env, u);
  const list = await messagesFor(env, u, pend, settings, me.plan);
  return { messages: list.map(x => x.text), meta: list.map((x, i) => ({ skey: pend[i].skey, tone: x.tone, source: x.source })) };
}
/* POST /api/campaign/start */
async function campaignStart(env, u, realMe) {
  const me = await buildMe(env, u, Date.now()); if (me.plan !== 'pro') throw err(402, 'pro_required', 'Upgrade to Pro to start a campaign.');
  await limit(env, 'camp:' + u.uid, 20, 60);
  const { settings, loaded, td, eff, pend } = await pendingFor(env, u);
  if (!loaded.length || !eff.length) throw err(400, 'blank', 'Blank Excel files cannot start a campaign.');
  if (!settings.payLink) throw err(400, 'paylink_required', 'Add your payment link before starting a campaign.');
  const done = await sentSet(env, u.uid, td.key), queue = pend.filter(r => !done.has(r.skey + '#' + edFp(r))).map(r => ({ k: r.skey, fp: edFp(r) }));
  const completedToday = !!(await one(env, "SELECT id FROM campaigns WHERE uid=?1 AND day=?2 AND status='done' LIMIT 1", u.uid, td.key));
  if (realMe && realMe.role === 'member') { const workspace = realMe._ws || u.uid; /* Count actual successful sends, not campaign-row counters: aborted/restarted campaign rows must not erase the day's shared-seat usage. */ const s = await one(env, "SELECT COUNT(*) n FROM sent_log WHERE day=?1 AND status='sent' AND uid IN (SELECT uid FROM seats WHERE owner_uid=?2 AND uid IS NOT NULL UNION SELECT ?2)", td.key, workspace); if (s.n > SEAT_BLOCK_AFTER_SENT) throw err(403, 'seat_same_day', "Today's campaign has already been completed by your subscription owner or another seat admin. Restarting campaigns for the same numbers multiple times in a single day is not permitted. Please try again tomorrow."); }
  await exec(env, "UPDATE campaigns SET status='aborted',updated=?3 WHERE uid=?1 AND day=?2 AND status IN ('running','paused')", u.uid, td.key, Date.now());
  if (!queue.length) return { total: 0, notice: completedToday ? 'same_day' : (pend.length ? 'same_day' : 'none') };
  const id = 'c' + Date.now().toString(36) + rid(4), now = Date.now();
  await exec(env, "INSERT INTO campaigns(id,uid,day,status,total,cursor,sent,failed,queue,created,updated) VALUES(?1,?2,?3,'running',?4,0,0,0,?5,?6,?6)", id, u.uid, td.key, queue.length, JSON.stringify(queue), now);
  return { id, total: queue.length, cursor: 0, keys: queue.map(q => q.k), notice: completedToday ? 'same_day' : null };
}
async function loadCampaign(env, u, id) { const c = await one(env, 'SELECT * FROM campaigns WHERE id=?1 AND uid=?2', id, u.uid); if (!c) throw err(404, 'not_found', 'That campaign no longer exists.'); return c; }
/* POST /api/campaign/step — sends the next few messages. Safe to call repeatedly or in parallel: the slice is claimed atomically
   and every message is reserved in sent_log first, so nothing is ever sent twice on the same day. */
async function campaignStep(env, u, body) {
  let c = await loadCampaign(env, u, String(body.id || '')); if (c.status === 'done') return { ...progress(c), done: true };
  if (c.status === 'paused' || c.status === 'aborted') return { ...progress(c), paused: true };
  const me = await buildMe(env, u, Date.now()); if (me.plan !== 'pro') throw err(402, 'pro_required', 'Upgrade to Pro to continue.');
  await limit(env, 'step:' + u.uid, 120, 60);
  const queue = JSON.parse(c.queue), n = Math.max(1, Math.min(10, +body.n || 5)), from = c.cursor, to = Math.min(queue.length, from + n);
  const claim = await exec(env, "UPDATE campaigns SET cursor=?3,updated=?4 WHERE id=?1 AND cursor=?2 AND status='running'", c.id, from, to, Date.now());
  if (claim.meta.changes === 0) return { ...progress(await loadCampaign(env, u, c.id)), busy: true };
  const { settings, td, eff } = await pendingFor(env, u), byKey = new Map(eff.map(r => [r.skey, r])), slice = queue.slice(from, to);
  const rowsSel = slice.map(q => byKey.get(q.k)).filter(r => r && +r.pending > 0), msgs = rowsSel.length ? await messagesFor(env, u, rowsSel, settings, 'pro') : [], msgOf = new Map(rowsSel.map((r, i) => [r.skey, msgs[i]]));
  let sent = 0, failed = 0; const results = [];
  for (const q of slice) {
    const r = byKey.get(q.k);
    if (!r || +r.pending <= 0 || edFp(r) !== q.fp) { results.push({ skipped: true }); continue; }          // paid or edited since the queue was made
    const phone = e164(r.phone), text = msgOf.get(q.k).text;
    if (!phone) { await reserveSend(env, u.uid, td.key, q, r.phone, text, c.id); await finishSend(env, u.uid, td.key, q, 'failed', '', 'invalid phone number'); failed++; results.push({ ok: false }); continue; }
    if (!(await reserveSend(env, u.uid, td.key, q, phone, text, c.id))) { results.push({ skipped: true }); continue; }
    let res; try { res = await waSend(env, phone, msgOf.get(q.k).vars); } catch (e) { await finishSend(env, u.uid, td.key, q, 'failed', '', e.message); await exec(env, "UPDATE campaigns SET status='paused',cursor=?2,updated=?3 WHERE id=?1", c.id, queue.indexOf(q), Date.now()); throw e; }
    if (res.ok) { sent++; await finishSend(env, u.uid, td.key, q, 'sent', res.id, ''); } else { failed++; await finishSend(env, u.uid, td.key, q, 'failed', '', res.error); }
    results.push({ ok: res.ok });
  }
  const finished = to >= queue.length; await exec(env, 'UPDATE campaigns SET sent=sent+?2,failed=failed+?3,status=CASE WHEN ?4=1 THEN \'done\' ELSE status END,updated=?5 WHERE id=?1', c.id, sent, failed, finished ? 1 : 0, Date.now());
  const fresh = await loadCampaign(env, u, c.id); return { ...progress(fresh), done: fresh.status === 'done', results };
}
const progress = c => ({ id: c.id, total: c.total, cursor: c.cursor, sent: c.sent, failed: c.failed, status: c.status });
async function reserveSend(env, uid, day, q, phone, text, campaign) {
  const masked = '******' + edDigits(phone).slice(-4), now = Date.now();
  const r = await exec(env, "INSERT INTO sent_log(uid,day,skey,fp,phone,text,status,wa_id,error,campaign,created) VALUES(?1,?2,?3,?4,?5,?6,'queued','','',?7,?8) ON CONFLICT(uid,day,skey,fp) DO UPDATE SET status='queued',campaign=?7,created=?8 WHERE sent_log.status='failed' OR (sent_log.status='queued' AND sent_log.created<?9)", uid, day, q.k, q.fp, masked, text, campaign, now, now - 120000);
  return r.meta.changes > 0;
}
const finishSend = (env, uid, day, q, status, waId, error) => exec(env, 'UPDATE sent_log SET status=?5,wa_id=?6,error=?7,created=?8 WHERE uid=?1 AND day=?2 AND skey=?3 AND fp=?4', uid, day, q.k, q.fp, status, waId, String(error || '').slice(0, 200), Date.now());
async function campaignAbort(env, u, body) { const c = await loadCampaign(env, u, String(body.id || '')); if (c.status === 'running') await exec(env, "UPDATE campaigns SET status='paused',updated=?2 WHERE id=?1", c.id, Date.now()); return { ...progress(await loadCampaign(env, u, c.id)) }; }
async function campaignResume(env, u, body) { const c = await loadCampaign(env, u, String(body.id || '')); const td = edTodayUTC(u.tz);
  if (c.day !== td.key) throw err(410, 'campaign_expired', 'That campaign belongs to an earlier day. Start a new campaign.');
  if (c.status === 'paused' || c.status === 'running') await exec(env, "UPDATE campaigns SET status='running',updated=?2 WHERE id=?1", c.id, Date.now()); return { ...progress(await loadCampaign(env, u, c.id)), keys: JSON.parse(c.queue).map(q => q.k) }; }

/* ═══ 70_pay.js ═══ */
const DAY = 86400000;
const activeSub = (env, uid, now) => one(env, "SELECT * FROM subscriptions WHERE owner_uid=?1 AND status IN ('active','cancelled') AND expires>?2 ORDER BY expires DESC LIMIT 1", uid, now);
async function ensureSeats(env, uid) {
  const ex = await one(env, 'SELECT count(*) c FROM seats WHERE owner_uid=?1', uid); if (ex.c >= SEATS_PER_PLAN) return;
  const r = await one(env, "UPDATE meta SET v=CAST(v AS INTEGER)+?1 WHERE k='seat_counter' RETURNING v", SEATS_PER_PLAN); const base = Number(r.v) - SEATS_PER_PLAN, now = Date.now();
  await batch(env, Array.from({ length: SEATS_PER_PLAN }, (_, i) => stmt(env, 'INSERT OR IGNORE INTO seats(seat_no,owner_uid,slot,uid,claimed) VALUES(?1,?2,?3,?4,?5)', base + i + 1, uid, i + 1, i === 0 ? uid : null, i === 0 ? now : null)));
}
const initial = n => ((String(n || '').trim()[0] || 'E')).toUpperCase();
/* everything the app needs to know about the signed-in user — the backend is the only source of truth for the plan */
async function buildMe(env, u, now) {
  const own = await activeSub(env, u.uid, now); let role = 'free', sub = own, blocked = false, myseat = null;
  if (!own) {
    const s = await one(env, 'SELECT * FROM seats WHERE uid=?1 AND slot>1', u.uid);
    if (s) { const os = await activeSub(env, s.owner_uid, now);
      if (os) { if (!s.device_id && u.device) { await exec(env, 'UPDATE seats SET device_id=?2 WHERE seat_no=?1', s.seat_no, u.device); s.device_id = u.device; }
        if (!u.device || s.device_id !== u.device) blocked = true; else { role = 'member'; sub = os; myseat = s; } } }
  } else role = 'owner';
  if (u.admin) { role = 'free'; sub = null; blocked = false; myseat = null; } // admin access is independent of subscription tier
  let seats = [], members = [], ownerUid = role === 'owner' ? u.uid : (myseat ? myseat.owner_uid : null);
  if (ownerUid) {
    const block = await rows(env, 'SELECT s.seat_no,s.slot,s.uid,us.name,us.photo FROM seats s LEFT JOIN users us ON us.uid=s.uid WHERE s.owner_uid=?1 ORDER BY s.slot', ownerUid);
    seats = block.map(b => ({ slot: b.slot, state: b.uid === u.uid ? 'you' : (b.uid ? 'taken' : 'free'), ...(role === 'owner' ? { ref: b.seat_no } : {}) }));
    members = block.filter(b => b.uid).map(b => ({ initial: initial(b.name), photo: b.photo || '' }));
  }
  return { _ws: role === 'member' ? ownerUid : u.uid, user: { uid: u.uid, email: u.email, name: u.name, photo: u.photo }, role, plan: role === 'free' ? 'free' : 'pro', deviceBlocked: blocked, admin: u.admin,
    sub: sub ? { status: sub.status, started: sub.started, expires: sub.expires, source: sub.source, cycleDays: CYCLE_DAYS } : null, seats, members,
    now, tz: u.tz, pricing: { amount: PRICE_PAISE / 100, currency: CURRENCY, cycleDays: CYCLE_DAYS } };
}
/* ───────── PhonePe Autopay ─────────
   • Sign-up: PhonePe hosted checkout (SUBSCRIPTION_CHECKOUT_SETUP) → user pays ₹2,499 and authorises a FIXED ₹2,499 UPI mandate.
   • Renewal: PhonePe has no 29-day frequency, so the mandate is ON_DEMAND and Edsora sends the pre-debit notice (autoDebit:true) 2 days
     before each 29-day period ends; PhonePe then debits automatically. The plan is extended by 29 days only after PhonePe's API says COMPLETED.
   • Nothing is ever activated from a browser claim or an unsigned webhook — every activation re-reads the status from PhonePe's API. */
const PP_SRC = 'phonepe_subscription', PP_RENEW_LEAD = 2 * DAY, PP_RETRY_GAP = 12 * 3600000, PP_MAX_TRIES = 4, PP_GRACE = 3 * DAY, PP_SETUP_TTL = 15 * 60000;
const ppRand = () => { const a = new Uint8Array(9); crypto.getRandomValues(a); return Array.from(a, x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join(''); };
const ppUrls = c => c.ppBase ? { auth: c.ppBase + '/v1/oauth/token', api: c.ppBase + '/apis/pg' }
  : c.ppEnv === 'sandbox' || c.ppEnv === 'preprod' ? { auth: 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token', api: 'https://api-preprod.phonepe.com/apis/pg-sandbox' }
  : { auth: 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token', api: 'https://api.phonepe.com/apis/pg' };
const ppConfigured = c => !!(c.ppId && c.ppSecret && c.ppVersion);
let PP_TOKEN = null;
async function ppToken(env, force) {
  const c = cfg(env); if (!ppConfigured(c)) throw err(503, 'pay_unconfigured', 'Payments are not connected yet.');
  const k = c.ppId + '|' + c.ppSecret + '|' + c.ppVersion + '|' + c.ppEnv + '|' + c.ppBase;
  if (!force && PP_TOKEN && PP_TOKEN.k === k && PP_TOKEN.exp > Date.now() + 60000) return PP_TOKEN.tok;
  const r = await fetch(ppUrls(c).auth, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.ppId, client_version: c.ppVersion, client_secret: c.ppSecret, grant_type: 'client_credentials' }).toString() });
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.access_token) throw err(502, 'pay_provider_error', 'The payment provider rejected the credentials.');
  const exp = Number(j.expires_at) > 0 ? (Number(j.expires_at) < 1e12 ? Number(j.expires_at) * 1000 : Number(j.expires_at)) : Date.now() + 50 * 60000;
  PP_TOKEN = { k, tok: j.access_token, exp }; return j.access_token;
}
async function pp(env, method, path, body, retried) {
  const c = cfg(env), tok = await ppToken(env, !!retried);
  const r = await fetch(ppUrls(c).api + path, { method, headers: { authorization: 'O-Bearer ' + tok, 'content-type': 'application/json', accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401 && !retried) return pp(env, method, path, body, true);
  const txt = await r.text(); let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch (e) {}
  if (!r.ok) { const e = err(502, 'pay_provider_error', String(j.message || j.code || 'The payment provider returned an error.').slice(0, 200)); e.ppStatus = r.status; e.ppCode = j.code; throw e; }
  return j;
}
const ppSubKey = msid => 'pp:' + msid;
async function grantAdmin(env, u) {
  const now = Date.now(); await exec(env, 'INSERT OR IGNORE INTO subscriptions(owner_uid,status,source,started,expires,payment_id,created) VALUES(?1,?2,?3,?4,?5,?6,?4)', u.uid, 'active', 'admin_grant', now, now + 3650 * DAY, 'admin:' + u.uid);
  await exec(env, "UPDATE subscriptions SET status='active',expires=?2 WHERE payment_id=?1 AND expires<?3", 'admin:' + u.uid, now + 3650 * DAY, now + 3000 * DAY); await ensureSeats(env, u.uid);
}
/* POST /api/pay/order → starts the hosted PhonePe Autopay checkout; the browser is sent to redirectUrl */
async function payOrder(env, u, origin) {
  const now = Date.now(); await limit(env, 'order:' + u.uid, 12, 600);
  if (u.admin) return { free: true };
  const c = cfg(env); if (!ppConfigured(c)) throw err(503, 'pay_unconfigured', 'Payments are not connected yet.');
  if (await activeSub(env, u.uid, now)) throw err(409, 'already_active', 'Your Pro plan is already active.');
  /* an earlier checkout that was never finished: settle it first (it may actually have been paid), or wait for it to expire */
  const pend = await rows(env, "SELECT o.order_id,o.created FROM pp_orders o JOIN subscriptions s ON s.payment_id=o.sub_key WHERE o.uid=?1 AND o.kind='setup' AND o.status='created' AND s.status='created' ORDER BY o.created DESC LIMIT 3", u.uid);
  for (const p of pend) {
    try { await ppActivateSetup(env, u.uid, p.order_id); throw err(409, 'already_active', 'Your Pro plan is already active.'); }
    catch (e) { if (e instanceof HttpError && e.code === 'already_active') throw e;
      if (e instanceof HttpError && e.code === 'payment_pending' && now - p.created < PP_SETUP_TTL) throw err(409, 'subscription_pending', 'Your payment setup is still in progress. Finish it in your UPI app, or try again in a few minutes.');
      if (!(e instanceof HttpError) || e.status >= 500) throw e; }
  }
  const stamp = ppRand(), moid = 'EDSO-' + stamp, msid = 'EDSS-' + stamp, redirectUrl = String(origin || '').replace(/\/+$/, '') + '/?pp=' + moid;
  if (!/^https?:\/\//.test(redirectUrl)) throw err(400, 'bad_request', 'Could not work out the return address.');
  await exec(env, "INSERT INTO subscriptions(owner_uid,status,source,started,expires,payment_id,created) VALUES(?1,'created',?2,?3,?3,?4,?3)", u.uid, PP_SRC, now, ppSubKey(msid));
  await exec(env, "INSERT INTO pp_orders(order_id,sub_key,uid,kind,amount,status,cycle_end,created,updated) VALUES(?1,?2,?3,'setup',?4,'created',NULL,?5,?5)", moid, ppSubKey(msid), u.uid, PRICE_PAISE, now);
  let r;
  try {
    r = await pp(env, 'POST', '/checkout/v2/pay', { merchantOrderId: moid, amount: PRICE_PAISE, expireAfter: PP_SETUP_TTL / 1000, metaInfo: { udf1: u.uid, udf2: 'edsora-pro' },
      paymentFlow: { type: 'SUBSCRIPTION_CHECKOUT_SETUP', merchantUrls: { redirectUrl }, subscriptionDetails: { subscriptionType: 'RECURRING', merchantSubscriptionId: msid, authWorkflowType: 'TRANSACTION', amountType: 'FIXED', maxAmount: PRICE_PAISE, frequency: 'ON_DEMAND', expireAt: now + 3650 * DAY } } });
  } catch (e) { await exec(env, "UPDATE subscriptions SET status='failed' WHERE payment_id=?1", ppSubKey(msid)); await exec(env, "UPDATE pp_orders SET status='failed' WHERE order_id=?1", moid); throw e; }
  if (!r.redirectUrl) { await exec(env, "UPDATE subscriptions SET status='failed' WHERE payment_id=?1", ppSubKey(msid)); throw err(502, 'pay_provider_error', 'The payment provider did not return a checkout link.'); }
  return { orderId: moid, redirectUrl: r.redirectUrl, amount: PRICE_PAISE, currency: CURRENCY, name: 'Edsora', description: 'Edsora Pro — ₹2,499 every 29 days (UPI AutoPay)' };
}
/* Verify with PhonePe (never trust the browser) and activate. Idempotent: safe to call from the return page, the webhook and the poller. */
async function ppActivateSetup(env, uid, moid) {
  const o = await one(env, "SELECT * FROM pp_orders WHERE order_id=?1 AND kind='setup'", moid);
  if (!o || (uid && o.uid !== uid)) throw err(403, 'wrong_user', 'This payment belongs to another account.');
  if (o.status === 'done') return { done: true, uid: o.uid };
  const st = await pp(env, 'GET', '/subscriptions/v2/order/' + encodeURIComponent(moid) + '/status?details=true');
  if (st.state === 'FAILED') { await exec(env, "UPDATE pp_orders SET status='failed',updated=?2 WHERE order_id=?1 AND status='created'", moid, Date.now()); await exec(env, "UPDATE subscriptions SET status='failed' WHERE payment_id=?1 AND status='created'", o.sub_key); throw err(402, 'payment_failed', 'The payment was not completed. You have not been charged.'); }
  if (st.state !== 'COMPLETED') throw err(402, 'payment_pending', 'Your payment is still being confirmed.');
  const msid = o.sub_key.slice(3), pf = st.paymentFlow || {};
  if (Number(st.amount) !== PRICE_PAISE) throw err(402, 'bad_amount', 'The paid amount did not match the plan price.');
  if (pf.merchantSubscriptionId && pf.merchantSubscriptionId !== msid) throw err(402, 'bad_subscription', 'The payment does not match this subscription.');
  const ss = await pp(env, 'GET', '/subscriptions/v2/' + encodeURIComponent(msid) + '/status?details=true');
  if (ss.state === 'ACTIVATION_IN_PROGRESS') throw err(402, 'payment_pending', 'Your AutoPay mandate is still being activated.');
  if (ss.state !== 'ACTIVE') throw err(402, 'subscription_not_active', 'The AutoPay mandate is not active.');
  const now = Date.now(), other = await one(env, "SELECT payment_id FROM subscriptions WHERE owner_uid=?1 AND source=?2 AND status='active' AND expires>?3 AND payment_id<>?4 LIMIT 1", o.uid, PP_SRC, now, o.sub_key);
  if (other) { /* the user already has a live mandate: never run two — cancel this duplicate */
    try { await pp(env, 'POST', '/subscriptions/v2/' + encodeURIComponent(msid) + '/cancel'); } catch (e) { await logError(env, 'pp_dup_cancel', e); }
    await exec(env, "UPDATE subscriptions SET status='cancelled' WHERE payment_id=?1 AND status='created'", o.sub_key); await exec(env, "UPDATE pp_orders SET status='done',updated=?2 WHERE order_id=?1", moid, now); return { done: true, uid: o.uid, duplicate: true };
  }
  const r = await exec(env, "UPDATE subscriptions SET status='active',started=?2,expires=?3 WHERE payment_id=?1 AND status IN ('created','failed')", o.sub_key, now, now + CYCLE_DAYS * DAY);
  if (r.meta && r.meta.changes) {
    const pd = (st.paymentDetails && st.paymentDetails[0]) || {};
    await exec(env, 'INSERT OR IGNORE INTO payments(payment_id,order_id,uid,amount,currency,status,method,created) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)', String(pd.transactionId || 'ppo:' + moid), moid, o.uid, PRICE_PAISE, CURRENCY, 'captured', String(pd.paymentMode || 'UPI_AUTOPAY'), now);
  }
  await exec(env, "UPDATE pp_orders SET status='done',updated=?2 WHERE order_id=?1", moid, now); await ensureSeats(env, o.uid);
  return { done: true, uid: o.uid };
}
async function payVerify(env, u, body) {
  const moid = String(body.orderId || ''); if (!/^EDSO-[a-z0-9]{9}$/.test(moid)) throw err(400, 'bad_request', 'Missing payment details.');
  await limit(env, 'verify:' + u.uid, 40, 600);
  await ppActivateSetup(env, u.uid, moid);
  return buildMe(env, u, Date.now());
}
async function payFailed(env, u, body) {
  const moid = String(body.orderId || '');
  if (/^EDSO-[a-z0-9]{9}$/.test(moid)) { const o = await one(env, "SELECT sub_key FROM pp_orders WHERE order_id=?1 AND uid=?2 AND kind='setup'", moid, u.uid); if (o) await exec(env, "UPDATE subscriptions SET status=?2 WHERE payment_id=?1 AND status='created'", o.sub_key, body.cancelled ? 'cancelled' : 'failed'); }
  return { ok: true };
}
async function payCancel(env, u) {
  const s = await one(env, "SELECT * FROM subscriptions WHERE owner_uid=?1 AND source=?2 AND status='active' ORDER BY expires DESC LIMIT 1", u.uid, PP_SRC);
  if (s && String(s.payment_id || '').startsWith('pp:')) {
    try { await pp(env, 'POST', '/subscriptions/v2/' + encodeURIComponent(s.payment_id.slice(3)) + '/cancel'); }
    catch (e) { /* already cancelled/revoked on PhonePe's side (e.g. the user revoked it in their UPI app) → fine, the plan simply won't renew */
      let st = null; try { st = await pp(env, 'GET', '/subscriptions/v2/' + encodeURIComponent(s.payment_id.slice(3)) + '/status'); } catch (x) {}
      if (!st || !['CANCELLED', 'REVOKED', 'CANCEL_IN_PROGRESS', 'REVOKE_IN_PROGRESS', 'EXPIRED'].includes(st.state)) throw e; }
    await exec(env, "UPDATE subscriptions SET status='cancelled' WHERE payment_id=?1", s.payment_id);
  }
  return buildMe(env, u, Date.now());
}
/* ───────── renewals (every 29 days) ─────────
   Runs from: the free daily poller URL (GET /api/pay/renew-due), the webhook, and whenever a paying owner opens the app in the last 2 days. */
async function ppRenewOne(env, sub, now) {
  const key = sub.payment_id, msid = key.slice(3);
  let last = await one(env, "SELECT * FROM pp_orders WHERE sub_key=?1 AND kind='renewal' AND cycle_end=?2 ORDER BY created DESC LIMIT 1", key, sub.expires);
  if (last && last.status === 'pending') {
    const st = await pp(env, 'GET', '/subscriptions/v2/order/' + encodeURIComponent(last.order_id) + '/status?details=true');
    if (st.state === 'COMPLETED') {
      if (Number(st.amount) !== PRICE_PAISE) { await logError(env, 'pp_renew_amount', new Error('renewal amount mismatch ' + st.amount)); return 'bad_amount'; }
      const next = Math.max(sub.expires, now) + CYCLE_DAYS * DAY;
      const r = await exec(env, "UPDATE subscriptions SET status='active',expires=?3 WHERE payment_id=?1 AND expires=?2 AND status='active'", key, sub.expires, next);
      if (r.meta && r.meta.changes) { const pd = (st.paymentDetails && st.paymentDetails[0]) || {}; await exec(env, 'INSERT OR IGNORE INTO payments(payment_id,order_id,uid,amount,currency,status,method,created) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)', String(pd.transactionId || 'ppo:' + last.order_id), last.order_id, sub.owner_uid, PRICE_PAISE, CURRENCY, 'captured', String(pd.paymentMode || 'UPI_AUTOPAY'), now); }
      await exec(env, "UPDATE pp_orders SET status='done',updated=?2 WHERE order_id=?1", last.order_id, now); return 'renewed';
    }
    if (st.state === 'FAILED') { await exec(env, "UPDATE pp_orders SET status='failed',updated=?2 WHERE order_id=?1", last.order_id, now); last = Object.assign({}, last, { status: 'failed', updated: now }); }
    else return 'waiting';
  }
  if (sub.expires > now + PP_RENEW_LEAD) return 'not_due';
  /* is the mandate still alive on PhonePe's side? */
  const ss = await pp(env, 'GET', '/subscriptions/v2/' + encodeURIComponent(msid) + '/status?details=true');
  if (ss.state === 'CANCELLED' || ss.state === 'REVOKED' || ss.state === 'CANCEL_IN_PROGRESS' || ss.state === 'REVOKE_IN_PROGRESS') { await exec(env, "UPDATE subscriptions SET status='cancelled' WHERE payment_id=?1 AND status='active'", key); return 'cancelled'; }
  if (ss.state === 'EXPIRED' || ss.state === 'FAILED') { await exec(env, "UPDATE subscriptions SET status='halted' WHERE payment_id=?1 AND status='active'", key); return 'halted'; }
  if (ss.state !== 'ACTIVE') return 'paused';
  if (now > sub.expires + PP_GRACE) { await exec(env, "UPDATE subscriptions SET status='halted' WHERE payment_id=?1 AND status='active'", key); return 'halted'; }
  const tries = (await one(env, "SELECT count(*) c FROM pp_orders WHERE sub_key=?1 AND kind='renewal' AND cycle_end=?2", key, sub.expires)).c;
  if (last && (now - last.updated < PP_RETRY_GAP || tries >= PP_MAX_TRIES)) return 'backoff';
  const moid = 'EDSR-' + ppRand();
  await exec(env, "INSERT INTO pp_orders(order_id,sub_key,uid,kind,amount,status,cycle_end,created,updated) VALUES(?1,?2,?3,'renewal',?4,'pending',?5,?6,?6)", moid, key, sub.owner_uid, PRICE_PAISE, sub.expires, now);
  try {
    await pp(env, 'POST', '/subscriptions/v2/notify', { merchantOrderId: moid, amount: PRICE_PAISE, expireAt: now + 2 * DAY, paymentFlow: { type: 'SUBSCRIPTION_REDEMPTION', merchantSubscriptionId: msid, redemptionRetryStrategy: 'STANDARD', autoDebit: true } });
  } catch (e) { await exec(env, "UPDATE pp_orders SET status='failed',updated=?2 WHERE order_id=?1", moid, Date.now()); throw e; }
  return 'notified';
}
async function ppRenewDue(env, onlyUid) {
  if (!ppConfigured(cfg(env))) return { checked: 0, results: {} };
  const now = Date.now(), list = await rows(env, "SELECT * FROM subscriptions WHERE source=?1 AND status='active' AND expires<=?2 AND expires>?3" + (onlyUid ? ' AND owner_uid=?4' : '') + ' ORDER BY expires LIMIT 40', ...[PP_SRC, now + PP_RENEW_LEAD, now - PP_GRACE - DAY].concat(onlyUid ? [onlyUid] : []));
  const results = {};
  for (const s of list) { try { const x = await ppRenewOne(env, s, now); results[x] = (results[x] || 0) + 1; } catch (e) { results.error = (results.error || 0) + 1; await logError(env, 'pp_renew', e); } }
  return { checked: list.length, results };
}
/* ───────── POST /webhook/phonepe ─────────
   PhonePe's webhook is only a HINT. Whatever it says, Edsora re-reads the real state from PhonePe's API before changing anything,
   so a forged call can never unlock Pro. If PHONEPE_WEBHOOK_USERNAME/PASSWORD are set, the Authorization header is also checked. */
async function webhook(env, request) {
  const c = cfg(env); if (!ppConfigured(c)) return J({ error: 'webhook_unconfigured' }, 503);
  const raw = await request.text();
  if (c.ppWhUser && c.ppWhPass) { const want = await sha256Hex(c.ppWhUser + ':' + c.ppWhPass), got = String(request.headers.get('authorization') || '').replace(/^sha256\s+/i, '').trim().toLowerCase(); if (!got || !safeEq(want, got)) return J({ error: 'bad_auth' }, 401); }
  let ev; try { ev = JSON.parse(raw); } catch (e) { return J({ error: 'bad_json' }, 400); }
  await ensureSchema(env);
  try { await limit(env, 'pp_hook', 300, 600); } catch (e) { return J({ ok: true, throttled: true }); }
  const type = String(ev.event || ev.type || ''), pl = ev.payload || {}, moid = String(pl.merchantOrderId || pl.originalMerchantOrderId || ''), msid = String((pl.paymentFlow && pl.paymentFlow.merchantSubscriptionId) || pl.merchantSubscriptionId || '');
  try {
    if (/^EDSO-[a-z0-9]{9}$/.test(moid)) { try { await ppActivateSetup(env, null, moid); } catch (e) { if (!(e instanceof HttpError) || e.status >= 500 || e.code === 'pay_provider_error') throw e; } }
    else if (/^EDSS-[a-z0-9]{9}$/.test(msid) || /^EDSR-/.test(moid)) {
      const key = ppSubKey(msid || ''), sub = msid ? await one(env, "SELECT * FROM subscriptions WHERE payment_id=?1 AND source=?2", key, PP_SRC) : (await one(env, "SELECT s.* FROM pp_orders o JOIN subscriptions s ON s.payment_id=o.sub_key WHERE o.order_id=?1", moid));
      if (sub && /cancel|revok/.test(type)) { const ss = await pp(env, 'GET', '/subscriptions/v2/' + encodeURIComponent(sub.payment_id.slice(3)) + '/status'); if (['CANCELLED', 'REVOKED'].includes(ss.state)) await exec(env, "UPDATE subscriptions SET status='cancelled' WHERE payment_id=?1 AND status IN ('active','created')", sub.payment_id); }
      else if (sub && sub.status === 'active') await ppRenewOne(env, sub, Date.now());
    }
  } catch (e) { await logError(env, 'webhook', e); return J({ error: 'retry' }, 500); }
  return J({ ok: true });
}
/* ───────── referral seats ───────── */
async function claimSeat(env, u, body) {
  await limit(env, 'claim:' + u.uid, 8, 3600); const now = Date.now();
  const m = /^premium(\d{1,9})$/i.exec(String(body.ref || '').trim()); if (!m) throw err(404, 'invalid_link', 'This invitation link is not valid.');
  const seat = await one(env, 'SELECT * FROM seats WHERE seat_no=?1', +m[1]); if (!seat || seat.slot === 1) throw err(404, 'invalid_link', 'This invitation link is not valid.');
  const owner = await one(env, 'SELECT * FROM users WHERE uid=?1', seat.owner_uid), os = await activeSub(env, seat.owner_uid, now); if (!owner || !os) throw err(410, 'plan_inactive', 'This Pro plan is not active right now.');
  if (seat.owner_uid === u.uid) throw err(409, 'own_link', 'This is your own Pro plan.');
  if (normEmail(body.email) !== normEmail(owner.email)) throw err(403, 'email_mismatch', "This email doesn't match your subscription buyer's email. Please try again.");
  if (await activeSub(env, u.uid, now)) throw err(409, 'already_pro', 'You already have your own Pro plan.');
  const mine = await one(env, 'SELECT seat_no FROM seats WHERE uid=?1 AND slot>1', u.uid); if (mine && mine.seat_no !== seat.seat_no) throw err(409, 'already_member', 'You already hold a seat on another plan.');
  if (!u.device) throw err(400, 'device_required', 'This device could not be identified. Reload and try again.');
  if (seat.uid && seat.uid !== u.uid) throw err(409, 'seat_taken', 'This seat has already been taken.');
  if (seat.uid === u.uid && seat.device_id && seat.device_id !== u.device) throw err(409, 'device_locked', 'This seat is signed in on another device.');
  const r = await exec(env, 'UPDATE seats SET uid=?2,device_id=?3,claimed=?4 WHERE seat_no=?1 AND (uid IS NULL OR uid=?2)', seat.seat_no, u.uid, u.device, now);
  if (r.meta.changes === 0) throw err(409, 'seat_taken', 'This seat has already been taken.');
  return buildMe(env, u, Date.now());
}
async function signOutRelease(env, u) { if (u.device) await exec(env, 'UPDATE seats SET device_id=NULL WHERE uid=?1 AND slot>1 AND device_id=?2', u.uid, u.device); return { ok: true }; }

/* ═══ 80_admin.js ═══ */
const mask = e => { e = String(e || ''); const i = e.indexOf('@'); return i < 2 ? e : e[0] + '\u2022\u2022\u2022' + e.slice(i - 1); };
function ytId(s) { s = String(s || '').trim(); if (!s) return ''; if (/^[\w-]{11}$/.test(s)) return s; try { const u = new URL(s); const h = u.hostname.replace(/^www\.|^m\./, ''); let id = '';
  if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0]; else if (/youtube(-nocookie)?\.com$/.test(h)) id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/) || [])[1] || '';
  return /^[\w-]{11}$/.test(id) ? id : ''; } catch (e) { return ''; } }
const cfgGet = async (env, k) => { const r = await one(env, 'SELECT v FROM config WHERE k=?1', k); return r ? r.v : ''; };
const cfgSet = (env, k, v) => exec(env, 'INSERT INTO config(k,v) VALUES(?1,?2) ON CONFLICT(k) DO UPDATE SET v=?2', k, v);
async function publicVideo(env) { await ensureSchema(env); const url = await cfgGet(env, 'video_url'), id = ytId(url); return { url: id ? url : '', id, videoId: id }; }
async function publicReferral(env) { await ensureSchema(env); return { url: await cfgGet(env, 'referral_url') }; }
async function adminAccounts(env) {
  const us = await rows(env, 'SELECT u.uid,u.name,u.email,u.photo,u.created,u.last_seen,COALESCE(a.files,0) files,COALESCE(a.students,0) students FROM users u LEFT JOIN acct_stats a ON a.uid=u.uid ORDER BY u.created DESC LIMIT 2000');
  const msg = new Map((await rows(env, "SELECT uid,count(*) c FROM sent_log WHERE status='sent' GROUP BY uid")).map(r => [r.uid, r.c])), now = Date.now();
  const subs = new Map((await rows(env, "SELECT owner_uid,max(expires) e,max(source) s FROM subscriptions WHERE status IN ('active','cancelled') AND expires>?1 GROUP BY owner_uid", now)).map(r => [r.owner_uid, r]));
  const seats = new Map((await rows(env, 'SELECT uid FROM seats WHERE slot>1 AND uid IS NOT NULL')).map(r => [r.uid, 1]));
  return us.map(u => { const plan = subs.has(u.uid) ? 'Pro' : seats.has(u.uid) ? 'Pro (seat)' : 'Free', m = msg.get(u.uid) || 0;
    return { id: u.uid, uid: u.uid, name: u.name || u.email, displayName: u.name || u.email, accountName: u.name || u.email, email: u.email, photoURL: u.photo, photo: u.photo, avatar: u.photo,
      joinedAt: u.created, createdAt: u.created, lastSeen: u.last_seen, plan, files: u.files, students: u.students, messages: m, usage: `${plan} \u2022 ${u.files} file${u.files === 1 ? '' : 's'} \u2022 ${m} message${m === 1 ? '' : 's'}` }; });
}
async function adminFiles(env) {
  const fs = await rows(env, 'SELECT f.id,f.name,f.title,f.created,f.updated,f.size,f.count,u.name uname,u.email FROM files f LEFT JOIN users u ON u.uid=f.uid ORDER BY f.updated DESC LIMIT 5000');
  return fs.map(f => { const type = /\.csv$/i.test(f.name) ? 'csv' : /\.xlsx?$/i.test(f.name) ? 'xlsx' : 'xlsx'; return { id: f.id, name: f.name, fileName: f.name, title: f.title, type, size: f.size, rows: f.count, accountName: f.uname || f.email || 'Account', account: f.uname || f.email || 'Account', accountEmail: f.email, uploadedAt: f.created, createdAt: f.created, updatedAt: f.updated, url: '/api/admin/files/' + encodeURIComponent(f.id) + '/download' }; });
}
async function adminDownload(env, id, format) {
  const f = await one(env, 'SELECT * FROM files WHERE id=?1', id); if (!f) throw err(404, 'not_found', 'File not found.');
  const raw = await loadRaw(env, id), fmt = format === 'csv' ? 'csv' : format === 'xlsx' ? 'xlsx' : (/\.csv$/i.test(f.name) ? 'csv' : 'xlsx'), base = String(f.name).replace(/\.[a-z0-9]+$/i, '').replace(/[^\w.\- ]+/g, '_') || 'edsora-file';
  const body = fmt === 'csv' ? toCsv(raw) : toXlsx(raw);
  return new Response(body, { headers: { 'content-type': fmt === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${base}.${fmt}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
async function adminStats(env) {
  const a = await one(env, 'SELECT COALESCE(sum(students),0) s,COALESCE(sum(parents),0) p,COALESCE(sum(uploads),0) u FROM acct_stats'), m = await one(env, "SELECT count(*) c FROM sent_log WHERE status='sent'");
  return { students: a.s, parents: a.p, messages: m.c, excelFiles: a.u, files: a.u, updatedAt: Date.now() };
}
async function adminOverview(env) {
  const now = Date.now(), st = await adminStats(env), schools = (await one(env, 'SELECT count(*) c FROM users')).c, active = (await one(env, "SELECT count(DISTINCT owner_uid) c FROM subscriptions WHERE status IN ('active','cancelled') AND expires>?1", now)).c;
  const pay = await one(env, "SELECT count(*) n,COALESCE(sum(amount),0) amt FROM payments WHERE status='captured'"), ref = (await one(env, 'SELECT count(*) c FROM payments WHERE refunded=1')).c, camps = (await one(env, 'SELECT count(*) c FROM campaigns')).c;
  return { schools, activeSubscriptions: active, payments: { captured: pay.n, amountPaise: pay.amt, refunded: ref }, campaigns: camps, ...st };
}
const adminPayments = async env => (await rows(env, 'SELECT p.payment_id,p.order_id,p.amount,p.currency,p.status,p.method,p.created,u.email FROM payments p LEFT JOIN users u ON u.uid=p.uid ORDER BY p.created DESC LIMIT 200')).map(p => ({ paymentId: p.payment_id, orderId: p.order_id, amount: p.amount, currency: p.currency, status: p.status, method: p.method, at: p.created, account: mask(p.email) }));
const adminCampaigns = async env => ({ byStatus: await rows(env, 'SELECT status,count(*) n,COALESCE(sum(sent),0) sent,COALESCE(sum(failed),0) failed FROM campaigns GROUP BY status'), recent: (await rows(env, 'SELECT c.id,c.day,c.status,c.total,c.sent,c.failed,c.updated,u.email FROM campaigns c LEFT JOIN users u ON u.uid=c.uid ORDER BY c.updated DESC LIMIT 100')).map(c => ({ ...c, email: mask(c.email) })) });
async function adminHealth(env) { const c = cfg(env); let db = true; try { await one(env, 'SELECT 1 x'); } catch (e) { db = false; }
  return { ok: db, time: Date.now(), services: { database: db ? 'connected' : 'unavailable', googleSignIn: c.fb.projectId ? 'configured' : 'unconfigured', phonepe: ppConfigured(c) ? 'configured' : 'unconfigured', phonepeWebhook: c.ppWhUser && c.ppWhPass ? 'configured (verified)' : 'hint-only (always re-checked with PhonePe)', llm: llmPool(env).length ? `${c.gemini.length} Gemini + ${c.groq.length} Groq key(s)` : 'unconfigured', storage: b2On(env) ? 'backblaze b2' : 'database (Backblaze not configured)', whatsapp: c.wa.token && c.wa.phoneId ? (c.wa.template ? 'configured (template)' : 'configured (text)') : 'unconfigured' },
    errors: db ? await rows(env, 'SELECT at,scope,msg FROM errors ORDER BY id DESC LIMIT 20') : [] }; }
async function adminPutVideo(env, body) { const raw = String(body.url ?? body.videoUrl ?? '').trim(), id = ytId(raw); if (raw && !id) throw err(400, 'bad_video', 'Please paste a valid YouTube video link.'); await cfgSet(env, 'video_url', raw); return { url: raw, id, videoId: id }; }
async function adminPutReferral(env, body) { const raw = String(body.url ?? body.referralUrl ?? '').trim(), u = raw ? cleanUrl(raw) : ''; if (raw && !u) throw err(400, 'bad_url', 'Please paste a valid https:// link.'); await cfgSet(env, 'referral_url', u.replace(/[?#].*$/, '')); return { url: u.replace(/[?#].*$/, '') }; }

/* ═══ 99_main.js ═══ */
const SEC_HEADERS = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'SAMEORIGIN' };
async function api(request, env, url) {
  const m = request.method, p = url.pathname.replace(/\/+$/, '') || '/';
  if (m !== 'GET' && m !== 'HEAD' && p !== '/webhook/phonepe') { const o = request.headers.get('origin'); if (o) { let h = ''; try { h = new URL(o).host; } catch (e) {} if (h !== url.host) throw err(403, 'bad_origin', 'This request was blocked.'); } }
  if (p === '/webhook/phonepe') { if (m !== 'POST') throw err(405, 'method_not_allowed', 'POST only.'); return webhook(env, request); }
  if (p === '/api/health') return J({ ok: true, time: Date.now() });
  /* free daily poller (cron-job.org etc.): sends the 29-day pre-debit notices and extends paid plans. Public on purpose — it takes no input and only acts on what PhonePe's API confirms. */
  if (p === '/api/pay/renew-due' && (m === 'GET' || m === 'POST')) { await limit(env, 'renew_due', 60, 3600); return J(await ppRenewDue(env, null)); }
  if (p === '/api/public-config') { const c = cfg(env); return J({ firebase: c.fb, configured: { auth: !!c.fb.projectId && !!c.fb.apiKey, payments: ppConfigured(c), llm: llmPool(env).length > 0, whatsapp: !!(c.wa.token && c.wa.phoneId) } }); }
  if (p === '/api/referral' && m === 'GET') return J(await publicReferral(env), 200, { 'cache-control': 'public, max-age=30' });
  /* ── administrator API (Google token + server-side allowlist on EVERY call) ── */
  if (p.startsWith('/api/admin')) {
    const u = await requireAdmin(env, request), q = p.slice('/api/admin'.length);
    if (q === '/whoami') return J({ ok: true, email: u.email, name: u.name, photo: u.photo });
    if (q === '/referral') return m === 'PUT' ? J(await adminPutReferral(env, await readJson(request, 20000))) : J(await publicReferral(env));
    if (q === '/accounts') return J({ accounts: await adminAccounts(env) });
    if (q === '/files') return J({ files: await adminFiles(env) });
    const dl = /^\/files\/([^/]+)\/download$/.exec(q); if (dl && m === 'GET') return adminDownload(env, decodeURIComponent(dl[1]), url.searchParams.get('format'));
    if (q === '/stats') return J(await adminStats(env));
    if (q === '/overview') return J(await adminOverview(env));
    if (q === '/payments') return J({ payments: await adminPayments(env) });
    if (q === '/campaigns') return J(await adminCampaigns(env));
    if (q === '/health') return J(await adminHealth(env));
    if (q === '/settings') { if (m === 'PUT') { const b = await readJson(request, 20000); if (b.referral) await adminPutReferral(env, b.referral); } return J({ referral: await publicReferral(env), pricing: { amountPaise: PRICE_PAISE, currency: CURRENCY, cycleDays: CYCLE_DAYS }, admins: getAdminEmails(env).map(mask) }); }
    throw err(404, 'not_found', 'Unknown admin endpoint.');
  }
  /* ── signed-in app API ── */
  const real = await requireUser(env, request), me0 = await buildMe(env, real, Date.now()), u = Object.assign({}, real, { uid: me0._ws }), pub = x => { const { _ws, ...r } = x; return r; };
  /* seat members work inside the plan owner's workspace (same files, settings and send-log); everything else about them stays their own */
  if (p === '/api/me' && m === 'GET') return J(pub(me0));
  if (p === '/api/state' && m === 'GET') { if (me0.role === 'owner' && me0.sub && me0.sub.source === PP_SRC && me0.sub.status === 'active' && me0.sub.expires - Date.now() <= PP_RENEW_LEAD) { try { await limit(env, 'renew:' + real.uid, 6, 3600); await ppRenewDue(env, real.uid); } catch (e) {} }
    return J({ me: pub(me0), state: await buildState(env, u) }); }
  if (p === '/api/files' && m === 'POST') { if (me0.plan !== 'pro') throw err(402, 'pro_required', 'Upgrade to Pro to upload files.'); const r = await postFile(env, u, await readJson(request)); return J({ ...r, state: await buildState(env, u) }); }
  const fm = /^\/api\/files\/([\w-]+)$/.exec(p);
  if (fm) { const id = fm[1];
    if (m === 'PUT') { if (me0.plan !== 'pro') throw err(402, 'pro_required', 'Upgrade to Pro to edit files.'); const r = await putFile(env, u, id, await readJson(request)); return J({ ...r, state: await buildState(env, u) }); }
    if (m === 'PATCH') { await patchFile(env, u, id, await readJson(request, 20000)); return J({ state: await buildState(env, u) }); }
    if (m === 'DELETE') { await deleteFileRec(env, u, id); return J({ state: await buildState(env, u) }); } }
  if (p === '/api/settings') {
    if (m === 'PUT') { const b = await readJson(request, 60000), patch = {}; if ('payLink' in b) patch.payLink = cleanPayLink(b.payLink); if ('fees' in b) patch.fees = cleanFees(b.fees); if ('school' in b) patch.school = String(b.school || '').trim().slice(0, 80); await putSettings(env, u.uid, patch); }
    return J({ settings: await getSettings(env, u.uid) }); }
  if (p === '/api/messages' && m === 'POST') return J(await apiMessages(env, u));
  if (p === '/api/campaign/start' && m === 'POST') return J(await campaignStart(env, u, me0));
  if (p === '/api/campaign/step' && m === 'POST') return J(await campaignStep(env, u, await readJson(request, 20000)));
  if (p === '/api/campaign/abort' && m === 'POST') return J(await campaignAbort(env, u, await readJson(request, 20000)));
  if (p === '/api/campaign/resume' && m === 'POST') return J(await campaignResume(env, u, await readJson(request, 20000)));
  if (p === '/api/pay/order' && m === 'POST') return J(await payOrder(env, real, url.origin));
  if (p === '/api/pay/verify' && m === 'POST') return J({ me: pub(await payVerify(env, real, await readJson(request, 20000))) });
  if (p === '/api/pay/failed' && m === 'POST') return J(await payFailed(env, real, await readJson(request, 20000)));
  if (p === '/api/pay/cancel' && m === 'POST') return J({ me: pub(await payCancel(env, real)) });
  if (p === '/api/seat/claim' && m === 'POST') return J({ me: pub(await claimSeat(env, real, await readJson(request, 20000))) });
  if (p === '/api/auth/signout' && m === 'POST') return J(await signOutRelease(env, real));
  throw err(404, 'not_found', 'Unknown endpoint.');
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/webhook/')) { try { await ensureSchema(env); } catch (e) { if (e.code !== 'db_unconfigured') throw e; if (!/^\/api\/(health|public-config)$/.test(url.pathname)) throw e; } return await api(request, env, url); }
      if (!env.ASSETS) return new Response('Not found', { status: 404 });
      if (url.pathname === '/admin' || url.pathname === '/admin/') { const r = await env.ASSETS.fetch(new Request(new URL('/admin/', url), request)); const h = new Headers(r.headers); h.set('x-robots-tag', 'noindex, nofollow'); h.set('cache-control', 'no-store'); for (const k in SEC_HEADERS) h.set(k, SEC_HEADERS[k]); return new Response(r.body, { status: r.status, headers: h }); }
      const r = await env.ASSETS.fetch(request); const h = new Headers(r.headers); for (const k in SEC_HEADERS) if (!h.has(k)) h.set(k, SEC_HEADERS[k]);
      if (url.pathname === '/sw.js' || url.pathname === '/index.html' || url.pathname === '/') h.set('cache-control', 'no-cache');
      return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
    } catch (e) {
      if (e instanceof HttpError) { const h = e.extra && e.extra.retryAfter ? { 'retry-after': String(e.extra.retryAfter) } : {}; return J({ error: e.code, message: e.message, ...e.extra }, e.status, h); }
      try { await logError(env, 'api', e); } catch (x) {}
      return J({ error: 'server_error', message: 'Something went wrong. Please try again.' }, 500);
    }
  },
};
