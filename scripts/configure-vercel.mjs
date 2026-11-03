// Reads sensitive setup values on stdin; never prints credentials.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {neon} from '@neondatabase/serverless';
import {postgresDatabase} from '../deploy/postgres.js';
process.loadEnvFile('.env.vercel.local');
console.log('Ready for deployment configuration JSON on stdin (input is hidden).');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const raw=await new Promise(resolve=>{let value='';function data(chunk){value+=chunk.toString();if(value.includes('\n')||value.includes('\r')){process.stdin.off('data',data);if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();resolve(value.trim())}}process.stdin.on('data',data)});
const input=JSON.parse(raw);
await mkdir('.local',{recursive:true});
let secrets;try{secrets=JSON.parse(await readFile('.local/vercel-secrets.json','utf8'))}catch{
 secrets={FINN_ACCESS_PASSWORD:randomBytes(24).toString('base64url'),FINN_SESSION_SECRET:randomBytes(48).toString('base64url'),CRON_SECRET:randomBytes(48).toString('base64url')};
 await writeFile('.local/vercel-secrets.json',JSON.stringify(secrets),{mode:0o600});
 await writeFile('.local/vercel-access.txt','FINN private Vercel access password\n'+secrets.FINN_ACCESS_PASSWORD+'\nKeep this file private.\n',{mode:0o600});
}
if(input.apiKey){
 const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':input.apiKey},body:JSON.stringify({contents:[{parts:[{text:'Reply OK.'}]}],generationConfig:{maxOutputTokens:20}}),signal:AbortSignal.timeout(25000)});
 const authenticated=response.ok||((response.status===429||response.status===503)&&(await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite',{headers:{'x-goog-api-key':input.apiKey},signal:AbortSignal.timeout(20000)})).ok);
 if(authenticated){secrets.GEMINI_API_KEY=input.apiKey;console.log(response.ok?'Gemini credential verified using a real generation.':'Gemini credential authenticated; generation currently has provider capacity limits.');await writeFile('.local/vercel-secrets.json',JSON.stringify(secrets),{mode:0o600})}
 else console.log('Gemini credential did not verify (HTTP '+response.status+'); no unverified key was configured.');
}
const sql=neon(process.env.DATABASE_URL);const db=postgresDatabase((text,args)=>sql.query(text,args,{fullResults:true}));
let configs=0,events=0;
for(const row of input.configs||[]){
 const owner=row.owner==='shared'?'shared':'vercel-owner';
 await db.prepare('INSERT INTO finn_monitor_config (owner,config_json,enabled,updated_at) VALUES (?,?,?,?) ON CONFLICT(owner) DO NOTHING').bind(owner,row.config_json,row.enabled,row.updated_at).run();configs++;
}
for(const row of input.events||[]){
 const owner=row.owner==='shared'?'shared':'vercel-owner';const payload=JSON.parse(row.payload_json);
 const id=createHash('sha256').update(owner+'|'+payload.key).digest('hex');
 await db.prepare('INSERT OR IGNORE INTO finn_monitor_events (id,owner,ticker,kind,payload_json,first_seen_at,state) VALUES (?,?,?,?,?,?,?)').bind(id,owner,row.ticker,row.kind,row.payload_json,row.first_seen_at,row.state).run();events++;
}
console.log('Migrated '+configs+' monitoring profiles and '+events+' alert records.');
// Fixed command strings only. Values go through stdin, never command arguments.
async function cli(command,value){
 await new Promise((resolve,reject)=>{
  const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c',command],{stdio:['pipe','pipe','pipe'],windowsHide:true});let error='';
  child.stdout.on('data',()=>{});child.stderr.on('data',c=>{error+=c.toString()});child.on('error',reject);
  child.on('exit',code=>code===0?resolve():reject(new Error('Configuration command failed with code '+code)));
  child.stdin.end(value);
 });
}
for(const [key,value]of Object.entries({...secrets,FINN_PROVIDER:'gemini',FINN_MODEL:'gemini-3.1-flash-lite'})){
 await cli('npx --yes vercel@latest env add '+key+' --environment production --sensitive --yes --force',value);console.log('Configured '+key+'.');
}
await cli('gh secret set FINN_MONITOR_TOKEN --repo harshitag2/finn-research-desk',secrets.CRON_SECRET);
console.log('Hourly monitoring token saved to GitHub Actions.');
