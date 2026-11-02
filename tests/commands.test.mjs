import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCommand,validatePlan,compareCompanies} from '../src/commands.js';
import {runResearch} from '../src/research.js';
const companies=[{ticker:'INFY',name:'Infosys'},{ticker:'TCS',name:'Tata Consultancy Services'},{ticker:'HDFCBANK',name:'HDFC Bank'},{ticker:'LT',name:'Larsen & Toubro'},{ticker:'RELIANCE',name:'Reliance Industries'}];
test('a compound natural-language request resolves company aliases, comparison and prices',()=>{
 const p=parseCommand('Compare Infosys and TCS on FY27 guidance and show their prices',{ticker:'HDFCBANK'},companies);
 assert.equal(p.action,'compare');assert.deepEqual(p.tickers,['INFY','TCS']);assert.equal(p.includePrices,true);
 const banks=parseCommand('Compare Infosys and HDFC Bank on FY26 growth',{},companies);assert.deepEqual(banks.tickers,['INFY','HDFCBANK']);
 const lt=parseCommand('Compare L&T and TCS',{},companies);assert.deepEqual(new Set(lt.tickers),new Set(['TCS','LT']));
});
test('follow-up research keeps current context while navigation and market controls remain distinct',()=>{
 assert.deepEqual(parseCommand('What did management say about margins?',{ticker:'HDFCBANK'},companies).tickers,['HDFCBANK']);
 assert.equal(parseCommand('Open my portfolio',{},companies).view,'portfolio');
 assert.equal(parseCommand('Show prices for Reliance and HDFC Bank',{},companies).action,'prices');
 assert.deepEqual(parseCommand('Pause price auto refresh',{},companies).workspace.operations,[{type:'auto_refresh',value:false,view:'briefing'}]);
 assert.equal(parseCommand('Export this research note',{},companies).action,'export');
 assert.equal(parseCommand('Compare Infosys',{ticker:'TCS'},companies).action,'clarify');
});
test('untrusted plans cannot introduce arbitrary actions, invalid scopes or unsafe navigation',()=>{
 assert.throws(()=>validatePlan({action:'execute_script'},'hello'),/Unsupported/);
 assert.throws(()=>validatePlan({action:'research',tickers:['../../secret']},'hello'),/Invalid/);
 assert.equal(validatePlan({action:'navigate',view:'https://evil.test'},'open').view,'research');
});
test('no-source research skips provider calls and returns an actionable coverage state',async()=>{
 const r=await runResearch({query:'What guidance did management give?',ticker:'MISSING',corpus:{documents:[],chunks:[]},env:{GEMINI_API_KEY:'should-not-be-used'}});
 assert.equal(r.mode,'coverage');assert.deepEqual(r.coverage.tickers,['MISSING']);assert.ok(!r.trace.some(t=>t.tool==='model_step'));assert.match(r.summary,/Add sources/);
});
test('comparisons require every issuer and retain balanced issuer retrieval',async()=>{
 const corpus={documents:[{id:'a',ticker:'INFY',title:'Infosys'},{id:'b',ticker:'TCS',title:'TCS'}],chunks:[{id:'a1',documentId:'a',ticker:'INFY',page:1,text:'Revenue growth guidance for FY27 remains cautious.'},{id:'b1',documentId:'b',ticker:'TCS',page:2,text:'We do not provide numerical revenue growth guidance.'}]};
 const missing=await compareCompanies({query:'Compare growth guidance',tickers:['INFY','HDFCBANK'],corpus,env:{GEMINI_API_KEY:'unused'}});assert.equal(missing.mode,'coverage');assert.deepEqual(missing.coverage.tickers,['HDFCBANK']);assert.equal(missing.evidence.length,0);
 const r=await compareCompanies({query:'Compare growth guidance',tickers:['INFY','TCS'],corpus});assert.equal(r.mode,'evidence');assert.deepEqual(new Set(r.evidence.map(e=>e.ticker)),new Set(['INFY','TCS']));assert.deepEqual(r.scope,['INFY','TCS']);
});
