/* ───────── WhatsApp template messages ─────────
   Meta's rule: business-initiated messages must use the APPROVED template, so the wording is fixed. Each message is the template
   with six variables filled from the school's own data. The LLM never rewrites the template — it is only used to tidy a messy NAME
   (symbols, digits, "S/O …" tails). It may remove or re-case characters but can never add any, so it cannot invent anything. */
const TONE_NAMES = { 1: 'Newly pending', 2: 'Pending ~1 month', 3: 'Pending ~2 months', 4: 'Pending ~3 months', 5: 'Pending 4+ months' };
const NAME_SYSTEM = `You clean up person names found in a school's fee spreadsheet. For each item return only the person's clean name.
Rules: fix capitalisation and spacing; remove digits, symbols, honorific clutter and relationship text such as "S/O", "D/O", "W/O", "C/O" together with everything after it.
NEVER add, invent, translate, expand, reorder or guess any letters or words — the answer must be made only of characters already present in the input.
Output only a JSON array like [{"i":0,"name":"Clean Name"}] with one object per item, nothing else.`;
const inrPlain = n => Number(n || 0).toLocaleString('en-IN');
const dueText = due => due ? new Date(due).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) : null;
const titleCase = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s\-'\u2019.])([a-z\u00C0-\u024F])/g, (m, a, b) => a + b.toUpperCase());
const needsTidy = s => /[0-9_@#$%^&*()+=<>|\\\/]/.test(String(s || '')) || String(s || '').trim().length > 40;
const roughTidy = s => titleCase(String(s || '').replace(/\b[sdwc]\s*\/\s*o\b.*$/i, '').replace(/[0-9_@#$%^&*()+=<>|\\\/]/g, ' ').replace(/\s+/g, ' ')).slice(0, 60) || 'Parent';
const waClean = (t, max = 60) => String(t == null ? '' : t).replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max);
const renderTemplate = v => WA_TEMPLATE_BODY.replace(/\{\{(\d)\}\}/g, (m, i) => v[i - 1]);
/* ───────── LLM routing: Gemini ×5 + Groq ×5, interleaved, rotated per call, with automatic fail-over ───────── */
const LLM_PROVIDERS = {
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', models: ['gemini-2.5-flash', 'gemini-2.0-flash'] },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] },
};
const KEY_COOL = new Map(); let RR_POS = 0;
function llmPool(env) { const c = cfg(env), g = c.gemini.map((k, i) => ({ p: 'gemini', k, id: 'g' + i })), q = c.groq.map((k, i) => ({ p: 'groq', k, id: 'q' + i })), out = [];
  for (let i = 0; i < Math.max(g.length, q.length); i++) { if (g[i]) out.push(g[i]); if (q[i]) out.push(q[i]); } return out; }
const llmStatus = env => ({ gemini: cfg(env).gemini.length, groq: cfg(env).groq.length });
async function callLLM(env, system, userPayload) {
  const pool = llmPool(env), c = cfg(env); if (!pool.length) throw new Error('llm_unconfigured');
  const start = RR_POS++ % pool.length, order = pool.map((_, i) => pool[(start + i) % pool.length]), now = Date.now();
  const ready = order.filter(x => (KEY_COOL.get(x.id) || 0) <= now), tryList = ready.length ? ready : order; let last = '';
  for (const key of tryList) {
    const P = LLM_PROVIDERS[key.p], url = c.llmBase ? c.llmBase.replace(/\/$/, '') + '/' + key.p + '/v1/chat/completions' : P.url;
    for (const model of P.models) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + key.k, 'content-type': 'application/json' }, body: JSON.stringify({ model, temperature: 0.4, messages: [{ role: 'system', content: system }, { role: 'user', content: userPayload }] }) });
        if (r.status === 404 || r.status === 400) { last = key.p + ' ' + r.status; continue; }                       // model unavailable → next model
        if (r.status === 429) { const ra = Number(r.headers.get('retry-after')) || 60; KEY_COOL.set(key.id, Date.now() + Math.min(ra, 600) * 1000); last = key.p + ' 429'; break; }
        if (r.status === 401 || r.status === 403) { KEY_COOL.set(key.id, Date.now() + 3600e3); last = key.p + ' ' + r.status; break; }
        if (!r.ok) { KEY_COOL.set(key.id, Date.now() + 15e3); last = key.p + ' ' + r.status; break; }
        const j = await r.json(), text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '', m = /\[[\s\S]*\]/.exec(text);
        if (!m) { last = 'no json'; continue; } const arr = JSON.parse(m[0]); if (Array.isArray(arr)) return arr;
      } catch (e) { KEY_COOL.set(key.id, Date.now() + 15e3); last = e.message; break; }
    }
  }
  throw new Error('llm_failed:' + last);
}

async function tidyNames(env, u, names, plan) {
  const out = new Map(), todo = [];
  for (const n of new Set(names)) { if (!needsTidy(n)) { out.set(n, titleCase(n)); continue; }
    const k = 'nm|' + await sha256Hex(n), c = await one(env, 'SELECT text FROM msg_cache WHERE k=?1', k); if (c) { out.set(n, c.text); continue; } todo.push({ n, k }); }
  for (let b = 0; b < todo.length; b += 20) {
    const slice = todo.slice(b, b + 20); let got = {};
    if (plan === 'pro' && llmPool(env).length) { try { const arr = await callLLM(env, NAME_SYSTEM, JSON.stringify({ items: slice.map((x, i) => ({ i, name: x.n })) }));
      for (const o of arr) { const x = slice[o.i]; if (!x || typeof o.name !== 'string') continue; const a = edNorm(x.n), r = edNorm(o.name); if (o.name.length <= 60 && r.length >= 2 && a.includes(r)) got[o.i] = waClean(o.name); } } catch (e) { await logError(env, 'llm', e); } }
    for (let i = 0; i < slice.length; i++) { const v = got[i] || roughTidy(slice[i].n); out.set(slice[i].n, v); if (plan === 'pro') await exec(env, 'INSERT OR REPLACE INTO msg_cache(k,uid,text,src,created) VALUES(?1,?2,?3,?4,?5)', slice[i].k, u.uid, v, got[i] ? 'llm' : 'rule', Date.now()); }
  }
  return out;
}
/* returns [{text, vars, source, tone}] aligned with pendingRows — `vars` are the six template parameters sent to WhatsApp */
async function messagesFor(env, u, pendingRows, settings, plan) {
  const td = edTodayUTC(u.tz), names = await tidyNames(env, u, pendingRows.flatMap(r => [r.parent, r.student]), plan), school = waClean(settings.school || 'the school office');
  return pendingRows.map(r => {
    const days = edOverdueDays(r.due, td.utc), vars = [waClean(names.get(r.parent) || r.parent), school, waClean(names.get(r.student) || r.student), inrPlain(r.pending), dueText(r.due) || 'this month', waClean(settings.payLink || 'your school\u2019s payment link', 500)];
    return { text: renderTemplate(vars), vars, source: 'template', tone: edTone(days) };
  });
}
