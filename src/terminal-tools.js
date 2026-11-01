// Self-contained because this factory is serialized into the browser by the Worker.
export default function createTerminalTools(){
 const good=q=>Number.isFinite(q?.price)&&q.price>0;
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
 return {applySnapshot,sortedRows};
}
