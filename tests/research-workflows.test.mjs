import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildCommitments,validateCommitments,reconcileCommitments,extractExplicitCommitments} from '../src/commitments.js';
import {buildCashQuality,validateCashFacts,calculateCashQuality} from '../src/cash-quality.js';
import {normalizeQuote,numberSupported,periodSupported,quoteNumbers,expandEvidencePages} from '../src/research-facts.js';
const full=JSON.parse(fs.readFileSync(new URL('../data/corpus.json',import.meta.url),'utf8'));
const makeEvidence=(id,text,date='2026-04-20')=>({id,documentId:id+'-doc',ticker:'TEST',page:7,text,document:{id:id+'-doc',ticker:'TEST',date,period:'FY26',type:'transcript',title:'Test primary disclosure',url:'https://example.com/test.pdf'}});
const p=makeEvidence('p','Company management: We expect consolidated FY26 revenue growth in constant currency of 0% to 3%.','2025-04-20');
const a=makeEvidence('a','Company management: We reported consolidated FY26 revenue growth in constant currency of 3.1%.','2026-04-20');
const record=(e,kind='promise',extra={})=>({kind,metric:'revenue_growth',targetPeriod:'FY26',basis:'constant_currency_yoy_consolidated',unit:'percent',low:kind==='promise'?0:null,high:kind==='promise'?3:null,value:kind==='actual'?3.1:null,speaker:'Company management',quote:e.text,evidenceId:e.id,...extra});

test('commitments retain exact quotes and reject unsupported numbers, analyst questions and wrong periods',()=>{
 const valid=validateCommitments([record(p),record(a,'actual')],[p,a]);assert.equal(valid.rows.length,2);
 const bad=validateCommitments([record(p,'promise',{high:4}),record(p,'promise',{targetPeriod:'FY27'}),record(p,'promise',{speaker:'Analyst'}),record(p,'promise',{quote:'We expect revenue growth of 50%.'})],[p,a]);assert.equal(bad.rows.length,0);assert.equal(bad.rejected.length,4);
});
test('promise reconciliation uses the latest dated guidance and does not merge incompatible fiscal periods/bases',()=>{
 const {rows}=validateCommitments([record(p),record(a,'actual')],[p,a]);
 const revised={...rows[0],date:'2026-01-14',low:3,high:3.5};
 const reports=reconcileCommitments([...rows,revised],{now:'2026-11-02'});assert.equal(reports.length,1);assert.equal(reports[0].status,'within');assert.equal(reports[0].revisionCount,1);assert.equal(reports[0].comparison.low,3);
 const mismatch=reconcileCommitments([rows[0],{...rows[1],basis:'reported_currency_yoy_consolidated'}]);assert.equal(mismatch.find(r=>r.promises.length).status,'not_comparable');assert.equal(mismatch.find(r=>r.promises.length).comparison,null);
 const quarter=reconcileCommitments([rows[0],{...rows[1],targetPeriod:'Q4 FY26'}],{now:'2026-11-02'});assert.equal(quarter.find(r=>r.promises.length).status,'outcome_missing');
 assert.equal(reconcileCommitments([{...rows[0],targetPeriod:'FY28'}],{now:'2026-11-02'})[0].status,'not_yet_due');
});
test('later unextracted same-year transcripts prevent a false final-guidance verdict',()=>{
 const {rows}=validateCommitments([record(p),record(a,'actual')],[p,a]);
 const incomplete=reconcileCommitments(rows,{documents:[{id:'later-q2',type:'transcript',date:'2025-10-20',period:'Q2 FY26',title:'Later management update'}]})[0];
 assert.equal(incomplete.status,'coverage_incomplete');assert.equal(incomplete.comparison,null);assert.equal(incomplete.missingDisclosures[0].id,'later-q2');
});
test('a guidance statement cannot be reused as achieved delivery',()=>{
 assert.equal(validateCommitments([record(p,'actual',{value:3})],[p]).rows.length,0);
 assert.equal(numberSupported(-30,'Cash purchases (30)'),true);assert.equal(numberSupported(30,'Cash purchases (30)'),false);
 assert.equal(periodSupported('FY26',"FY'26 revenue",{}),true);assert.equal(periodSupported('Q2 FY26','Full year FY26 revenue',{}),false);assert.equal(normalizeQuote('a  –  b'),'a - b');
});
test('range separators are not negative values and accounting negatives are not double-negated',()=>{
 assert.deepEqual(quoteNumbers('Guidance0%–3%, then20–22%.'),[0,3,20,22]);
 assert.deepEqual(quoteNumbers('Growth was -2.4%; cash (1,234), (-1,234), and 29, 211.'),[-2.4,-1234,-1234,29211]);
 assert.equal(numberSupported(3,'Growth guidance 0%-3%'),true);assert.equal(numberSupported(-2.4,'Revenue growth -2.4%'),true);
 assert.equal(periodSupported('FY26','Our guidance for this financial year is 3% to 3.5%.',{period:'Q3 FY26',type:'transcript'}),true);
 assert.equal(periodSupported('FY27','Our guidance for this financial year is 3% to 3.5%.',{period:'Q3 FY26',type:'transcript'}),false);
});
const c=makeEvidence('cash','Consolidated statement of cash flows for FY26 (INR crore): Net cash from operating activities 120. Profit after tax for the year 100. Purchase of property, plant and equipment (30).');
const cashFact=(metric,value,quote)=>({metric,value,quote,period:'FY26',basis:'consolidated',unit:'INR_crore',evidenceId:c.id});
const rawCash=[cashFact('cfo',120,'Net cash from operating activities 120.'),cashFact('pat',100,'Profit after tax for the year 100.'),cashFact('capex',-30,'Purchase of property, plant and equipment (30).')];
test('cash quality calculates FCF and conversion from matched exact annual amounts',()=>{
 const {facts,rejected}=validateCashFacts(rawCash,[c]);assert.equal(rejected.length,0);const rows=calculateCashQuality(facts);assert.equal(rows.length,1);assert.equal(rows[0].freeCashFlow,90);assert.equal(rows[0].cashConversion,1.2);assert.equal(rows[0].facts[0].page,7);
});
test('cash quality withholds mismatched scope/scale, conflicting values and zero/negative PAT ratios',()=>{
 assert.equal(validateCashFacts([cashFact('cfo',999,'Net cash from operating activities 120.')],[c]).facts.length,0);
 assert.equal(validateCashFacts([{...rawCash[0],unit:'USD_million'}],[c]).facts.length,0);
 assert.equal(validateCashFacts([{...rawCash[0],basis:'standalone'}],[c]).facts.length,0);
 const matched=validateCashFacts(rawCash,[c]).facts;
 const rows=calculateCashQuality(matched.map(f=>f.metric==='pat'?{...f,basis:'standalone'}:f));assert.ok(rows.every(r=>r.cashConversion===null));
 assert.equal(calculateCashQuality(matched.map(f=>f.metric==='pat'?{...f,value:0}:f))[0].cashConversion,null);
 const conflicting=makeEvidence('conflict','Consolidated statement of cash flows for FY26 (INR crore): Net cash from operating activities 130.');
 const result=validateCashFacts([rawCash[0],{...rawCash[0],value:130,quote:'Net cash from operating activities 130.',evidenceId:'conflict'}],[c,conflicting]);assert.equal(result.facts.length,2);assert.ok(result.facts.every(f=>f.conflict));const calculated=calculateCashQuality([...result.facts,...matched.filter(f=>f.metric!=='cfo')])[0];assert.equal(calculated.cfo,null);assert.equal(calculated.freeCashFlow,null);assert.equal(calculated.cashConversion,null);assert.match(calculated.gaps[0],/Conflicting CFO/);
});
test('real indexed issuers have isolated evidence states without requiring a key',async()=>{
 for(const ticker of ['INFY','HCLTECH','LT']){const r=await buildCommitments({ticker,corpus:full});assert.ok(['agent','evidence'].includes(r.mode));assert.ok(r.evidence.length>0);assert.ok(r.evidence.every(e=>e.ticker===ticker));if(r.mode==='evidence')assert.equal(r.rows.length,0)}
 const cash=await buildCashQuality({ticker:'INFY',corpus:full});assert.equal(cash.extractionMode,'deterministic_statement');assert.ok(cash.evidence.some(e=>e.document.type==='annual_report'));
 const bank=await buildCashQuality({ticker:'HDFCBANK',corpus:full});assert.equal(bank.mode,'not_applicable');assert.equal(bank.evidence.length,0);
 const absent=await buildCommitments({ticker:'UNKNOWN',corpus:full});assert.equal(absent.mode,'coverage');assert.equal(absent.evidence.length,0);
});
test('generic declarative guidance parsing recovers the actual four dated revisions and correct final delivery',async()=>{
 const r=await buildCommitments({ticker:'INFY',corpus:full}),row=r.rows.find(x=>x.metric==='revenue_growth'&&x.targetPeriod==='FY26');assert.equal(r.extractionMode,'deterministic_guidance');
 assert.deepEqual(row.promises.map(p=>[p.date,p.low,p.high]),[['2025-04-17',0,3],['2025-07-23',1,3],['2025-10-16',2,3],['2026-01-14',3,3.5]]);assert.equal(row.actual.value,3.1);assert.equal(row.status,'within');assert.equal(row.comparison.high,3.5);
 assert.ok(r.records.every(record=>r.evidence.some(e=>e.id===record.evidenceId&&normalizeQuote(e.text).includes(record.quote))));
 const bad=makeEvidence('ambiguous','Our revenue growth guidance for FY26 is 0% to 3% and operating margin 20% to 22% in constant currency. Could you explain our revenue growth guidance for FY26 of 1% to 3% in constant currency?');assert.equal(extractExplicitCommitments([bad]).rows.length,0);
 const revised=makeEvidence('revised','Our revenue growth guidance for FY26 was 0% to 3%, now it will be 1% to 3% in constant currency.');assert.deepEqual(extractExplicitCommitments([revised]).rows.map(r=>[r.low,r.high]),[[1,3]]);
});
test('complete physical cash-flow pages recover statement scope, rupee units, annual columns and core amounts',async()=>{
 const r=await buildCashQuality({ticker:'INFY',corpus:full}),source=r.evidence.find(e=>e.documentId==='infy-ar-fy26'&&e.page===295);
 assert.ok(source?.text.includes('Consolidated Statement of Cash Flows'));assert.ok(source.text.includes('33,986'));assert.ok(source.expandedPhysicalPage);
 const quote=source.text.match(/Net cash generated by operating activities 33,986 35,694/)[0],capex=source.text.match(/Expenditure on property, plant and equipment and intangibles, net of sale proceeds \(Refer to note 2.2\) \(2,727\) \(2,237\)/)[0],pat=source.text.match(/Profit for the year 29,474 26,750/)[0];
 const facts=[['cfo',33986,quote],['capex',-2727,capex],['pat',29474,pat]].map(([metric,value,quote])=>({metric,value,quote,evidenceId:source.id,period:'FY26',basis:'consolidated',unit:'INR_crore'}));
 const valid=validateCashFacts(facts,[source]);assert.equal(valid.facts.length,3,JSON.stringify(valid.rejected));assert.equal(calculateCashQuality(valid.facts)[0].freeCashFlow,31259);assert.equal(calculateCashQuality(valid.facts)[0].cashConversion,1.1531);
 const ledger=await buildCommitments({ticker:'INFY',corpus:full});assert.ok(ledger.evidence.some(e=>e.documentId==='infy-q4-fy25'&&e.page===4),'original guidance page must be retrieved');
});
test('model extraction is validated and cached by changed source content, not ticker alone',async()=>{
 const previous=globalThis.fetch;let calls=0;
 const corpus={documents:[p.document,a.document],chunks:[p,a]};
 globalThis.fetch=async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.generationConfig.responseJsonSchema.properties.records.maxItems,6);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({records:[record(p),record(a,'actual')],gaps:[]})}]}}]})};
 try{
  const env={GEMINI_API_KEY:'test-key',FINN_MODEL:'test-ledger'};
  const one=await buildCommitments({ticker:'TEST',corpus,env});assert.equal(one.mode,'agent');assert.equal(one.records.length,2);assert.equal(one.rows[0].status,'above');
  const two=await buildCommitments({ticker:'TEST',corpus,env});assert.equal(two.cached,true);assert.equal(calls,1);
  await buildCommitments({ticker:'TEST',corpus:{...corpus,chunks:[{...p,text:p.text+' Source revision.'},a]},env});assert.equal(calls,2);
 }finally{globalThis.fetch=previous}
});
test('cash model output passes through exact source validation and deterministic calculation',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.generationConfig.responseJsonSchema.properties.facts.maxItems,6);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({facts:rawCash,gaps:[]})}]}}]})};
 try{const r=await buildCashQuality({ticker:'TEST',corpus:{documents:[c.document],chunks:[c]},env:{GEMINI_API_KEY:'test-key',FINN_MODEL:'test-cash'}});assert.equal(r.mode,'agent');assert.equal(r.facts.length,3);assert.equal(r.rows[0].freeCashFlow,90)}finally{globalThis.fetch=previous}
});
test('provider rejection remains diagnosable without leaking credentials or raw errors',async()=>{
 const previous=globalThis.fetch,secret='test-secret-extraction-never-print';
 globalThis.fetch=async()=>Response.json({error:{message:'Invalid schema request with key '+secret+'; unsupported field.'}},{status:400});
 try{
  for(const run of [buildCommitments,buildCashQuality]){
   const r=await run({ticker:'TEST',corpus:{documents:[c.document],chunks:[c]},env:{GEMINI_API_KEY:secret,FINN_MODEL:'failure-diagnostic'}});
   assert.equal(r.mode,'evidence');const failure=r.trace.find(t=>t.tool==='extraction_error');assert.equal(failure.status,400);assert.match(failure.safeDetail,/Invalid schema/);assert.ok(!JSON.stringify(r).includes(secret));
  }
 }finally{globalThis.fetch=previous}
});
