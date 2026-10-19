/* ===== EDSORA SHARED LOGIC — the SAME code runs in the browser and in the Cloudflare Worker ===== */
function edNorm(v){return String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'')}
function edFindVal(r,keys){for(const k of keys){const key=Object.keys(r).find(x=>edNorm(x)===edNorm(k)||edNorm(x).includes(edNorm(k)));if(key&&r[key]!==''&&r[key]!=null)return r[key]}return ''}
function edParseCsv(text){let rows=[],row=[],cell='',quote=false;text=String(text||'').replace(/^\uFEFF/,'');for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++}else quote=!quote}else if(c===','&&!quote){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()!==''))rows.push(row);row=[]}else cell+=c}row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);if(!rows.length)return [];const headers=rows.shift().map(x=>x.trim());return rows.map(a=>Object.fromEntries(headers.map((h,i)=>[h,(a[i]??'').trim()])))}
/* calendar dates are stored as UTC-midnight milliseconds so they never shift with the viewer's time zone */
function edParseDue(v){const s=String(v??'').trim();if(!s)return 0;
  if(/^\d{4,6}(\.\d+)?$/.test(s)){const n=Number(s);if(n>20000&&n<80000){const d=new Date(Math.round(n-25569)*864e5);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())}}
  let m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);if(m){let y=+m[3];if(y<100)y+=2000;return Date.UTC(y,+m[2]-1,+m[1])}
  m=s.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);if(m)return Date.UTC(+m[1],+m[2]-1,+m[3]);
  const t=Date.parse(s+(/\d{4}/.test(s)&&!/[zZ+]|GMT|UTC/.test(s)?' UTC':''));if(isNaN(t))return 0;const d=new Date(t);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())}
function edDigits(v){return String(v??'').replace(/\D+/g,'')}
function edStdOf(v){const m=String(v??'').trim().match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s*[-\/ ]?\s*([A-Za-z])?\b/i);return m?{n:+m[1],sec:(m[2]||'').toUpperCase()}:null}
/* Fees page structure: {standards:[{standard:6,sections:[{section:'A',fee:'1800'}]}]} */
function edFeeFor(std,fees){if(!std||!fees||!Array.isArray(fees.standards))return 0;const st=fees.standards.find(x=>+x.standard===std.n);if(!st)return 0;
  const secs=(st.sections||[]).map(s=>({s:String(s.section||'').toUpperCase(),f:Number(String(s.fee??'').replace(/[^0-9.]/g,''))||0})).filter(x=>x.f>0);if(!secs.length)return 0;
  if(std.sec){const x=secs.find(y=>y.s===std.sec);if(x)return x.f}
  const u=[...new Set(secs.map(x=>x.f))];return u.length===1?u[0]:0}
function edSkey(r){const p=edDigits(r.phone).slice(-10);return edNorm(r.student)+'|'+(p||edNorm(r.parent))}
function edFp(r){return [r.skey,+r.pending||0,+r.due||0,edDigits(r.phone).slice(-10),edNorm(r.parent)].join('|')}
const ED_PAID_RE=/^(paid|complete|completed|cleared|settled|received|done)\b/i,ED_PEND_RE=/^(pending|due|unpaid|overdue|partial|balance|not paid|outstanding)/i;
function edCanonicalRows(raw,fees){if(!raw||!raw.length)return [];const out=[];for(const r of raw){
  if(Object.values(r).every(v=>String(v??'').trim()===''))continue;
  const student=edFindVal(r,['student name','student','child name','child']),parent=edFindVal(r,['parent name','parent','father name','mother name','guardian']),phone=edFindVal(r,['phone','mobile','whatsapp','contact']),month=edFindVal(r,['month','fee month','billing month'])||'current month';
  const pendingRaw=edFindVal(r,['pending fees','pending amount','due amount','balance','pending']),paidRaw=edFindVal(r,['paid fees','paid amount','paid']),totalRaw=edFindVal(r,['total fees','fee amount','fees','amount']);
  const cls=String(edFindVal(r,['standard/class','standard','class','grade','std'])||'').trim();
  const statusRaw=String(edFindVal(r,['payment status','status'])).trim(),isPaid=ED_PAID_RE.test(statusRaw);
  const parseN=v=>Number(String(v).replace(/[^0-9.-]/g,''))||0;let pending=parseN(pendingRaw),paid=parseN(paidRaw),total=parseN(totalRaw);
  const feeStd=edFeeFor(edStdOf(cls),fees);
  if(isPaid){if(!paid)paid=total||pending||feeStd;pending=0;total=paid}
  else{if(!pending&&total&&paid)pending=Math.max(0,total-paid);if(!pending&&!paid&&!total&&feeStd&&ED_PEND_RE.test(statusRaw))pending=feeStd;if(!total)total=paid+pending}
  if(!student&&!parent&&!phone&&!pending&&!paid&&!total)continue;
  const row={student:student||'Student',parent:parent||'Parent',phone:String(phone||''),month,paid,pending,total,due:edParseDue(edFindVal(r,['due date','due on','deadline'])),status:statusRaw,std:cls};row.skey=edSkey(row);out.push(row)}return out}
/* account-level de-duplication: the same person across many files counts ONCE, the most recently updated file wins */
function edEffective(filesOldestFirst){const m=new Map();for(const f of filesOldestFirst)for(const r of f.rows)m.set(r.skey,Object.assign({},r,{fileId:f.id}));return [...m.values()]}
function edOverdueDays(due,todayUTC){return due?Math.max(0,Math.round((todayUTC-due)/864e5)):0}
function edTone(days){return days<30?1:days<60?2:days<90?3:days<120?4:5}
function edTodayUTC(tz,now){let k;try{k=new Intl.DateTimeFormat('en-CA',{timeZone:tz||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now==null?Date.now():now))}catch(e){k=new Date(now==null?Date.now():now).toISOString().slice(0,10)}const p=k.split('-').map(Number);return {key:k,utc:Date.UTC(p[0],p[1]-1,p[2])}}
function edStats(rows,todayUTC,doneSet){const s={students:rows.length,pending:0,newlyPending:0,pendingMonth:0,paid:0,overdue:0,paidAmount:0,pendingAmount:0,remaining:0};
  for(const r of rows){s.paidAmount+=+r.paid||0;s.pendingAmount+=+r.pending||0;
    if(+r.pending>0){s.pending++;const d=edOverdueDays(r.due,todayUTC);if(d>0)s.overdue++;if(d>=30)s.pendingMonth++;else s.newlyPending++;if(!doneSet||!doneSet.has(r.skey+'#'+edFp(r)))s.remaining++}
    else if(+r.paid>0)s.paid++}return s}
function edWords(t){const m=String(t||'').trim().match(/\S+/g);return m?m.length:0}
if(typeof module!=='undefined')module.exports={edNorm,edFindVal,edParseCsv,edParseDue,edDigits,edStdOf,edFeeFor,edSkey,edFp,edCanonicalRows,edEffective,edOverdueDays,edTone,edTodayUTC,edStats,edWords};
