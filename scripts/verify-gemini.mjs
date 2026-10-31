async function verify(){
// Accept a key through masked stdin, never argv or an on-disk credential file.
const input=await new Promise((resolve,reject)=>{let input='';const tty=process.stdin.isTTY;const done=()=>{if(tty)process.stdin.setRawMode(false);process.stdin.pause();process.stdin.removeListener('data',onData);try{resolve(JSON.parse(input.trim()))}catch{reject(new Error('Invalid verification input'))}};const onData=chunk=>{input+=chunk;if(input.includes('\n')||input.includes('\r'))done()};if(tty){process.stdin.setRawMode(true);process.stderr.write('Ready for Gemini verification JSON on stdin (input is hidden).\n')}process.stdin.setEncoding('utf8');process.stdin.on('data',onData);process.stdin.once('end',done);process.stdin.resume()});
const key=input.key,model=input.model||'gemini-3.1-flash-lite';
if(!key)throw new Error('No key supplied');
try{
 if(input.mode==='models'){
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(20000)});const body=await response.json();console.log(JSON.stringify({ok:response.ok,httpStatus:response.status,models:body.models?.map(m=>m.name).filter(n=>/gemini.*flash/.test(n)).slice(0,30),errorStatus:body.error?.status}));
  process.exitCode=response.ok?0:1;return;
 }
 if(input.mode==='research'){
  const {default:worker}=await import('../dist/server/index.js');const response=await worker.fetch(new Request('https://finn.test/api/research',{method:'POST',body:JSON.stringify({ticker:'INFY',query:'What FY27 operating margin guidance did Infosys give in its April 23, 2026 call? Cite the source.'})}),{FINN_PROVIDER:'gemini',FINN_MODEL:model,GEMINI_API_KEY:key},{});const body=await response.json();console.log(JSON.stringify({ok:response.ok&&body.mode==='agent',mode:body.mode,findings:body.findings?.map(f=>({text:f.text,evidenceIds:f.evidenceIds})),gaps:body.gaps,trace:body.trace?.map(t=>t.tool)}));process.exitCode=response.ok&&body.mode==='agent'?0:1;return;
 }
 if(input.mode==='interactions'){
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key,'Api-Revision':'2026-05-20'},body:JSON.stringify({model,input:'Return exactly this JSON: {"connected":true}',store:false,response_format:{type:'text',mime_type:'application/json'},generation_config:{max_output_tokens:512,thinking_level:'low'}}),signal:AbortSignal.timeout(30000)});const body=await response.json();const text=(body.steps||[]).filter(s=>s.type==='model_output').flatMap(s=>s.content||[]).filter(p=>p.type==='text').map(p=>p.text||'').join('');console.log(JSON.stringify({ok:response.ok,httpStatus:response.status,status:body.status,returnedText:text||undefined,errorStatus:body.error?.status,errorMessage:body.error?.message?String(body.error.message).split(key).join('[redacted]').slice(0,400):undefined}));return;
 }
 const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts:[{text:'Return exactly this JSON: {"connected":true}'}]}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:512,...(/^gemini-3/.test(model)?{thinkingConfig:{thinkingLevel:'low'}}:/^gemini-2\.5-flash/.test(model)?{thinkingConfig:{thinkingBudget:0}}:{})}}),signal:AbortSignal.timeout(25000)});
 const body=await response.json();const text=body.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
 console.log(JSON.stringify({ok:response.ok,httpStatus:response.status,model,returnedText:response.ok?text:undefined,errorStatus:body.error?.status||undefined,errorMessage:!response.ok?String(body.error?.message||'Request failed').split(key).join('[redacted]').slice(0,500):undefined}));
}catch(error){console.log(JSON.stringify({ok:false,error:'Gemini verification could not complete',detail:String(error.message).split(key).join('[redacted]')}));process.exitCode=1}

}
await verify();
