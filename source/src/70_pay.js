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
