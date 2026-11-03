import worker from '../dist/server/vercel-worker.mjs';
import {neon} from '@neondatabase/serverless';
import {postgresDatabase} from '../deploy/postgres.js';
import {authorize} from '../deploy/vercel-auth.js';
import {timingSafeEqual} from 'node:crypto';

let database;
function runtime(){
 if(!process.env.DATABASE_URL)throw new Error('Database is not configured.');
 if(!database){const sql=neon(process.env.DATABASE_URL);database=postgresDatabase((text,args)=>sql.query(text,args,{fullResults:true}))}
 return {...process.env,DB:database,FINN_RUNTIME:'vercel'};
}
export default {async fetch(request){
 const url=new URL(request.url);
 if(url.pathname==='/api/cron'){
  const expected=process.env.CRON_SECRET?'Bearer '+process.env.CRON_SECRET:'';
  const actual=request.headers.get('authorization')||'';
  const a=Buffer.from(actual),b=Buffer.from(expected);
  if(!expected||a.length!==b.length||!timingSafeEqual(a,b))return new Response('Unauthorized',{status:401});
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  try{return await worker.fetch(new Request(new URL('/api/monitor/run',url),{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),runtime(),{})}
  catch{return Response.json({error:'Scheduled scan unavailable'},{status:503})}
 }
 const gate=await authorize(request,process.env);if(gate)return gate;
 try{
  const env=runtime();
  if(url.pathname==='/api/health'){
   await env.DB.prepare('SELECT 1 AS connected').bind().first();
   return Response.json({status:'ok',backend:'vercel-node',database:'postgres',modelConfigured:!!(env.GEMINI_API_KEY||env.GOOGLE_API_KEY||env.FINN_API_KEY)},{headers:{'cache-control':'no-store'}});
  }
  // Identity is set here after session verification. Never trust a caller's OAI header.
  const headers=new Headers(request.headers);headers.delete('oai-authenticated-user-id');headers.set('oai-authenticated-user-id','vercel-owner');
  const response=await worker.fetch(new Request(request,{headers}),env,{});
  const out=new Headers(response.headers);out.set('cache-control','private, no-store');out.set('x-frame-options','DENY');
  return new Response(response.body,{status:response.status,headers:out});
 }catch(error){console.error('FINN runtime failure:',error?.name||'Error');return Response.json({error:'Backend or database connection unavailable. Check server configuration.'},{status:503,headers:{'cache-control':'no-store'}})}
}};
