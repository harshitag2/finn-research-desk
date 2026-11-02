import test from 'node:test';
import assert from 'node:assert/strict';
import createIntentTools from '../src/intent.js';
import createPortfolioTools from '../src/portfolio.js';
import {parseCommand,planCommand} from '../src/commands.js';
const intent=createIntentTools(),p=createPortfolioTools(),companies=[{ticker:'RELIANCE',name:'Reliance Industries'},{ticker:'INFY',name:'Infosys'}];
test('plain company lookup opens a stock page, while research and mixed price questions keep their intent',async()=>{
 for(const q of ['reliance','Reliance Industries','RELIANCE.NS','search reliance','show me Reliance stock'])assert.equal(parseCommand(q,{},companies).action,'stock',q);
 assert.equal(parseCommand('Research Reliance cash flow',{},companies).action,'research');assert.equal(parseCommand('compare Reliance and Infosys',{},companies).action,'compare');
 assert.equal(parseCommand('Reliance current stock price',{},companies).action,'prices');
 const r=await planCommand({prompt:'reliance',companies,env:{GEMINI_API_KEY:'must-not-call-model'}});assert.equal(r.action,'stock');assert.equal(r.planner,'workspace rules');
});
test('company suggestions match names/symbols and do not substitute a research sentence',()=>{
 assert.equal(intent.stockSearch('reli',companies)[0].ticker,'RELIANCE');assert.equal(intent.stockSearch('Infosys',companies)[0].exact,true);assert.equal(intent.stockSearch('Reliance revenue guidance in detail',companies).length,0);
});
const rows=p.parseCSV('ticker,account,market_value,invested_value,quantity\nRELIANCE,A,12000,10000,10\nRELIANCE,B,6000,5500,5');
const quote={price:1300,change:20,currency:'INR',stale:false};
test('owned position aggregates accounts, marks quantity at quote and separates daily P&L from total P&L',()=>{
 const r=p.position(rows,'RELIANCE',{quote});assert.equal(r.quantity,15);assert.equal(r.currentValue,19500);assert.equal(r.investedValue,15500);assert.equal(r.pnl,4000);assert.equal(r.dayChange,300);assert.equal(r.snapshotValue,18000);assert.equal(r.marked,true);assert.ok(Math.abs(r.averageCost-1033.333333)<1e-5);
 assert.equal(p.position(rows,'RELIANCE',{quote,account:'B'}).currentValue,6500);assert.equal(p.position(rows,'INFY',{quote}),null);
});
test('missing quantities and costs stay unavailable, stale quotes are labelled and invalid currencies cannot reprice',()=>{
 const missing=p.parseCSV('ticker,account,market_value,invested_value,quantity\nRELIANCE,A,12000,10000,10\nRELIANCE,B,6000,,');const r=p.position(missing,'RELIANCE',{quote});assert.equal(r.quantity,null);assert.equal(r.currentValue,18000);assert.equal(r.investedValue,null);assert.equal(r.pnl,null);assert.equal(r.dayChange,null);assert.equal(r.marked,false);
 assert.equal(p.position(rows,'RELIANCE',{quote:{...quote,stale:true}}).stale,true);assert.equal(p.position(rows,'RELIANCE',{quote:{...quote,currency:'USD'}}).marked,false);
 assert.equal(p.position(p.parseCSV('ticker,asset_type,market_value\nRELIANCE,Mutual Funds,123'),'RELIANCE',{quote}),null);
 for(const q of ['-1','NaN','1e3','0.123456789'])assert.throws(()=>p.parseCSV('ticker,market_value,quantity\nRELIANCE,1,'+q),/quantity/);
});
