/* ───────── settings (payment link, fee structure) ───────── */
async function getSettings(env, uid) { const r = await one(env, 'SELECT * FROM settings WHERE uid=?1', uid); let fees = null; try { fees = r && r.fees ? JSON.parse(r.fees) : null; } catch (e) {} return { payLink: r ? r.pay_link || '' : '', fees, school: r ? r.school || '' : '' }; }
async function putSettings(env, uid, patch) {
  const cur = await getSettings(env, uid), next = { payLink: 'payLink' in patch ? patch.payLink : cur.payLink, fees: 'fees' in patch ? patch.fees : cur.fees, school: 'school' in patch ? patch.school : cur.school };
  await exec(env, 'INSERT INTO settings(uid,pay_link,fees,school,updated) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(uid) DO UPDATE SET pay_link=?2,fees=?3,school=?4,updated=?5', uid, next.payLink, next.fees ? JSON.stringify(next.fees) : null, next.school, Date.now()); return next;
}
function cleanPayLink(v) { let s = String(v || '').trim(); if (!s) return ''; if (s.length > 500 || /\s/.test(s)) throw err(400, 'bad_link', 'That payment link does not look valid.'); if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s; try { const u = new URL(s); if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw 0; return u.href; } catch (e) { throw err(400, 'bad_link', 'That payment link does not look valid.'); } }
function cleanFees(f) {
  if (f === null) return null; if (!f || !Array.isArray(f.standards) || f.standards.length > 20) throw err(400, 'bad_fees', 'The fee structure could not be read.');
  return { version: 1, savedAt: new Date().toISOString(), standards: f.standards.map(s => ({ standard: Math.max(1, Math.min(20, +s.standard | 0)), name: String(s.name || '').slice(0, 20), sections: (Array.isArray(s.sections) ? s.sections : []).slice(0, 10).map(x => ({ section: String(x.section || '').slice(0, 2).toUpperCase(), fee: String(x.fee ?? '').replace(/[^0-9.]/g, '').slice(0, 9) })) })) };
}
/* ───────── file storage helpers (raw header-keyed rows are the source of truth; amounts are derived on read) ───────── */
const listFiles = (env, uid) => rows(env, 'SELECT * FROM files WHERE uid=?1 ORDER BY updated ASC, created ASC', uid);
async function loadRaw(env, id) { const s = await getParts(env, id, 'rows'); try { return s ? JSON.parse(s) : []; } catch (e) { return []; } }
const rowSig = r => JSON.stringify([r.student, r.parent, String(r.phone || ''), +r.paid || 0, +r.pending || 0, +r.total || 0, +r.due || 0, r.month, r.std || '', r.status || '']);
const pairsOf = (table, fees) => table.map(r => ({ r, c: edCanonicalRows([r], fees)[0] })).filter(p => p.c);
async function loadAll(env, uid, fees) { const out = []; for (const f of await listFiles(env, uid)) { const raw = await loadRaw(env, f.id); out.push({ f, raw, rows: edCanonicalRows(raw, fees) }); } return out; }
async function refreshAcctStats(env, uid, loaded) {
  const s = await getSettings(env, uid); loaded = loaded || await loadAll(env, uid, s.fees);
  const eff = edEffective(loaded.map(x => ({ id: x.f.id, rows: x.rows }))), parents = new Set(eff.map(r => edNorm(r.parent)).filter(Boolean));
  await exec(env, 'INSERT INTO acct_stats(uid,students,parents,files,uploads,updated) VALUES(?1,?2,?3,?4,0,?5) ON CONFLICT(uid) DO UPDATE SET students=?2,parents=?3,files=?4,updated=?5', uid, eff.length, parents.size, loaded.length, Date.now());
}
async function noteUnchanged(env, uid, day) {
  const r = await one(env, 'SELECT n FROM upload_dupes WHERE uid=?1 AND day=?2', uid, day), n = (r ? r.n : 0) + 1;
  await exec(env, 'INSERT INTO upload_dupes(uid,day,n) VALUES(?1,?2,?3) ON CONFLICT(uid,day) DO UPDATE SET n=?3', uid, day, n);
  if (n >= UNCHANGED_LIMIT) throw err(429, 'unchanged_limit', '5 unchanged files detected. You\u2019ve reached the limit.');
  return n;
}
/* ───────── POST /api/files : add / update with account-wide de-duplication ───────── */
async function postFile(env, u, body) {
  const name = String(body.name || 'Untitled').slice(0, 120), table = Array.isArray(body.table) ? body.table.filter(r => r && typeof r === 'object') : null;
  if (!table) throw err(400, 'bad_request', 'No rows were received.'); if (table.length > MAX_ROWS) throw err(413, 'too_many_rows', 'A file can hold up to 10,000 rows.');
  await limit(env, 'up:' + u.uid, 40, 60);
  const settings = await getSettings(env, u.uid), fees = settings.fees, loaded = await loadAll(env, u.uid, fees), day = edTodayUTC(u.tz).key;
  const incoming = edCanonicalRows(table, fees); let target = null;
  if (body.mode === 'update' && body.targetId) { target = loaded.find(x => x.f.id === body.targetId); if (!target) throw err(404, 'not_found', 'That file no longer exists.'); }
  if (!target) { const nm = name.trim().toLowerCase(); target = loaded.find(x => String(x.f.name || '').trim().toLowerCase() === nm) || null; }
  const eff = new Map(edEffective(loaded.map(x => ({ id: x.f.id, rows: x.rows }))).map(r => [r.skey, r]));
  const base = target ? new Map(target.rows.map(r => [r.skey, r])) : eff;
  const changed = incoming.filter(r => { const b = base.get(r.skey); return !b || rowSig(b) !== rowSig(r); });
  const now = Date.now();
  if (!incoming.length) { if (target || loaded.some(x => !x.rows.length && String(x.f.name).toLowerCase() === name.toLowerCase())) { await noteUnchanged(env, u.uid, day); return { unchanged: true }; } }
  else if (!changed.length) { await noteUnchanged(env, u.uid, day); return { unchanged: true }; }
  let id, title, raw, rawRows, created = now;
  if (target) {
    id = target.f.id; title = target.f.title; created = target.f.created;
    const m = new Map(pairsOf(target.raw, fees).map(p => [p.c.skey, p])); for (const p of pairsOf(table, fees)) m.set(p.c.skey, p);
    rawRows = [...m.values()].map(p => p.r); raw = JSON.stringify(rawRows, null, 2);
  } else {
    id = now.toString(36) + rid(5); const n = loaded.filter(x => /^First File CSV #\d+$/.test(x.f.title)).length + 1; title = 'First File CSV #' + n;
    rawRows = table; raw = typeof body.raw === 'string' && body.raw.length < MAX_BODY ? body.raw : JSON.stringify(table, null, 2);
  }
  const count = edCanonicalRows(rawRows, fees).length;
  await savePartsBoth(env, id, rawRows, raw);
  await exec(env, 'INSERT INTO files(id,uid,title,name,created,updated,pinned,count,size,sig) VALUES(?1,?2,?3,?4,?5,?6,0,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET updated=?6,count=?7,size=?8,sig=?9', id, u.uid, title, name, created, now, count, raw.length, await sha256Hex(raw));
  await exec(env, 'INSERT INTO acct_stats(uid,students,parents,files,uploads,updated) VALUES(?1,0,0,0,1,?2) ON CONFLICT(uid) DO UPDATE SET uploads=uploads+1', u.uid, now);
  await refreshAcctStats(env, u.uid); return { fileId: id, merged: !!target, changed: changed.length };
}
async function savePartsBoth(env, id, rawRows, raw) { await putParts(env, id, 'rows', JSON.stringify(rawRows)); await putParts(env, id, 'raw', raw); }
function parseEditorText(text) { text = String(text || ''); if (/^\s*[\[{]/.test(text)) { let j; try { j = JSON.parse(text); } catch (e) { throw err(400, 'bad_format', 'Invalid file format'); } if (!Array.isArray(j)) throw err(400, 'bad_format', 'Invalid file format'); return j.filter(r => r && typeof r === 'object'); } return edParseCsv(text); }
/* ───────── PUT /api/files/:id : inline edit (saves into the stored file itself) ───────── */
async function putFile(env, u, id, body) {
  const f = await one(env, 'SELECT * FROM files WHERE id=?1 AND uid=?2', id, u.uid); if (!f) throw err(404, 'not_found', 'That file no longer exists.');
  await limit(env, 'up:' + u.uid, 60, 60);
  const text = String(body.text ?? ''), table = parseEditorText(text); if (table.length > MAX_ROWS) throw err(413, 'too_many_rows', 'A file can hold up to 10,000 rows.');
  const settings = await getSettings(env, u.uid), rowsNew = edCanonicalRows(table, settings.fees);
  if (!rowsNew.length) throw err(422, 'empty', 'No readable rows found');
  const bad = rowsNew.findIndex(r => !(+r.paid > 0 || +r.pending > 0)); if (bad >= 0) throw err(422, 'fee_missing', 'Please edit both student sections. A student cannot have both \u20B90 pending and \u20B90 paid.', { index: bad });
  const old = edCanonicalRows(await loadRaw(env, id), settings.fees), sg = a => JSON.stringify(a.map(rowSig));
  if (old.length && sg(old) === sg(rowsNew)) return { unchanged: true };
  await savePartsBoth(env, id, table, text);
  await exec(env, 'UPDATE files SET updated=?2,count=?3,size=?4,sig=?5 WHERE id=?1', id, Date.now(), rowsNew.length, text.length, await sha256Hex(text));
  await refreshAcctStats(env, u.uid); return { fileId: id };
}
async function patchFile(env, u, id, body) {
  const f = await one(env, 'SELECT id FROM files WHERE id=?1 AND uid=?2', id, u.uid); if (!f) throw err(404, 'not_found', 'That file no longer exists.');
  if (typeof body.title === 'string') await exec(env, 'UPDATE files SET title=?2 WHERE id=?1', id, body.title.trim().slice(0, 60) || 'Untitled');
  if (typeof body.pinned === 'boolean') await exec(env, 'UPDATE files SET pinned=?2 WHERE id=?1', id, body.pinned ? 1 : 0);
}
async function deleteFileRec(env, u, id) {
  const f = await one(env, 'SELECT id FROM files WHERE id=?1 AND uid=?2', id, u.uid); if (!f) return;
  await delParts(env, id); await exec(env, 'DELETE FROM files WHERE id=?1', id); await refreshAcctStats(env, u.uid);
}
/* ───────── GET /api/state : everything the app shows, already de-duplicated and fee-resolved ───────── */
async function sentSet(env, uid, day) { return new Set((await rows(env, "SELECT skey,fp FROM sent_log WHERE uid=?1 AND day=?2 AND status='sent'", uid, day)).map(r => r.skey + '#' + r.fp)); }
async function buildState(env, u) {
  const settings = await getSettings(env, u.uid), loaded = await loadAll(env, u.uid, settings.fees), td = edTodayUTC(u.tz);
  const eff = edEffective(loaded.map(x => ({ id: x.f.id, rows: x.rows }))), done = await sentSet(env, u.uid, td.key);
  const camp = await one(env, "SELECT id,status,total,cursor,sent,failed FROM campaigns WHERE uid=?1 AND day=?2 AND status IN ('paused','running') ORDER BY created DESC LIMIT 1", u.uid, td.key);
  const sentToday = (await one(env, "SELECT count(*) c FROM sent_log WHERE uid=?1 AND day=?2 AND status='sent'", u.uid, td.key)).c;
  const files = []; for (const x of loaded) files.push({ id: x.f.id, title: x.f.title, name: x.f.name, created: x.f.created, pinned: !!x.f.pinned, count: x.rows.length, raw: await getParts(env, x.f.id, 'raw') });
  return { now: Date.now(), today: td.key, files, rows: eff, settings, stats: Object.assign(edStats(eff, td.utc, done), { sentToday }), blank: loaded.length > 0 && !eff.length, campaign: camp || null };
}
/* ───────── CSV / XLSX writers (admin downloads) ───────── */
function tableOf(rawRows) { const heads = []; for (const r of rawRows) for (const k of Object.keys(r)) if (!heads.includes(k)) heads.push(k); return { heads, body: rawRows.map(r => heads.map(h => r[h] ?? '')) }; }
const csvCell = v => { v = String(v ?? ''); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const toCsv = rawRows => { const t = tableOf(rawRows); return '\uFEFF' + [t.heads, ...t.body].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'; };
let CRC_T = null; function crc32(b) { if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } } let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files) {
  const parts = [], central = []; let off = 0; const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const f of files) { const nm = enc.encode(f.name), d = f.data, c = crc32(d);
    const lh = Uint8Array.from([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0x21, 0, 0, ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(nm.length), 0, 0, ...nm]); parts.push(lh, d);
    central.push(Uint8Array.from([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0x21, 0, 0, ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(nm.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(off), ...nm])); off += lh.length + d.length; }
  const cs = central.reduce((a, b) => a + b.length, 0), end = Uint8Array.from([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cs), ...u32(off), 0, 0]);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0; for (const a of all) { out.set(a, p); p += a.length; } return out;
}
const xmlEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
function colName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function toXlsx(rawRows) {
  const t = tableOf(rawRows), all = [t.heads, ...t.body];
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    all.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => { const ref = colName(ci) + (ri + 1); return typeof v === 'number' && isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`; }).join('') + '</row>').join('') + '</sheetData></worksheet>';
  const F = (name, str) => ({ name, data: enc.encode(str) });
  return zipStore([F('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    F('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    F('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    F('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    F('xl/worksheets/sheet1.xml', sheet)]);
}
