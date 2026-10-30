import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../dist/server/index.js';
const call=(path,options={})=>worker.fetch(new Request('https://finn.test'+path,options),{},{});
test('public diligence context remains outside the company research corpus',async()=>{
 const d=await(await call('/api/diligence')).json();assert.equal(d.lenses.length,5);assert.match(d.method,/not its internal/);
 const r=await(await call('/api/review',{method:'POST',body:JSON.stringify({ticker:'INFY',thesis:'Operating cash generation supports profit quality',disconfirm:'Weak cash conversion would challenge this belief',lens:'cash'})})).json();assert.equal(r.mode,'evidence');assert.equal(r.reviewContext.ticker,'INFY');assert.ok(r.evidence.every(e=>e.document.ticker==='INFY'));
 const bad=await call('/api/review',{method:'POST',body:JSON.stringify({ticker:'INFY',thesis:'short',disconfirm:'short',lens:'made-up'})});assert.equal(bad.status,400);
});
test('app shell, assets and library API are served by the production bundle',async()=>{
 const home=await call('/');assert.equal(home.status,200);assert.match(await home.text(),/FINN/);
 const js=await call('/app.js');assert.equal(js.headers.get('content-type'),'application/javascript; charset=utf-8');assert.match(await js.text(),/research-form/);
 const library=await(await call('/api/library')).json();assert.equal(library.portfolio.length,18);assert.equal(library.documents.length,9);assert.equal(library.providerConfigured,false);
});
test('briefing is explicitly historical and case study has five source passages',async()=>{
 const r=await(await call('/api/briefing')).json();assert.equal(r.mode,'archive');assert.equal(r.items.length,4);assert.ok(r.items.every(i=>i.evidence?.document?.url));
 const c=await(await call('/api/case-study')).json();assert.equal(c.evidence.length,5);
});
test('research endpoint supports keyless citations and rejects invalid inputs',async()=>{
 const query=await call('/api/research',{method:'POST',body:JSON.stringify({ticker:'INFY',query:'cash from operations and cash conversion'})});assert.equal(query.status,200);const r=await query.json();assert.equal(r.mode,'evidence');assert.ok(r.evidence.length);
 const bad=await call('/api/research',{method:'POST',body:JSON.stringify({ticker:'../../secret',query:'hello'})});assert.equal(bad.status,400);
});
test('uploaded text cannot escape its assigned issuer scope',async()=>{
 const body={ticker:'INFY',query:'exclusive evidence secret marker',extraCorpus:{documents:[{id:'u',ticker:'TCS',title:'Uploaded document'}],chunks:[{id:'u1',documentId:'u',ticker:'INFY',page:1,text:'exclusive evidence secret marker'}]}};
 const r=await(await call('/api/search',{method:'POST',body:JSON.stringify(body)})).json();assert.ok(!r.evidence.some(e=>e.id==='u1'));
});
test('invalid PDFs fail clearly rather than producing invented text',async()=>{
 const body=new FormData();body.set('ticker','INFY');body.set('file',new Blob(['not a PDF'],{type:'application/pdf'}),'fake.pdf');const response=await call('/api/ingest',{method:'POST',body});assert.equal(response.status,400);assert.match((await response.json()).error,/not a PDF/);
});
test('real company PDF import preserves page attribution',async t=>{
 const report=JSON.parse(fs.readFileSync('data/ingestion-report.json','utf8'));
 const candidates=fs.readdirSync('data/raw').filter(f=>f.endsWith('.pdf'));
 const raw=candidates.find(f=>/hcl/i.test(f));if(!raw){t.skip('Raw source PDFs are not committed; run ingestion to exercise this integration check.');return}
 const body=new FormData();body.set('ticker','HCLTECH');body.set('period','Q4 FY26');body.set('date','2026-04-21');body.set('type','transcript');body.set('file',new Blob([fs.readFileSync('data/raw/'+raw)],{type:'application/pdf'}),'hcl-call.pdf');
 const response=await call('/api/ingest',{method:'POST',body});const result=await response.json();assert.equal(response.status,200,result.error);assert.equal(result.document.pages,24);assert.ok(result.chunks.length>20);assert.ok(result.chunks.every(c=>c.page>=1&&c.page<=24&&c.ticker==='HCLTECH'));
});
