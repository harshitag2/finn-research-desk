export const HORIZONS={'1D':{label:'Daily',sessions:1,threshold:4},'1W':{label:'Weekly · 5 sessions',sessions:5,threshold:8},'1M':{label:'Monthly · 21 sessions',sessions:21,threshold:15}};
export function marketSnapshot(history){
 const rows=history.lastPartial?history.rows.slice(0,-1):history.rows,last=rows.at(-1),returns={};if(!last)return null;
 for(const [key,h] of Object.entries(HORIZONS)){const first=rows.at(-1-h.sessions);if(!first||(!history.adjusted&&history.splits?.some(s=>s.date>first.date&&s.date<=last.date))){returns[key]=null;continue}const adjusted=history.adjusted&&Number.isFinite(last.adj)&&Number.isFinite(first.adj),v=((adjusted?last.adj:last.close)/(adjusted?first.adj:first.close)-1)*100;returns[key]=Number.isFinite(v)?Number(v.toFixed(2)):null}
 return {ticker:history.symbol,through:last.date,returns,basis:history.adjusted?'Dividend-adjusted daily closes':'Unadjusted daily closes',source:history.source||'Yahoo Finance daily history'};
}
export function urgency(event){
 if(['price','volume','horizon_price'].includes(event.kind||event.type))return Number.isFinite(event.value)&&Number.isFinite(event.threshold)&&Math.abs(event.value)>=2*event.threshold?{urgency:'urgent',urgencyReason:'At least twice your configured threshold.'}:{urgency:'non_urgent',urgencyReason:'Threshold crossed; include in the next review.'};
 const adverse=/\b(default(?:ed)?|downgrad(?:e|ed)|insolven\w*|fraud|resign\w*|suspend\w*|penalt\w*|enforcement|adverse)\b/i.test((event.text||'')+' '+(event.title||event.summary||''));
 return event.materiality==='high'&&adverse&&['litigation','credit_rating','pledging','management_change'].includes(event.category)?{urgency:'urgent',urgencyReason:'Material filing category with an adverse-event text cue; verify the original disclosure.'}:{urgency:'non_urgent',urgencyReason:'Scheduled review; category or thesis relevance alone does not establish an urgent adverse event.'};
}
export function horizonAlerts(history,prefs={}){
 const rows=history.lastPartial?history.rows.slice(0,-1):history.rows,out=[],selected=prefs.alertHorizons||[];
 for(const key of selected.filter(k=>k!=='1D'&&HORIZONS[k])){
  const horizon=HORIZONS[key],last=rows.at(-1),first=rows.at(-1-horizon.sessions);if(!last||!first)continue;
  if(!history.adjusted&&history.splits?.some(s=>s.date>first.date&&s.date<=last.date))continue;
  const adjusted=history.adjusted&&Number.isFinite(last.adj)&&Number.isFinite(first.adj),start=adjusted?first.adj:first.close,end=adjusted?last.adj:last.close,threshold=Number(prefs.horizonThresholds?.[key]??horizon.threshold),value=(end/start-1)*100;
  if(!Number.isFinite(value)||threshold<=0||Math.abs(value)<threshold)continue;
  const event={ticker:history.symbol,type:'horizon_price',kind:'horizon_price',horizon:key,date:last.date,startDate:first.date,value:Number(value.toFixed(2)),threshold,basis:adjusted?'Dividend-adjusted daily closes':'Unadjusted daily closes',text:history.symbol+' '+(value>=0?'rose':'fell')+' '+Math.abs(value).toFixed(2)+'% over '+horizon.sessions+' completed trading sessions ('+first.date+' → '+last.date+'); threshold ±'+threshold+'%.'};out.push({...event,...urgency(event)});
 }
 return out;
}
