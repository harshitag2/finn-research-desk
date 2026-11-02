import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {researchDepth,expandedEvidence,detailQuality} from '../src/research-depth.js';
import {retrieve,runResearch,validateFindings} from '../src/research.js';
const full=JSON.parse(fs.readFileSync(new URL('../data/corpus.json',import.meta.url),'utf8'));
const corpus={documents:full.documents.filter(d=>['INFY','TCS'].includes(d.ticker)),chunks:full.chunks.filter(c=>['INFY','TCS'].includes(c.ticker))};
test('in-detail comparisons retrieve across subjects and both issuers rather than company-name matches',()=>{
 const depth=researchDepth('compare infy and tcs in detail'),evidence=expandedEvidence(corpus,{query:'compare infy and tcs in detail',depth,retrieve});
 assert.equal(depth.maxFindings,18);assert.ok(evidence.length>6);assert.ok(evidence.filter(e=>e.ticker==='INFY').length>=5);assert.ok(evidence.filter(e=>e.ticker==='TCS').length>=5);assert.ok(new Set(evidence.map(e=>e.retrievalTopic)).size>=4);assert.ok(evidence.every(e=>e.page&&e.document));
});
test('valid citations alone do not make a two-fact response a detailed report',()=>{
 const evidence=[{id:'a',ticker:'INFY'},{id:'b',ticker:'TCS'}],findings=validateFindings([{text:'Infosys fact',evidenceIds:['a'],section:'profitability'},{text:'TCS fact',evidenceIds:['b'],section:'growth'}],evidence,18);
 assert.equal(findings[0].section,'profitability');assert.equal(detailQuality(findings,evidence,researchDepth('in detail')).sufficient,false);assert.equal(researchDepth('Briefly compare revenue').maxFindings,7);
});
test('a thin detailed draft receives one repair request and produces structured cited sections',async()=>{
 const previous=globalThis.fetch;let count=0,lastPrompt;
 globalThis.fetch=async(url,options)=>{count++;const body=JSON.parse(options.body),user=JSON.parse(body.contents[0].parts[0].text);lastPrompt=body.systemInstruction.parts[0].text;assert.equal(body.generationConfig.maxOutputTokens,6500);const evidence=user.initialEvidence;
  const findings=count===1?evidence.slice(0,2).map(e=>({text:'A short fact',evidenceIds:[e.id],section:'growth'})):['business','growth','profitability','capital','outlook'].flatMap(section=>['INFY','TCS'].map(ticker=>({section,evidenceIds:[evidence.find(e=>e.ticker===ticker).id],text:(ticker+' source-backed explanatory paragraph about this topic and its period, drivers and qualifications. ').repeat(6)})));
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({action:'finish',findings,gaps:[]})}]}}]});
 };
 try{const r=await runResearch({query:'Compare INFY and TCS in detail',ticker:'',corpus,env:{GEMINI_API_KEY:'test-key'}});assert.equal(count,2);assert.equal(r.findings.length,10);assert.equal(r.sections.length,5);assert.equal(r.depthStatus,'complete');assert.ok(r.trace.some(t=>t.tool==='expand_detail'));assert.match(lastPrompt,/BOTH issuers/)}finally{globalThis.fetch=previous}
});
