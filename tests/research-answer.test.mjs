import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {timelineCoverage,finishResearchAnswer} from '../src/research-answer.js';
import {runResearch} from '../src/research.js';
import createWorkbenchUI from '../src/workbench-ui.js';
const corpus=JSON.parse(fs.readFileSync(new URL('../data/corpus.json',import.meta.url),'utf8'));
const tcs=corpus.documents.filter(d=>d.ticker==='TCS');
const query='How did revenue growth guidance change through FY26?';

test('a lone closing transcript cannot establish a full-year guidance timeline',()=>{
 const c=timelineCoverage(query,tcs);assert.equal(c.partial,true);assert.deepEqual(c.companies[0].available,['Q4 FY26']);assert.deepEqual(c.companies[0].missing,['Q1 FY26','Q2 FY26','Q3 FY26']);
 const full=timelineCoverage(query,corpus.documents.filter(d=>d.ticker==='INFY'));assert.equal(full.partial,false);
 assert.equal(timelineCoverage('What is the latest guidance?',tcs),null);
 assert.equal(timelineCoverage('How did revenue change through FY26?',tcs),null);
});

test('suggestions fit issuer and actual source coverage without hardcoded company policy',()=>{
 const ui=createWorkbenchUI(),questions=ui.questions('TCS',corpus.documents);
 assert.match(questions[0],/Does TCS give numerical guidance.*Q4 FY26/);assert.ok(questions.every(q=>!q.includes('through FY26')));
 assert.match(ui.questions('INFY',corpus.documents)[0],/guidance change through FY26/);
 assert.match(ui.questions('HDFCBANK',corpus.documents)[0],/loan and deposit/);
});

test('real TCS policy remains a dated cited statement and the year remains incomplete',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body),context=JSON.parse(body.contents[0].parts[0].text),e=context.initialEvidence.find(e=>/don't provide/.test(e.text.normalize('NFKC')));assert.ok(e);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({action:'finish',summary:'Research completed.',findings:[{text:'TCS does not provide numerical revenue or earnings guidance.',evidenceIds:[e.id],stance:'supports'}],gaps:['No revenue guidance exists to track changes.']})}]}}]})};
 try{
  const r=await runResearch({query,ticker:'TCS',corpus,env:{GEMINI_API_KEY:'test-key'}});
  assert.equal(r.answerStatus,'limited_coverage');assert.equal(r.depthStatus,'partial');assert.equal(r.answerContext.period,'Q4 FY26');assert.equal(r.answerContext.page,3);
  assert.match(r.answerContext.quote,/we don't provide any specific revenue or earnings guidance/);
  assert.ok(r.gaps.some(g=>g.includes('Q1 FY26, Q2 FY26, Q3 FY26')));assert.ok(!r.gaps.some(g=>g.includes('No revenue guidance exists')));
  assert.match(r.summary,/indexed Q4 FY26 call/);assert.equal(r.findings[0].stance,undefined);assert.equal(r.nextQuestions.length,2);assert.ok(r.nextQuestions.every(q=>q.query.includes('TCS')&&q.query.includes('Q4 FY26')));
 }finally{globalThis.fetch=previous}
});

test('missing evidence and analyst questions never create a verified no-guidance policy',()=>{
 const document=tcs[0],base={mode:'agent',findings:[{text:'No numerical guidance located.',evidenceIds:['e']}],evidence:[{id:'e',ticker:'TCS',page:3,document,text:'Analyst: Why do we not provide any specific revenue or earnings guidance?'}],gaps:[]};
 assert.equal(finishResearchAnswer(base,{query,documents:tcs}).answerContext,undefined);
 base.evidence[0].text="Analyst: Why do you say we don't provide any specific revenue or earnings guidance?";
 assert.equal(finishResearchAnswer(base,{query,documents:tcs}).answerContext,undefined);
 base.evidence=[];assert.equal(finishResearchAnswer(base,{query,documents:tcs}).answerContext,undefined);
});

test('a direct result summary comes from validated findings instead of a success slogan',()=>{
 const r=finishResearchAnswer({mode:'agent',summary:'Research completed.',findings:[{text:'A source-backed statement.',evidenceIds:['x']}],evidence:[],gaps:[]},{query:'Explain revenue',documents:tcs});
 assert.equal(r.summary,'A source-backed statement.');
});
