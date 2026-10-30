import test from 'node:test';
import assert from 'node:assert/strict';
import createPortfolioTools from '../src/portfolio.js';
const {parseCSV,consolidate}=createPortfolioTools();
test('multi-account positions consolidate and sector weights use provided INR values',()=>{
 const rows=parseCSV('ticker,name,sector,account,market_value\nINFY,Infosys,Technology,A,120000\nINFY,Infosys,Technology,B,80000\nLT,Larsen & Toubro,Industrials,A,100000');
 const total=consolidate(rows);assert.equal(total.total,300000);assert.equal(total.holdings.length,2);assert.equal(total.holdings[0].marketValue,200000);assert.ok(Math.abs(total.holdings[0].weight-66.6666666667)<1e-7);assert.equal(total.accounts.length,2);assert.equal(consolidate(rows,'B').total,80000);assert.equal(consolidate(rows,'B').holdings[0].weight,100);
});
test('quoted CSV, escaped quotes, commas and BOM are handled',()=>{
 const rows=parseCSV('\ufeffticker,name,sector,account,market_value,currency\r\nINFY,"Infosys, Limited",Technology,"Family ""A""","₹1,234.56",INR\r\n');assert.equal(rows[0].name,'Infosys, Limited');assert.equal(rows[0].account,'Family "A"');assert.equal(consolidate(rows).total,1234.56);
});
test('duplicate positions and conflicting sector labels do not silently double-count',()=>{
 assert.throws(()=>parseCSV('ticker,market_value\nINFY,10\nINFY,20'),/Duplicate/);
 assert.throws(()=>parseCSV('ticker,sector,account,market_value\nINFY,Tech,A,10\nINFY,Other,B,20'),/Conflicting/);
});
test('currency and malformed financial values are rejected before replacing a snapshot',()=>{
 assert.throws(()=>parseCSV('ticker,market_value,currency\nINFY,100,USD'),/only INR/);assert.throws(()=>parseCSV('ticker,market_value\nINFY,-10'),/nonnegative/);assert.throws(()=>parseCSV('ticker,market_value\nINFY,1e9'),/nonnegative/);assert.throws(()=>parseCSV('ticker,market_value\nINFY,NaN'),/nonnegative/);assert.throws(()=>parseCSV('ticker,market_value\nINFY,"100'),/not closed/);
});
test('zero snapshots have no invented portfolio weights and paise remain precise',()=>{
 const zero=consolidate(parseCSV('ticker,market_value\nINFY,0'));assert.equal(zero.total,0);assert.equal(zero.holdings[0].weight,null);assert.equal(zero.sectors[0].weight,null);
 const cents=consolidate(parseCSV('ticker,market_value\nINFY,0.10\nTCS,0.20'));assert.equal(cents.total,0.30);
});
