import {createServer} from 'node:http';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {localDatabase} from './local-db.mjs';
await mkdir('dist/server',{recursive:true});
await build({entryPoints:['src/worker.js'],outfile:'dist/server/local.mjs',bundle:true,format:'esm',platform:'node',target:'node22',loader:{'.html':'text','.css':'text'},logLevel:'warning'});
const {default:worker}=await import('../dist/server/local.mjs?'+Date.now());
const port=Number(process.env.PORT||4173);
const runtimeEnv={...process.env,DB:await localDatabase()};
createServer(async(req,res)=>{
 try{
  const body=[];for await(const chunk of req)body.push(chunk);
  const bytes=Buffer.concat(body);
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  const response=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,...(bytes.length?{body:bytes,duplex:'half'}:{})}),runtimeEnv,{});
  res.writeHead(response.status,Object.fromEntries(response.headers));
  if(response.body){for await(const chunk of response.body)res.write(chunk)}res.end();
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Local server error',detail:error.message}));}
}).listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+port));
