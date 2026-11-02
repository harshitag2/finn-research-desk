import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../dist/server/index.js';

test('shared extraction returns issuer-scoped passages with physical PDF page references',async()=>{
 const library=await(await worker.fetch(new Request('https://finn.test/api/library'))).json();
 const document=library.documents.find(d=>d.ticker==='INFY');
 const response=await worker.fetch(new Request('https://finn.test/api/documents/extraction?id='+encodeURIComponent(document.id)));
 assert.equal(response.status,200);const r=await response.json();
 assert.equal(r.document.id,document.id);assert.ok(r.chunks.length>0);
 assert.ok(r.chunks.every(c=>c.documentId===document.id&&c.ticker==='INFY'&&c.page>0&&c.page<=document.pages));
 assert.match(r.note,/overlap/);
 assert.equal((await worker.fetch(new Request('https://finn.test/api/documents/extraction?id=not-found'))).status,404);
});
test('PDF upload retains full page text and a reproducible source fingerprint for inspection/export',async()=>{
 const bytes=await readFile(new URL('./fixtures/hcl-q4-fy26.pdf',import.meta.url));
 const form=new FormData();form.set('file',new File([bytes],'hcl.pdf',{type:'application/pdf'}));
 form.set('ticker','HCLTECH');form.set('period','Q4 FY26');form.set('date','2026-04-21');
 const response=await worker.fetch(new Request('https://finn.test/api/ingest',{method:'POST',body:form}));
 assert.equal(response.status,200);const r=await response.json();
 assert.equal(r.extractedPages.length,r.document.pages);assert.ok(r.chunks.length>0);
 assert.ok(r.extractedPages.every((p,i)=>p.page===i+1&&typeof p.text==='string'));
 const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
 assert.equal(r.document.sha256,hash);assert.equal(r.document.provenance,'user_upload');
});
test('non-PDF uploads fail without indexing fabricated document text',async()=>{
 const form=new FormData();form.set('file',new File(['not a PDF'],'report.pdf'));form.set('ticker','INFY');
 const response=await worker.fetch(new Request('https://finn.test/api/ingest',{method:'POST',body:form}));
 assert.equal(response.status,400);assert.match((await response.json()).error,/not a PDF/);
});
