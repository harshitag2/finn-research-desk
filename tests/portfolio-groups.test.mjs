import test from 'node:test';
import assert from 'node:assert/strict';
import createPortfolioTools from '../src/portfolio.js';
const p=createPortfolioTools();
const csv=`ticker,name,sector,account,asset_type,market_value,invested_value
INFY,Infosys,Technology,A,Stocks,120000,100000
INFY,Infosys,Technology,B,Equity,80000,70000
HDFCBANK,HDFC Bank,Banking,A,Stocks,100000,90000
120503,Fund,,A,MF,150000,120000
GOLDBEES,Gold ETF,,A,ETF,30000,25000
DEPOSIT_1,Deposit,,A,FD,20000,20000`;
test('mixed snapshots consolidate accounts and classify assets without stock requests for funds',()=>{
 const rows=p.parseCSV(csv),d=p.consolidate(rows);assert.equal(d.total,500000);assert.equal(d.holdings.length,5);
 assert.deepEqual(d.holdings.filter(p.isListed).map(x=>x.ticker).sort(),['GOLDBEES','HDFCBANK','INFY']);
 const g=p.groups(d.holdings);assert.equal(g.groups.find(g=>g.label==='Stocks').weight,60);assert.equal(g.groups.find(g=>g.label==='Mutual Funds').pnl,30000);
 assert.equal(g.groups.find(g=>g.label==='Stocks').pnl,40000);
 const sectors=p.groups(d.holdings,'sector');assert.equal(sectors.total,300000);assert.equal(sectors.excludedValue,200000);assert.equal(sectors.groups.length,2);assert.ok(Math.abs(sectors.groups[0].weight-66.6666667)<1e-6);
 assert.equal(p.consolidate(rows,'B').total,80000);
});
test('partial cost is not treated as zero, and zero cost has no percentage gain',()=>{
 const rows=p.parseCSV('ticker,account,market_value,invested_value\nINFY,A,100,50\nINFY,B,100,');const g=p.groups(p.consolidate(rows).holdings).groups[0];assert.equal(g.pnl,null);assert.equal(g.investedValue,null);
 const z=p.groups(p.consolidate(p.parseCSV('ticker,market_value,invested_value\nINFY,10,0')).holdings).groups[0];assert.equal(z.pnl,10);assert.equal(z.pnlPercent,null);
});
test('identifiers can coexist across classes; unknown labels and invalid costs fail clearly',()=>{
 assert.equal(p.consolidate(p.parseCSV('ticker,asset_type,market_value\nINFY,Stocks,1\nINFY,MF,2')).holdings.length,2);
 assert.throws(()=>p.parseCSV('ticker,asset_type,market_value\nINFY,Guess,1'),/unsupported asset_type/);
 assert.throws(()=>p.parseCSV('ticker,market_value,invested_value\nINFY,1,-2'),/invested_value/);
 assert.throws(()=>p.parseCSV('ticker,market_value,invested_value\nINFY,1,NaN'),/invested_value/);
});
test('zero-valued groups have no weights; unclassified stocks stay visible',()=>{
 const d=p.consolidate(p.parseCSV('ticker,market_value\nINFY,0'));assert.equal(p.groups(d.holdings,'sector').groups[0].label,'Unclassified');assert.equal(p.groups(d.holdings).groups[0].weight,null);
});
