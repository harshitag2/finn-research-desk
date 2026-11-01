// Self-contained because this factory is serialized into the browser by the Worker.
export default function createTerminalTools(){
 const good=q=>Number.isFinite(q?.price)&&q.price>0;
 function quoteHealth(q,at=Date.now()){
  if(!good(q))return {state:'unavailable',label:'Quote unavailable',ageSeconds:null};
  const age=Number.isFinite(Date.parse(q.asOf))?Math.max(0,Math.floor((at-Date.parse(q.asOf))/1000)):null;
  if(q.stale)return {state:'cached',label:'Cached · refresh unavailable',ageSeconds:age};
  if(q.marketState==='closed')return {state:'closed',label:'Market closed · last exchange quote',ageSeconds:age};
  if(age===null||q.marketState!=='open')return {state:'unknown',label:'Session or quote age unconfirmed',ageSeconds:age};
  if(q.delayMinutes>0||age>Math.max(900,((q.delayMinutes||0)+5)*60))return {state:'delayed',label:q.delayMinutes>0?'Provider reports '+q.delayMinutes+' min delay':'Exchange tick '+Math.floor(age/60)+' min ago',ageSeconds:age};
  return {state:'recent',label:'Exchange tick '+(age<60?age+'s':Math.floor(age/60)+' min')+' ago',ageSeconds:age};
 }
 function applySnapshot(previous,incoming,at=Date.now()){
  const map={...previous},changes=[],rejected=[];
  for(const q of incoming||[]){const old=map[q.ticker];
   if(good(q)&&good(old)&&Date.parse(q.asOf)<Date.parse(old.asOf)){rejected.push(q.ticker);continue}
   if(!good(q)&&good(old)){map[q.ticker]={...old,stale:true,marketState:'unknown',error:q.error||'Refresh unavailable'};continue}
   map[q.ticker]=q;
   if(good(q)&&good(old)&&!q.stale&&q.price!==old.price)changes.push({ticker:q.ticker,previous:old.price,price:q.price,delta:q.price-old.price,at,asOf:q.asOf});
  }
  return {map,changes,rejected};
 }
 function sortedRows(tickers,map,{query='',sort='symbol'}={}){
  const q=query.trim().toLowerCase();let rows=tickers.map(t=>map[t]||{ticker:t,price:null}).filter(r=>!q||(r.ticker+' '+(r.name||'')).toLowerCase().includes(q));
  return rows.sort((a,b)=>sort==='change'?(b.changePercent??-Infinity)-(a.changePercent??-Infinity):sort==='volume'?(b.volume??-Infinity)-(a.volume??-Infinity):a.ticker.localeCompare(b.ticker));
 }
 return {applySnapshot,sortedRows,quoteHealth};
}
