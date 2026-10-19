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
