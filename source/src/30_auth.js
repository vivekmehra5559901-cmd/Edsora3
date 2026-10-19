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
