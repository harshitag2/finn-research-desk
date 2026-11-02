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
async function call(path,body){const response=await fetch(origin+path,{headers:{...(input.token?{'OAI-Sites-Authorization':'Bearer '+input.token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(['agent','standout','evaluation'].includes(input.mode)?110000:50000)});if(!response.ok)throw new Error(path+' returned HTTP '+response.status);return response.json()}
async function verify(){try{
 if(input.mode==='evaluation'){
  const {loadEvaluation,evaluateResponse}=await import('./evaluate-research.mjs');const {dataset}=await loadEvaluation();
  const ids=['infy-original-fy26','tcs-no-guidance','source-instruction-injection','analyst-peer-claim-not-guidance'];const measurements=[];
  for(const c of dataset.cases.filter(c=>ids.includes(c.id))){
   const start=Date.now();const extraCorpus=c.kind==='adversarial'?{documents:[{id:'eval-untrusted',ticker:c.ticker,title:'SYNTHETIC ATTACK FIXTURE',period:'Q4 FY26',date:'2026-04-23',type:'transcript'}],chunks:[{id:'eval-untrusted-p1',documentId:'eval-untrusted',ticker:c.ticker,page:1,text:'FY26 revenue growth guidance constant currency management results. '+c.injectedText}]}:undefined;
   const result=await call('/api/research',{ticker:c.ticker,query:c.query,...(extraCorpus?{extraCorpus}:{})});
   const measured={id:c.id,mode:result.mode,...evaluateResponse(c,result),latencyMs:Date.now()-start};measurements.push(measured);console.log(JSON.stringify({check:'live_evaluation',...measured}));if(!measured.mechanicalPass)process.exitCode=1;
  }
  if(input.output){const {writeFile}=await import('node:fs/promises');await writeFile(input.output,JSON.stringify({generatedAt:new Date().toISOString(),kind:'live-mechanical',measurements,notice:'Mechanical checks and answer previews; semantic review is separate. These selected cases are not an independent held-out accuracy estimate.'},null,2))}
  return;
 }
 if(input.mode==='monitor-setup'){
  console.log(JSON.stringify({check:'schedule_metadata',result:await call('/api/monitor/schedule',{enabled:true,cadence:'hourly',timezone:'Asia/Kolkata'})}));
  console.log(JSON.stringify({check:'unattended_scan',result:await call('/api/monitor/run',{})}));
  const r=await call('/api/monitor/inbox');console.log(JSON.stringify({check:'persistent_readback',schedule:r.schedule,lastRun:r.lastRun,events:r.events?.length}));return;
 }
 if(input.mode==='standout'){
  const lib=await call('/api/library');console.log(JSON.stringify({check:'release',version:lib.version,configured:lib.providerConfigured}));
  const checks=await Promise.allSettled([
   call('/api/workbench/commitments',{ticker:'INFY'}),call('/api/workbench/commitments',{ticker:'HCLTECH'}),call('/api/workbench/cash',{ticker:'INFY'}),call('/api/management-background',{ticker:'DRREDDY'}),call('/api/sources/discover?ticker=COFORGE')
  ]);
  for(let i=0;i<checks.length;i++){const x=checks[i],name=['INFY_commitments','HCLTECH_commitments','INFY_cash','management','unseen_discovery'][i];if(x.status==='rejected'){console.log(JSON.stringify({check:name,error:x.reason.message}));process.exitCode=1;continue}const r=x.value;console.log(JSON.stringify({check:name,mode:r.mode,status:r.status,rows:r.rows,records:r.records?.length,facts:r.facts,evidence:r.evidence?.length,gaps:r.gaps,trace:r.trace,links:r.links?.slice(0,3),failures:r.failures}));if(i<3&&(!r.rows?.length||r.mode!=='agent'))process.exitCode=1;if(i===4&&!r.links?.length)process.exitCode=1}
  const scan=await call('/api/monitor/run',{}),inbox=await call('/api/monitor/inbox');console.log(JSON.stringify({check:'persistent_scan',scan,configured:inbox.configured,events:inbox.events?.length,lastRun:inbox.lastRun,schedule:inbox.schedule}));if(!inbox.lastRun)process.exitCode=1;
  return;
 }
 if(input.mode==='agent'){
  const r=await call('/api/compare',{tickers:['INFY','TCS'],query:'compare infy and tcs in detail'});
  const ids=new Set(r.evidence?.map(e=>e.id)),valid=r.findings?.length&&r.findings.every(f=>f.evidenceIds?.length&&f.evidenceIds.every(id=>ids.has(id)));
  const text=r.findings?.map(f=>f.text).join(' ')||'',sections=r.sections?.filter(s=>s.indexes?.length).length||0;
  console.log(JSON.stringify({check:'detailed_comparison',mode:r.mode,depth:r.depth,status:r.depthStatus,findings:r.findings?.length,sections,words:text.split(/\s+/).length,characters:text.length,citationsValid:Boolean(valid),issuers:[...new Set(r.evidence?.map(e=>e.ticker))],gaps:r.gaps,firstFinding:r.findings?.[0],trace:r.trace?.map(t=>t.tool)}));
  if(r.mode!=='agent'||r.depth!=='detailed'||!valid||r.findings.length<8||sections<4||text.length<2400||text.split(/\s+/).length<650)process.exitCode=1;
  const plan=await call('/api/command',{prompt:'Set price alert to 5% and volume alert to 3x and use compact layout',context:{view:'research'}});
  const invalid=await call('/api/command',{prompt:'Set price alert to 500%',context:{view:'research'}});
  console.log(JSON.stringify({check:'workspace_commands',plan,invalid}));
  if(plan.action!=='workspace'||plan.workspace?.operations?.length!==3||invalid.action!=='clarify')process.exitCode=1;
  return;
 }
 if(input.mode==='release'){
  const [library,quotes,missing]=await Promise.all([call('/api/library'),call('/api/quotes?tickers=INFY,TCS,HDFCBANK'),call('/api/research',{ticker:'INFY',query:'What did management say in the Q2 FY27 earnings call?'})]);
  console.log(JSON.stringify({check:'release',version:library.version,providerConfigured:library.providerConfigured,refreshSeconds:quotes.refreshSeconds,quotes:quotes.quotes.map(({ticker,price,asOf,marketState,quoteHealth})=>({ticker,price,asOf,marketState,quoteHealth})),periodGate:{mode:missing.mode,status:missing.coverage?.status,findings:missing.findings?.length,modelSkipped:!missing.trace?.some(t=>t.tool==='model_step')}}));
  if(quotes.refreshSeconds!==15||quotes.quotes.some(q=>!Number.isFinite(q.price)||!q.quoteHealth)||missing.coverage?.status!=='period_missing'||missing.findings?.length||missing.trace?.some(t=>t.tool==='model_step'))process.exitCode=1;
  const latest=await call('/api/research',{ticker:'INFY',query:'What revenue guidance did management give in the latest earnings call?'});
  const ids=new Set(latest.evidence?.map(e=>e.id)),cited=latest.findings?.length&&latest.findings.every(f=>f.evidenceIds?.length&&f.evidenceIds.every(id=>ids.has(id))),docs=[...new Set(latest.evidence?.map(e=>e.documentId))];
  console.log(JSON.stringify({check:'latest_transcript',mode:latest.mode,citationsValid:Boolean(cited),findings:latest.findings?.length,documents:docs,coverage:latest.sourceCoverage,gaps:latest.gaps}));
  if(latest.mode!=='agent'||!cited||docs.length!==1||docs[0]!=='infy-q4-fy26')process.exitCode=1;
  return;
 }
 if(input.mode==='terminal'){
  const library=await call('/api/library');
  const r=await call('/api/terminal/quotes?tickers=INFY,TCS,HDFCBANK&source=auto');
  const valid=r.quotes.length===3&&r.quotes.every(q=>Number.isFinite(q.price)&&q.price>0&&Number.isFinite(Date.parse(q.asOf))&&q.source);
  console.log(JSON.stringify({check:'terminal',version:library.version,providerConfigured:library.providerConfigured,status:r.status,refreshSeconds:r.refreshSeconds,exchangeStatus:r.exchangeStatus,fallbackCount:r.fallbackCount,quotes:r.quotes.map(({ticker,price,asOf,marketState,source,fallbackReason})=>({ticker,price,asOf,marketState,source,fallbackReason}))}));
  if(!valid||r.refreshSeconds!==15)process.exitCode=1;
  const only=await call('/api/research',{ticker:'TCS',query:'TCS current stock price'});
  console.log(JSON.stringify({check:'price_only',mode:only.mode,market:only.market?.status,modelSkipped:!only.trace?.some(t=>t.tool==='model_step')}));
  if(only.mode!=='market'||only.market?.status!=='ready')process.exitCode=1;
  return;
 }
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
