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
