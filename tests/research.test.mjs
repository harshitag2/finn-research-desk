import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {retrieve,calculateChange,compareGuidance,validateFindings,chunkPages,runResearch} from '../src/research.js';
const corpus=JSON.parse(fs.readFileSync(new URL('../data/corpus.json',import.meta.url),'utf8'));
test('retrieval is restricted to the selected issuer and returns page evidence',()=>{
 const evidence=retrieve(corpus,{query:'revenue growth guidance',ticker:'HCLTECH'});
 assert.ok(evidence.length);for(const e of evidence){assert.equal(e.ticker,'HCLTECH');assert.ok(e.page>0);assert.ok(e.document.url.startsWith('https://'));assert.equal(e.document.id,e.documentId)}
});
test('retrieval respects period and type',()=>{
 const results=retrieve(corpus,{query:'revenue growth guidance',ticker:'INFY',period:'Q3 FY26',type:'transcript'});
 assert.ok(results.length);assert.ok(results.every(e=>e.document.period==='Q3 FY26'&&e.document.type==='transcript'));
});
test('an unfamiliar ticker with no indexed evidence has no fabricated answer',async()=>{
 const r=await runResearch({query:'What guidance did management give?',ticker:'PIDILITIND',corpus});
 assert.equal(r.mode,'evidence');assert.equal(r.evidence.length,0);assert.equal(r.findings.length,0);assert.match(r.summary,/No matching evidence/);
});
test('retrieval generalizes to a newly ingested company',async()=>{
 const doc={id:'new-co',ticker:'NEWCO',title:'NEWCO call',type:'transcript',period:'Q1 FY27',url:'',date:'2026-07-01',pages:1};
 const chunks=chunkPages(['CEO: Our operating margin guidance for FY27 is 12 to 14 percent. We expect growth in our manufacturing business.'],doc);
 const r=await runResearch({query:'What operating margin guidance did management give?',ticker:'NEWCO',corpus:{documents:[...corpus.documents,doc],chunks:[...corpus.chunks,...chunks]}});
 assert.equal(r.evidence[0].ticker,'NEWCO');assert.match(r.evidence[0].text,/12 to 14/);
});
test('percentage change handles zero and invalid bases',()=>{
 assert.equal(calculateChange(120,100).percentage,20);assert.equal(calculateChange(10,0).percentage,null);assert.throws(()=>calculateChange(NaN,10));
});
test('annual guidance cannot be settled with quarterly data or mismatched basis',()=>{
 const base={actual:3.1,low:3,high:3.5,targetPeriod:'FY26',actualPeriod:'FY26',basis:'CC consolidated',actualBasis:'CC consolidated'};
 assert.equal(compareGuidance(base).status,'within');assert.equal(compareGuidance({...base,actualPeriod:'Q4 FY26'}).status,'not_comparable');assert.equal(compareGuidance({...base,actualBasis:'reported INR'}).status,'not_comparable');assert.throws(()=>compareGuidance({...base,low:5}));
});
test('unretrieved and missing evidence IDs are rejected',()=>{
 const f=validateFindings([{text:'valid',evidenceIds:['a']},{text:'invented source',evidenceIds:['b']},{text:'unsupported',evidenceIds:[]}],[{id:'a'}]);assert.deepEqual(f,[{text:'valid',evidenceIds:['a']}]);
});
test('all corpus chunks have unique identifiers and valid physical page references',()=>{
 const ids=new Set();const docs=new Map(corpus.documents.map(d=>[d.id,d]));
 for(const c of corpus.chunks){assert.ok(!ids.has(c.id));ids.add(c.id);const d=docs.get(c.documentId);assert.ok(d);assert.equal(c.ticker,d.ticker);assert.ok(c.page>=1&&c.page<=d.pages);assert.ok(c.text.length>0)}
});
test('source-checked guidance example points at actual source language',()=>{
 const g=JSON.parse(fs.readFileSync(new URL('../data/guidance.json',import.meta.url),'utf8'));
 for(const entry of [...g.revisions,g.actual]){const c=corpus.chunks.find(c=>c.id===entry.evidenceId);assert.ok(c);assert.match(c.text,/guidance|3\.1%/i)}
 assert.match(corpus.chunks.find(c=>c.id===g.actual.evidenceId).text,/grew 3\.1% in constant currency/);
});
test('configured agent executes search, arithmetic and citation validation',async()=>{
 const original=globalThis.fetch;let count=0;const id=corpus.chunks.find(c=>c.ticker==='INFY').id;
 const steps=[{action:'read_passage',args:{id}},{action:'calculate_change',args:{current:120,previous:100}},{action:'search_documents',args:{query:'full year revenue growth guidance'}},{action:'finish',findings:[{text:'Evidence-backed test finding',evidenceIds:[id]}],gaps:['Test adapter, not a live model.']}];
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify(steps[count++])}}]});
 try{const r=await runResearch({query:'FY26 revenue growth guidance',ticker:'INFY',corpus,env:{FINN_PROVIDER:'compatible',FINN_MODEL:'test-model',FINN_API_KEY:'test-key',FINN_API_URL:'https://example.invalid/chat/completions'}});assert.equal(r.mode,'agent');assert.equal(r.findings.length,1);assert.ok(r.trace.some(t=>t.tool==='calculate_change'));assert.ok(r.trace.some(t=>t.tool==='validate_citations'));assert.equal(count,4)}finally{globalThis.fetch=original}
});
test('provider failure falls back to original passages',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('error',{status:503});try{const r=await runResearch({query:'guidance growth',ticker:'INFY',corpus,env:{FINN_PROVIDER:'compatible',FINN_MODEL:'test',FINN_API_KEY:'test',FINN_API_URL:'https://example.invalid'}});assert.equal(r.mode,'evidence');assert.ok(r.evidence.length);assert.match(r.gaps[0],/Model request failed/)}finally{globalThis.fetch=original}
});
test('the agent stops at its tool budget',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify({action:'calculate_change',args:{current:2,previous:1}})}}]})};try{const r=await runResearch({query:'guidance',ticker:'INFY',corpus,env:{FINN_PROVIDER:'compatible',FINN_MODEL:'test',FINN_API_KEY:'test',FINN_API_URL:'https://example.invalid'}});assert.equal(calls,5);assert.equal(r.mode,'evidence');assert.match(r.gaps[0],/budget/)}finally{globalThis.fetch=original}
});
