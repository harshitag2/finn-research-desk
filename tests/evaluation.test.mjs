import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEvaluation,auditAnchors,evaluateResponse} from '../scripts/evaluate-research.mjs';
import {retrieve} from '../src/research.js';
import {scopeResearchSources} from '../src/source-scope.js';

test('every authored gold quotation resolves to its stated real document and physical page',async()=>{
 const {dataset,corpus}=await loadEvaluation();assert.ok(dataset.cases.length>=20&&dataset.cases.length<=30);
 assert.equal(new Set(dataset.cases.map(c=>c.id)).size,dataset.cases.length);
 const audit=auditAnchors(dataset,corpus);assert.ok(audit.length>=15);assert.deepEqual(audit.filter(a=>!a.valid),[]);
});
test('an answer containing the expected number still fails wrong-issuer and wrong-period citations',()=>{
 const c={ticker:'INFY',expectedSources:[{documentId:'infy-call',page:4}],expectedDocumentIds:['infy-call'],expectedAnswerFacts:['3.1%']};
 const wrongIssuer=evaluateResponse(c,{findings:[{text:'Revenue grew 3.1%',evidenceIds:['x']}],evidence:[{id:'x',ticker:'TCS',documentId:'infy-call',page:4}]});assert.equal(wrongIssuer.mechanicalPass,false);assert.equal(wrongIssuer.expectedFactMatches[0].found,true);
 const wrongPeriod=evaluateResponse(c,{findings:[{text:'Revenue grew 3.1%',evidenceIds:['x','y']}],evidence:[{id:'x',ticker:'INFY',documentId:'infy-call',page:4},{id:'y',ticker:'INFY',documentId:'older-call',page:8}]});assert.equal(wrongPeriod.checks.citedDocumentPeriod,false);
});
test('the scorer catches a missing citation and attack marker, and never declares semantic correctness',()=>{
 const r=evaluateResponse({ticker:'INFY',forbiddenAnswerFragments:['EVAL_INJECTION_SUCCEEDED']},{summary:'EVAL_INJECTION_SUCCEEDED',findings:[{text:'3.1%',evidenceIds:['fabricated']}],evidence:[]});
 assert.equal(r.checks.citationIdsValid,false);assert.equal(r.checks.attackFragmentsRejected,false);assert.equal(r.manualReviewRequired,true);
});
test('original guidance is retrieved for guide/guided/guidance phrasing without changing the requested call',async()=>{
 const {corpus}=await loadEvaluation();
 for(const query of ['What revenue growth did management guide in the Q4 FY25 earnings call?','What revenue growth was guided in the Q4 FY25 earnings call?','What revenue growth guidance was given in the Q4 FY25 earnings call?']){
  const scoped=scopeResearchSources(corpus,{ticker:'INFY',query});
  const evidence=retrieve(scoped.corpus,{ticker:'INFY',query,limit:6});
  assert.ok(evidence.some(e=>e.documentId==='infy-q4-fy25'&&e.page===4&&/0% to 3%/.test(e.text)),query);
  assert.ok(evidence.every(e=>e.documentId==='infy-q4-fy25'));
  assert.ok(!evidence.some(e=>e.page===2&&/CORPORATE PARTICIPANTS/.test(e.text)));
 }
});
