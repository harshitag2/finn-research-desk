import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';

test('daily market view handles incomplete upstream arrays without leaking a TypeError',async()=>{
 const previous=globalThis.fetch;
 const timestamp=[3,2,1].map(days=>Math.floor(Date.now()/1000)-days*86400);
 try{
  for(const [i,indicators] of [undefined,{quote:[{close:[100,101,102]}]},{quote:[{volume:[10,11,12]}]}].entries()){
   globalThis.fetch=async()=>Response.json({chart:{result:[{timestamp,indicators}]}});
   const response=await worker.fetch(new Request('https://finn.test/api/quote?ticker=INCOMPLETE'+i));
   assert.equal(response.status,502);const r=await response.json();
   assert.match(r.error,/incomplete daily prices or volumes/);assert.doesNotMatch(r.error,/undefined|Cannot read/);
   assert.equal(r.close,undefined);
  }
 }finally{globalThis.fetch=previous}
});

test('daily market view still reports complete provider data and supports zero volume',async()=>{
 const previous=globalThis.fetch;
 try{
  const timestamp=[3,2,1].map(days=>Math.floor(Date.now()/1000)-days*86400);
  globalThis.fetch=async()=>Response.json({chart:{result:[{timestamp,meta:{currency:'INR'},indicators:{quote:[{close:[100,101,102],volume:[0,0,0]}]}}]}});
  const response=await worker.fetch(new Request('https://finn.test/api/quote?ticker=COMPLETEQA'));
  assert.equal(response.status,200);const r=await response.json();assert.equal(r.close,102);assert.equal(r.volume,0);assert.equal(r.volumeRatio,null);assert.equal(r.history.length,3);
 }finally{globalThis.fetch=previous}
});
