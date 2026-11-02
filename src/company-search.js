// Bounded NSE issuer discovery; this endpoint returns names/symbols, never prices or holdings.
const cache=new Map();
export async function searchCompanies(query,{fetcher=fetch,now=Date.now()}={}){
 const q=String(query||'').trim();if(q.length<2||q.length>80)return {status:'invalid',companies:[],notice:'Enter 2–80 characters.'};
 const key=q.toLowerCase(),old=cache.get(key);if(old&&now-old.at<90000)return old.value;
 try{
  const response=await fetcher('https://query1.finance.yahoo.com/v1/finance/search?q='+encodeURIComponent(q)+'&quotesCount=12&newsCount=0',{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'},signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw new Error('Directory unavailable');const body=await response.json(),seen=new Set(),companies=[];
  for(const r of Array.isArray(body.quotes)?body.quotes:[]){if(typeof r.symbol!=='string'||!r.symbol.endsWith('.NS')||!['EQUITY','ETF'].includes(r.quoteType))continue;const ticker=r.symbol.slice(0,-3);if(!/^[A-Z0-9&-]{1,24}$/.test(ticker)||seen.has(ticker))continue;seen.add(ticker);companies.push({ticker,name:String(r.longname||r.shortname||ticker).slice(0,150),assetType:r.quoteType==='ETF'?'ETFs':'Stocks'});if(companies.length>=8)break}
  const value={status:'ok',companies,source:'Yahoo Finance security directory'};if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,{at:now,value});return value;
 }catch{return {status:'unavailable',companies:[],notice:'Company directory unavailable. Watchlist and imported company matches remain available.'}}
}
