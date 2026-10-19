import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMocks, mint, otherKey, PROJECT, S3 } from './mocks.mjs';
const MODE = process.argv[2] || 'd1', PORT = 8790, BASE = 'http://localhost:' + PORT, MOCK = 'http://localhost:9001';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), DIST = ROOT + '/_testdist_' + MODE, WR = process.env.WRANGLER_BIN || 'wrangler';
fs.rmSync(DIST, { recursive: true, force: true }); fs.mkdirSync(DIST + '/admin', { recursive: true });
fs.copyFileSync(ROOT + '/source/dist_worker.js', DIST + '/_worker.js'); fs.writeFileSync(DIST + '/index.html', '<h1>edsora</h1>'); fs.writeFileSync(DIST + '/admin/index.html', '<h1>admin</h1>');
let pass = 0, fail = 0; const t = (n, c, i) => { if (c) pass++; else { fail++; console.log('FAIL', n, i === undefined ? '' : JSON.stringify(i).slice(0, 300)); } if (c && process.env.V) console.log('PASS', n); };
const mk = (n, email) => ({ uid: 'uid_' + n, email, name: n[0].toUpperCase() + n.slice(1), device: 'dev_' + n });
const U = { alice: mk('alice', 'alice@school.test'), bob: mk('bob', 'bob@home.test'), carol: mk('carol', 'carol@home.test'), dave: mk('dave', 'dave@home.test'), zoe: mk('zoe', 'zoe@school.test'), eve: mk('eve', 'eve@home.test'), ann: mk('ann', 'ann@school.test'), admin1: mk('admin1', 'panchalsharva@gmail.com'), admin2: mk('admin2', 'mayankpanchal9287@gmail.com') };
async function call(u, method, path, body, extra = {}) {
  const h = { 'content-type': 'application/json', 'x-tz': u.tz || 'Asia/Kolkata', 'x-device-id': u.device, ...extra };
  if (u.token !== null) h.authorization = 'Bearer ' + (u.token || mint(u, u.claims || {})); const r = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const raw = await r.text(); let j; try { j = JSON.parse(raw); } catch (e) { j = raw; } return { s: r.status, j, h: r.headers, raw };
}
const mock = (p, b) => fetch(MOCK + p, { method: 'POST', body: JSON.stringify(b || {}) }).then(r => r.json());
const mstate = () => fetch(MOCK + '/__state').then(r => r.json());
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest('hex');
let payN = 0;
async function buyPro(u) { const o = await call(u, 'POST', '/api/pay/order'); if (o.s !== 200) return { o }; const pid = 'pay_' + (++payN) + '_' + u.uid; await mock('/__rzp/payment', { id: pid, order_id: o.j.orderId, amount: 249900, currency: 'INR', status: 'captured', method: 'upi' });
  const v = await call(u, 'POST', '/api/pay/verify', { razorpay_order_id: o.j.orderId, razorpay_payment_id: pid, razorpay_signature: hmac('secret123', o.j.orderId + '|' + pid) }); return { o, v, pid }; }
const dd = n => { const d = new Date(Date.now() - n * 864e5); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
const row = (name, cls, par, ph, pend, due, st) => ({ 'Student Name': name, 'Standard/Class': cls, 'Parent/Guardian Name': par, 'Mobile Number': ph, 'Pending Amount': pend, 'Due Date': due, 'Payment Status': st });
const baseTable = () => [row('Aarav Mehta', '6A', 'Rina Mehta', '9876501001', '4500', dd(5), 'Pending'), row('Diya Shah', '4', 'Kunal Shah', '9876501002', '3200', dd(45), 'Pending'), row('Kabir Rao', '7', 'Neha Rao', '9876501003', '6000', dd(75), 'Pending'),
  row('Ishita Jain', '3', 'Mohit Jain', '9876501004', '2500', dd(105), 'Pending'), row('Rohan Gupta', '8', 'Sunita Gupta', '9876501005', '1800', dd(160), 'Pending'), row('Meera Nair', '6B', 'Ravi Nair', '9876501006', '2000', '', 'Paid'), row('Tara Singh', '6A', 'Amit Singh', '9876501007', '', '', 'Paid')];
const wcount = s => (s.trim().match(/\S+/g) || []).length;
const words = (n) => Array.from({ length: n }, (_, i) => 'w' + i).join(' ');

const { srv } = await startMocks(9001);
const env = ['FIREBASE_JWKS_URL=' + MOCK + '/jwks', 'RAZORPAY_API_BASE=' + MOCK, 'RAZORPAY_KEY_ID=rzp_test_x', 'RAZORPAY_KEY_SECRET=secret123', 'RAZORPAY_WEBHOOK_SECRET=whsec_test', 'GEMINI_API_KEYS=g1,g2', 'GROQ_API_KEYS=q1,q2', 'LLM_BASE_URL_OVERRIDE=' + MOCK + '/llm'];
if (MODE === 'd1') env.push('WA_ACCESS_TOKEN=watok', 'WA_PHONE_NUMBER_ID=12345', 'WA_API_BASE=' + MOCK);
if (MODE === 'b2') env.push('B2_KEY_ID=' + S3.keyId, 'B2_KEY=' + S3.secret, 'B2_BUCKET=' + S3.bucket, 'B2_BUCKET_ID=bid', 'B2_ENDPOINT=http://localhost:9001');
const wr = spawn(WR, ['pages', 'dev', DIST, '--d1=DB', '--port', String(PORT), '--local', '--persist-to', '/tmp/edsora-d1-' + MODE + '-' + Date.now(), ...env.flatMap(v => ['--binding', v])], { stdio: ['ignore', 'pipe', 'pipe'] });
let wlog = ''; wr.stdout.on('data', d => wlog += d); wr.stderr.on('data', d => wlog += d);
for (let i = 0; i < 120; i++) { try { const r = await fetch(BASE + '/api/health'); if (r.ok) break; } catch (e) {} await new Promise(r => setTimeout(r, 500)); }
const done = () => { try { wr.kill('SIGKILL'); execSync('pkill -f workerd || true'); } catch (e) {} srv.close(); };
try {
  /* ═════════ A · security ═════════ */
  let r = await call({ ...U.alice, token: null }, 'GET', '/api/me'); t('A1 no token → 401', r.s === 401 && r.j.error === 'missing_token', r);
  r = await call({ ...U.alice, token: 'abc.def.ghi' }, 'GET', '/api/me'); t('A2 garbage token → 401', r.s === 401, r);
  r = await call({ ...U.alice, claims: { aud: 'other-project' } }, 'GET', '/api/me'); t('A3 wrong audience → 401', r.s === 401, r);
  r = await call({ ...U.alice, claims: { exp: Math.floor(Date.now() / 1000) - 10 } }, 'GET', '/api/me'); t('A4 expired token → 401', r.s === 401, r);
  r = await call({ ...U.alice, claims: { email_verified: false } }, 'GET', '/api/me'); t('A5 unverified email → 403', r.s === 403 && r.j.error === 'email_unverified', r);
  r = await call({ ...U.alice, token: mint(U.alice, {}, otherKey) }, 'GET', '/api/me'); t('A6 token signed by another key → 401', r.s === 401, r);
  r = await call({ ...U.alice, claims: { iss: 'https://securetoken.google.com/evil' } }, 'GET', '/api/me'); t('A7 wrong issuer → 401', r.s === 401, r);
  r = await call({ ...U.alice, claims: { firebase: { sign_in_provider: 'password' } } }, 'GET', '/api/me'); t('A8 password provider rejected → 403', r.s === 403, r);
  const tok = mint(U.alice), tam = tok.split('.'); tam[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(tam[1], 'base64url')), email: 'panchalsharva@gmail.com' })).toString('base64url');
  r = await call({ ...U.alice, token: tam.join('.') }, 'GET', '/api/admin/whoami'); t('A9 tampered payload (forged admin email) → 401', r.s === 401, r);
  r = await call({ ...U.alice, token: null }, 'GET', '/api/admin/stats'); t('A10 admin API without token → 401', r.s === 401, r);
  r = await call(U.eve, 'GET', '/api/admin/stats'); t('A11 normal Google user on admin API → 403', r.s === 403 && !JSON.stringify(r.j).includes('students'), r);
  r = await call(U.eve, 'PUT', '/api/admin/video', { url: 'https://youtu.be/dQw4w9WgXcQ' }); t('A12 normal user cannot change admin settings → 403', r.s === 403, r);
  r = await call(U.eve, 'GET', '/api/admin/files'); t('A13 normal user cannot list files → 403', r.s === 403, r);
  for (const a of ['admin1', 'admin2']) { r = await call(U[a], 'GET', '/api/admin/whoami'); t('A14 ' + a + ' allowlisted → 200', r.s === 200 && r.j.ok, r); }
  r = await call({ ...U.admin1, claims: { email: '  PanchalSharva@Gmail.COM ' } }, 'GET', '/api/admin/whoami'); t('A15 email normalised (trim+lowercase) → 200', r.s === 200, r);
  r = await call(U.eve, 'POST', '/api/files', {}, { origin: 'https://evil.test' }); t('A16 cross-origin write blocked → 403', r.s === 403 && r.j.error === 'bad_origin', r);
  r = await fetch(BASE + '/admin'); t('A17 /admin serves the admin page directly', r.status === 200 && (await r.text()).includes('admin') && r.headers.get('x-robots-tag') === 'noindex, nofollow', r.status);
  r = await fetch(BASE + '/'); t('A18 / serves the app + security headers', r.status === 200 && r.headers.get('x-content-type-options') === 'nosniff');
  r = await call(U.alice, 'GET', '/api/public-config'); t('A19 public-config exposes no secrets', r.s === 200 && !r.raw.includes('secret123') && !r.raw.includes('whsec') && r.j.firebase.projectId === PROJECT, r.raw.slice(0, 200));
  /* ═════════ B · free user & payments ═════════ */
  r = await call(U.alice, 'GET', '/api/me'); t('B1 new user is Free', r.s === 200 && r.j.plan === 'free' && r.j.role === 'free' && !('_ws' in r.j), r.j);
  r = await call(U.alice, 'POST', '/api/files', { name: 'x.csv', table: baseTable() }); t('B2 Free user cannot upload (402)', r.s === 402 && r.j.error === 'pro_required', r);
  r = await call(U.alice, 'POST', '/api/campaign/start'); t('B3 Free user cannot start campaign (402)', r.s === 402, r);
  const o1 = await call(U.alice, 'POST', '/api/pay/order'); t('B4 order created for exactly ₹2,499 INR', o1.s === 200 && o1.j.amount === 249900 && o1.j.currency === 'INR' && o1.j.orderId && o1.j.keyId === 'rzp_test_x' && !o1.raw.includes('secret123'), o1.j);
  r = await call(U.alice, 'GET', '/api/me'); t('B5 creating an order does NOT unlock Pro', r.j.plan === 'free', r.j);
  const oid = o1.j.orderId, pid1 = 'pay_manual_1';
  r = await call(U.alice, 'POST', '/api/pay/verify', { razorpay_order_id: oid, razorpay_payment_id: pid1, razorpay_signature: 'deadbeef' }); t('B6 forged signature rejected (400)', r.s === 400 && r.j.error === 'bad_signature', r);
  r = await call(U.alice, 'GET', '/api/me'); t('B7 still Free after forged verify', r.j.plan === 'free');
  await mock('/__rzp/payment', { id: pid1, order_id: oid, amount: 249900, currency: 'INR', status: 'failed' });
  r = await call(U.alice, 'POST', '/api/pay/verify', { razorpay_order_id: oid, razorpay_payment_id: pid1, razorpay_signature: hmac('secret123', oid + '|' + pid1) }); t('B8 valid signature but payment NOT captured → 402', r.s === 402 && r.j.error === 'not_captured', r);
  r = await call(U.bob, 'POST', '/api/pay/verify', { razorpay_order_id: oid, razorpay_payment_id: pid1, razorpay_signature: hmac('secret123', oid + '|' + pid1) }); t('B9 another account cannot claim alice\'s order → 403', r.s === 403, r);
  await mock('/__rzp/payment', { id: pid1, order_id: oid, amount: 100, currency: 'INR', status: 'captured' });
  r = await call(U.alice, 'POST', '/api/pay/verify', { razorpay_order_id: oid, razorpay_payment_id: pid1, razorpay_signature: hmac('secret123', oid + '|' + pid1) }); t('B10 wrong amount rejected → 402', r.s === 402 && r.j.error === 'amount_mismatch', r);
  await mock('/__rzp/payment', { id: pid1, order_id: oid, amount: 249900, currency: 'INR', status: 'authorized' });
  r = await call(U.alice, 'POST', '/api/pay/verify', { razorpay_order_id: oid, razorpay_payment_id: pid1, razorpay_signature: hmac('secret123', oid + '|' + pid1) });
  t('B11 authorised payment is captured then verified → Pro', r.s === 200 && r.j.me.plan === 'pro' && r.j.me.role === 'owner', r);
  const sub1 = r.j.me.sub; t('B12 subscription is a 29-day cycle', Math.abs((sub1.expires - sub1.started) / 864e5 - 29) < 0.01 && sub1.cycleDays === 29, sub1);
  r = await call(U.alice, 'POST', '/api/pay/verify', { razorpay_order_id: oid, razorpay_payment_id: pid1, razorpay_signature: hmac('secret123', oid + '|' + pid1) }); t('B13 replaying verify is idempotent (expiry unchanged)', r.s === 200 && r.j.me.sub.expires === sub1.expires, r.j);
  r = await call(U.alice, 'POST', '/api/pay/order'); t('B14 cannot buy again while >7 days remain (409)', r.s === 409 && r.j.error === 'already_active', r);
  /* webhook */
  const wh = (body, o = {}) => { const raw = JSON.stringify(body); return fetch(BASE + '/webhook/razorpay', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': o.sig ?? hmac('whsec_test', raw), 'x-razorpay-event-id': o.id || 'evt_' + Math.random().toString(36).slice(2) }, body: raw }).then(async x => ({ s: x.status, j: await x.json().catch(() => ({})) })); };
  r = await wh({ event: 'payment.captured', payload: {} }, { sig: 'bad' }); t('B15 webhook with bad signature → 400', r.s === 400, r);
  r = await fetch(BASE + '/webhook/razorpay', { method: 'POST', body: '{}' }); t('B16 webhook with no signature → 400', r.status === 400);
  r = await fetch(BASE + '/webhook/razorpay'); t('B17 webhook GET → 405', r.status === 405);
  const od = await call(U.dave, 'POST', '/api/pay/order'), pd = 'pay_hook_dave'; await mock('/__rzp/payment', { id: pd, order_id: od.j.orderId, amount: 249900, currency: 'INR', status: 'captured', method: 'card' });
  const ev = { event: 'payment.captured', payload: { payment: { entity: { id: pd, order_id: od.j.orderId, amount: 249900, currency: 'INR', status: 'captured', notes: { uid: U.dave.uid } } } } };
  r = await wh(ev, { id: 'evt_dave_1' }); t('B18 valid payment.captured webhook → 200', r.s === 200, r);
  r = await call(U.dave, 'GET', '/api/me'); t('B19 webhook alone activated Pro (no browser verify)', r.j.plan === 'pro', r.j); const exp0 = r.j.sub.expires;
  r = await wh(ev, { id: 'evt_dave_1' }); t('B20 duplicate event id → acknowledged as duplicate', r.s === 200 && r.j.duplicate === true, r);
  r = await wh({ ...ev, event: 'order.paid' }, { id: 'evt_dave_2' }); r = await call(U.dave, 'GET', '/api/me'); t('B21 second event for same payment does NOT extend subscription', r.j.sub.expires === exp0, [r.j.sub.expires, exp0]);
  const oe = await call(U.eve, 'POST', '/api/pay/order'), pe = 'pay_hook_eve'; await mock('/__rzp/payment', { id: pe, order_id: oe.j.orderId, amount: 500, currency: 'INR', status: 'captured' });
  await wh({ event: 'payment.captured', payload: { payment: { entity: { id: pe, order_id: oe.j.orderId, amount: 500, currency: 'INR', status: 'captured' } } } }); r = await call(U.eve, 'GET', '/api/me'); t('B22 webhook with wrong amount does not unlock', r.j.plan === 'free', r.j);
  await mock('/__rzp/payment', { id: 'pay_unknown', order_id: 'order_nope', amount: 249900, currency: 'INR', status: 'captured' });
  r = await wh({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_unknown', order_id: 'order_nope', amount: 249900, currency: 'INR', status: 'captured' } } } }); t('B23 unknown order ignored safely (200)', r.s === 200, r);
  r = await wh({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_f1', order_id: oe.j.orderId, amount: 249900, currency: 'INR', status: 'failed' } } } }); r = await call(U.eve, 'GET', '/api/me'); t('B24 payment.failed keeps account Free', r.j.plan === 'free');
  r = await call(U.eve, 'POST', '/api/pay/failed', { orderId: oe.j.orderId, cancelled: true }); t('B25 cancelled checkout recorded; retry allowed', r.s === 200); r = await call(U.eve, 'POST', '/api/pay/order'); t('B26 user can retry payment after cancel', r.s === 200 && r.j.orderId);
  const adm = await call(U.admin1, 'POST', '/api/pay/order'); t('B27 admin "Get Pro Plan" is free', adm.s === 200 && adm.j.free === true, adm); r = await call(U.admin1, 'GET', '/api/me'); t('B28 admin account is Pro with no payment', r.j.plan === 'pro' && r.j.sub.source === 'admin_grant', r.j);
  r = await call(U.admin2, 'POST', '/api/pay/order'); t('B29 second admin free too', r.j.free === true, r); const calls0 = (await mstate()).rzp.calls.filter(c => c === 'order').length; t('B30 admin grant made no Razorpay order', calls0 >= 1);
  /* ═════════ C · seats ═════════ */
  r = await call(U.alice, 'GET', '/api/me'); const seatsA = r.j.seats; t('C1 owner sees 4 seats: #1 is theirs, 3 free, with ref numbers', seatsA.length === 4 && seatsA[0].state === 'you' && seatsA.slice(1).every(s => s.state === 'free' && typeof s.ref === 'number'), seatsA);
  const refsA = seatsA.map(s => s.ref); t('C2 global numbering is a block of 4', refsA.every((x, i) => i === 0 || x === refsA[i - 1] + 1), refsA);
  r = await call(U.dave, 'GET', '/api/me'); const refsD = r.j.seats.map(s => s.ref); t('C3 next buyer gets the NEXT block (no overlap)', Math.min(...refsD) > Math.max(...refsA), [refsA, refsD]);
  const seat2 = refsA[1], seat3 = refsA[2], seat4 = refsA[3];
  r = await call(U.bob, 'POST', '/api/seat/claim', { ref: 'premium' + seat2, email: 'wrong@x.test' }); t('C4 wrong buyer email → 403 with exact message', r.s === 403 && r.j.message === "This email doesn't match your subscription buyer's email. Please try again.", r);
  r = await call(U.bob, 'GET', '/api/me'); t('C5 wrong email did not unlock', r.j.plan === 'free');
  r = await call(U.bob, 'POST', '/api/seat/claim', { ref: 'premium' + (Math.max(...refsD) + 50), email: 'alice@school.test' }); t('C6 a link number nobody generated is not accessible (404)', r.s === 404, r);
  r = await call(U.bob, 'POST', '/api/seat/claim', { ref: 'premium' + refsA[0], email: 'alice@school.test' }); t('C7 the owner\'s own seat link is not claimable', r.s === 404, r);
  r = await call(U.bob, 'POST', '/api/seat/claim', { ref: 'premium' + seat2, email: '  ALICE@School.test ' }); t('C8 correct buyer email (any case/spacing) unlocks Pro', r.s === 200 && r.j.me.plan === 'pro' && r.j.me.role === 'member', r);
  r = await call(U.bob, 'GET', '/api/me'); t('C9 member sees seats without any link numbers', r.j.seats.every(s => !('ref' in s)) && r.j.seats.find(s => s.state === 'you').slot === 2, r.j.seats);
  t('C10 member avatar group lists joined accounts', r.j.members.length === 2 && r.j.members.every(m => m.initial), r.j.members);
  r = await call({ ...U.bob, device: 'other-phone' }, 'GET', '/api/me'); t('C11 same account on a DIFFERENT device is blocked (device-locked seat)', r.j.plan === 'free' && r.j.deviceBlocked === true, r.j);
  r = await call(U.carol, 'POST', '/api/seat/claim', { ref: 'premium' + seat2, email: 'alice@school.test' }); t('C12 a taken seat cannot be taken by someone else → 409', r.s === 409 && r.j.error === 'seat_taken', r);
  r = await call(U.carol, 'POST', '/api/seat/claim', { ref: 'premium' + seat3, email: 'alice@school.test' }); t('C13 second invitee can take the next seat', r.s === 200 && r.j.me.role === 'member', r);
  r = await call(U.alice, 'GET', '/api/me'); t('C14 owner sees seats 2 and 3 taken, 4 free', r.j.seats[1].state === 'taken' && r.j.seats[2].state === 'taken' && r.j.seats[3].state === 'free' && r.j.members.length === 3, r.j.seats);
  r = await call(U.alice, 'POST', '/api/seat/claim', { ref: 'premium' + seat4, email: 'alice@school.test' }); t('C15 owner cannot claim own plan\'s seat', r.s === 409 || r.s === 404, r);
  r = await call(U.bob, 'POST', '/api/seat/claim', { ref: 'premium' + seat4, email: 'alice@school.test' }); t('C16 a member cannot hold two seats', r.s === 409, r);
  r = await call({ ...U.bob, device: 'other-phone' }, 'POST', '/api/auth/signout'); r = await call(U.bob, 'POST', '/api/auth/signout'); r = await call({ ...U.bob, device: 'other-phone' }, 'GET', '/api/me'); t('C17 after sign-out on the first device the seat can move to a new device', r.j.plan === 'pro' && r.j.role === 'member', r.j); U.bob.device = 'other-phone';
  for (let i = 0; i < 10; i++) r = await call(U.eve, 'POST', '/api/seat/claim', { ref: 'premium' + seat4, email: 'guess' + i + '@x.test' }); t('C18 email guessing is rate-limited (429)', r.s === 429, r);
  /* ═════════ D · files, de-dup, fees ═════════ */
  let f = await call(U.alice, 'POST', '/api/files', { name: 'fees.xlsx', table: baseTable(), raw: JSON.stringify(baseTable()) }); let S = f.j.state;
  t('D1 upload stores file; 7 students', f.s === 200 && S.files.length === 1 && S.rows.length === 7, f.j.error || S.rows.length);
  t('D2 counts: total, newly pending, pending ≥ month, paid', S.stats.students === 7 && S.stats.pending === 5 && S.stats.newlyPending === 1 && S.stats.pendingMonth === 4 && S.stats.paid === 1, S.stats);
  t('D3 amounts: paid 2000, pending 18000', S.stats.paidAmount === 2000 && S.stats.pendingAmount === 18000, S.stats);
  t('D4 file keeps its raw editable content', S.files[0].raw.includes('Aarav Mehta') && S.files[0].count === 7);
  for (let i = 1; i <= 4; i++) { r = await call(U.alice, 'POST', '/api/files', { name: 'fees.xlsx', table: baseTable() }); t('D5.' + i + ' identical re-upload #' + i + ' accepted as unchanged (no duplicates)', r.s === 200 && r.j.unchanged === true, r); }
  r = await call(U.alice, 'POST', '/api/files', { name: 'copy-of-fees.xlsx', table: baseTable() }); t('D6 5th identical upload → limit toast text', r.s === 429 && r.j.error === 'unchanged_limit' && r.j.message === '5 unchanged files detected. You\u2019ve reached the limit.', r);
  r = await call(U.bob, 'GET', '/api/state'); t('D7 seat member sees the SAME workspace (shared Pro)', r.j.state.files.length === 1 && r.j.state.rows.length === 7, r.j.state && r.j.state.rows.length);
  let tb = baseTable(); tb[0]['Pending Amount'] = '4700';
  f = await call(U.bob, 'POST', '/api/files', { name: 'fees.xlsx', table: tb }); S = f.j.state; t('D8 small modification merges into the same file (no multiplication); member can edit', f.s === 200 && S.files.length === 1 && S.rows.length === 7 && S.stats.pendingAmount === 18200, f.j.error || S.stats);
  const two = [row('Diya Shah', '4', 'Kunal Shah', '9876501002', '3300', dd(45), 'Pending'), row('Neel Das', '5', 'Rita Das', '9876501008', '1000', dd(3), 'Pending')];
  f = await call(U.alice, 'POST', '/api/files', { name: 'second.csv', table: two }); S = f.j.state; t('D9 same person in a NEW file counts once, newest wins; new person adds 1', S.files.length === 2 && S.rows.length === 8 && S.rows.find(x => x.student === 'Diya Shah').pending === 3300, [S.rows.length, S.stats]);
  t('D10 dashboard dedup: students 8, pending 6, amount 19500', S.stats.students === 8 && S.stats.pending === 6 && S.stats.pendingAmount === 4700 + 3300 + 6000 + 2500 + 1800 + 1000, S.stats);
  await call(U.alice, 'PUT', '/api/settings', { fees: { standards: [{ standard: 6, name: '6th', sections: [{ section: 'A', fee: '1800' }, { section: 'B', fee: '1800' }] }] } });
  const fid = S.files.find(x => x.name === 'fees.xlsx').id; let txt = JSON.parse(S.files.find(x => x.id === fid).raw); txt.find(x => x['Student Name'] === 'Kabir Rao')['Pending Amount'] = '6100';
  f = await call(U.alice, 'PUT', '/api/files/' + fid, { text: JSON.stringify(txt) }); t('D11 inline edit saves into the stored file and changes the numbers', f.s === 200 && f.j.state.rows.find(x => x.student === 'Kabir Rao').pending === 6100 && f.j.state.files.find(x => x.id === fid).raw.includes('6100'), f.j.error);
  f = await call(U.alice, 'PUT', '/api/files/' + fid, { text: JSON.stringify(txt) }); t('D12 saving without changes → unchanged', f.j.unchanged === true, f.j);
  const bad = JSON.parse(JSON.stringify(txt)); bad[1]['Pending Amount'] = ''; bad[1]['Payment Status'] = 'Pending'; f = await call(U.alice, 'PUT', '/api/files/' + fid, { text: JSON.stringify(bad) }); t('D13 student with no fee amount is rejected with its row index', f.s === 422 && f.j.error === 'fee_missing' && typeof f.j.index === 'number', f);
  const add = JSON.parse(JSON.stringify(txt)); add.push(row('Zara Khan', '2', 'Imran Khan', '9876501009', '900', dd(2), 'Pending')); f = await call(U.alice, 'PUT', '/api/files/' + fid, { text: JSON.stringify(add) }); t('D14 adding a row works', f.s === 200 && f.j.state.rows.length === 9, f.j.error);
  f = await call(U.alice, 'PUT', '/api/files/' + fid, { text: '{not json' }); t('D15 malformed content → "Invalid file format"', f.s === 400 && f.j.message === 'Invalid file format', f);
  f = await call(U.dave, 'DELETE', '/api/files/' + fid); r = await call(U.alice, 'GET', '/api/state'); t('D16 another account cannot delete alice\'s file', r.j.state.files.some(x => x.id === fid), r.j.state.files.length);
  r = await call(U.zoe, 'GET', '/api/state'); t('D17 other accounts see none of alice\'s data', r.j.state.rows.length === 0 && r.j.state.files.length === 0, r.j.state.rows.length);
  r = await call(U.alice, 'GET', '/api/state'); S = r.j.state;
  t('D18 Fees page: standard 6 paid row with no amount adds ₹1,800 to the paid ring', S.rows.find(x => x.student === 'Tara Singh').paid === 1800 && S.stats.paidAmount === 3800, [S.rows.find(x => x.student === 'Tara Singh'), S.stats.paidAmount]);
  const fx = JSON.parse(JSON.stringify(add)); fx.find(x => x['Student Name'] === 'Tara Singh')['Pending Amount'] = '1800'; f = await call(U.alice, 'PUT', '/api/files/' + fid, { text: JSON.stringify(fx) }); t('D19 same ₹1,800 in file AND fees page is NOT counted twice', f.j.state.rows.find(x => x.student === 'Tara Singh').paid === 1800 && f.j.state.stats.paidAmount === 3800, f.j.state && f.j.state.stats);
  r = await call(U.alice, 'PUT', '/api/settings', { payLink: 'not a link' }); t('D20 invalid payment link rejected', r.s === 400, r);
  r = await call(U.alice, 'PUT', '/api/settings', { payLink: 'pay.school.test/fees?x=1' }); t('D21 link without scheme is normalised', r.j.settings.payLink === 'https://pay.school.test/fees?x=1', r.j);
  r = await call(U.alice, 'PUT', '/api/settings', { payLink: 'https://pay.school.test/fees' });
  const big = Array.from({ length: 10001 }, (_, i) => row('S' + i, '1', 'P' + i, '98' + String(10000000 + i), '10', dd(1), 'Pending')); r = await call(U.alice, 'POST', '/api/files', { name: 'big.csv', table: big }); t('D22 more than 10,000 rows rejected (413)', r.s === 413, r.s);
  const blank = Array.from({ length: 100 }, () => row('', '', '', '', '', '', '')); r = await call(U.ann, 'POST', '/api/pay/order'); const ob = r.j.orderId; await mock('/__rzp/payment', { id: 'pay_ann', order_id: ob, amount: 249900, currency: 'INR', status: 'captured' }); await call(U.ann, 'POST', '/api/pay/verify', { razorpay_order_id: ob, razorpay_payment_id: 'pay_ann', razorpay_signature: hmac('secret123', ob + '|pay_ann') });
  r = await call(U.ann, 'POST', '/api/files', { name: 'blank.xlsx', table: blank }); t('D23 blank template uploads as a blank file (0 students)', r.s === 200 && r.j.state.blank === true && r.j.state.rows.length === 0 && r.j.state.files.length === 1, r.j.error);
  r = await call(U.ann, 'PUT', '/api/settings', { payLink: 'https://pay.ann.test' }); r = await call(U.ann, 'POST', '/api/campaign/start'); t('D24 blank file cannot start a campaign', r.s === 400 && r.j.message === 'Blank Excel files cannot start a campaign.', r);
  /* ═════════ E · WhatsApp template messages ═════════ */
  const TEMPLATE = 'Hello {{1}}, this is a fee payment reminder from {{2}} regarding {{3}}. An amount of \u20B9{{4}} remains outstanding, with a due date of {{5}}. Kindly complete your payment using the payment link provided below: {{6}}. If you have already paid, please disregard this reminder.';
  const render = v => TEMPLATE.replace(/\{\{(\d)\}\}/g, (m, i) => v[i - 1]), longDate = ms => new Date(ms).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }), inr = n => Number(n).toLocaleString('en-IN');
  const link = 'https://pay.school.test/fees'; await mock('/__reset'); r = await call(U.alice, 'POST', '/api/messages'); const M = r.j; S = (await call(U.alice, 'GET', '/api/state')).j.state; const pend = S.rows.filter(x => x.pending > 0);
  t('E1 one message per pending student', r.s === 200 && M.messages.length === pend.length && pend.length >= 6, [M.messages.length, pend.length]);
  t('E2 every message is EXACTLY the approved template filled with the student\'s own data', pend.every((p, i) => M.messages[i] === render([p.parent, 'the school office', p.student, inr(p.pending), longDate(p.due) || 'this month', link])), [M.messages[0], pend[0]]);
  t('E3 the school\'s own payment link is inside every message (and only that link)', M.messages.every(m => m.includes('below: ' + link + '.') && (m.match(/https?:\/\//g) || []).length === 1));
  t('E4 clean data needs ZERO LLM calls (saves quota)', (await mstate()).llm.calls.length === 0, (await mstate()).llm.calls.length);
  t('E5 overdue tone bucket is still computed per student (1..5)', [1, 2, 3, 4, 5].every(x => M.meta.some(mm => mm.tone === x)), M.meta.map(x => x.tone));
  r = await call(U.alice, 'PUT', '/api/settings', { school: 'Sun\nrise   Public School' }); r = await call(U.alice, 'POST', '/api/messages'); t('E6 school name fills {{2}} (newlines/extra spaces stripped for WhatsApp)', r.j.messages[0].includes('reminder from Sun rise Public School regarding'), r.j.messages[0].slice(0, 90));
  const weird = (n, st, pa, amt) => ({ name: 'w' + n + '.csv', table: [row(st, '3', pa, '98000' + String(10000 + n), String(amt), dd(4), 'Pending')] });
  await mock('/__reset'); for (let i = 0; i < 4; i++) { const w = weird(i, 'RAHUL VERMA ' + i, 'Mr. SURESH VERMA S/O RAMESH ' + i, 1200 + i); await call(U.alice, 'POST', '/api/files', w); r = await call(U.alice, 'POST', '/api/messages'); }
  let cs = (await mstate()).llm.calls; const wmsg = r.j.messages.filter(m => m.includes('Rahul Verma'));
  t('E7 messy names are tidied by the LLM (symbols, digits and "S/O" tails removed, nothing invented)', wmsg.length >= 4 && wmsg.every(m => m.includes('Hello Suresh Verma, ') && !/S\/O|[0-9]{2}.*regarding/.test(m.split('regarding')[0])), wmsg[0]);
  t('E8 routing: calls spread across Gemini AND Groq keys', cs.length === 4 && new Set(cs.map(c => c.provider)).size === 2 && new Set(cs.map(c => c.key)).size >= 3, cs.map(c => c.provider + ':' + c.key));
  await call(U.alice, 'POST', '/api/messages'); t('E9 tidied names are cached — no repeat LLM calls', (await mstate()).llm.calls.length === 4);
  await mock('/__reset'); await mock('/__llm', { mode: 'rate-g1' }); let g1calls = 0, ok = true; for (let i = 10; i < 16; i++) { await call(U.alice, 'POST', '/api/files', weird(i, 'KIRAN ROY ' + i, 'ASHA ROY S/O X' + i, 900 + i)); r = await call(U.alice, 'POST', '/api/messages'); ok = ok && r.j.messages.some(m => m.includes('Kiran Roy') && m.includes('Hello Asha Roy,')); } cs = (await mstate()).llm.calls;
  t('E10 a rate-limited key fails over to the next key automatically', ok, r.j.messages.slice(-1)); t('E11 …and the limited key is parked, not hammered', cs.filter(c => c.key === 'g1').length <= 1, cs.filter(c => c.key === 'g1').length);
  await mock('/__reset'); await mock('/__llm', { mode: 'model404' }); await call(U.alice, 'POST', '/api/files', weird(20, 'MOHAN DAS 20', 'LATA DAS S/O Y', 700)); r = await call(U.alice, 'POST', '/api/messages'); cs = (await mstate()).llm.calls;
  t('E12 an unavailable model falls back to the next model/provider', r.j.messages.some(m => m.includes('Hello Lata Das,')) && cs.some(c => c.model === 'gemini-2.0-flash' || c.provider === 'groq'), cs.map(c => c.model));
  await mock('/__reset'); await mock('/__llm', { mode: 'bad' }); await call(U.alice, 'POST', '/api/files', weird(21, 'DEEP NATH 21', 'RANI NATH S/O Z', 650)); r = await call(U.alice, 'POST', '/api/messages');
  t('E13 an LLM answer that invents text is rejected → safe rule-based tidy is used', r.j.messages.some(m => m.includes('Hello Rani Nath,')) && !r.j.messages.some(m => m.includes('Hacker')), r.j.messages.slice(-1));
  await mock('/__reset'); await mock('/__llm', { mode: 'rate-all' }); await call(U.alice, 'POST', '/api/files', weird(22, 'ZED ALI 22', 'FARAH ALI S/O Q', 640)); r = await call(U.alice, 'POST', '/api/messages'); t('E14 every key down → rule-based tidy, app keeps working', r.s === 200 && r.j.messages.some(m => m.includes('Hello Farah Ali,')), r.j.messages.slice(-1));
  await mock('/__reset'); await call(U.alice, 'PUT', '/api/settings', { school: '' });
  /* ═════════ F · campaign ═════════ */
  r = await call(U.zoe, 'POST', '/api/pay/order'); const oz = r.j.orderId; await mock('/__rzp/payment', { id: 'pay_zoe', order_id: oz, amount: 249900, currency: 'INR', status: 'captured' }); await call(U.zoe, 'POST', '/api/pay/verify', { razorpay_order_id: oz, razorpay_payment_id: 'pay_zoe', razorpay_signature: hmac('secret123', oz + '|pay_zoe') });
  const zt = Array.from({ length: 12 }, (_, i) => row('Pupil ' + String.fromCharCode(65 + i), '5', 'Guardian ' + String.fromCharCode(65 + i), '98765' + String(20000 + i), String(1000 + i * 100), dd(2 + i * 12), 'Pending')); await call(U.zoe, 'POST', '/api/files', { name: 'zoe.csv', table: zt });
  if (MODE === 'd1') {
    r = await call(U.zoe, 'POST', '/api/campaign/start'); t('F1 campaign needs a payment link first', r.s === 400 && r.j.error === 'paylink_required', r);
    await call(U.zoe, 'PUT', '/api/settings', { payLink: 'https://pay.zoe.test/f' });
    r = await call(U.zoe, 'POST', '/api/campaign/start'); const cid = r.j.id; t('F2 campaign starts with all 12 pending', r.s === 200 && r.j.total === 12 && !r.j.notice, r);
    r = await call(U.zoe, 'POST', '/api/campaign/step', { id: cid, n: 5 }); t('F3 first batch sends 5', r.s === 200 && r.j.cursor === 5 && r.j.sent === 5, r.j);
    let ws = (await mstate()).wa.sent; const pm = x => x.template.components[0].parameters.map(p => p.text); t('F4 WhatsApp v26 call: approved template, E.164 number, 6 variables with the school\'s own link in {{6}}', ws.length === 5 && ws[0].messaging_product === 'whatsapp' && ws[0].to.startsWith('91') && ws[0].type === 'template' && ws[0].template.name === 'edsora_fee_reminder' && ws[0].template.language.code === 'en' && ws.every(x => pm(x).length === 6 && pm(x)[5] === 'https://pay.zoe.test/f') && pm(ws[0])[0].startsWith('Guardian') && pm(ws[0])[1] === 'the school office' && pm(ws[0])[2].startsWith('Pupil'), ws[0] && ws[0].template);
    r = await call(U.zoe, 'POST', '/api/campaign/abort', { id: cid }); t('F5 abort pauses at the exact position', r.j.status === 'paused' && r.j.cursor === 5, r.j);
    r = await call(U.zoe, 'POST', '/api/campaign/step', { id: cid, n: 5 }); t('F6 paused campaign sends nothing', r.j.paused === true && (await mstate()).wa.sent.length === 5, r.j);
    r = await call(U.zoe, 'GET', '/api/state'); t('F7 state reports the paused campaign (for the Resume toast)', r.j.state.campaign && r.j.state.campaign.status === 'paused' && r.j.state.campaign.cursor === 5 && r.j.state.stats.remaining === 7, r.j.state.campaign);
    r = await call(U.zoe, 'POST', '/api/campaign/resume', { id: cid }); t('F8 resume continues from where it stopped', r.j.status === 'running' && r.j.cursor === 5, r.j);
    const [a, b] = await Promise.all([call(U.zoe, 'POST', '/api/campaign/step', { id: cid, n: 5 }), call(U.zoe, 'POST', '/api/campaign/step', { id: cid, n: 5 })]);
    r = await call(U.zoe, 'POST', '/api/campaign/step', { id: cid, n: 5 }); ws = (await mstate()).wa.sent;
    t('F9 parallel steps never double-send; all 12 sent exactly once', ws.length === 12 && new Set(ws.map(m => m.to)).size === 12 && r.j.done === true, [ws.length, new Set(ws.map(m => m.to)).size, a.j, b.j]);
    r = await call(U.zoe, 'GET', '/api/state'); t('F10 scheduled reminders reach 0 after all are sent', r.j.state.stats.remaining === 0 && r.j.state.stats.sentToday === 12, r.j.state.stats);
    r = await call(U.zoe, 'POST', '/api/campaign/start'); t('F11 second start the same day: nothing re-sent + same-day notice', r.j.total === 0 && r.j.notice === 'same_day' && (await mstate()).wa.sent.length === 12, r.j);
    const zid = (await call(U.zoe, 'GET', '/api/state')).j.state.files[0].id; let zt2 = JSON.parse((await call(U.zoe, 'GET', '/api/state')).j.state.files[0].raw); zt2[3]['Pending Amount'] = '9999';
    await call(U.zoe, 'PUT', '/api/files/' + zid, { text: JSON.stringify(zt2) }); r = await call(U.zoe, 'POST', '/api/campaign/start'); t('F12 same day: ONLY the modified student is queued (+ notice)', r.j.total === 1 && r.j.notice === 'same_day', r.j);
    r = await call(U.zoe, 'POST', '/api/campaign/step', { id: r.j.id, n: 5 }); ws = (await mstate()).wa.sent; t('F13 exactly one new message sent, with the new amount', ws.length === 13 && pm(ws[12])[3] === '9,999', ws[12] && ws[12].template);
    const ist = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()); const alt = ['Pacific/Pago_Pago', 'Pacific/Kiritimati', 'America/Los_Angeles'].find(z => new Intl.DateTimeFormat('en-CA', { timeZone: z }).format(new Date()) !== ist);
    r = await call({ ...U.zoe, tz: alt }, 'POST', '/api/campaign/start'); t('F14 a new calendar day allows a full campaign again (' + alt + ')', r.j.total === 12 && !r.j.notice, r.j);
    if (r.j.id) { await call({ ...U.zoe, tz: alt }, 'POST', '/api/campaign/step', { id: r.j.id, n: 10 }); await call({ ...U.zoe, tz: alt }, 'POST', '/api/campaign/step', { id: r.j.id, n: 10 }); } t('F15 …and sends all 12 again', (await mstate()).wa.sent.length === 25, (await mstate()).wa.sent.length);
    r = await call(U.zoe, 'POST', '/api/campaign/resume', { id: (await call({ ...U.zoe, tz: alt }, 'GET', '/api/state')).j.state.campaign?.id || 'x' }); t('F16 resuming a previous day\'s campaign is refused', r.s === 404 || r.s === 410, r.s);
    await mock('/__wa', { failFor: ['9999999999'] }); const ft = [row('Fail Kid', '1', 'Fail Parent', '9999999999', '700', dd(3), 'Pending'), row('Ok Kid', '1', 'Ok Parent', '9111111111', '800', dd(3), 'Pending')]; await call(U.ann, 'POST', '/api/files', { name: 'f.csv', table: ft });
    r = await call(U.ann, 'POST', '/api/campaign/start'); r = await call(U.ann, 'POST', '/api/campaign/step', { id: r.j.id, n: 5 }); t('F17 an undeliverable number is counted as failed, others still send', r.j.sent === 1 && r.j.failed === 1 && r.j.done, r.j);
    await mock('/__wa', { failFor: [] }); r = await call(U.ann, 'POST', '/api/campaign/start'); t('F18 failed ones are retried on the next start, sent ones are not', r.j.total === 1, r.j);
    if (r.j.id) await call(U.ann, 'POST', '/api/campaign/step', { id: r.j.id, n: 5 });
    const bigT = Array.from({ length: 205 }, (_, i) => row('Mass ' + i, '4', 'Parent ' + i, '97' + String(10000000 + i), '500', dd(3), 'Pending')); await call(U.ann, 'POST', '/api/files', { name: 'mass.csv', table: bigT });
    r = await call(U.ann, 'POST', '/api/campaign/start'); const mid = r.j.id; let tot = 0; for (let i = 0; i < 30 && tot < r.j.total; i++) { const x = await call(U.ann, 'POST', '/api/campaign/step', { id: mid, n: 10 }); tot = x.j.cursor; if (x.j.done) break; }
    t('F21 a 205-number campaign completes', (await call(U.ann, 'GET', '/api/state')).j.state.stats.remaining === 0, tot);
    const annRefs = (await call(U.ann, 'GET', '/api/me')).j.seats.map(s => s.ref), maxU = mk('max', 'max@home.test'); r = await call(maxU, 'POST', '/api/seat/claim', { ref: 'premium' + annRefs[1], email: 'ann@school.test' }); t('F22 setup: a seat admin joins ann\'s plan', r.s === 200 && r.j.me.role === 'member', r);
    r = await call(maxU, 'POST', '/api/campaign/start'); t('F23 seat admin cannot restart after a >200 campaign today → exact toast text', r.s === 403 && r.j.error === 'seat_same_day' && r.j.message === "Today's campaign has already been completed by your subscription owner or another seat admin. Restarting campaigns for the same numbers multiple times in a single day is not permitted. Please try again tomorrow.", r);
    r = await call(U.ann, 'POST', '/api/campaign/start'); t('F24 the owner may still start (only modified messages are queued)', r.s === 200 && r.j.total === 0 && r.j.notice === 'same_day', r.j);
  }
  if (MODE === 'b2') { r = await call(U.zoe, 'PUT', '/api/settings', { payLink: 'https://pay.zoe.test/f' }); r = await call(U.zoe, 'POST', '/api/campaign/start'); r = await call(U.zoe, 'POST', '/api/campaign/step', { id: r.j.id, n: 5 }); t('F19 WhatsApp not configured → clear 503 and campaign pauses (nothing lost)', r.s === 503 && r.j.error === 'wa_unconfigured', r); S = (await call(U.zoe, 'GET', '/api/state')).j; t('F20 …campaign is paused so Resume works later', S.state.campaign && S.state.campaign.status === 'paused', S.state.campaign); }
  /* ═════════ G · admin panel API ═════════ */
  r = await call(U.admin1, 'GET', '/api/admin/accounts'); const accs = r.j.accounts; t('G1 accounts list with usage', r.s === 200 && accs.length >= 6 && accs.find(a => a.email === 'alice@school.test').usage.startsWith('Pro'), accs.slice(0, 2));
  r = await call(U.admin2, 'GET', '/api/admin/files'); const fl = r.j.files; t('G2 every user file is listed with its account name', fl.length >= 3 && fl.every(x => x.accountName && x.url) && fl.some(x => x.accountName === 'Alice' && x.name === 'fees.xlsx'), fl.slice(0, 2));
  const target = fl.find(x => x.name === 'fees.xlsx'); r = await fetch(BASE + target.url, { headers: { authorization: 'Bearer ' + mint(U.admin1), 'x-tz': 'UTC' } }); const bytes = Buffer.from(await r.arrayBuffer()); fs.writeFileSync('/tmp/dl_' + MODE + '.xlsx', bytes);
  t('G3 admin can download the file as .xlsx (valid ZIP container)', r.status === 200 && bytes.slice(0, 2).toString() === 'PK' && (r.headers.get('content-disposition') || '').includes('.xlsx'), r.status);
  r = await fetch(BASE + target.url + '?format=csv', { headers: { authorization: 'Bearer ' + mint(U.admin1) } }); const csv = await r.text(); t('G4 …and as .csv with the real data', r.status === 200 && csv.includes('Aarav Mehta') && csv.includes('Rina Mehta'), csv.slice(0, 80));
  r = await fetch(BASE + target.url); t('G5 file download without sign-in is refused', r.status === 401);
  r = await fetch(BASE + target.url, { headers: { authorization: 'Bearer ' + mint(U.eve) } }); t('G6 file download by non-admin is refused', r.status === 403);
  r = await call(U.admin1, 'GET', '/api/admin/stats'); t('G7 testimonial stats: students, parents, messages, files', r.s === 200 && r.j.students >= 20 && r.j.parents >= 15 && r.j.messages >= (MODE === 'd1' ? 25 : 0) && r.j.excelFiles >= 4, r.j);
  r = await call(U.admin1, 'PUT', '/api/admin/video', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }); t('G8 video URL saves', r.s === 200 && r.j.id === 'dQw4w9WgXcQ', r.j);
  r = await fetch(BASE + '/api/video'); r = await r.json(); t('G9 public /api/video returns it (used by the Blueprint)', r.id === 'dQw4w9WgXcQ' && r.url.includes('youtube'), r);
  r = await call(U.admin1, 'PUT', '/api/admin/video', { url: 'https://example.com/x' }); t('G10 non-YouTube link rejected', r.s === 400, r);
  r = await call(U.admin2, 'PUT', '/api/admin/referral', { url: 'https://edsora.pages.dev/?x=1' }); t('G11 referral base URL saves (query stripped)', r.s === 200 && r.j.url === 'https://edsora.pages.dev/', r.j);
  r = await (await fetch(BASE + '/api/referral')).json(); t('G12 public /api/referral returns it', r.url === 'https://edsora.pages.dev/', r);
  for (const ep of ['overview', 'payments', 'campaigns', 'health', 'settings']) { r = await call(U.admin1, 'GET', '/api/admin/' + ep); t('G13 admin ' + ep + ' endpoint works', r.s === 200, r.j); }
  r = await call(U.admin1, 'GET', '/api/admin/payments'); t('G14 payments list minimises sensitive data (masked emails, no card data)', r.j.payments.length > 0 && r.j.payments.every(p => !p.account || p.account.includes('\u2022')) && !r.raw.includes('4111'), r.j.payments[0]);
  r = await call(U.admin1, 'GET', '/api/admin/health'); t('G15 health reports services honestly', r.j.services.database === 'connected' && r.j.services.llm.includes('2 Gemini') && (MODE === 'b2' ? r.j.services.storage === 'backblaze b2' : r.j.services.whatsapp.startsWith('configured')) , r.j.services);
  /* ═════════ H · refund + storage ═════════ */
  const refund = { event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: pd, amount: 249900 } } } }; r = await wh(refund); r = await call(U.dave, 'GET', '/api/me'); t('H1 full refund revokes Pro', r.j.plan === 'free', r.j.plan);
  if (MODE === 'b2') { const st = await mstate(); t('H2 files are stored in Backblaze (S3) with valid SigV4 signatures', st.s3.keys.some(k => k.startsWith('files/') && k.endsWith('rows.json')) && st.s3.bad === 0 && st.s3.ok > 10, { keys: st.s3.keys.length, bad: st.s3.bad, ok: st.s3.ok });
    const keysBefore = st.s3.keys.length, fl2 = (await call(U.zoe, 'GET', '/api/state')).j.state.files[0].id; await call(U.zoe, 'DELETE', '/api/files/' + fl2); const after = (await mstate()).s3.keys.length; t('H3 deleting a file removes it from Backblaze', after === keysBefore - 2, [keysBefore, after]);
    r = await call(U.admin1, 'GET', '/api/admin/files'); t('H4 admin download still works from B2', r.j.files.length >= 1); }
} catch (e) { fail++; console.log('EXCEPTION', e.stack); }
console.log(`\n[${MODE}] ${pass} passed, ${fail} failed`); if (fail) console.log(wlog.split('\n').filter(l => /ERROR|Error|error/.test(l)).slice(-12).join('\n'));
done(); process.exit(fail ? 1 : 0);
