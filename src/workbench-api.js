import {buildCommitments} from './commitments.js';
import {buildCashQuality} from './cash-quality.js';
import {discoverSources,ingestDiscovered,enrichManagement} from './source-discovery.js';
import {createMonitorStore,validateMonitorConfig,runMonitor,readInbox} from './monitor.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const valid=t=>/^[A-Z0-9&-]{1,24}$/.test(t);
const local=url=>['127.0.0.1','localhost','[::1]'].includes(url.hostname);
const owner=(request,url)=>request.headers.get('oai-authenticated-user-id')?.slice(0,200)||(local(url)?'local-preview':'shared');
async function body(request,max=2500000){if(!request.headers.get('content-type')?.includes('application/json'))throw new Error('Send JSON for this operation.');const text=await request.text();if(text.length>max)throw new Error('Request too large.');return JSON.parse(text)}
export function workbenchCommand(prompt,context,companies){
 let mode=null;if(/\b(?:commitments?|promis(?:e[ds]?|ing)|promised vs delivered|management track record)\b/i.test(prompt))mode='commitments';
 if(/\b(?:cash quality|cash conversion|follow the cash|cash allocation|cash flow check)\b/i.test(prompt))mode='cash';
 const company=companies.find(c=>[c.ticker,c.name,...(c.aliases||[])].some(n=>new RegExp('(?:^|\\W)'+String(n).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|\\W)','i').test(prompt)));
 const explicit=String(prompt).match(/\b[A-Z][A-Z0-9&-]{1,23}\b/g)?.find(t=>!['NSE','BSE','CFO','CEO','PAT','FCF','FY26','FY27'].includes(t));
 const ticker=company?.ticker||explicit||context?.ticker||'INFY';
 if(mode&&valid(ticker))return {action:'workbench',tab:mode,tickers:[ticker],query:prompt};
 if(/^(?:open |show |check |my )?(?:change |thesis )?inbox\b/i.test(prompt)||/^(?:scan|check) (?:my )?alerts\b/i.test(prompt))return {action:'inbox',scan:/^(?:scan|check)/i.test(prompt),tickers:[],query:prompt};
 if(/^(?:enable|start|pause|stop|disable) (?:background )?monitoring\b/i.test(prompt))return {action:'monitor',enabled:/^(?:enable|start)/i.test(prompt),tickers:[],query:prompt};
 return null;
}
export async function handleWorkbench(request,env,{corpus,combine,portfolio}){
 const url=new URL(request.url),path=url.pathname;
 if(!/^\/api\/(?:workbench\/|monitor\/|sources\/|management-background$)/.test(path))return null;
 try{
  if(request.method==='POST'){
   const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'Use this workspace to make changes.'},403);
  }
  if(path==='/api/sources/discover'&&request.method==='GET')return json(await discoverSources({ticker:url.searchParams.get('ticker'),corpus}));
  if(path==='/api/sources/ingest'&&request.method==='POST'){const b=await body(request,20000);return json(await ingestDiscovered({ticker:b.ticker,id:b.id,corpus}))}
  if(path==='/api/management-background'&&request.method==='POST'){const b=await body(request,20000);return json(await enrichManagement({ticker:b.ticker,url:b.url,env}))}
  if(path.startsWith('/api/workbench/')&&request.method==='POST'){
   const b=await body(request),ticker=String(b.ticker||'').trim().toUpperCase();if(!valid(ticker))return json({error:'Enter an NSE ticker.'},400);
   const options={ticker,corpus:combine(b.extraCorpus),env,sector:portfolio.find(c=>c.ticker===ticker)?.sector||''};
   if(path==='/api/workbench/commitments')return json(await buildCommitments(options));
   if(path==='/api/workbench/cash')return json(await buildCashQuality(options));
  }
  if(path.startsWith('/api/monitor/')){
   if(!env.DB)return json({error:'Persistent monitoring storage is not connected.',status:'storage_unavailable'},503);
   const store=createMonitorStore(env.DB),who=owner(request,url);
   if(path==='/api/monitor/inbox'&&request.method==='GET'){
    const own=await store.config(who);return json({...await readInbox(store,own?who:'shared'),scope:own?'personal':'default'});
   }
   if(path==='/api/monitor/schedule'&&request.method==='POST'){
    if(request.headers.has('oai-authenticated-user-id'))return json({error:'Schedule metadata is managed by the cloud setup.'},403);
    const b=await body(request,4000);if(b.enabled!==true||b.cadence!=='hourly'||b.timezone!=='Asia/Kolkata')return json({error:'Unsupported schedule metadata.'},400);
    await store.saveSchedule({enabled:true,cadence:'hourly',timezone:'Asia/Kolkata',verifiedAt:new Date().toISOString()});return json({saved:true});
   }
   if(path==='/api/monitor/config'&&request.method==='POST'){const config=validateMonitorConfig(await body(request,80000));await store.saveConfig(who,config);return json({saved:true,config})}
   if(path==='/api/monitor/state'&&request.method==='POST'){const b=await body(request,10000);if(!['new','watch','dismissed','reviewed'].includes(b.state)||!/^[a-f0-9]{64}$/.test(b.id))return json({error:'Invalid inbox state.'},400);await store.state(who,b.id,b.state);return json({saved:true})}
   if(path==='/api/monitor/run'&&request.method==='POST'){
    await body(request,10000);
    const identified=request.headers.has('oai-authenticated-user-id')||local(url);
    let profiles=identified?[{owner:who,config_json:(await store.config(who))?.config_json}]:await store.configs();
    if(!profiles.length)profiles=[{owner:'shared'}];
    const runs=[];for(const profile of profiles.slice(0,10)){
     const config=profile.config_json?validateMonitorConfig(JSON.parse(profile.config_json)):validateMonitorConfig({tickers:portfolio.map(c=>c.ticker),enabled:true});
     if(!profile.config_json)await store.saveConfig(profile.owner,config);
     runs.push(await runMonitor({store,owner:profile.owner,config}));
    }
    return json({status:runs.every(r=>r.status==='ok')?'ok':'partial',profiles:runs.length,added:runs.reduce((n,r)=>n+r.added,0),runs:runs.map(({owner,...r})=>r)});
   }
  }
  return json({error:'Unknown workbench operation.'},404);
 }catch(error){return json({error:String(error.message||'Operation unavailable').slice(0,800)},502)}
}
