// Shared, provider-independent portfolio snapshot tools. No data leaves the browser.
export default function createPortfolioTools(){
 function parseCSV(text){
  if(typeof text!=='string'||text.length>250000)throw new Error('Use a CSV smaller than 250 KB.');
  text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],field='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){
   const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}}else field+=c;continue}
   if(c==='"'){if(field||closed)throw new Error('Malformed CSV quotation.');quoted=true;continue}
   if(c===','||c==='\n'||c==='\r'){row.push(field.trim());field='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(Boolean))rows.push(row);row=[]}continue}
   if(closed&&!/\s/.test(c))throw new Error('Unexpected text after a quoted field.');field+=c;
  }
  if(quoted)throw new Error('A quoted CSV field was not closed.');row.push(field.trim());if(row.some(Boolean))rows.push(row);
  if(rows.length<2)throw new Error('The CSV needs a header and at least one holding.');
  if(rows.length>1001)throw new Error('Import up to 1,000 holdings at a time.');
  const header=rows.shift().map(s=>s.toLowerCase());
  if(new Set(header).size!==header.length)throw new Error('Duplicate CSV column names.');
  if(!header.includes('ticker')||!header.includes('market_value'))throw new Error('Required columns: ticker and market_value. Optional: name, sector, account, currency.');
  const unique=new Set(),companyMeta=new Map();
  return rows.map((r,i)=>{
   if(r.length!==header.length)throw new Error('Row '+(i+2)+': column count does not match the header.');
   const value=Object.fromEntries(header.map((k,j)=>[k,r[j]]));const ticker=value.ticker.toUpperCase().replace(/\.NS$/,'');
   if(!/^[A-Z0-9&-]{1,24}$/.test(ticker))throw new Error('Row '+(i+2)+': invalid NSE ticker.');
   if(value.currency&&value.currency.toUpperCase()!=='INR')throw new Error('Row '+(i+2)+': only INR snapshots are supported.');
   const amount=value.market_value.replace(/[₹,\s]/g,'');
   if(!/^\d+(?:\.\d{1,2})?$/.test(amount)||!Number.isFinite(Number(amount))||Number(amount)>1e13)throw new Error('Row '+(i+2)+': market_value must be a nonnegative INR amount with at most two decimals.');
   const account=(value.account||'Main account').slice(0,100),key=account.toLowerCase()+'|'+ticker;
   if(unique.has(key))throw new Error('Duplicate '+ticker+' in '+account+'. Consolidate lots into one row per account and ticker.');unique.add(key);
   const sector=(value.sector||'Unclassified').slice(0,100),name=(value.name||ticker).slice(0,150);
   const previous=companyMeta.get(ticker);if(previous&&previous.sector!==sector)throw new Error('Conflicting sectors for '+ticker+' across accounts.');companyMeta.set(ticker,{sector,name});
   return {ticker,name,sector,account,marketValue:Number(amount),paise:Math.round(Number(amount)*100)};
  });
 }
 function consolidate(rows,account='all'){
  const chosen=rows.filter(r=>account==='all'||r.account===account);const totalPaise=chosen.reduce((sum,r)=>sum+r.paise,0);const stocks=new Map(),sectors=new Map();
  if(!Number.isSafeInteger(totalPaise))throw new Error('Snapshot total exceeds the supported numeric range.');
  for(const r of chosen){const existing=stocks.get(r.ticker)||{ticker:r.ticker,name:r.name,sector:r.sector,paise:0,accounts:[]};existing.paise+=r.paise;if(!existing.accounts.includes(r.account))existing.accounts.push(r.account);stocks.set(r.ticker,existing);sectors.set(r.sector,(sectors.get(r.sector)||0)+r.paise)}
  return {total:totalPaise/100,accounts:[...new Set(rows.map(r=>r.account))],holdings:[...stocks.values()].map(s=>({...s,marketValue:s.paise/100,weight:totalPaise?s.paise/totalPaise*100:null})).sort((a,b)=>b.paise-a.paise),sectors:[...sectors].map(([sector,paise])=>({sector,marketValue:paise/100,weight:totalPaise?paise/totalPaise*100:null})).sort((a,b)=>b.marketValue-a.marketValue)};
 }
 return {parseCSV,consolidate};
}
