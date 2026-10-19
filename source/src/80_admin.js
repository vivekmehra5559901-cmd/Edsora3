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
