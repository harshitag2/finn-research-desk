import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertPublicURL,parseDiscoveryHTML,discoverSources,ingestDiscovered,verifyIssuerText,validateManagementFacts,enrichManagement} from '../src/source-discovery.js';
const ticker='COFORGE',base='https://www.screener.in/company/COFORGE/consolidated/';
const html=`<h1>Coforge Ltd</h1><a href="https://www.nseindia.com/get-quotes/equity?symbol=COFORGE">NSE: COFORGE</a><a href="https://www.coforge.com" target="_blank">Website</a><section id="documents"><h3>Annual reports</h3><a href="https://www.bseindia.com/xml-data/corpfiling/AttachLive/coforge-fy2025-26.pdf">Annual report FY2025-26</a><h3>Concalls</h3><a href="https://www.coforge.com/investors/Q2FY27-transcript.pdf">Transcript Q2 FY27</a><a href="https://evil.example/fake.pdf">Annual report FY2026-27</a></section>`;
test('source discovery verifies NSE identity and only permits primary document hosts',()=>{
 const r=parseDiscoveryHTML(html,ticker);assert.equal(r.company,'Coforge Ltd');assert.equal(r.links.length,2);assert.equal(r.links[0].type,'annual_report');assert.equal(r.links[0].period,'FY26');assert.equal(r.links[1].type,'transcript');assert.equal(r.links[1].period,'Q2 FY27');assert.throws(()=>parseDiscoveryHTML(html,'INFY'),/verify the NSE ticker/);
});
test('arbitrary URLs, credentials, private destinations and unrelated hosts are rejected',()=>{
 for(const url of ['http://www.bseindia.com/a.pdf','https://127.0.0.1/a.pdf','https://[::1]/a.pdf','https://169.254.169.254/','https://localhost/a','https://metadata.internal/a','https://user:pass@www.bseindia.com/a','https://www.bseindia.com:444/a'])assert.throws(()=>assertPublicURL(url),/public HTTPS/);
 assert.throws(()=>assertPublicURL('https://evil.example/a',['www.bseindia.com']),/approved primary/);
 assert.equal(assertPublicURL('https://www.bseindia.com/a',['bseindia.com']).hostname,'www.bseindia.com');
});
test('remote import binds source choice to issuer, validates PDF identity and preserves physical pages',async()=>{
 const fetcher=async url=>url===base?new Response(html):new Response('%PDF-1.7 TEST FIXTURE ONLY');
 const d=await discoverSources({ticker,fetcher,force:true});assert.equal(d.links.length,2);
 const pages=['Coforge Limited TEST FIXTURE ONLY. '.repeat(8),'This TEST FIXTURE ONLY second physical page contains an earnings discussion. '.repeat(4)];
 const r=await ingestDiscovered({ticker,id:d.links[1].id,fetcher,extractor:async()=>pages});assert.equal(r.document.ticker,ticker);assert.equal(r.document.provenance,'primary_discovery');assert.equal(r.document.sha256.length,64);assert.ok(r.chunks.some(c=>c.page===2));assert.ok(r.chunks.every(c=>c.ticker===ticker));
 await assert.rejects(ingestDiscovered({ticker,url:'https://evil.example/fake.pdf',fetcher}),/Select a verified/);
 await assert.rejects(ingestDiscovered({ticker,id:d.links[0].id,url:d.links[1].url,fetcher}),/does not match/);
 await assert.rejects(ingestDiscovered({ticker,id:d.links[0].id,fetcher,extractor:async()=>['Another Corporation TEST FIXTURE ONLY. '.repeat(8)]}),/does not identify/);
});
test('source redirects cannot escape the issuer allowlist and size limits are enforced before parsing',async()=>{
 const d=await discoverSources({ticker,fetcher:async()=>new Response(html),force:true});
 await assert.rejects(ingestDiscovered({ticker,id:d.links[0].id,fetcher:async()=>new Response('',{status:302,headers:{location:'https://127.0.0.1/file.pdf'}})}),/public HTTPS/);
 await assert.rejects(ingestDiscovered({ticker,id:d.links[0].id,fetcher:async()=>new Response('',{headers:{'content-length':'16000000'}})}),/15 MB/);
});
test('unavailable discovery remains recoverable without inventing company coverage',async()=>{
 const r=await discoverSources({ticker:'UNKNOWNXYZ',fetcher:async()=>new Response('blocked',{status:403}),force:true});assert.equal(r.status,'unavailable');assert.equal(r.links.length,0);assert.match(r.failures[0],/403/);assert.match(r.note,/import/);
});
test('management background facts need verbatim value and quote on the correct physical page',()=>{
 const pages=['COFORGE TEST FIXTURE ONLY. Jane Doe appointed Chief Financial Officer effective 1 April 2026. Previously Jane Doe worked at Test Systems.'];
 const good={field:'name',personType:'incoming',value:'Jane Doe',quote:'Jane Doe appointed Chief Financial Officer',page:1};assert.equal(validateManagementFacts([good],pages).length,1);
 assert.equal(validateManagementFacts([{...good,value:'Invented Person'}],pages).length,0);assert.equal(validateManagementFacts([{...good,page:2}],pages).length,0);assert.equal(validateManagementFacts([{...good,quote:'Jane Doe has 35 years experience'}],pages).length,0);
 assert.equal(verifyIssuerText(pages,{ticker:'COFORGE',company:'Coforge Ltd'}),true);assert.equal(verifyIssuerText(pages,{ticker:'INFY',company:'Infosys Limited'}),false);
});
test('management enrichment is linked to a real issuer-scoped filing selection and is separate from research',async()=>{
 const fixture={ticker:'COFORGE',company:'Coforge Ltd',nseCategory:'Change in Management',text:'Appointment of CFO',at:'2026-04-01T10:00:00Z',url:'https://nsearchives.nseindia.com/corporate/test-fixture.pdf'};
 const r=await enrichManagement({ticker,fetcher:async()=>new Response('%PDF-1.7'),announcementFetcher:async()=>[fixture],extractor:async()=>['Coforge Ltd TEST FIXTURE ONLY. Jane Doe appointed Chief Financial Officer effective 1 April 2026. '.repeat(4)]});assert.equal(r.mode,'evidence');assert.equal(r.facts.length,0);assert.equal(r.source.type,'exchange_filing');assert.match(r.source.provenance,/enrichment only/);assert.equal(r.evidence[0].page,1);
 await assert.rejects(enrichManagement({ticker,url:'https://nsearchives.nseindia.com/corporate/other.pdf',announcementFetcher:async()=>[fixture]}),/No matching/);
});
test('real HCL transcript primary-source import retains PDF page attribution and checksum',async t=>{
 const raw=fs.readdirSync('data/raw').find(f=>/hcl.*\.pdf$/i.test(f));if(!raw){t.skip('Raw primary PDFs unavailable');return}
 const full=JSON.parse(fs.readFileSync('data/corpus.json','utf8'));const c={documents:full.documents.filter(d=>d.ticker==='HCLTECH'),chunks:[]};
 const r=await discoverSources({ticker:'HCLTECH',corpus:c,force:true,fetcher:async()=>new Response('',{status:403})});assert.ok(r.links.length);
 const doc=await ingestDiscovered({ticker:'HCLTECH',id:r.links[0].id,corpus:c,fetcher:async()=>new Response(fs.readFileSync('data/raw/'+raw))});assert.notEqual(doc.document.sha256,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');assert.equal(doc.document.pages,24);assert.ok(doc.chunks.some(c=>c.page===24));assert.ok(doc.document.identityVerified);
});
