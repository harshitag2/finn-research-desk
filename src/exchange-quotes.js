import {latestQuote} from './market.js';

export const SNAPSHOT_SECONDS=15;
const MONTHS={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
const cache=new Map(),pending=new Map();
let exchangeBlockedUntil=0,exchangeBlockedReason='';
const good=q=>Number.isFinite(q?.price)&&q.price>0;
const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
export function nseTimestamp(raw){
 const m=String(raw||'').match(/^(\d{2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
 if(!m||!MONTHS[m[2][0].toUpperCase()+m[2].slice(1).toLowerCase()]||+m[1]<1||+m[1]>31||+m[4]>23||+m[5]>59||+m[6]>59)throw new Error('NSE quote timestamp is unavailable.');
 const iso=`${m[3]}-${String(MONTHS[m[2][0].toUpperCase()+m[2].slice(1).toLowerCase()]).padStart(2,'0')}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+05:30`;
 const d=new Date(iso);if(!Number.isFinite(d.getTime())||new Date(d.getTime()+330*60000).getUTCDate()!==+m[1])throw new Error('NSE quote timestamp is invalid.');return d.toISOString();
}
export function normalizeNseQuote(raw,ticker,now=Date.now()){
 if(String(raw?.info?.symbol||'').toUpperCase()!==ticker)throw new Error('NSE returned a different security.');
 const p=raw.priceInfo,price=number(p?.lastPrice);if(!price||price<=0)throw new Error('NSE returned no valid quote.');
 const asOf=nseTimestamp(raw.metadata?.lastUpdateTime||raw.lastUpdateTime);
 if(Date.parse(asOf)>now+300000)throw new Error('NSE timestamp is in the future.');
 const previous=number(p.previousClose),base=previous>0?previous:null;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));
 const get=t=>parts.find(x=>x.type===t)?.value,time=Number(get('hour'))*60+Number(get('minute'));
 const sameDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date(now))===new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date(asOf));
 // A weekday/clock estimate is not enough to establish an exchange session (holidays/special sessions).
 const explicit=String(raw.marketStatus?.marketStatus||raw.marketStatus||'').toLowerCase();
 const session=explicit==='open'?'open':explicit==='closed'?'closed':!sameDay||['Sat','Sun'].includes(get('weekday'))||time<555||time>930?'closed':'unknown';
 return {ticker,name:raw.info.companyName||ticker,price,currency:'INR',previousClose:base,change:base===null?null:price-base,changePercent:base===null?null:(price-base)/base*100,asOf,timestampKind:'exchange_snapshot',fetchedAt:new Date(now).toISOString(),marketState:session,exchange:'NSE',delayMinutes:null,dayHigh:number(p.intraDayHighLow?.max),dayLow:number(p.intraDayHighLow?.min),volume:number(raw.marketDeptOrderBook?.totalTradedVolume),intraday:[],source:'NSE website snapshot',sourceURL:'https://www.nseindia.com/get-quotes/equity?symbol='+encodeURIComponent(ticker),feedMode:'exchange_snapshot',stale:false};
}
async function nseQuote(ticker,{fetcher,now}){
 const old=cache.get(ticker);if(old&&now-old.time<SNAPSHOT_SECONDS*1000)return {...old.quote,cacheAgeSeconds:Math.round((now-old.time)/1000)};
 if(exchangeBlockedUntil>now)throw new Error(exchangeBlockedReason+'; retry after exchange cooldown.');
 if(pending.has(ticker))return pending.get(ticker);
 const task=(async()=>{try{
  const r=await fetcher('https://www.nseindia.com/api/quote-equity?symbol='+encodeURIComponent(ticker),{headers:{'User-Agent':'Mozilla/5.0 FINN research prototype',Accept:'application/json',Referer:'https://www.nseindia.com/get-quotes/equity?symbol='+encodeURIComponent(ticker)},signal:AbortSignal.timeout(5000)});
  if(!r.ok){const error=new Error('NSE quote access returned HTTP '+r.status);error.status=r.status;throw error}
  const quote=normalizeNseQuote(await r.json(),ticker,now);cache.set(ticker,{quote,time:now});if(cache.size>200)cache.delete(cache.keys().next().value);return {...quote,cacheAgeSeconds:0};
 }catch(error){
  if([401,403,429].includes(error.status)||['TimeoutError','AbortError','TypeError'].includes(error.name)){exchangeBlockedUntil=now+120000;exchangeBlockedReason=error.status?'NSE access unavailable (HTTP '+error.status+')':'NSE connection unavailable';}
  throw error;
 }finally{pending.delete(ticker)}})();pending.set(ticker,task);return task;
}
export async function terminalQuotes(tickers,{source='auto',fetcher=fetch,now=Date.now()}={}){
 const scope=[...new Set(tickers)];
 if(!scope.length||scope.length>50||scope.some(t=>!/^[A-Z0-9&-]{1,24}$/.test(t)))throw new Error('Request 1–50 valid NSE symbols.');
 if(!['auto','nse','yahoo'].includes(source))throw new Error('Choose auto, nse or yahoo as the quote source.');
 const rows=new Array(scope.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(4,scope.length)},async()=>{for(;;){const i=cursor++;if(i>=scope.length)break;const ticker=scope[i];let reason='';
  if(source!=='yahoo'){try{rows[i]=await nseQuote(ticker,{fetcher,now});continue}catch(error){reason=error.message}}
  if(source==='nse'){
   const old=cache.get(ticker);rows[i]=old?{...old.quote,stale:true,marketState:'unknown',error:reason}:{ticker,price:null,error:reason,source:'NSE website snapshot',fetchedAt:new Date(now).toISOString()};continue;
  }
  const q=await latestQuote(ticker,{fetcher,now,maxAgeMs:15000});
  const old=cache.get(ticker);
  rows[i]=source==='auto'&&old&&good(q)&&Date.parse(q.asOf)<Date.parse(old.quote.asOf)?{...old.quote,stale:true,marketState:'unknown',error:'NSE refresh unavailable; fallback quote has an older exchange timestamp.'}:{...q,feedMode:source==='auto'?'fallback_snapshot':'provider_snapshot',...(reason?{fallbackReason:reason,requestedSource:'NSE website snapshot'}:{})};
 }}));
 const available=rows.filter(good).length,fallbackCount=rows.filter(q=>q.feedMode==='fallback_snapshot').length;
 return {quotes:rows,source:source==='auto'?'NSE with labelled Yahoo fallback':source==='nse'?'NSE website snapshot':'Yahoo Finance',requestedSource:source,status:available===rows.length&&!rows.some(q=>q.stale)?'ready':available?'partial':'unavailable',fallbackCount,refreshSeconds:SNAPSHOT_SECONDS,exchangeStatus:source==='yahoo'?'not_requested':rows.some(q=>q.stale||q.error||q.fallbackReason)||!available?'unavailable':'available',notice:'Auto-refreshing quote snapshots; not an exchange streaming subscription. Source, exchange timestamp and any fallback are shown per symbol.',fetchedAt:new Date(now).toISOString()};
}
