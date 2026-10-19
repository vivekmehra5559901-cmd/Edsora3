import http from 'node:http';
import crypto from 'node:crypto';
export const PROJECT = 'edsora-8ee49';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid-1', alg: 'RS256', use: 'sig' };
const b64u = b => Buffer.from(b).toString('base64url');
export function mint(u, over = {}, key = privateKey, kid = 'test-kid-1') {
  const now = Math.floor(Date.now() / 1000), claims = { iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, auth_time: now - 30, user_id: u.uid, sub: u.uid, iat: now - 30, exp: now + 3600,
    email: u.email, email_verified: true, name: u.name || u.email.split('@')[0], picture: 'https://photos.test/' + u.uid + '.jpg', firebase: { identities: {}, sign_in_provider: 'google.com' }, ...over };
  Object.keys(claims).forEach(k => claims[k] === undefined && delete claims[k]);
  const head = b64u(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })), body = b64u(JSON.stringify(claims)), sig = crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), key);
  return head + '.' + body + '.' + b64u(sig);
}
export const otherKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
export const S3 = { keyId: 'b2keyid', secret: 'b2secretkey', bucket: 'edsora-bucket' };
const sha = d => crypto.createHash('sha256').update(d).digest('hex'), hm = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
function s3Verify(req, body, st) {
  const a = req.headers.authorization || '', m = /Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]+)/.exec(a); if (!m) return false;
  const [, kid, day, region, sh, sig] = m; if (kid !== S3.keyId) return false; const amz = req.headers['x-amz-date']; if (!amz || amz.slice(0, 8) !== day) return false;
  if (req.headers['x-amz-content-sha256'] !== sha(body)) return false;
  const u = new URL(req.url, 'http://x'), canon = [req.method, u.pathname, u.search.slice(1), sh.split(';').map(h => h + ':' + String(req.headers[h]).trim() + '\n').join(''), sh, sha(body)].join('\n');
  let k = hm('AWS4' + S3.secret, day); k = hm(k, region); k = hm(k, 's3'); k = hm(k, 'aws4_request');
  return crypto.createHmac('sha256', k).update(['AWS4-HMAC-SHA256', amz, `${day}/${region}/s3/aws4_request`, sha(canon)].join('\n')).digest('hex') === sig;
}
export function startMocks(port = 9001) {
  const st = { rzp: { orders: {}, payments: {}, n: 0, calls: [] }, llm: { mode: 'ok', calls: [], cool: {} }, wa: { sent: [], failFor: [] }, s3: { objs: new Map(), bad: 0, ok: 0 } };
  const words = n => Array.from({ length: n }, (_, i) => 'w' + i).join(' ');
  const srv = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c); const buf = Buffer.concat(chunks), text = buf.toString(), u = new URL(req.url, 'http://x'), p = u.pathname;
    const send = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(typeof o === 'string' ? o : JSON.stringify(o)); };
    if (p === '/jwks') return send(200, { keys: [jwk] });
    if (p.startsWith('/__')) { const b = text ? JSON.parse(text) : {}; if (p === '/__rzp/payment') { st.rzp.payments[b.id] = b; return send(200, {}); } if (p === '/__llm') { Object.assign(st.llm, b); return send(200, {}); } if (p === '/__wa') { Object.assign(st.wa, b); return send(200, {}); } if (p === '/__state') return send(200, { rzp: st.rzp, llm: { calls: st.llm.calls }, wa: st.wa, s3: { keys: [...st.s3.objs.keys()], bad: st.s3.bad, ok: st.s3.ok } }); if (p === '/__reset') { st.llm.calls = []; st.wa.sent = []; st.llm.mode = 'ok'; st.llm.cool = {}; st.wa.failFor = []; return send(200, {}); } }
    if (p === '/v1/orders' && req.method === 'POST') { if (req.headers.authorization !== 'Basic ' + Buffer.from('rzp_test_x:secret123').toString('base64')) return send(401, { error: { description: 'auth' } }); const b = JSON.parse(text), id = 'order_' + (++st.rzp.n); st.rzp.orders[id] = { id, ...b }; st.rzp.calls.push('order'); return send(200, { id, amount: b.amount, currency: b.currency, status: 'created' }); }
    let m = /^\/v1\/payments\/([^/]+)(\/capture)?$/.exec(p); if (m) { const pay = st.rzp.payments[m[1]]; if (!pay) return send(404, { error: { description: 'no payment' } }); if (m[2]) { pay.status = 'captured'; st.rzp.calls.push('capture'); } else st.rzp.calls.push('get'); return send(200, pay); }
    m = /^\/llm\/(gemini|groq)\/v1\/chat\/completions$/.exec(p); if (m) {
      const key = (req.headers.authorization || '').replace('Bearer ', ''), body = JSON.parse(text), items = JSON.parse(body.messages[1].content).items; const call = { provider: m[1], key, model: body.model, n: items.length, names: items.map(i => i.name) }; st.llm.calls.push(call);
      const mode = st.llm.mode; if (mode === 'fail') return send(500, { error: 'boom' }); if (mode === 'rate-g1' && key === 'g1') return send(429, { error: 'rate' }); if (mode === 'rate-all') return send(429, {}); if (mode === 'model404' && body.model === 'gemini-2.5-flash') return send(404, { error: 'no model' });
      const tidy = n => n.replace(/\b[sdwc]\s*\/\s*o\b.*$/i, '').replace(/\b(mr|mrs|ms)\.?\s/i, '').replace(/[^A-Za-z .'-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/(^|[\s'-])([a-z])/g, (x, a, b) => a + b.toUpperCase());
      const out = items.map(i => ({ i: i.i, name: mode === 'bad' ? 'Hacker Invented' : tidy(i.name) }));
      return send(200, { choices: [{ message: { content: 'Sure:\n' + JSON.stringify(out) } }] }); }
    m = /^\/v26\.0\/(\d+)\/messages$/.exec(p); if (m) { if (req.headers.authorization !== 'Bearer watok' || m[1] !== '12345') return send(401, { error: { message: 'bad token' } }); const b = JSON.parse(text); if (st.wa.failFor.some(x => b.to.includes(x))) return send(400, { error: { message: 'Recipient not reachable' } }); st.wa.sent.push(b); return send(200, { messages: [{ id: 'wamid.' + st.wa.sent.length }] }); }
    m = /^\/([^/]+)\/(.+)$/.exec(decodeURIComponent(p)); if (m && m[1] === S3.bucket) { const ok = s3Verify(req, buf, st); if (!ok) { st.s3.bad++; return send(403, '<Error>SignatureDoesNotMatch</Error>'); } st.s3.ok++; const key = m[2];
      if (req.method === 'PUT') { st.s3.objs.set(key, buf.toString()); return send(200, {}); } if (req.method === 'GET') { return st.s3.objs.has(key) ? send(200, st.s3.objs.get(key)) : send(404, '<Error>NoSuchKey</Error>'); } if (req.method === 'DELETE') { st.s3.objs.delete(key); res.writeHead(204); return res.end(); } }
    send(404, { error: 'nomock', p });
  });
  return new Promise(r => srv.listen(port, () => r({ srv, st, port })));
}
