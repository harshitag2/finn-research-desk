import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {modelConfig,DEFAULT_GEMINI_MODEL} from '../src/model-config.js';
import {runResearch} from '../src/research.js';
const corpus=JSON.parse(fs.readFileSync(new URL('../data/corpus.json',import.meta.url),'utf8'));
test('Gemini uses its server key alias and keeps other providers selectable',()=>{
 assert.equal(modelConfig({GEMINI_API_KEY:'test-key'}).configured,true);assert.equal(modelConfig({GOOGLE_API_KEY:'test-key'}).provider,'gemini');assert.equal(modelConfig({GEMINI_API_KEY:'test-key'}).model,DEFAULT_GEMINI_MODEL);assert.equal(modelConfig({}).configured,false);assert.equal(modelConfig({FINN_PROVIDER:'compatible',FINN_MODEL:'example',FINN_API_KEY:'test'}).provider,'compatible');
});
test('Gemini adapter sends credentials in headers and produces validated cited findings',async()=>{
 const previous=globalThis.fetch;let checked=false;
 globalThis.fetch=async(url,options)=>{assert.ok(url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/'));assert.ok(!url.includes('test-secret'));assert.equal(options.headers['x-goog-api-key'],'test-secret');const body=JSON.parse(options.body);assert.equal(body.generationConfig.responseMimeType,'application/json');assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'low');const context=JSON.parse(body.contents[0].parts[0].text);checked=true;return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({action:'finish',findings:[{text:'Mocked citation check.',evidenceIds:[context.initialEvidence[0].id]}],gaps:[]})}]}}]})};
 try{const r=await runResearch({query:'Revenue growth guidance',ticker:'INFY',corpus,env:{GEMINI_API_KEY:'test-secret'}});assert.ok(checked);assert.equal(r.mode,'agent');assert.equal(r.findings.length,1)}finally{globalThis.fetch=previous}
});
test('Gemini quota failures preserve evidence and explain the failure without exposing a key',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>Response.json({error:{status:'RESOURCE_EXHAUSTED',message:'Quota exceeded'}},{status:429});try{const r=await runResearch({query:'Revenue growth guidance',ticker:'INFY',corpus,env:{GEMINI_API_KEY:'test-secret'}});assert.equal(r.mode,'evidence');assert.ok(r.evidence.length);assert.match(r.gaps[0],/HTTP 429/);assert.match(r.gaps[0],/quota/);assert.ok(!JSON.stringify(r).includes('test-secret'))}finally{globalThis.fetch=previous}
});
