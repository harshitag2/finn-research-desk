// Shared, provider-independent portfolio snapshot tools. No data leaves the browser.
export default function createPortfolioTools(){
 const aliases={stock:'Stocks',stocks:'Stocks',equity:'Stocks',mf:'Mutual Funds',mutualfund:'Mutual Funds',mutualfunds:'Mutual Funds',etf:'ETFs',etfs:'ETFs',bond:'Bonds',bonds:'Bonds',gold:'Gold',cash:'Cash',fd:'Fixed Deposits',fixeddeposit:'Fixed Deposits',fixeddeposits:'Fixed Deposits',other:'Other',unclassified:'Unclassified'};
 const assetType=r=>r.assetType||'Stocks';
 const isListed=r=>['Stocks','ETFs'].includes(assetType(r))&&/^[A-Z0-9&-]{1,24}$/.test(r.ticker);
 function amountPaise(value,label){const s=String(value).replace(/[₹,\s]/g,'');if(!/^\d+(?:\.\d{1,2})?$/.test(s)||Number(s)>1e13)throw new Error(label+' must be a nonnegative INR amount with at most two decimals.');return Math.round(Number(s)*100)}
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
   const type=value.asset_type?aliases[value.asset_type.toLowerCase().replace(/[\s_-]/g,'')]:'Stocks';
   if(!type)throw new Error('Row '+(i+2)+': unsupported asset_type. Use Stocks, Mutual Funds, ETFs, Bonds, Gold, Cash, Fixed Deposits, Other or Unclassified.');
   if(!(['Stocks','ETFs'].includes(type)?/^[A-Z0-9&-]{1,24}$/:/^[A-Z0-9][A-Z0-9_.:&-]{0,39}$/).test(ticker))throw new Error('Row '+(i+2)+': invalid ticker or instrument identifier.');
   if(value.currency&&value.currency.toUpperCase()!=='INR')throw new Error('Row '+(i+2)+': only INR snapshots are supported.');
   const amount=value.market_value.replace(/[₹,\s]/g,'');
   if(!/^\d+(?:\.\d{1,2})?$/.test(amount)||!Number.isFinite(Number(amount))||Number(amount)>1e13)throw new Error('Row '+(i+2)+': market_value must be a nonnegative INR amount with at most two decimals.');
   const account=(value.account||'Main account').slice(0,100),key=account.toLowerCase()+'|'+type+'|'+ticker;
   if(unique.has(key))throw new Error('Duplicate '+ticker+' in '+account+'. Consolidate lots into one row per account and ticker.');unique.add(key);
   const sector=(value.sector||'Unclassified').slice(0,100),name=(value.name||ticker).slice(0,150);
   const instrument=type+'|'+ticker,previous=companyMeta.get(instrument);if(previous&&previous.sector!==sector)throw new Error('Conflicting sectors for '+ticker+' across accounts.');companyMeta.set(instrument,{sector,name});
   return {ticker,name,sector,account,assetType:type,marketValue:Number(amount),paise:Math.round(Number(amount)*100),costPaise:value.invested_value?amountPaise(value.invested_value,'Row '+(i+2)+': invested_value'):null};
  });
 }
 function consolidate(rows,account='all'){
  const chosen=rows.filter(r=>account==='all'||r.account===account);const totalPaise=chosen.reduce((sum,r)=>sum+r.paise,0);const stocks=new Map(),sectors=new Map();
  if(!Number.isSafeInteger(totalPaise))throw new Error('Snapshot total exceeds the supported numeric range.');
  if(!Number.isSafeInteger(chosen.reduce((sum,r)=>sum+(r.costPaise??0),0)))throw new Error('Snapshot invested cost exceeds the supported numeric range.');
  for(const r of chosen){const key=assetType(r)+'|'+r.ticker,existing=stocks.get(key)||{ticker:r.ticker,name:r.name,sector:r.sector,assetType:assetType(r),paise:0,costPaise:0,costComplete:true,accounts:[]};existing.paise+=r.paise;if(Number.isSafeInteger(r.costPaise))existing.costPaise+=r.costPaise;else existing.costComplete=false;if(!existing.accounts.includes(r.account))existing.accounts.push(r.account);stocks.set(key,existing);sectors.set(r.sector,(sectors.get(r.sector)||0)+r.paise)}
  return {total:totalPaise/100,accounts:[...new Set(rows.map(r=>r.account))],holdings:[...stocks.values()].map(s=>({...s,marketValue:s.paise/100,weight:totalPaise?s.paise/totalPaise*100:null})).sort((a,b)=>b.paise-a.paise),sectors:[...sectors].map(([sector,paise])=>({sector,marketValue:paise/100,weight:totalPaise?paise/totalPaise*100:null})).sort((a,b)=>b.marketValue-a.marketValue)};
 }
 function groups(holdings,dimension='assetType'){
  const cents=h=>Math.round(h.marketValue*100),chosen=dimension==='sector'?holdings.filter(h=>assetType(h)==='Stocks'):holdings,total=chosen.reduce((s,h)=>s+cents(h),0)/100,map=new Map();
  for(const h of chosen){const label=dimension==='sector'?(h.sector||'Unclassified'):assetType(h),g=map.get(label)||{label,paise:0,holdings:[],costPaise:0,costComplete:true};g.paise+=cents(h);g.holdings.push(h);if(h.costComplete&&Number.isSafeInteger(h.costPaise))g.costPaise+=h.costPaise;else g.costComplete=false;map.set(label,g)}
  return {total,excludedValue:(holdings.reduce((s,h)=>s+cents(h),0)-Math.round(total*100))/100,groups:[...map.values()].map(g=>({...g,marketValue:g.paise/100,weight:total?g.paise/100/total*100:null,investedValue:g.costComplete?g.costPaise/100:null,pnl:g.costComplete?(g.paise-g.costPaise)/100:null,pnlPercent:g.costComplete&&g.costPaise>0?(g.paise/g.costPaise-1)*100:null})).sort((a,b)=>b.marketValue-a.marketValue)};
 }
 return {parseCSV,consolidate,groups,isListed,assetType};
}
