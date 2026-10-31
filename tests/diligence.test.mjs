import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {collectThesisEvidence,reviewThesis,LENSES} from '../src/diligence.js';
import {validateFindings} from '../src/research.js';
const corpus=JSON.parse(fs.readFileSync(new URL('../data/corpus.json',import.meta.url),'utf8'));
test('thesis reviews search both the belief and disconfirming condition within one issuer',()=>{
 const r=collectThesisEvidence({corpus,ticker:'INFY',thesis:'Cash conversion supports reported profits',disconfirm:'Rising receivables or weak cash flow would challenge the thesis',lens:'cash'});
 assert.equal(r.evidenceGroups.length,2);assert.ok(r.evidenceGroups.every(g=>g.ids.length>0));assert.ok(r.evidence.every(e=>e.ticker==='INFY'&&e.document.url));assert.equal(new Set(r.evidence.map(e=>e.id)).size,r.evidence.length);
});
test('keyless thesis evidence does not automatically classify the thesis as supported',async()=>{
 const r=await reviewThesis({corpus,ticker:'INFY',thesis:'Revenue growth is supported by large deals',disconfirm:'Weak conversion and downward guidance revisions challenge the belief',lens:'management'});
 assert.equal(r.mode,'evidence');assert.equal(r.findings.length,0);assert.match(r.gaps[0],/not judgments/);assert.equal(r.reviewContext.ticker,'INFY');assert.equal(r.trace[0].tool,'thesis_review');
});
test('missing issuer evidence stays unknown, including in a downside review',async()=>{
 const r=await reviewThesis({corpus,ticker:'UNKNOWNCO',thesis:'The company has a resilient balance sheet',disconfirm:'A material increase in debt would challenge the belief',lens:'downside'});
 assert.equal(r.evidence.length,0);assert.equal(r.findings.length,0);assert.equal(r.mode,'coverage');assert.deepEqual(r.coverage.tickers,['UNKNOWNCO']);
});
test('stance labels require valid evidence and an allowed interpretation',()=>{
 const findings=validateFindings([{text:'headwind',evidenceIds:['a'],stance:'challenges'},{text:'unfounded',evidenceIds:['missing'],stance:'supports'},{text:'no rating',evidenceIds:['a'],stance:'buy'}],[{id:'a'}]);assert.equal(findings.length,2);assert.equal(findings[0].stance,'challenges');assert.equal(findings[1].stance,undefined);assert.equal(LENSES.length,5);
});
test('configured thesis review asks for disconfirming evidence and preserves cited interpretation',async()=>{
 const previous=globalThis.fetch;let checked=false;
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);assert.match(body.messages[0].content,/Actively inspect disconfirming evidence/);const context=JSON.parse(body.messages[1].content);assert.ok(context.review.disconfirm);checked=true;return Response.json({choices:[{message:{content:JSON.stringify({action:'finish',findings:[{text:'Mock-provider interpretation for the test.',stance:'challenges',evidenceIds:[context.initialEvidence[0].id]}],gaps:['Mock provider; not a live model assessment.']})}}]})};
 try{const result=await reviewThesis({corpus,ticker:'INFY',thesis:'Operating cash flow supports profitability',disconfirm:'A rise in receivables challenges this thesis',lens:'cash',env:{FINN_MODEL:'test',FINN_PROVIDER:'compatible',FINN_API_KEY:'test',FINN_API_URL:'https://example.invalid'}});assert.ok(checked);assert.equal(result.mode,'agent');assert.equal(result.findings[0].stance,'challenges')}finally{globalThis.fetch=previous}
});
