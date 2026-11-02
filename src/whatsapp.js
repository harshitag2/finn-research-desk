// Integration settings and submission ledger use the existing durable monitor key/value table.
const enc=new TextEncoder();
export async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function whatsappProvider(env={}){const required=['WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_TEMPLATE_NAME','WHATSAPP_GRAPH_VERSION'];const missing=required.filter(k=>!env[k]);return {configured:!missing.length&&/^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_VERSION||'')&&/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID||''),missing,webhookConfigured:!!env.WHATSAPP_APP_SECRET&&!!env.WHATSAPP_VERIFY_TOKEN}}
export function notificationStore(db){
 return {get:async key=>{const r=await db.prepare('SELECT value FROM finn_monitor_meta WHERE key = ?').bind(key).first();if(!r)return null;try{return JSON.parse(r.value)}catch{return null}},put:(key,value)=>db.prepare('INSERT INTO finn_monitor_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(value)).run(),claim:async(key,value)=>Number((await db.prepare('INSERT OR IGNORE INTO finn_monitor_meta (key,value) VALUES (?,?)').bind(key,JSON.stringify(value)).run()).meta?.changes||0)>0,remove:key=>db.prepare('DELETE FROM finn_monitor_meta WHERE key = ?').bind(key).run()};
}
const subscriptionKey=owner=>'wa:subscription:'+owner;
export async function notificationStatus(store,owner,env={}){const s=await store.get(subscriptionKey(owner)),provider=whatsappProvider(env);return {provider,subscription:s?{enabled:!!s.enabled,recipientMasked:'+'+s.phone.slice(1,3)+'••••••'+s.phone.slice(-4),digestCadence:s.digestCadence,urgentOnly:!!s.urgentOnly,consentAt:s.consentAt}:null,state:!provider.configured?'not_connected':s?.enabled?'ready':'paused',lastDelivery:await store.get('wa:last:'+owner)}}
export async function saveNotificationSettings(store,owner,input,now=Date.now()){
 const previous=await store.get(subscriptionKey(owner)),phone=String(input.phone||previous?.phone||'').replace(/[\s()-]/g,'');if(!/^\+[1-9]\d{7,14}$/.test(phone))throw new Error('Enter your WhatsApp number with country code, for example +91 followed by the mobile number.');
 if(!['hourly','daily','weekly'].includes(input.digestCadence))throw new Error('Choose hourly, daily or weekly updates.');
 if(input.enabled===true&&input.consent!==true)throw new Error('Confirm that this is your number and you want FINN WhatsApp updates.');
 const index='wa:recipient:'+await hash(phone),registered=await store.get(index);if(registered&&registered.owner!==owner)throw new Error('This number is already connected to a different FINN profile.');
 const s={phone,enabled:input.enabled===true,digestCadence:input.digestCadence,urgentOnly:input.urgentOnly===true,consentAt:input.consent===true?new Date(now).toISOString():previous?.consentAt||null,subscribedAt:previous?.phone===phone?previous.subscribedAt:new Date(now).toISOString()};
 await store.put(index,{owner});await store.put(subscriptionKey(owner),s);if(previous?.phone&&previous.phone!==phone)await store.remove('wa:recipient:'+await hash(previous.phone));return s;
}
export function digestSlot(cadence,now){const d=new Date(now+19800000),iso=d.toISOString(),hour=d.getUTCHours();if(cadence==='hourly')return iso.slice(0,13);if(hour<18)return null;if(cadence==='weekly'&&d.getUTCDay()!==5)return null;return iso.slice(0,10)}
export function eventText(e){return (e.urgency==='urgent'?'URGENT REVIEW':'REVIEW')+' · '+e.ticker+' · '+(e.horizon||'Filing')+'\n'+String(e.title||e.text||'').slice(0,350)+'\nSource date: '+(e.at||e.firstSeenAt||'unavailable')+(e.urgencyReason?'\n'+e.urgencyReason:'')}
async function submit(store,owner,key,text,s,env,fetcher,now){
 const jobKey='wa:job:'+await hash(owner+'|'+key),base={key,at:new Date(now).toISOString(),status:'submitting'};
 if(!await store.claim(jobKey,base))return {status:'duplicate'};
 let result;
 try{
  const r=await fetcher('https://graph.facebook.com/'+env.WHATSAPP_GRAPH_VERSION+'/'+env.WHATSAPP_PHONE_NUMBER_ID+'/messages',{method:'POST',headers:{'authorization':'Bearer '+env.WHATSAPP_ACCESS_TOKEN,'content-type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({messaging_product:'whatsapp',to:s.phone.slice(1),type:'template',template:{name:env.WHATSAPP_TEMPLATE_NAME,language:{code:env.WHATSAPP_TEMPLATE_LANGUAGE||'en'},components:[{type:'body',parameters:[{type:'text',text:String(text).replace(/[\r\n\t]+/g,' · ').slice(0,900)}]}]}})});
  const b=await r.json().catch(()=>({})),id=b.messages?.[0]?.id;
  result=r.ok&&typeof id==='string'?{...base,status:'accepted',messageId:id}:{...base,status:'failed',error:'WhatsApp rejected submission (HTTP '+r.status+'). Check the approved template, sender and recipient access.'};
  if(result.messageId)await store.put('wa:message:'+result.messageId,{owner,jobKey});
 }catch{result={...base,status:'submission_unknown',error:'No provider acknowledgement received. Automatic retry is paused to avoid duplicate messages; check the provider before trying again.'}}
 await store.put(jobKey,result);await store.put('wa:last:'+owner,result);return result;
}
export async function dispatchWhatsApp({store,owner,events,marketSummary=null,env={},now=Date.now(),fetcher=fetch,test=false}){
 const s=await store.get(subscriptionKey(owner));if(!whatsappProvider(env).configured)return {status:'not_connected',sent:0};if(!s?.enabled||!s.consentAt)return {status:'paused',sent:0};
 if(test)return submit(store,owner,'test|'+crypto.randomUUID(),'FINN connection test. Your WhatsApp alert setup can submit messages. Open FINN to review your settings.',s,env,fetcher,now);
 const eligible=events.filter(e=>e.state!=='dismissed'&&e.state!=='reviewed'&&Date.parse(e.firstSeenAt||0)>=Date.parse(s.subscribedAt));let sent=0;
 // One stable key per event. Provider timeouts are not retried automatically.
 let attempted=0;for(const e of eligible.filter(e=>e.urgency==='urgent')){const r=await submit(store,owner,'urgent|'+e.id,eventText(e),s,env,fetcher,now);if(r.status!=='duplicate')attempted++;if(r.status==='accepted')sent++;if(attempted>=3)break}
 const slot=digestSlot(s.digestCadence,now),checkpoint=await store.get('wa:checkpoint:'+owner),regular=eligible.filter(e=>e.urgency!=='urgent'&&Date.parse(e.firstSeenAt)>Date.parse(checkpoint?.at||s.subscribedAt));
 const snapshotRows=marketSummary?.rows||[],snapshotKey=snapshotRows.map(r=>r.ticker+'|'+r.through).sort().join(';'),freshSnapshot=!!snapshotKey&&Date.parse(marketSummary.checkedAt)>=Date.parse(s.subscribedAt)&&snapshotKey!==checkpoint?.snapshotKey;
 if(!s.urgentOnly&&slot&&(regular.length||freshSnapshot)){const pct=v=>Number.isFinite(v)?(v>=0?'+':'')+v.toFixed(2)+'%':'unavailable',snapshotText=freshSnapshot?'\nLatest completed-session returns (D/W/M):\n'+snapshotRows.slice(0,4).map(r=>r.ticker+' '+['1D','1W','1M'].map(k=>pct(r.returns[k])).join(' / ')+' · '+r.through).join('\n'):'';const r=await submit(store,owner,'digest|'+s.digestCadence+'|'+slot,'FINN '+s.digestCadence+' review · '+regular.length+' new alerts'+snapshotText+'\n'+regular.slice(0,2).map(eventText).join('\n\n')+'\nOpen FINN for all sources and details.',s,env,fetcher,now);if(r.status==='accepted'){sent++;await store.put('wa:checkpoint:'+owner,{at:new Date(now).toISOString(),snapshotKey:snapshotKey||checkpoint?.snapshotKey||null})}}
 return {status:'checked',sent};
}
export async function whatsappWebhook(request,env,store){
 const url=new URL(request.url);if(request.method==='GET'){const ok=!!env.WHATSAPP_VERIFY_TOKEN&&url.searchParams.get('hub.mode')==='subscribe'&&url.searchParams.get('hub.verify_token')===env.WHATSAPP_VERIFY_TOKEN;return new Response(ok?String(url.searchParams.get('hub.challenge')||'').slice(0,300):'Verification denied',{status:ok?200:403,headers:{'content-type':'text/plain'}})}
 if(request.method!=='POST'||!env.WHATSAPP_APP_SECRET)return new Response('Webhook not configured',{status:403});
 const raw=await request.text();if(raw.length>250000)return new Response('Too large',{status:413});const signature=request.headers.get('x-hub-signature-256')||'';
 const key=await crypto.subtle.importKey('raw',enc.encode(env.WHATSAPP_APP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 let verified=false;if(/^sha256=[a-f0-9]{64}$/i.test(signature))verified=await crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.slice(7).match(/../g),v=>parseInt(v,16)),enc.encode(raw));if(!verified)return new Response('Invalid signature',{status:403});
 let body;try{body=JSON.parse(raw)}catch{return new Response('Invalid JSON',{status:400})}
 for(const entry of (body.entry||[]).slice(0,20))for(const change of (entry.changes||[]).slice(0,20)){
  for(const status of (change.value?.statuses||[]).slice(0,50)){const m=await store.get('wa:message:'+status.id);if(!m||!['sent','delivered','read','failed'].includes(status.status))continue;const job=await store.get(m.jobKey);if(job){const ranks={accepted:0,sent:1,delivered:2,read:3,failed:4};if((ranks[status.status]??0)<(ranks[job.status]??0))continue;const next={...job,status:status.status,receiptAt:new Date().toISOString()};await store.put(m.jobKey,next);const last=await store.get('wa:last:'+m.owner);if(last?.messageId===status.id)await store.put('wa:last:'+m.owner,next)}}
  for(const message of (change.value?.messages||[]).slice(0,20)){if(!/^(stop|unsubscribe|pause|बंद)$/i.test(String(message.text?.body||'').trim()))continue;const index=await store.get('wa:recipient:'+await hash('+'+message.from));if(index){const s=await store.get(subscriptionKey(index.owner));if(s)await store.put(subscriptionKey(index.owner),{...s,enabled:false})}}
 }
 return new Response('OK');
}
