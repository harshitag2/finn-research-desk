// Optional separate public Cloudflare Worker. FINN itself stays private.
// Bind FINN_ORIGIN, FINN_SERVICE_TOKEN, WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN as secrets.
export default {async fetch(request,env){
 const url=new URL(request.url),plain=(s,status=200)=>new Response(s,{status,headers:{'content-type':'text/plain'}});
 if(request.method==='GET'){const ok=!!env.WHATSAPP_VERIFY_TOKEN&&url.searchParams.get('hub.mode')==='subscribe'&&url.searchParams.get('hub.verify_token')===env.WHATSAPP_VERIFY_TOKEN;return plain(ok?String(url.searchParams.get('hub.challenge')||'').slice(0,300):'Denied',ok?200:403)}
 if(request.method!=='POST'||!env.WHATSAPP_APP_SECRET||!env.FINN_SERVICE_TOKEN)return plain('Not configured',503);
 const signature=request.headers.get('x-hub-signature-256')||'';
 if(!/^sha256=[a-f0-9]{64}$/i.test(signature))return plain('Denied',403);
 if(Number(request.headers.get('content-length')||0)>250000)return plain('Too large',413);
 const reader=request.body?.getReader();if(!reader)return plain('No payload',400);const chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>250000){await reader.cancel();return plain('Too large',413)}chunks.push(value)}
 const payload=new Uint8Array(size);let offset=0;for(const chunk of chunks){payload.set(chunk,offset);offset+=chunk.length}const raw=new TextDecoder().decode(payload);
 const bytes=Uint8Array.from(signature.slice(7).match(/../g),v=>parseInt(v,16)),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.WHATSAPP_APP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(raw)))return plain('Denied',403);
 let origin;try{origin=new URL(env.FINN_ORIGIN);if(origin.protocol!=='https:'||!origin.hostname.endsWith('.chatgpt.site')||origin.username||origin.password)throw new Error()}catch{return plain('Invalid private origin',503)}
 try{const r=await fetch(origin.origin+'/api/whatsapp/webhook',{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':signature,'OAI-Sites-Authorization':'Bearer '+env.FINN_SERVICE_TOKEN},body:raw,signal:AbortSignal.timeout(15000)});return plain(r.ok?'OK':'Private callback unavailable',r.ok?200:502)}catch{return plain('Callback unavailable',502)}
}};
