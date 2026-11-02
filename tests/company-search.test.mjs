import test from 'node:test';import assert from 'node:assert/strict';import {searchCompanies} from '../src/company-search.js';
test('directory resolves NSE equities and ETFs, excludes other markets and duplicates, and encodes input',async()=>{
 const r=await searchCompanies('distinct & issuer',{now:1000,fetcher:async url=>{assert.ok(url.includes('q=distinct%20%26%20issuer'));return Response.json({quotes:[{symbol:'COFORGE.NS',longname:'Coforge Limited',quoteType:'EQUITY'},{symbol:'COFORGE.BO',quoteType:'EQUITY'},{symbol:'COFORGE.NS',quoteType:'EQUITY'},{symbol:'ETF.NS',quoteType:'ETF'},{symbol:'FUND.NS',quoteType:'MUTUALFUND'},{symbol:'AAPL',quoteType:'EQUITY'}]})}});
 assert.equal(r.status,'ok');assert.deepEqual(r.companies.map(c=>c.ticker),['COFORGE','ETF']);assert.equal(r.companies[0].name,'Coforge Limited');
});
test('directory failures and malformed requests stay explicit rather than inventing results',async()=>{
 let called=false;assert.equal((await searchCompanies('x',{fetcher:async()=>{called=true}})).status,'invalid');assert.equal(called,false);
 assert.equal((await searchCompanies('distinct failure issuer',{fetcher:async()=>new Response('blocked',{status:403})})).status,'unavailable');
});
