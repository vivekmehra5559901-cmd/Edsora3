/* PhonePe AutoPay backend test — run:  node tests/phonepe.test.mjs   (needs Node 22+; no wrangler, no network)
   Loads dist_worker.js, gives it an in-memory SQLite "D1", a fake PhonePe server and a fake Google JWKS. */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startMocks, mint, PROJECT } from './mocks.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-')); fs.copyFileSync(path.join(here, '../dist_worker.js'), tmp + '/w.mjs');
const worker = (await import(pathToFileURL(tmp + '/w.mjs').href)).default;
/* ── fake D1 ── */
const sql = new DatabaseSync(':memory:');
const D1 = { prepare: q => { const mk = args => ({ bind: (...a) => mk(a), first: async () => sql.prepare(q).get(...args) || null, all: async () => ({ results: sql.prepare(q).all(...args) }), run: async () => { const r = sql.prepare(q).run(...args); return { meta: { changes: Number(r.changes) } }; }, _q: q, _a: args }); return mk([]); },
  batch: async st => { const out = []; for (const s of st) out.push(await s.run()); return out; } };
/* ── fake PhonePe ── */
const PP = { orders: {}, subs: {}, calls: [], notify: [], cancels: [], tokenCalls: 0 };
const ppSrv = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c); const text = Buffer.concat(chunks).toString(), p = new URL(req.url, 'http://x').pathname;
  const send = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(o === undefined ? '' : JSON.stringify(o)); };
  if (p === '/__pp') { const b = JSON.parse(text); Object.assign(PP.orders, b.orders || {}); Object.assign(PP.subs, b.subs || {}); return send(200, {}); }
  if (p === '/v1/oauth/token') { PP.tokenCalls++; const f = new URLSearchParams(text); if (f.get('client_id') !== 'CID' || f.get('client_secret') !== 'CSEC' || f.get('client_version') !== '1' || f.get('grant_type') !== 'client_credentials') return send(401, { code: 'bad' }); return send(200, { access_token: 'tok1', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'O-Bearer' }); }
  if (req.headers.authorization !== 'O-Bearer tok1') return send(401, { code: 'Unauthorized' });
  PP.calls.push(req.method + ' ' + p);
  if (p === '/apis/pg/checkout/v2/pay') { const b = JSON.parse(text); PP.orders[b.merchantOrderId] = { state: 'PENDING', amount: b.amount, msid: b.paymentFlow.subscriptionDetails.merchantSubscriptionId, body: b }; PP.subs[PP.orders[b.merchantOrderId].msid] = 'ACTIVATION_IN_PROGRESS'; return send(200, { orderId: 'OMO' + b.merchantOrderId, state: 'PENDING', redirectUrl: 'https://mercury.phonepe.test/transact?token=abc' }); }
  let m = /^\/apis\/pg\/subscriptions\/v2\/order\/([^/]+)\/status$/.exec(p);
  if (m) { const o = PP.orders[decodeURIComponent(m[1])]; if (!o) return send(404, { code: 'NOT_FOUND' }); return send(200, { merchantOrderId: m[1], state: o.state, amount: o.amount, paymentFlow: { merchantSubscriptionId: o.msid }, paymentDetails: [{ transactionId: 'TX' + m[1], paymentMode: 'UPI_AUTO_PAY', state: o.state }] }); }
  m = /^\/apis\/pg\/subscriptions\/v2\/([^/]+)\/status$/.exec(p); if (m) { const s = PP.subs[m[1]]; if (!s) return send(404, { code: 'NOT_FOUND' }); return send(200, { merchantSubscriptionId: m[1], state: s }); }
  if (p === '/apis/pg/subscriptions/v2/notify') { const b = JSON.parse(text); PP.notify.push(b); PP.orders[b.merchantOrderId] = { state: 'PENDING', amount: b.amount, msid: b.paymentFlow.merchantSubscriptionId }; return send(200, { orderId: 'N' + b.merchantOrderId, state: 'NOTIFICATION_IN_PROGRESS' }); }
  m = /^\/apis\/pg\/subscriptions\/v2\/([^/]+)\/cancel$/.exec(p); if (m) { PP.cancels.push(m[1]); PP.subs[m[1]] = 'CANCELLED'; return send(204); }
  send(404, { code: 'nomock', p });
});
await new Promise(r => ppSrv.listen(9002, r));
const { srv: jwksSrv } = await startMocks(9001);
const env = { DB: D1, FIREBASE_JWKS_URL: 'http://localhost:9001/jwks', PHONEPE_CLIENT_ID: 'CID', PHONEPE_CLIENT_SECRET: 'CSEC', PHONEPE_CLIENT_VERSION: '1', PHONEPE_API_BASE: 'http://localhost:9002' };
const ORIGIN = 'https://edsora.test';
let pass = 0, fail = 0; const t = (n, c, i) => { if (c) pass++; else { fail++; console.log('FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 400)); } };
const mk = n => ({ uid: 'uid_' + n, email: n + '@school.test', name: n, device: 'dev_' + n });
const U = Object.fromEntries(['alice', 'bob', 'carol', 'dave'].map(n => [n, mk(n)]));
async function call(u, method, p, body, raw) {
  const h = { 'content-type': 'application/json', 'x-device-id': u.device, 'x-tz': 'Asia/Kolkata' }; if (u.token !== null) h.authorization = 'Bearer ' + mint(u);
  const r = await worker.fetch(new Request(ORIGIN + p, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) }), env);
  const x = await r.text(); let j; try { j = JSON.parse(x); } catch (e) { j = x; } return { s: r.status, j, raw: x };
}
const ctl = b => fetch('http://localhost:9002/__pp', { method: 'POST', body: JSON.stringify(b) });
const DAY = 864e5, SUB = uid => sql.prepare("SELECT * FROM subscriptions WHERE owner_uid=? ORDER BY id DESC").get(uid);
const wh = async (body, hdr = {}) => worker.fetch(new Request(ORIGIN + '/webhook/phonepe', { method: 'POST', headers: hdr, body: JSON.stringify(body) }), env);
try {
  let r = await call(U.alice, 'GET', '/api/public-config'); t('config: payments configured, no secrets', r.j.configured && r.j.configured.payments === true && !r.raw.includes('CSEC') && !r.raw.includes('razorpay'), r.raw.slice(0, 200));
  r = await call(U.alice, 'GET', '/api/me'); t('new user is Free', r.j.plan === 'free' && r.j.pricing.amount === 2499 && r.j.pricing.cycleDays === 29 && !('razorpayKeyId' in r.j), r.j);
  /* order */
  const o1 = await call(U.alice, 'POST', '/api/pay/order'); const b1 = Object.values(PP.orders).find(o => o.body && o.body.metaInfo.udf1 === 'uid_alice');
  t('order → 200 with PhonePe redirectUrl', o1.s === 200 && /^https:\/\/mercury/.test(o1.j.redirectUrl) && /^EDSO-[a-z0-9]{9}$/.test(o1.j.orderId) && o1.j.amount === 249900, o1);
  const f = b1 && b1.body.paymentFlow, sd = f && f.subscriptionDetails;
  t('mandate: ₹2,499 FIXED, TRANSACTION, ON_DEMAND, first debit = ₹2,499', b1 && b1.body.amount === 249900 && f.type === 'SUBSCRIPTION_CHECKOUT_SETUP' && sd.subscriptionType === 'RECURRING' && sd.amountType === 'FIXED' && sd.maxAmount === 249900 && sd.authWorkflowType === 'TRANSACTION' && sd.frequency === 'ON_DEMAND' && sd.expireAt > Date.now() + 365 * DAY, b1 && b1.body);
  t('redirectUrl returns to our app with the order id', f.merchantUrls.redirectUrl === ORIGIN + '/?pp=' + o1.j.orderId, f.merchantUrls);
  t('IDs are PhonePe-safe (≤63, [A-Za-z0-9_-])', /^[A-Za-z0-9_-]{1,63}$/.test(o1.j.orderId) && /^[A-Za-z0-9_-]{1,63}$/.test(sd.merchantSubscriptionId));
  t('order response leaks no secret', !o1.raw.includes('CSEC') && !o1.raw.includes('tok1'));
  const oid = o1.j.orderId;
  r = await call(U.alice, 'POST', '/api/pay/order'); t('2nd order while checkout pending → 409 subscription_pending', r.s === 409 && r.j.error === 'subscription_pending', r);
  /* verify */
  r = await call(U.alice, 'POST', '/api/pay/verify', { orderId: oid }); t('verify while PENDING → 402 payment_pending', r.s === 402 && r.j.error === 'payment_pending', r);
  r = await call(U.alice, 'POST', '/api/pay/verify', { orderId: 'nonsense' }); t('verify bad id → 400', r.s === 400, r);
  r = await call(U.alice, 'POST', '/api/pay/verify', { orderId: 'EDSO-zzzzzzzzz' }); t('verify unknown id → 403', r.s === 403, r);
  r = await call(U.bob, 'POST', '/api/pay/verify', { orderId: oid }); t("another account cannot claim alice's payment → 403", r.s === 403 && r.j.error === 'wrong_user', r);
  r = await call(U.alice, 'GET', '/api/me'); t('still Free after unpaid verify attempts', r.j.plan === 'free', r.j);
  await ctl({ orders: { [oid]: { ...PP.orders[oid], state: 'COMPLETED', amount: 100 } } }); r = await call(U.alice, 'POST', '/api/pay/verify', { orderId: oid }); t('wrong amount → 402, still Free', r.s === 402 && r.j.error === 'bad_amount', r);
  await ctl({ orders: { [oid]: { ...PP.orders[oid], amount: 249900 } }, subs: { [sd.merchantSubscriptionId]: 'ACTIVATION_IN_PROGRESS' } }); r = await call(U.alice, 'POST', '/api/pay/verify', { orderId: oid }); t('paid but mandate not yet ACTIVE → 402 payment_pending', r.s === 402 && r.j.error === 'payment_pending', r);
  await ctl({ subs: { [sd.merchantSubscriptionId]: 'ACTIVE' } });
  const t0 = Date.now(); r = await call(U.alice, 'POST', '/api/pay/verify', { orderId: oid });
  t('COMPLETED + ACTIVE → Pro unlocked', r.s === 200 && r.j.me.plan === 'pro' && r.j.me.role === 'owner' && r.j.me.sub.source === 'phonepe_subscription' && r.j.me.sub.status === 'active', r);
  t('plan runs exactly 29 days', Math.abs(r.j.me.sub.expires - (t0 + 29 * DAY)) < 60000, r.j.me.sub);
  t('4 seats created', r.j.me.seats && r.j.me.seats.length === 4, r.j.me.seats);
  const exp1 = SUB('uid_alice').expires; r = await call(U.alice, 'POST', '/api/pay/verify', { orderId: oid }); t('verify replay is idempotent (expiry unchanged)', r.s === 200 && SUB('uid_alice').expires === exp1);
  t('exactly one payment row (₹2,499)', sql.prepare("SELECT count(*) c,sum(amount) a FROM payments WHERE uid='uid_alice'").get().c === 1 && sql.prepare("SELECT sum(amount) a FROM payments WHERE uid='uid_alice'").get().a === 249900);
  r = await call(U.alice, 'POST', '/api/pay/order'); t('buying again while active → 409', r.s === 409 && r.j.error === 'already_active', r);
  /* renewal */
  r = await call(U.alice, 'GET', '/api/pay/renew-due'); t('renew-due when not yet due → nothing to do', r.s === 200 && r.j.checked === 0 && PP.notify.length === 0, r);
  sql.prepare("UPDATE subscriptions SET expires=? WHERE owner_uid='uid_alice'").run(Date.now() + 1.5 * DAY); const dueAt = SUB('uid_alice').expires;
  r = await call(U.alice, 'GET', '/api/pay/renew-due'); const n0 = PP.notify[0];
  t('within 2 days of end → pre-debit notice sent once', r.j.checked === 1 && PP.notify.length === 1 && n0.amount === 249900 && n0.paymentFlow.type === 'SUBSCRIPTION_REDEMPTION' && n0.paymentFlow.autoDebit === true && n0.paymentFlow.merchantSubscriptionId === sd.merchantSubscriptionId && /^EDSR-[a-z0-9]{9}$/.test(n0.merchantOrderId), { r: r.j, n0 });
  r = await call(U.alice, 'GET', '/api/pay/renew-due'); t('polling again does NOT notify/debit twice', PP.notify.length === 1 && r.j.results.waiting === 1, r.j);
  r = await call(U.alice, 'GET', '/api/state'); t('opening the app in the last 2 days does not duplicate the notice', PP.notify.length === 1, PP.notify.length);
  await ctl({ orders: { [n0.merchantOrderId]: { ...PP.orders[n0.merchantOrderId], state: 'COMPLETED' } } });
  r = await call(U.alice, 'GET', '/api/pay/renew-due'); const s2 = SUB('uid_alice');
  t('PhonePe COMPLETED → plan extended by exactly 29 days from old end', r.j.results.renewed === 1 && s2.expires === dueAt + 29 * DAY && s2.status === 'active', { r: r.j, s2, dueAt });
  t('renewal payment recorded', sql.prepare("SELECT count(*) c FROM payments WHERE uid='uid_alice'").get().c === 2);
  r = await call(U.alice, 'GET', '/api/pay/renew-due'); t('no double extension on re-poll', SUB('uid_alice').expires === dueAt + 29 * DAY && PP.notify.length === 1, r.j);
  /* failed debit → retry with back-off */
  sql.prepare("UPDATE subscriptions SET expires=? WHERE owner_uid='uid_alice'").run(Date.now() + 1 * DAY); const d2 = SUB('uid_alice').expires;
  await call(U.alice, 'GET', '/api/pay/renew-due'); const n1 = PP.notify[1]; t('next cycle: new notice with a NEW order id', PP.notify.length === 2 && n1.merchantOrderId !== n0.merchantOrderId);
  await ctl({ orders: { [n1.merchantOrderId]: { ...PP.orders[n1.merchantOrderId], state: 'FAILED' } } });
  r = await call(U.alice, 'GET', '/api/pay/renew-due'); t('failed debit: plan NOT extended, back-off (no instant retry)', SUB('uid_alice').expires === d2 && PP.notify.length === 2 && r.j.results.backoff === 1, { r: r.j, n: PP.notify.length });
  sql.prepare("UPDATE pp_orders SET updated=updated-?1 WHERE kind='renewal'").run(13 * 3600000);
  r = await call(U.alice, 'GET', '/api/pay/renew-due'); t('after 12h a retry notice is sent', PP.notify.length === 3, r.j);
  await ctl({ orders: { [PP.notify[2].merchantOrderId]: { ...PP.orders[PP.notify[2].merchantOrderId], state: 'COMPLETED' } } }); await call(U.alice, 'GET', '/api/pay/renew-due'); t('retry succeeds → +29 days', SUB('uid_alice').expires === d2 + 29 * DAY, SUB('uid_alice'));
  /* lapse: user revokes mandate in their UPI app */
  sql.prepare("UPDATE subscriptions SET expires=? WHERE owner_uid='uid_alice'").run(Date.now() + 1 * DAY); await ctl({ subs: { [sd.merchantSubscriptionId]: 'REVOKED' } });
  const nb = PP.notify.length; await call(U.alice, 'GET', '/api/pay/renew-due'); t('mandate revoked on PhonePe → no notice, marked cancelled, Pro until period end', PP.notify.length === nb && SUB('uid_alice').status === 'cancelled' && (await call(U.alice, 'GET', '/api/me')).j.plan === 'pro');
  /* webhook */
  const o2 = await call(U.carol, 'POST', '/api/pay/order'), id2 = o2.j.orderId, ms2 = PP.orders[id2].msid;
  let w = await wh({ event: 'subscription.setup.order.completed', payload: { merchantOrderId: id2, state: 'COMPLETED' } }); r = await call(U.carol, 'GET', '/api/me');
  t('forged "completed" webhook cannot unlock Pro (PhonePe still says PENDING)', w.status === 200 && r.j.plan === 'free', r.j.plan);
  await ctl({ orders: { [id2]: { ...PP.orders[id2], state: 'COMPLETED' } }, subs: { [ms2]: 'ACTIVE' } }); w = await wh({ event: 'subscription.setup.order.completed', payload: { merchantOrderId: id2, state: 'COMPLETED' } }); r = await call(U.carol, 'GET', '/api/me');
  t('real webhook → verified with PhonePe → Pro unlocked without the browser', w.status === 200 && r.j.plan === 'pro', { w: w.status, plan: r.j.plan });
  w = await wh({ event: 'x' }, {}); t('junk webhook body is harmless (200)', w.status === 200);
  w = await worker.fetch(new Request(ORIGIN + '/webhook/phonepe', { method: 'POST', body: 'not json' }), env); t('non-JSON webhook → 400', w.status === 400);
  w = await worker.fetch(new Request(ORIGIN + '/webhook/phonepe', { method: 'GET' }), env); t('webhook GET → 405', w.status === 405);
  const envA = { ...env, PHONEPE_WEBHOOK_USERNAME: 'u', PHONEPE_WEBHOOK_PASSWORD: 'p' }, good = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('u:p')))].map(x => x.toString(16).padStart(2, '0')).join('');
  w = await worker.fetch(new Request(ORIGIN + '/webhook/phonepe', { method: 'POST', body: '{}' }), envA); t('webhook auth configured: missing header → 401', w.status === 401);
  w = await worker.fetch(new Request(ORIGIN + '/webhook/phonepe', { method: 'POST', headers: { authorization: good }, body: '{}' }), envA); t('webhook auth configured: correct SHA256(user:pass) → 200', w.status === 200);
  /* cancel */
  r = await call(U.carol, 'POST', '/api/pay/cancel'); t('cancel → PhonePe cancel API called, plan stays Pro until period end', r.s === 200 && PP.cancels.includes(ms2) && r.j.me.plan === 'pro' && r.j.me.sub.status === 'cancelled', r);
  sql.prepare("UPDATE subscriptions SET expires=? WHERE owner_uid='uid_carol'").run(Date.now() + 1 * DAY); const nc = PP.notify.length; await call(U.carol, 'GET', '/api/pay/renew-due'); t('cancelled plan never renews', PP.notify.length === nc);
  /* abandoned checkout */
  const o3 = await call(U.dave, 'POST', '/api/pay/order'); sql.prepare("UPDATE pp_orders SET created=created-?1 WHERE uid='uid_dave'").run(20 * 60000);
  r = await call(U.dave, 'POST', '/api/pay/order'); t('abandoned checkout (>15 min) → user can start a fresh one', o3.s === 200 && r.s === 200 && r.j.orderId !== o3.j.orderId, r);
  /* unconfigured + provider errors */
  const envU = { ...env, PHONEPE_CLIENT_ID: '' }; const ru = await worker.fetch(new Request(ORIGIN + '/api/pay/order', { method: 'POST', headers: { authorization: 'Bearer ' + mint(U.bob), 'x-device-id': 'dev_bob' } }), envU); t('keys blank → clean 503 pay_unconfigured', ru.status === 503 && (await ru.json()).error === 'pay_unconfigured');
  const envB = { ...env, PHONEPE_CLIENT_SECRET: 'WRONG' }; const rb = await worker.fetch(new Request(ORIGIN + '/api/pay/order', { method: 'POST', headers: { authorization: 'Bearer ' + mint(U.bob), 'x-device-id': 'dev_bob' } }), envB); t('wrong secret → 502 and the pending row is closed (not stuck)', rb.status === 502 && sql.prepare("SELECT count(*) c FROM subscriptions WHERE owner_uid='uid_bob' AND status='created'").get().c === 0, rb.status);
  t('OAuth token is cached (not fetched per call)', PP.tokenCalls <= 3, PP.tokenCalls);
} finally { ppSrv.close(); jwksSrv.close(); }
console.log(`\nPhonePe tests: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
