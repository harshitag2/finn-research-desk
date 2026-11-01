import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeQuote,latestQuote,fetchQuotes} from '../src/market.js';
const now=Date.parse('2026-10-30T08:00:00Z');
function fixture(ticker,extra={}){return {chart:{result:[{meta:{symbol:ticker+'.NS',currency:'INR',regularMarketPrice:105,previousClose:100,regularMarketTime:now/1000-60,currentTradingPeriod:{regular:{start:now/1000-1000,end:now/1000+1000}},...extra},timestamp:[now/1000-120,now/1000-60],indicators:{quote:[{close:[103,105]}]}}]}}}
test('latest quote retains exchange timestamp and computes daily change from previous close',()=>{
 const q=normalizeQuote(fixture('LIVEA'),'LIVEA',now);assert.equal(q.price,105);assert.equal(q.changePercent,5);assert.equal(q.change,5);assert.equal(q.marketState,'open');assert.equal(q.delayMinutes,null);assert.equal(q.asOf,new Date(now-60000).toISOString());assert.equal(q.intraday.length,2);
});
test('closed market does not imply a fresh exchange tick',()=>{
 const q=normalizeQuote(fixture('LIVEB'),'LIVEB',now+2*86400000);assert.equal(q.marketState,'closed');assert.equal(q.asOf,new Date(now-60000).toISOString());
});
test('invalid quote metadata is rejected and a missing comparison base stays unknown',()=>{
 assert.throws(()=>normalizeQuote(fixture('OTHER'),'RIGHT',now),/different security/);assert.throws(()=>normalizeQuote(fixture('LIVEB',{currency:'USD'}),'LIVEB',now),/currency/);assert.throws(()=>normalizeQuote(fixture('LIVEB',{regularMarketPrice:NaN}),'LIVEB',now),/valid quote/);
 const q=normalizeQuote(fixture('LIVEB',{previousClose:0,chartPreviousClose:0}),'LIVEB',now);assert.equal(q.changePercent,null);assert.equal(q.change,null);
});
test('portfolio quotes return partial failures and deduplicate tickers',async()=>{
 let calls=0;const fetcher=async url=>{calls++;const symbol=decodeURIComponent(new URL(url).pathname.split('/').at(-1)).replace(/\.NS$/,'');return symbol==='FAILCO'?new Response('unavailable',{status:503}):Response.json(fixture(symbol))};
 const result=await fetchQuotes(['MULTIA','MULTIB','MULTIA','FAILCO'],{fetcher,now});assert.equal(calls,3);assert.equal(result.quotes.length,3);assert.equal(result.quotes[0].price,105);assert.equal(result.quotes[2].price,null);assert.match(result.notice,/may be delayed/);assert.equal(result.refreshSeconds,15);
});
test('a failed refresh keeps a clearly marked last successful quote',async()=>{
 const first=await latestQuote('STALECO',{fetcher:async()=>Response.json(fixture('STALECO')),now});assert.equal(first.stale,false);
 const cached=await latestQuote('STALECO',{fetcher:async()=>{throw new Error('should not fetch before TTL')},now:now+1000});assert.equal(cached.cacheAgeSeconds,1);
 const stale=await latestQuote('STALECO',{fetcher:async()=>new Response('error',{status:429}),now:now+31000});assert.equal(stale.price,105);assert.equal(stale.stale,true);assert.equal(stale.marketState,'unknown');assert.equal(stale.asOf,first.asOf);
});
test('batch limits prevent unbounded upstream requests',async()=>{
 await assert.rejects(fetchQuotes([]),/between 1 and 50/);await assert.rejects(fetchQuotes(['../../secret']),/valid NSE/);await assert.rejects(fetchQuotes(Array.from({length:51},(_,i)=>'TEST'+i)),/between 1 and 50/);
});
test("network and timeout failures are explained without inventing a price", async () => {
  const offline = await latestQuote("NETFAILCO", { fetcher: async () => { throw new TypeError("fetch failed"); }, now });
  assert.equal(offline.price, null);
  assert.match(offline.error, /Could not reach the quote provider/);
  const slow = await latestQuote("SLOWCO", { fetcher: async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); }, now });
  assert.equal(slow.price, null);
  assert.match(slow.error, /timed out/);
});
test('a provider timestamp regression retains the newer cached quote and explains the rejection',async()=>{
 const first=await latestQuote('TIMEREGRESS',{now,fetcher:async()=>Response.json(fixture('TIMEREGRESS'))});
 const older=await latestQuote('TIMEREGRESS',{now:now+16000,fetcher:async()=>Response.json(fixture('TIMEREGRESS',{regularMarketTime:now/1000-600,regularMarketPrice:90}))});
 assert.equal(older.price,first.price);assert.equal(older.asOf,first.asOf);assert.equal(older.stale,true);assert.equal(older.quoteHealth.state,'cached');assert.match(older.error,/Older provider snapshot ignored/);
});
test('the shared quote cache expires after 15 seconds and reports a delayed open-session tick',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json(fixture('AGECHECK',{regularMarketTime:now/1000-1200}))};
 const first=await latestQuote('AGECHECK',{now,fetcher});assert.equal(first.quoteHealth.state,'delayed');
 await latestQuote('AGECHECK',{now:now+14000,fetcher});assert.equal(calls,1);
 await latestQuote('AGECHECK',{now:now+16000,fetcher});assert.equal(calls,2);
});
