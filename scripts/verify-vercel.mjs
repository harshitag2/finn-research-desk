import {readFile} from 'node:fs/promises';
const base=process.argv[2];if(!base||!new URL(base).hostname.endsWith('.vercel.app'))throw new Error('Pass the deployed Vercel URL');
const secrets=JSON.parse(await readFile('.local/vercel-secrets.json','utf8'));
let response=await fetch(base+'/api/library');if(![200,401].includes(response.status))throw new Error('Access check failed: '+response.status);
console.log(response.status===200?'Public browsing available without a password.':'Unauthenticated API access blocked.');
response=await fetch(base+'/auth/login',{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:secrets.FINN_ACCESS_PASSWORD}),redirect:'manual'});
if(response.status!==303)throw new Error('Sign-in failed: '+response.status);
const cookie=response.headers.get('set-cookie').split(';')[0];
const headers={cookie};
const call=async(path,options={})=>{const r=await fetch(base+path,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(250000)});if(!r.ok)throw new Error(path+' failed: '+r.status);return r.json()};
console.log('Health:',await call('/api/health'));
const library=await call('/api/library');console.log('Source documents:',library.documents.length,'PDF upload limit:',library.uploadMaxBytes,'Model configured:',library.providerConfigured);
const inbox=await call('/api/monitor/inbox');console.log('PostgreSQL inbox:',{scope:inbox.scope,configured:inbox.configured,events:inbox.events.length});
// A no-op preference update proves authenticated persistent writes on the deployed runtime.
if(inbox.config){await call('/api/monitor/config',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify(inbox.config)});const again=await call('/api/monitor/inbox');if(JSON.stringify(again.config)!==JSON.stringify(inbox.config))throw new Error('Persistent write verification failed');console.log('Persistent configuration write/read verified.');}
const voice=await call('/api/voice/status');console.log('Voice configured:',voice.configured);
const quotes=await call('/api/quotes?tickers=INFY,RELIANCE');console.log('Quote endpoint responded:',Object.keys(quotes));
const form=new FormData();form.set('ticker','HCLTECH');form.set('file',new Blob([await readFile('tests/fixtures/hcl-q4-fy26.pdf')],{type:'application/pdf'}),'hcl.pdf');
const pdf=await call('/api/ingest',{method:'POST',headers:{origin:base},body:form});console.log('Live PDF extraction:',{pages:pdf.document.pages,passages:pdf.chunks.length});
console.log('Vercel deployment verification completed.');
