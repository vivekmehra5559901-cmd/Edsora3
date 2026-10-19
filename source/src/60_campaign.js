const waText = t => String(t || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 1000);
function e164(raw) { let d = edDigits(raw).replace(/^0+/, ''); if (d.length === 10) d = DEFAULT_COUNTRY_CODE + d; return d.length >= 11 && d.length <= 15 ? d : null; }
/* sends the APPROVED template with the six variables — Meta forbids rewriting a template per message */
async function waSend(env, phone, vars) {
  const k = cfg(env), w = k.wa; if (!w.token || !w.phoneId) throw err(503, 'wa_unconfigured', 'WhatsApp sending is not connected yet.'); if (!w.template) throw err(503, 'wa_unconfigured', 'Add your approved WhatsApp template name.');
  const body = { messaging_product: 'whatsapp', to: phone, type: 'template', template: { name: w.template, language: { code: w.lang }, components: [{ type: 'body', parameters: vars.map(v => ({ type: 'text', text: waClean(v, 1000) })) }] } };
  const r = await fetch(`${k.waBase}/${w.version}/${w.phoneId}/messages`, { method: 'POST', headers: { authorization: 'Bearer ' + w.token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) return { ok: false, error: String((j.error && j.error.message) || 'HTTP ' + r.status).slice(0, 200) };
  return { ok: true, id: j.messages && j.messages[0] && j.messages[0].id || '' };
}
async function proPlan(env, u) { const me = await buildMe(env, u, Date.now()); return me; }
async function pendingFor(env, u) {
  const settings = await getSettings(env, u.uid), loaded = await loadAll(env, u.uid, settings.fees), td = edTodayUTC(u.tz);
  const eff = edEffective(loaded.map(x => ({ id: x.f.id, rows: x.rows }))); return { settings, loaded, td, eff, pend: eff.filter(r => +r.pending > 0) };
}
/* POST /api/messages */
async function apiMessages(env, u) {
  await limit(env, 'msg:' + u.uid, 40, 60); const me = await buildMe(env, u, Date.now()), { settings, pend } = await pendingFor(env, u);
  const list = await messagesFor(env, u, pend, settings, me.plan);
  return { messages: list.map(x => x.text), meta: list.map((x, i) => ({ skey: pend[i].skey, tone: x.tone, source: x.source })) };
}
/* POST /api/campaign/start */
async function campaignStart(env, u, realMe) {
  const me = await buildMe(env, u, Date.now()); if (me.plan !== 'pro') throw err(402, 'pro_required', 'Upgrade to Pro to start a campaign.');
  await limit(env, 'camp:' + u.uid, 20, 60);
  const { settings, loaded, td, eff, pend } = await pendingFor(env, u);
  if (!loaded.length || !eff.length) throw err(400, 'blank', 'Blank Excel files cannot start a campaign.');
  if (!settings.payLink) throw err(400, 'paylink_required', 'Add your payment link before starting a campaign.');
  const done = await sentSet(env, u.uid, td.key), queue = pend.filter(r => !done.has(r.skey + '#' + edFp(r))).map(r => ({ k: r.skey, fp: edFp(r) }));
  const completedToday = !!(await one(env, "SELECT id FROM campaigns WHERE uid=?1 AND day=?2 AND status='done' LIMIT 1", u.uid, td.key));
  if (realMe && realMe.role === 'member') { const workspace = realMe._ws || u.uid; /* Count actual successful sends, not campaign-row counters: aborted/restarted campaign rows must not erase the day's shared-seat usage. */ const s = await one(env, "SELECT COUNT(*) n FROM sent_log WHERE day=?1 AND status='sent' AND uid IN (SELECT uid FROM seats WHERE owner_uid=?2 AND uid IS NOT NULL UNION SELECT ?2)", td.key, workspace); if (s.n > SEAT_BLOCK_AFTER_SENT) throw err(403, 'seat_same_day', "Today's campaign has already been completed by your subscription owner or another seat admin. Restarting campaigns for the same numbers multiple times in a single day is not permitted. Please try again tomorrow."); }
  await exec(env, "UPDATE campaigns SET status='aborted',updated=?3 WHERE uid=?1 AND day=?2 AND status IN ('running','paused')", u.uid, td.key, Date.now());
  if (!queue.length) return { total: 0, notice: completedToday ? 'same_day' : (pend.length ? 'same_day' : 'none') };
  const id = 'c' + Date.now().toString(36) + rid(4), now = Date.now();
  await exec(env, "INSERT INTO campaigns(id,uid,day,status,total,cursor,sent,failed,queue,created,updated) VALUES(?1,?2,?3,'running',?4,0,0,0,?5,?6,?6)", id, u.uid, td.key, queue.length, JSON.stringify(queue), now);
  return { id, total: queue.length, cursor: 0, keys: queue.map(q => q.k), notice: completedToday ? 'same_day' : null };
}
async function loadCampaign(env, u, id) { const c = await one(env, 'SELECT * FROM campaigns WHERE id=?1 AND uid=?2', id, u.uid); if (!c) throw err(404, 'not_found', 'That campaign no longer exists.'); return c; }
/* POST /api/campaign/step — sends the next few messages. Safe to call repeatedly or in parallel: the slice is claimed atomically
   and every message is reserved in sent_log first, so nothing is ever sent twice on the same day. */
async function campaignStep(env, u, body) {
  let c = await loadCampaign(env, u, String(body.id || '')); if (c.status === 'done') return { ...progress(c), done: true };
  if (c.status === 'paused' || c.status === 'aborted') return { ...progress(c), paused: true };
  const me = await buildMe(env, u, Date.now()); if (me.plan !== 'pro') throw err(402, 'pro_required', 'Upgrade to Pro to continue.');
  await limit(env, 'step:' + u.uid, 120, 60);
  const queue = JSON.parse(c.queue), n = Math.max(1, Math.min(10, +body.n || 5)), from = c.cursor, to = Math.min(queue.length, from + n);
  const claim = await exec(env, "UPDATE campaigns SET cursor=?3,updated=?4 WHERE id=?1 AND cursor=?2 AND status='running'", c.id, from, to, Date.now());
  if (claim.meta.changes === 0) return { ...progress(await loadCampaign(env, u, c.id)), busy: true };
  const { settings, td, eff } = await pendingFor(env, u), byKey = new Map(eff.map(r => [r.skey, r])), slice = queue.slice(from, to);
  const rowsSel = slice.map(q => byKey.get(q.k)).filter(r => r && +r.pending > 0), msgs = rowsSel.length ? await messagesFor(env, u, rowsSel, settings, 'pro') : [], msgOf = new Map(rowsSel.map((r, i) => [r.skey, msgs[i]]));
  let sent = 0, failed = 0; const results = [];
  for (const q of slice) {
    const r = byKey.get(q.k);
    if (!r || +r.pending <= 0 || edFp(r) !== q.fp) { results.push({ skipped: true }); continue; }          // paid or edited since the queue was made
    const phone = e164(r.phone), text = msgOf.get(q.k).text;
    if (!phone) { await reserveSend(env, u.uid, td.key, q, r.phone, text, c.id); await finishSend(env, u.uid, td.key, q, 'failed', '', 'invalid phone number'); failed++; results.push({ ok: false }); continue; }
    if (!(await reserveSend(env, u.uid, td.key, q, phone, text, c.id))) { results.push({ skipped: true }); continue; }
    let res; try { res = await waSend(env, phone, msgOf.get(q.k).vars); } catch (e) { await finishSend(env, u.uid, td.key, q, 'failed', '', e.message); await exec(env, "UPDATE campaigns SET status='paused',cursor=?2,updated=?3 WHERE id=?1", c.id, queue.indexOf(q), Date.now()); throw e; }
    if (res.ok) { sent++; await finishSend(env, u.uid, td.key, q, 'sent', res.id, ''); } else { failed++; await finishSend(env, u.uid, td.key, q, 'failed', '', res.error); }
    results.push({ ok: res.ok });
  }
  const finished = to >= queue.length; await exec(env, 'UPDATE campaigns SET sent=sent+?2,failed=failed+?3,status=CASE WHEN ?4=1 THEN \'done\' ELSE status END,updated=?5 WHERE id=?1', c.id, sent, failed, finished ? 1 : 0, Date.now());
  const fresh = await loadCampaign(env, u, c.id); return { ...progress(fresh), done: fresh.status === 'done', results };
}
const progress = c => ({ id: c.id, total: c.total, cursor: c.cursor, sent: c.sent, failed: c.failed, status: c.status });
async function reserveSend(env, uid, day, q, phone, text, campaign) {
  const masked = '******' + edDigits(phone).slice(-4), now = Date.now();
  const r = await exec(env, "INSERT INTO sent_log(uid,day,skey,fp,phone,text,status,wa_id,error,campaign,created) VALUES(?1,?2,?3,?4,?5,?6,'queued','','',?7,?8) ON CONFLICT(uid,day,skey,fp) DO UPDATE SET status='queued',campaign=?7,created=?8 WHERE sent_log.status='failed' OR (sent_log.status='queued' AND sent_log.created<?9)", uid, day, q.k, q.fp, masked, text, campaign, now, now - 120000);
  return r.meta.changes > 0;
}
const finishSend = (env, uid, day, q, status, waId, error) => exec(env, 'UPDATE sent_log SET status=?5,wa_id=?6,error=?7,created=?8 WHERE uid=?1 AND day=?2 AND skey=?3 AND fp=?4', uid, day, q.k, q.fp, status, waId, String(error || '').slice(0, 200), Date.now());
async function campaignAbort(env, u, body) { const c = await loadCampaign(env, u, String(body.id || '')); if (c.status === 'running') await exec(env, "UPDATE campaigns SET status='paused',updated=?2 WHERE id=?1", c.id, Date.now()); return { ...progress(await loadCampaign(env, u, c.id)) }; }
async function campaignResume(env, u, body) { const c = await loadCampaign(env, u, String(body.id || '')); const td = edTodayUTC(u.tz);
  if (c.day !== td.key) throw err(410, 'campaign_expired', 'That campaign belongs to an earlier day. Start a new campaign.');
  if (c.status === 'paused' || c.status === 'running') await exec(env, "UPDATE campaigns SET status='running',updated=?2 WHERE id=?1", c.id, Date.now()); return { ...progress(await loadCampaign(env, u, c.id)), keys: JSON.parse(c.queue).map(q => q.k) }; }
