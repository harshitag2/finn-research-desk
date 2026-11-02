import test from 'node:test';
import assert from 'node:assert/strict';
import {localDatabase} from '../scripts/local-db.mjs';
import {createMonitorStore,validateMonitorConfig,explainRelevance,runMonitor,readInbox} from '../src/monitor.js';
const config=validateMonitorConfig({tickers:['INFY'],focus:['management_change'],theses:[{id:'a',ticker:'INFY',thesis:'Capital allocation remains disciplined',disconfirm:'Management departure affects execution',lens:'management',updatedAt:'2026-11-02'}]});
const item={ticker:'INFY',category:'management_change',label:'Management change',summary:'Appointment of a director',text:'Appointment of a director',materiality:'high',url:'https://nsearchives.nseindia.com/corporate/fixture.pdf',at:'2026-11-02T01:00:00Z'};
test('relevance is explicit, issuer scoped and retains the exact thesis version',()=>{const r=explainRelevance(item,config);assert.equal(r.priority,0);assert.equal(r.thesisMatches[0].updatedAt,'2026-11-02');assert.match(r.thesisMatches[0].interpretation,/Potential/);assert.equal(explainRelevance({...item,ticker:'TCS'},config).thesisMatches.length,0);assert.throws(()=>validateMonitorConfig({tickers:['INFY'],priceThreshold:500}),/thresholds/)});
test('a persisted scan is idempotent, states are owner isolated, failures retain a successful checkpoint',async()=>{
 const db=await localDatabase(':memory:'),store=createMonitorStore(db),now=Date.parse('2026-11-02T02:00:00Z');
 try{
  await store.saveConfig('owner-a',config);const digest=async()=>({items:[item],priceAlerts:[],failures:[],priceFailures:[]});
  const first=await runMonitor({store,owner:'owner-a',config,digest,now});assert.equal(first.added,1);
  assert.equal((await runMonitor({store,owner:'owner-a',config,digest,now:now+1000})).added,0);
  let inbox=await readInbox(store,'owner-a');assert.equal(inbox.events.length,1);const id=inbox.events[0].id;
  await store.state('different-owner',id,'dismissed');assert.equal((await readInbox(store,'owner-a')).events[0].state,'new');
  await store.state('owner-a',id,'watch');assert.equal((await readInbox(store,'owner-a')).events[0].state,'watch');
  assert.equal((await readInbox(store,'different-owner')).events.length,0);
  await runMonitor({store,owner:'owner-a',config,digest:async()=>{throw new Error('offline')},now:now+4000});
  assert.equal((await store.lastRun('owner-a')).status,'unavailable');assert.equal((await store.checkpoint('owner-a')).started_at,new Date(now+1000).toISOString());
 }finally{db.close()}
});
