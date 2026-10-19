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
