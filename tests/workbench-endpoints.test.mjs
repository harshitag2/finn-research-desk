import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {localDatabase} from '../scripts/local-db.mjs';
import {workbenchCommand} from '../src/workbench-api.js';
import createWorkbenchUI from '../src/workbench-ui.js';
const companies=[{ticker:'INFY',name:'Infosys'},{ticker:'TCS',name:'Tata Consultancy Services'}];
test('new prompt routes preserve named company and do not need model routing',()=>{
 assert.deepEqual(workbenchCommand('Show Infosys management commitments',{ticker:'TCS'},companies).tickers,['INFY']);
 assert.equal(workbenchCommand('Check Infosys cash quality',{},companies).tab,'cash');
 assert.equal(workbenchCommand('Pause background monitoring',{},companies).enabled,false);
 assert.equal(workbenchCommand('Show TCS stock price',{},companies),null);
});
test('monitor configuration is durable, isolated by authenticated visitor and rejects cross-origin mutations',async()=>{
 const DB=await localDatabase(':memory:');
 const call=(path,user,body,origin)=>worker.fetch(new Request('https://finn.test'+path,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':user,...(body?{'content-type':'application/json'}:{}),...(origin?{origin}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB});
 try{
  assert.equal((await call('/api/monitor/config','a',{tickers:['INFY'],priceThreshold:5})).status,200);
  assert.equal((await(await call('/api/monitor/inbox','a')).json()).config.priceThreshold,5);
  assert.equal((await(await call('/api/monitor/inbox','b')).json()).configured,false);
  assert.equal((await call('/api/monitor/config','a',{tickers:['TCS']},'https://evil.example')).status,403);
  assert.deepEqual((await(await call('/api/monitor/inbox','a')).json()).config.tickers,['INFY']);
 }finally{DB.close()}
});
test('cash report renders derived amounts and missing values, with no misleading bank template',()=>{
 const ui=createWorkbenchUI(),base={ticker:'INFY',mode:'agent',evidence:[],rows:[{period:'FY26',basis:'consolidated',unit:'INR_crore',pat:100,cfo:130,capex:20,freeCashFlow:110,cashConversion:1.3,facts:[]}]};
 const html=ui.desk({ticker:'INFY',tab:'cash',result:base,documents:[]});assert.match(html,/110/);assert.match(html,/1.30×/);assert.match(html,/Source amounts/);assert.ok(!html.includes('No annual financial row'));
 const bank=ui.desk({ticker:'HDFCBANK',tab:'cash',result:{...base,ticker:'HDFCBANK',mode:'not_applicable',rows:[]},documents:[]});assert.match(bank,/sector-specific/);assert.ok(!bank.includes('wb-financial-grid'));
});
