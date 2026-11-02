import {buildDigest,CATEGORIES,DEFAULT_FOCUS} from './digest.js';
const symbol=s=>typeof s==='string'&&/^[A-Z0-9&-]{1,24}$/.test(s);
const LENS_CATEGORIES={business:['results','M&A','capex','press_release'],management:['management_change','fund_raise','capex','M&A','results'],cash:['results','fund_raise','dividend','credit_rating'],downside:['litigation','credit_rating','pledging','fund_raise'],governance:['management_change','litigation','pledging','insider_trading']};
export function validateMonitorConfig(input){
 const tickers=[...new Set(input?.tickers||[])];if(!tickers.length||tickers.length>30||tickers.some(t=>!symbol(t)))throw new Error('Choose 1–30 NSE symbols.');
 const priceThreshold=Number(input.priceThreshold??4),volumeThreshold=Number(input.volumeThreshold??2);
 if(!Number.isFinite(priceThreshold)||priceThreshold<0.1||priceThreshold>50||!Number.isFinite(volumeThreshold)||volumeThreshold<1||volumeThreshold>20)throw new Error('Invalid monitor thresholds.');
 const focus=Array.isArray(input.focus)?[...new Set(input.focus)].filter(c=>CATEGORIES.includes(c)):DEFAULT_FOCUS;
 const theses=(Array.isArray(input.theses)?input.theses:[]).slice(0,30).filter(t=>tickers.includes(t.ticker)&&typeof t.id==='string').map(t=>({id:t.id.slice(0,100),ticker:t.ticker,thesis:String(t.thesis||'').slice(0,1000),disconfirm:String(t.disconfirm||'').slice(0,1000),lens:Object.hasOwn(LENS_CATEGORIES,t.lens)?t.lens:'business',updatedAt:String(t.updatedAt||'').slice(0,40)}));
 return {tickers,priceThreshold,volumeThreshold,focus,theses,enabled:input.enabled!==false};
}
export function explainRelevance(item,config){
 const text=(item.summary||item.text||'').toLowerCase();
 const thesisMatches=config.theses.filter(t=>t.ticker===item.ticker).flatMap(t=>{
  const words=[...new Set((t.disconfirm+' '+t.thesis).toLowerCase().match(/[a-z]{5,}/g)||[])].filter(w=>!['company','should','would','their','there','which','could','growth','remain','business','management'].includes(w));
  const terms=words.filter(w=>text.includes(w)).slice(0,5),categoryMatch=LENS_CATEGORIES[t.lens]?.includes(item.category);
  return terms.length||categoryMatch?[{...t,terms,reason:terms.length?'Filing mentions '+terms.join(', ')+'.':'This filing category is relevant to your '+t.lens+' research lens.',interpretation:'Potential thesis relevance; open the filing before revising your view.'}]:[];
 });
 const reasons=[...(thesisMatches.length?['Relevant to '+thesisMatches.length+' saved thesis'+(thesisMatches.length===1?'':'es')]:[]),...(config.focus.includes(item.category)?['You selected '+item.label+' alerts']:[]),...(item.materiality==='high'?['Exchange category/text indicates a material event']:[])];
 return {thesisMatches,reasons,priority:thesisMatches.length?0:config.focus.includes(item.category)||item.materiality==='high'?1:2};
}
async function digestId(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('')}
export function createMonitorStore(db){
 if(!db)throw new Error('Persistent monitoring storage is not connected.');
 const all=async(sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
 return {
  configs:()=>all('SELECT owner, config_json FROM finn_monitor_config WHERE enabled = 1'),
  config:owner=>db.prepare('SELECT config_json FROM finn_monitor_config WHERE owner = ?').bind(owner).first(),
  schedule:async()=>{const r=await db.prepare("SELECT value FROM finn_monitor_meta WHERE key = 'schedule'").bind().first();return r?JSON.parse(r.value):null},
  saveSchedule:s=>db.prepare("INSERT INTO finn_monitor_meta (key,value) VALUES ('schedule',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(s)).run(),
  saveConfig:(owner,c)=>db.prepare('INSERT INTO finn_monitor_config (owner,config_json,enabled,updated_at) VALUES (?,?,?,?) ON CONFLICT(owner) DO UPDATE SET config_json=excluded.config_json,enabled=excluded.enabled,updated_at=excluded.updated_at').bind(owner,JSON.stringify(c),c.enabled?1:0,new Date().toISOString()).run(),
  insert:async(owner,event)=>{const id=await digestId(owner+'|'+event.key);const r=await db.prepare('INSERT OR IGNORE INTO finn_monitor_events (id,owner,ticker,kind,payload_json,first_seen_at,state) VALUES (?,?,?,?,?,?,?)').bind(id,owner,event.ticker,event.kind,JSON.stringify(event),new Date().toISOString(),'new').run();return Number(r.meta?.changes||0)},
  events:owner=>all('SELECT id,payload_json,first_seen_at,state FROM finn_monitor_events WHERE owner = ? ORDER BY first_seen_at DESC LIMIT 150',owner),
  state:(owner,id,state)=>db.prepare('UPDATE finn_monitor_events SET state = ? WHERE owner = ? AND id = ?').bind(state,owner,id).run(),
  lastRun:owner=>db.prepare('SELECT * FROM finn_monitor_runs WHERE owner = ? ORDER BY started_at DESC LIMIT 1').bind(owner).first(),
  checkpoint:async owner=>(await db.prepare("SELECT started_at FROM finn_monitor_runs WHERE owner = ? AND status = 'ok' ORDER BY started_at DESC LIMIT 1").bind(owner).first())||(await db.prepare('SELECT MIN(started_at) AS started_at FROM finn_monitor_runs WHERE owner = ?').bind(owner).first()),
  run:async(owner,r)=>{await db.prepare('INSERT INTO finn_monitor_runs (id,owner,started_at,finished_at,status,items_count,error) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),owner,r.startedAt,r.finishedAt,r.status,r.added,JSON.stringify(r.failures||[]).slice(0,6000)).run()},
  // An expired lease lets a crashed scan retry; overlapping scans remain deduplicated by event ID.
  lease:async(owner,now)=>{const r=await db.prepare('INSERT INTO finn_monitor_locks (owner,expires_at) VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET expires_at=excluded.expires_at WHERE finn_monitor_locks.expires_at < ?').bind(owner,now+600000,now).run();return Number(r.meta?.changes||0)>0},
  release:owner=>db.prepare('DELETE FROM finn_monitor_locks WHERE owner = ?').bind(owner).run()
 };
}
export async function runMonitor({store,owner,config,digest=buildDigest,now=Date.now()}){
 if(!await store.lease(owner,now))return {status:'running',added:0,owner};
 const startedAt=new Date(now).toISOString();let r;
 try{
  const last=await store.checkpoint(owner),age=last?.started_at?now-Date.parse(last.started_at):86400000;
  const window=age>7*86400000?'30d':age>3*86400000?'7d':age>86400000?'3d':'24h';
  const d=await digest({tickers:config.tickers,window,prefs:config,focus:config.focus,now});let added=0;
  for(const item of d.items||[]){
   const relevance=explainRelevance(item,config);
   // The full feed stays in Overview; the monitoring inbox stores selected, material or thesis-related events.
   if(relevance.priority===2)continue;
   const key='filing|'+item.ticker+'|'+(item.url||item.nseCategory+'|'+item.text+'|'+item.at);
   added+=await store.insert(owner,{key,kind:'filing',ticker:item.ticker,at:item.at,category:item.category,label:item.label,title:item.summary||item.nseCategory,text:item.text,url:item.url,links:item.links||[],...relevance});
  }
  for(const a of d.priceAlerts||[]){added+=await store.insert(owner,{key:'price|'+a.ticker+'|'+a.type+'|'+a.date,kind:a.type,ticker:a.ticker,at:a.date,title:a.text,text:a.text,priority:1,reasons:['Crossed your '+a.threshold+(a.type==='price'?'% price':'× volume')+' threshold using completed-session data.'],thesisMatches:[],value:a.value,threshold:a.threshold})}
  const failures=[...(d.failures||[]),...(d.priceFailures||[])];
  r={startedAt,finishedAt:new Date().toISOString(),status:failures.length?((d.items?.length||d.priceAlerts?.length)?'partial':'unavailable'):'ok',added,failures,window};
 }catch(e){r={startedAt,finishedAt:new Date().toISOString(),status:'unavailable',added:0,failures:[{error:String(e.message).slice(0,500)}]}}
 try{await store.run(owner,r)}finally{await store.release(owner)}return r;
}
export async function readInbox(store,owner){
 const config=await store.config(owner),events=await store.events(owner),lastRun=await store.lastRun(owner);
 return {configured:!!config,config:config?JSON.parse(config.config_json):null,lastRun,schedule:await store.schedule(),events:events.map(e=>({id:e.id,state:e.state,firstSeenAt:e.first_seen_at,...JSON.parse(e.payload_json)})).sort((a,b)=>a.priority-b.priority||b.firstSeenAt.localeCompare(a.firstSeenAt)),method:'Relevance uses your selected categories, saved thesis lens and matching terms. It is a review cue, not a conclusion that a thesis is invalid.'};
}
