import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNseQuote,nseTimestamp,terminalQuotes} from '../src/exchange-quotes.js';
import createTerminalTools from '../src/terminal-tools.js';
import {parseCommand} from '../src/commands.js';
const now=Date.parse('2026-10-30T08:00:00Z');
const nse=(ticker,price=105)=>({info:{symbol:ticker,companyName:'Test company'},metadata:{lastUpdateTime:'30-Oct-2026 13:29:00'},priceInfo:{lastPrice:price,previousClose:100,intraDayHighLow:{max:107,min:99}}});
const yahoo=ticker=>({chart:{result:[{meta:{symbol:ticker+'.NS',currency:'INR',regularMarketPrice:105,previousClose:100,regularMarketTime:now/1000-60,currentTradingPeriod:{regular:{start:now/1000-1000,end:now/1000+1000}}},timestamp:[now/1000-60],indicators:{quote:[{close:[105]}]}}]}});
test('NSE snapshot validates security, IST timestamp and unknown session without inventing ticks',()=>{
 const q=normalizeNseQuote(nse('TERMNSE'),'TERMNSE',now);assert.equal(q.price,105);assert.equal(q.asOf,'2026-10-30T07:59:00.000Z');assert.equal(q.marketState,'unknown');assert.equal(q.changePercent,5);assert.deepEqual(q.intraday,[]);
 assert.equal(normalizeNseQuote(nse('TERMNSE'),'TERMNSE',now+2*86400000).marketState,'closed');
 assert.throws(()=>normalizeNseQuote(nse('OTHER'),'TERMNSE',now),/different security/);
 assert.throws(()=>nseTimestamp('31-Apr-2026 10:00:00'),/invalid/);
 assert.equal(nseTimestamp('30-OCT-2026 13:29:00'),q.asOf);
 assert.throws(()=>normalizeNseQuote(nse('TERMNSE'),'TERMNSE',now-86400000),/future/);
});
test('NSE access denial uses a labelled fallback and cooldown without retrying blocked access',async()=>{
 let exchangeCalls=0;const fetcher=async url=>{if(url.includes('nseindia')){exchangeCalls++;return new Response('blocked',{status:403})}return Response.json(yahoo(decodeURIComponent(new URL(url).pathname.split('/').at(-1)).replace(/\.NS$/,'')))};
 const r=await terminalQuotes(['TERMFAIL'],{fetcher,now});assert.equal(r.quotes[0].price,105);assert.equal(r.fallbackCount,1);assert.match(r.quotes[0].fallbackReason,/403/);assert.equal(r.refreshSeconds,15);assert.equal(r.exchangeStatus,'unavailable');
 const blocked=await terminalQuotes(['TERMBLOCK'],{fetcher,now:now+16000,source:'nse'});assert.equal(blocked.quotes[0].price,null);assert.match(blocked.quotes[0].error,/cooldown/);assert.equal(exchangeCalls,1);
 const direct=await terminalQuotes(['TERMDIRECT'],{fetcher:async()=>Response.json(nse('TERMDIRECT')),now:now+130000,source:'nse'});assert.equal(direct.quotes[0].source,'NSE website snapshot');assert.equal(direct.fallbackCount,0);
 const explicit=await terminalQuotes(['TERMDIRECT'],{fetcher:async()=>Response.json(yahoo('TERMDIRECT')),now:now+131000,source:'yahoo'});assert.equal(explicit.quotes[0].source,'Yahoo Finance');assert.equal(explicit.exchangeStatus,'not_requested');
});
test('terminal bounds requests and rejects unknown sources',async()=>{
 await assert.rejects(terminalQuotes([]),/1–50/);await assert.rejects(terminalQuotes(['../../secret']),/valid/);await assert.rejects(terminalQuotes(['INFY'],{source:'shell'}),/Choose/);
});
test('only real price differences animate; failures preserve cached values and older ticks are rejected',()=>{
 const tools=(0,eval)('('+createTerminalTools.toString()+')')();const old={ticker:'INFY',price:100,asOf:'2026-10-30T08:00:00Z'};
 assert.equal(tools.applySnapshot({INFY:old},[{...old}],now).changes.length,0);
 const changed=tools.applySnapshot({INFY:old},[{...old,price:102,asOf:'2026-10-30T08:00:15Z'}],now);assert.equal(changed.changes[0].delta,2);
 const older=tools.applySnapshot(changed.map,[{...old,price:90}],now);assert.equal(older.map.INFY.price,102);assert.deepEqual(older.rejected,['INFY']);
 const fail=tools.applySnapshot(changed.map,[{ticker:'INFY',price:null,error:'offline'}],now);assert.equal(fail.map.INFY.price,102);assert.equal(fail.map.INFY.stale,true);assert.equal(fail.changes.length,0);
 assert.equal(tools.sortedRows(['INFY','TCS'],{INFY:{...old,name:'Infosys'},TCS:{ticker:'TCS',price:110}},{query:'infosys'})[0].ticker,'INFY');
});
test('one prompt opens and controls the market terminal',()=>{
 assert.equal(parseCommand('Open market terminal').action,'terminal');assert.equal(parseCommand('Pause terminal feed',{view:'terminal'}).workspace.operations[0].value,false);assert.equal(parseCommand('Resume terminal feed',{view:'terminal'}).workspace.operations[0].value,true);
 const p=parseCommand('Open terminal for Infosys',{},[{ticker:'INFY',name:'Infosys'}]);assert.equal(p.view,'terminal');assert.deepEqual(p.tickers,['INFY']);
});
test('quote health distinguishes closed, delayed, failed refresh and unknown sessions',()=>{
 const {quoteHealth}=createTerminalTools(),q={ticker:'INFY',price:105,asOf:new Date(now-1200000).toISOString(),marketState:'open'};
 assert.equal(quoteHealth(q,now).state,'delayed');assert.equal(quoteHealth({...q,marketState:'closed'},now).state,'closed');assert.equal(quoteHealth({...q,stale:true},now).state,'cached');assert.equal(quoteHealth({...q,marketState:'unknown'},now).state,'unknown');assert.equal(quoteHealth({...q,asOf:new Date(now-1000).toISOString()},now).state,'recent');assert.equal(quoteHealth({...q,price:null},now).state,'unavailable');
});
