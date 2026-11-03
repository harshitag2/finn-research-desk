import test from 'node:test';
import assert from 'node:assert/strict';
import {localDatabase} from '../scripts/local-db.mjs';
import {handleWorkbench} from '../src/workbench-api.js';
import {notificationStore,notificationStatus,dispatchWhatsApp,saveNotificationSettings} from '../src/whatsapp.js';
import {createMonitorStore} from '../src/monitor.js';
const context={portfolio:[{ticker:'INFY'},{ticker:'TCS'}],corpus:{}};
const settings={phone:'+919876543210',digestCadence:'daily',enabled:true,consent:true};
const request=input=>new Request('https://finn.test/api/monitor/whatsapp',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':'visitor:test'},body:JSON.stringify(input)});
test('enabling WhatsApp also persists an enabled monitoring profile with the visitor watchlist',async()=>{
 const DB=await localDatabase(':memory:');try{
  const r=await handleWorkbench(request({...settings,monitorConfig:{tickers:['TCS'],priceThreshold:6}}),{DB},context),d=await r.json();
  assert.equal(r.status,200);assert.equal(d.state,'not_connected');assert.equal(d.monitoringEnabled,true);
  const config=JSON.parse((await createMonitorStore(DB).config('visitor:test')).config_json);
  assert.deepEqual(config.tickers,['TCS']);assert.equal(config.enabled,true);assert.equal(config.priceThreshold,6);
  const paused=await handleWorkbench(request({...settings,enabled:false,consent:false}),{DB},context);
  assert.equal((await paused.json()).subscription.enabled,false);assert.equal(JSON.parse((await createMonitorStore(DB).config('visitor:test')).config_json).enabled,true);
 }finally{DB.close()}
});
test('invalid monitoring input does not save a partial WhatsApp subscription',async()=>{
 const DB=await localDatabase(':memory:');try{
  assert.equal((await handleWorkbench(request({...settings,monitorConfig:{tickers:['../../bad']}}),{DB},context)).status,502);
  assert.equal((await notificationStatus(notificationStore(DB),'visitor:test',{})).subscription,null);
 }finally{DB.close()}
});
test('automatic messaging waits for STOP/receipt callback configuration even with sender credentials',async()=>{
 const DB=await localDatabase(':memory:');try{
  const store=notificationStore(DB);await saveNotificationSettings(store,'visitor:test',settings);
  const env={WHATSAPP_ACCESS_TOKEN:'test',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_TEMPLATE_NAME:'finn',WHATSAPP_GRAPH_VERSION:'v99.0'};
  assert.equal((await notificationStatus(store,'visitor:test',env)).state,'webhook_required');
  const r=await dispatchWhatsApp({store,owner:'visitor:test',events:[],env,fetcher:()=>{throw new Error('Must not send without callbacks')}});
  assert.equal(r.status,'webhook_required');assert.equal(r.sent,0);
 }finally{DB.close()}
});
test('Meta hello_world tests omit body parameters and never masquerade as scheduled alerts',async()=>{
 const DB=await localDatabase(':memory:');try{
  const store=notificationStore(DB);await saveNotificationSettings(store,'visitor:test',settings);
  const env={WHATSAPP_ACCESS_TOKEN:'test',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_TEMPLATE_NAME:'hello_world',WHATSAPP_GRAPH_VERSION:'v99.0'};
  assert.equal((await notificationStatus(store,'visitor:test',env)).state,'test_only');
  let calls=0;
  const fetcher=async(_url,options)=>{calls++;const body=JSON.parse(options.body);assert.deepEqual(body.template,{name:'hello_world',language:{code:'en_US'}});return Response.json({messages:[{id:'wamid.hello'}]})};
  assert.equal((await dispatchWhatsApp({store,owner:'visitor:test',events:[],env,fetcher})).status,'template_required');
  assert.equal(calls,0);
  assert.equal((await dispatchWhatsApp({store,owner:'visitor:test',events:[],env,fetcher,test:true})).status,'accepted');
  assert.equal(calls,1);
 }finally{DB.close()}
});
