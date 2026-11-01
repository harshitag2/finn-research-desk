import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeResearchSources} from '../src/source-scope.js';
import {runResearch} from '../src/research.js';
import {compareCompanies} from '../src/commands.js';
const documents=[{id:'a1',ticker:'AAA',type:'transcript',period:'Q1 FY27',date:'2026-07-20',title:'AAA Q1'},{id:'a2',ticker:'AAA',type:'transcript',period:'Q2 FY27',date:'2026-10-20',title:'AAA Q2'},{id:'ar',ticker:'AAA',type:'annual_report',period:'FY26',date:'2026-08-20',title:'AAA annual report'},{id:'b1',ticker:'BBB',type:'transcript',period:'Q1 FY27',date:'2026-07-22',title:'BBB Q1'}];
const corpus={documents,chunks:documents.map(d=>({id:d.id+'-p1',documentId:d.id,ticker:d.ticker,page:1,text:'Management revenue growth guidance and margin discussion in '+d.period+'.'}))};
test('a requested call quarter creates a document boundary, including four-digit fiscal years',()=>{
 const r=scopeResearchSources(corpus,{ticker:'AAA',query:'What did management say in the Q2 FY2027 earnings call?'});assert.deepEqual(r.corpus.documents.map(d=>d.id),['a2']);assert.deepEqual(r.corpus.chunks.map(c=>c.documentId),['a2']);assert.equal(r.coverage.requested,'Q2 FY27');
});
test('latest transcript is chosen per issuer rather than the latest annual report',()=>{
 const r=scopeResearchSources(corpus,{query:'Compare the latest earnings calls'});assert.deepEqual(r.corpus.documents.map(d=>d.id),['a2','b1']);assert.equal(r.coverage.companies[0].through,'2026-10-20');assert.equal(r.coverage.companies[0].selectedThrough,'2026-10-20');assert.deepEqual(r.coverage.companies[0].selectedPeriods,['Q2 FY27']);
});
test('annual guidance timelines retain earlier quarters and explicit call dates stay exact',()=>{
 assert.equal(scopeResearchSources(corpus,{ticker:'AAA',query:'How did revenue guidance change through FY27?'}).corpus.documents.length,3);
 assert.deepEqual(scopeResearchSources(corpus,{ticker:'AAA',query:'Read the October 20, 2026 earnings call'}).corpus.documents.map(d=>d.id),['a2']);
 assert.deepEqual(scopeResearchSources(corpus,{ticker:'AAA',query:'Read the 2026-10-20 earnings call'}).corpus.documents.map(d=>d.id),['a2']);
 assert.doesNotThrow(()=>scopeResearchSources(corpus,{query:'April 99, 2026 call'}));
});
test('missing-quarter research stops before synthesis rather than substituting a different disclosure',async()=>{
 const r=await runResearch({query:'What did management say in the Q3 FY27 transcript?',ticker:'AAA',corpus,env:{GEMINI_API_KEY:'unused-test-key'}});assert.equal(r.mode,'coverage');assert.equal(r.coverage.status,'period_missing');assert.equal(r.findings.length,0);assert.equal(r.evidence.length,0);assert.ok(!r.trace.some(t=>t.tool==='model_step'));
});
test('comparison preserves the missing-period gate when only one issuer has the requested call',async()=>{
 const r=await compareCompanies({query:'Compare the Q2 FY27 earnings calls',tickers:['AAA','BBB'],corpus,env:{GEMINI_API_KEY:'unused-test-key'}});assert.equal(r.mode,'coverage');assert.deepEqual(r.coverage.tickers,['BBB']);assert.equal(r.coverage.status,'period_missing');assert.deepEqual(r.evidence,[]);
});
test('initial evidence cannot escape the selected disclosure, and answers expose coverage',async()=>{
 const r=await runResearch({query:'What revenue guidance was in the latest transcript?',ticker:'AAA',corpus,initialEvidence:[{...corpus.chunks[0],document:documents[0]}]});assert.ok(r.evidence.length);assert.ok(r.evidence.every(e=>e.documentId==='a2'));assert.equal(r.sourceCoverage.companies[0].documentCount,3);assert.equal(r.sourceCoverage.requested,'Latest indexed transcript');
});
