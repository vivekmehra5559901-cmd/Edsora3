const E=require('../src/shared.js');let ok=0,bad=0;const t=(n,c,i)=>{(c?ok++:bad++);console.log((c?'PASS ':'FAIL ')+n,c?'':JSON.stringify(i))};
const raw=[{'Student Name':'Aarav','Standard/Class':'6th A','Parent/Guardian Name':'Rina','Mobile Number':'98765 01234','Pending Amount':'4500','Due Date':'10/09/2026','Payment Status':'Pending'},
{'Student Name':'Ishita','Standard/Class':'6','Parent/Guardian Name':'Mohit','Mobile Number':'9876502222','Pending Amount':'','Due Date':'','Payment Status':'Paid'},
{'Student Name':'','Standard/Class':'','Parent/Guardian Name':'','Mobile Number':'','Pending Amount':'','Due Date':'','Payment Status':''}];
const fees={standards:[{standard:6,sections:[{section:'A',fee:'1800'},{section:'B',fee:'1800'}]}]};
let r=E.edCanonicalRows(raw,fees);t('blank row ignored, 2 rows',r.length===2,r);
t('pending amount from file wins',r[0].pending===4500&&r[0].paid===0,r[0]);
t('paid row with no amount uses standard fee 1800 (6th, both sections same)',r[1].paid===1800&&r[1].pending===0,r[1]);
t('without fee structure paid row has no amount',E.edCanonicalRows(raw,null)[1].paid===0);
raw[1]['Pending Amount']='1800';r=E.edCanonicalRows(raw,fees);t('same price in file AND fees page is NOT doubled',r[1].paid===1800,r[1]);
t('due parsed as UTC date 10 Sep 2026',r[0].due===Date.UTC(2026,8,10),r[0].due);
t('skey uses last-10 phone digits',r[0].skey==='aarav|9876501234',r[0].skey);
const f1={id:'a',rows:[{skey:'x',pending:1,student:'old'},{skey:'y',pending:2}]},f2={id:'b',rows:[{skey:'x',pending:9,student:'new'}]};
const eff=E.edEffective([f1,f2]);t('cross-file de-dup: person counted once, newest wins',eff.length===2&&eff.find(z=>z.skey==='x').pending===9&&eff.find(z=>z.skey==='x').fileId==='b',eff);
t('tone buckets',[0,29,30,59,60,90,119,120,400].map(E.edTone).join()==='1,1,2,2,3,4,4,5,5');
const td=E.edTodayUTC('Asia/Kolkata',Date.UTC(2026,9,11,20,0));t('IST day rolls at 18:30 UTC',td.key==='2026-10-12',td);
console.log(`\n${ok} passed, ${bad} failed`);process.exit(bad?1:0);
