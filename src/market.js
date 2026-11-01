// Latest provider quotes are distinct from completed-session EOD alerts.
import createTerminalTools from './terminal-tools.js';
const {quoteHealth}=createTerminalTools();
const withHealth=(q,now)=>({...q,quoteHealth:quoteHealth(q,now)});
const cached=new Map();const inflight=new Map();
const TTL=15000;
export function normalizeQuote(raw,ticker,now=Date.now()){
 const result=raw.chart?.result?.[0],meta=result?.meta;
 if(!meta||!Number.isFinite(meta.regularMarketPrice)||meta.regularMarketPrice<=0)throw new Error('No valid quote was returned for this symbol.');
 if(meta.symbol&&meta.symbol.toUpperCase()!==ticker+'.NS')throw new Error('Provider returned a different security.');
 if(meta.currency&&meta.currency!=='INR')throw new Error('Unexpected quote currency.');
 if(!Number.isFinite(meta.regularMarketTime))throw new Error('Quote timestamp is unavailable.');
 const asOf=new Date(meta.regularMarketTime*1000).toISOString();
 if(meta.regularMarketTime*1000>now+300000)throw new Error('Provider quote timestamp is in the future.');
 const previous=Number.isFinite(meta.previousClose)&&meta.previousClose>0?meta.previousClose:Number.isFinite(meta.chartPreviousClose)&&meta.chartPreviousClose>0?meta.chartPreviousClose:null;
 const session=meta.currentTradingPeriod?.regular;let marketState='unknown';
 if(session&&Number.isFinite(session.start)&&Number.isFinite(session.end))marketState=now>=session.start*1000&&now<=session.end*1000?'open':'closed';
 const providerState=String(meta.marketState||'').toUpperCase();if(['REGULAR','CLOSED','PRE','POST','PREPRE','POSTPOST'].includes(providerState))marketState=providerState==='REGULAR'?'open':'closed';
 const indicators=result.indicators?.quote?.[0];
 const intraday=(result.timestamp||[]).map((time,i)=>({time,price:indicators?.close?.[i]})).filter(p=>Number.isFinite(p.price)&&p.price>0&&p.time<=meta.regularMarketTime).slice(-90);
 return {ticker,name:meta.longName||meta.shortName||ticker,currency:meta.currency||'INR',price:meta.regularMarketPrice,previousClose:previous,change:previous===null?null:meta.regularMarketPrice-previous,changePercent:previous===null?null:(meta.regularMarketPrice-previous)/previous*100,asOf,fetchedAt:new Date(now).toISOString(),marketState,exchange:meta.fullExchangeName||meta.exchangeName||'NSE',delayMinutes:Number.isFinite(meta.exchangeDataDelayedBy)?meta.exchangeDataDelayedBy:null,dayHigh:Number.isFinite(meta.regularMarketDayHigh)?meta.regularMarketDayHigh:null,dayLow:Number.isFinite(meta.regularMarketDayLow)?meta.regularMarketDayLow:null,volume:Number.isFinite(meta.regularMarketVolume)?meta.regularMarketVolume:null,intraday,source:'Yahoo Finance',stale:false};
}
export async function latestQuote(ticker,{fetcher=fetch,now=Date.now(),maxAgeMs=TTL}={}){
 const lifetime=Math.max(15000,Math.min(TTL,maxAgeMs));
 const old=cached.get(ticker);if(old&&now-old.cachedAt<lifetime)return withHealth({...old.value,cacheAgeSeconds:Math.round((now-old.cachedAt)/1000)},now);
 if(inflight.has(ticker))return inflight.get(ticker);
 const task=(async()=>{
  try{
   const response=await fetcher('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(ticker+'.NS')+'?range=1d&interval=1m',{headers:{'User-Agent':'Mozilla/5.0 FINN research prototype'},signal:AbortSignal.timeout(9000)});
   if(!response.ok)throw new Error('Quote source HTTP '+response.status);
   const value=normalizeQuote(await response.json(),ticker,now);
   if(old&&Date.parse(value.asOf)<Date.parse(old.value.asOf))throw new Error('Provider returned an older exchange timestamp.');
   cached.set(ticker,{cachedAt:now,value});if(cached.size>200)cached.delete(cached.keys().next().value);return withHealth({...value,cacheAgeSeconds:0},now);
  }catch(error){if(old)return withHealth({...old.value,stale:true,marketState:'unknown',error:error.message==='Provider returned an older exchange timestamp.'?'Older provider snapshot ignored; showing the last successful quote.':'Source refresh failed; showing the last successful quote.',cacheAgeSeconds:Math.round((now-old.cachedAt)/1000)},now);return {ticker,error:error.name==='TimeoutError'||error.name==='AbortError'?'The quote provider timed out.':error.message==='fetch failed'?'Could not reach the quote provider (network error).':error.message||'Quote unavailable',price:null,stale:false,fetchedAt:new Date(now).toISOString()};}
  finally{inflight.delete(ticker)}
 })();inflight.set(ticker,task);return task;
}
export async function fetchQuotes(tickers,options={}){
 const unique=[...new Set(tickers)];if(!unique.length||unique.length>50||unique.some(t=>!/^[A-Z0-9&-]{1,24}$/.test(t)))throw new Error('Request between 1 and 50 valid NSE tickers.');
 const rows=new Array(unique.length);let next=0;
 await Promise.all(Array.from({length:Math.min(4,unique.length)},async()=>{for(;;){const index=next++;if(index>=unique.length)break;rows[index]=await latestQuote(unique[index],options)}}));
 return {quotes:rows,source:'Yahoo Finance',mode:'latest_provider_quotes',refreshSeconds:15,cacheSeconds:TTL/1000,notice:'Quotes may be delayed. Each quote has its own exchange timestamp. This is not a licensed real-time exchange feed.',fetchedAt:new Date(options.now||Date.now()).toISOString()};
}
