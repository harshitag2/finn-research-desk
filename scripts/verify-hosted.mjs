// Service authorization is supplied only through masked stdin, never argv or disk.
const input=await new Promise((resolve,reject)=>{
 let buffer='',done=false;const tty=process.stdin.isTTY;
 const finish=()=>{if(done)return;done=true;if(tty)process.stdin.setRawMode(false);process.stdin.pause();process.stdin.removeListener('data',onData);try{resolve(JSON.parse(buffer.trim()))}catch{reject(new Error('Invalid verification input'))}};
 const onData=chunk=>{buffer+=chunk;if(/[\r\n]/.test(buffer))finish()};
 if(tty){process.stdin.setRawMode(true);process.stderr.write('Ready for hosted verification JSON on stdin (input is hidden).\n')}
 process.stdin.setEncoding('utf8');process.stdin.on('data',onData);process.stdin.once('end',finish);process.stdin.resume();
});
// The origin can be overridden for a new host; the private Sites origin still requires its service credential.
const DEFAULT_ORIGIN='https://finn-research-desk.ayush2111319.chatgpt.site';
const origin=input.origin?new URL(input.origin).origin:DEFAULT_ORIGIN;
if(origin===DEFAULT_ORIGIN&&!input.token)throw new Error('A private-site service credential is required.');
const redact=text=>input.token?String(text).split(input.token).join('[redacted]'):String(text);
async function call(path,body){const response=await fetch(origin+path,{headers:{...(input.token?{'OAI-Sites-Authorization':'Bearer '+input.token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(50000)});if(!response.ok)throw new Error(path+' returned HTTP '+response.status);return response.json()}
async function verify(){try{
 if(input.mode==='acceptance'){
  const library=await call('/api/library');console.log(JSON.stringify({check:'library',version:library.version,provider:library.provider,configured:library.providerConfigured}));
  const mixed=await call('/api/compare',{tickers:['INFY','TCS'],query:'Compare Infosys and TCS on FY27 growth guidance and show their stock prices'});
  const evidenceIds=new Set(mixed.evidence?.map(e=>e.id));const cited=mixed.findings?.every(f=>f.evidenceIds?.length&&f.evidenceIds.every(id=>evidenceIds.has(id)));
  console.log(JSON.stringify({check:'mixed_research_prices',mode:mixed.mode,market:mixed.market?.status,documentQuery:mixed.documentQuery,findings:mixed.findings?.length,citationsValid:cited,quotes:mixed.market?.quotes?.map(({ticker,price,asOf,marketState,error})=>({ticker,price,asOf,marketState,error})),gaps:mixed.gaps}));
  if(mixed.mode!=='agent'||!mixed.findings?.length||!cited||mixed.market?.status!=='ready'||mixed.gaps?.some(g=>/stock price.*documents|share price.*documents/i.test(g)))process.exitCode=1;
  const form=await call('/api/research',{ticker:'HDFCBANK',query:'What did management say about loan growth in the April 18, 2026 call, and what is the current share price?'});
  console.log(JSON.stringify({check:'research_form_mixed',mode:form.mode,market:form.market?.status,findings:form.findings?.length,gaps:form.gaps}));if(form.mode!=='agent'||form.market?.status!=='ready')process.exitCode=1;
  const only=await call('/api/research',{ticker:'PIDILITIND',query:'PIDILITIND current stock price'});console.log(JSON.stringify({check:'uncovered_price',mode:only.mode,market:only.market?.status,modelSkipped:!only.trace?.some(t=>t.tool==='model_step')}));if(only.mode!=='market'||only.market?.status!=='ready')process.exitCode=1;
  const [digest,results]=await Promise.all([call('/api/digest?tickers=INFY,TCS&window=7d'),call('/api/results?ticker=INFY')]);
  console.log(JSON.stringify({check:'nse_digest',status:digest.status,items:digest.items?.length,failures:digest.failures,error:digest.error}));
  console.log(JSON.stringify({check:'nse_results',status:results.status,rows:results.rows?.length,checks:results.checks,gaps:results.gaps,error:results.error}));
  const analysis=await call('/api/analyze',{prompt:'Explain the main portfolio risk using cited computed metrics. Keep the synthesis brief.',holdings:[{ticker:'INFY',weight:1,sector:'Technology'},{ticker:'TCS',weight:1,sector:'Technology'},{ticker:'HDFCBANK',weight:1,sector:'Banking'}]});
  console.log(JSON.stringify({check:'gemini_portfolio',mode:analysis.mode,holdings:analysis.metrics?.holdingsAnalysed,findings:analysis.synthesis?.findings?.length,trace:analysis.trace?.map(t=>({tool:t.tool,detail:t.detail})),gaps:analysis.gaps}));
  if(analysis.mode!=='agent'||!analysis.synthesis?.findings?.length)process.exitCode=1;
  return;
 }
 if(input.mode==='quotes'){
  const r=await call('/api/quotes?tickers=INFY,TCS,HDFCBANK');console.log(JSON.stringify({check:'hosted_quotes',quotes:r.quotes.map(({ticker,price,asOf,error,stale})=>({ticker,price,asOf,error,stale}))}));
  if(r.quotes.some(q=>!Number.isFinite(q.price)))process.exitCode=1;
  if(input.mixed){
   const r=await call('/api/compare',{tickers:['INFY','TCS'],query:'Compare Infosys and TCS on FY27 growth guidance and show their stock prices'});console.log(JSON.stringify({check:'mixed_request',mode:r.mode,documentQuery:r.documentQuery,market:r.market?.status,quotes:r.market?.quotes?.map(({ticker,price,asOf,marketState,delayMinutes,error})=>({ticker,price,asOf,marketState,delayMinutes,error})),findings:r.findings?.length,gaps:r.gaps}));if(r.market?.status!=='ready'||r.gaps?.some(g=>/stock price|share price/i.test(g)))process.exitCode=1;
   const form=await call('/api/research',{ticker:'HDFCBANK',query:'What did management say about loan growth, and what is the current share price?'});console.log(JSON.stringify({check:'research_form_mixed',mode:form.mode,market:form.market?.status,gaps:form.gaps}));if(form.market?.status!=='ready'||form.gaps?.some(g=>/stock price|share price/i.test(g)))process.exitCode=1;
   const only=await call('/api/research',{ticker:'PIDILITIND',query:'PIDILITIND current stock price'});console.log(JSON.stringify({check:'price_only_uncovered',mode:only.mode,market:only.market?.status,modelSkipped:!only.trace?.some(t=>t.tool==='model_step')}));if(only.mode!=='market'||only.market?.status!=='ready')process.exitCode=1;
  }
  return;
 }
 const library=await call('/api/library');console.log(JSON.stringify({check:'library',version:library.version,documents:library.documents.length,provider:library.provider,configured:library.providerConfigured}));
 const plan=await call('/api/command',{prompt:'Compare Infosys and TCS on FY27 growth guidance and show their prices',context:{ticker:'HDFCBANK'}});if(plan.action!=='compare'||plan.tickers.join(',')!=='INFY,TCS'||!plan.includePrices)throw new Error('Compound command did not preserve its scope');console.log(JSON.stringify({check:'compound_command',action:plan.action,tickers:plan.tickers,includePrices:plan.includePrices}));
 for(const [path,body] of [['/api/research',{ticker:'HDFCBANK',query:'What did management say about loan growth in the April 18, 2026 call? Cite the transcript.'}],['/api/compare',{tickers:['INFY','TCS'],query:'Compare FY27 revenue growth guidance. Separate numeric guidance from qualitative commentary.'}]]){
  const r=await call(path,body),ids=new Set(r.evidence?.map(e=>e.id));const valid=r.findings?.every(f=>f.evidenceIds?.length&&f.evidenceIds.every(id=>ids.has(id)));
  console.log(JSON.stringify({check:path,mode:r.mode,findings:r.findings?.length,citationsValid:valid,issuers:[...new Set(r.evidence?.map(e=>e.ticker))],gaps:r.gaps,firstFinding:r.findings?.[0]?.text?.slice(0,500),steps:r.trace?.map(t=>t.tool)}));
  if(r.mode!=='agent'||!r.findings?.length||!valid)process.exitCode=1;
 }
 const gap=await call('/api/research',{ticker:'PIDILITIND',query:'What guidance did management give?'});if(gap.mode!=='coverage'||gap.evidence?.length||gap.trace?.some(t=>t.tool==='model_step'))throw new Error('Missing-source gate failed');console.log(JSON.stringify({check:'missing_source_gate',mode:gap.mode,modelSkipped:true}));
}catch(error){console.error(redact(error.message));process.exitCode=1}}
await verify();
