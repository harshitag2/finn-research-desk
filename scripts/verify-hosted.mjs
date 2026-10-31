// Service authorization is supplied only through masked stdin, never argv or disk.
const input=await new Promise((resolve,reject)=>{
 let buffer='',done=false;const tty=process.stdin.isTTY;
 const finish=()=>{if(done)return;done=true;if(tty)process.stdin.setRawMode(false);process.stdin.pause();process.stdin.removeListener('data',onData);try{resolve(JSON.parse(buffer.trim()))}catch{reject(new Error('Invalid verification input'))}};
 const onData=chunk=>{buffer+=chunk;if(/[\r\n]/.test(buffer))finish()};
 if(tty){process.stdin.setRawMode(true);process.stderr.write('Ready for hosted verification JSON on stdin (input is hidden).\n')}
 process.stdin.setEncoding('utf8');process.stdin.on('data',onData);process.stdin.once('end',finish);process.stdin.resume();
});
const origin='https://finn-research-desk.ayush2111319.chatgpt.site';
if(!input.token)throw new Error('A private-site service credential is required.');
async function call(path,body){const response=await fetch(origin+path,{headers:{'OAI-Sites-Authorization':'Bearer '+input.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(50000)});if(!response.ok)throw new Error(path+' returned HTTP '+response.status);return response.json()}
try{
 const library=await call('/api/library');console.log(JSON.stringify({check:'library',version:library.version,documents:library.documents.length,provider:library.provider,configured:library.providerConfigured}));
 const plan=await call('/api/command',{prompt:'Compare Infosys and TCS on FY27 growth guidance and show their prices',context:{ticker:'HDFCBANK'}});if(plan.action!=='compare'||plan.tickers.join(',')!=='INFY,TCS'||!plan.includePrices)throw new Error('Compound command did not preserve its scope');console.log(JSON.stringify({check:'compound_command',action:plan.action,tickers:plan.tickers,includePrices:plan.includePrices}));
 for(const [path,body] of [['/api/research',{ticker:'HDFCBANK',query:'What did management say about loan growth in the April 18, 2026 call? Cite the transcript.'}],['/api/compare',{tickers:['INFY','TCS'],query:'Compare FY27 revenue growth guidance. Separate numeric guidance from qualitative commentary.'}]]){
  const r=await call(path,body),ids=new Set(r.evidence?.map(e=>e.id));const valid=r.findings?.every(f=>f.evidenceIds?.length&&f.evidenceIds.every(id=>ids.has(id)));
  console.log(JSON.stringify({check:path,mode:r.mode,findings:r.findings?.length,citationsValid:valid,issuers:[...new Set(r.evidence?.map(e=>e.ticker))],gaps:r.gaps,firstFinding:r.findings?.[0]?.text?.slice(0,500),steps:r.trace?.map(t=>t.tool)}));
  if(r.mode!=='agent'||!r.findings?.length||!valid)process.exitCode=1;
 }
 const gap=await call('/api/research',{ticker:'PIDILITIND',query:'What guidance did management give?'});if(gap.mode!=='coverage'||gap.evidence?.length||gap.trace?.some(t=>t.tool==='model_step'))throw new Error('Missing-source gate failed');console.log(JSON.stringify({check:'missing_source_gate',mode:gap.mode,modelSkipped:true}));
}catch(error){console.error(String(error.message).split(input.token).join('[redacted]'));process.exitCode=1}
