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
