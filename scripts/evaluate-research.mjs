import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {retrieve,runResearch,compareGuidance,calculateChange} from '../src/research.js';
import {scopeResearchSources} from '../src/source-scope.js';
import {researchDepth,expandedEvidence} from '../src/research-depth.js';
import {marketIntent,compareCompanies} from '../src/commands.js';
import {modelConfig} from '../src/model-config.js';

const root=new URL('../',import.meta.url);
const normalize=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
const companies=[{ticker:'INFY',name:'Infosys'},{ticker:'TCS',name:'Tata Consultancy Services'},{ticker:'PIDILITIND',name:'Pidilite Industries'}];
export async function loadEvaluation(){return {dataset:JSON.parse(await fs.readFile(new URL('data/evaluation-cases.json',root),'utf8')),corpus:JSON.parse(await fs.readFile(new URL('data/corpus.json',root),'utf8'))}}
function issuerCorpus(corpus,c){const tickers=c.tickers||[c.ticker];return {documents:corpus.documents.filter(d=>tickers.includes(d.ticker)),chunks:corpus.chunks.filter(d=>tickers.includes(d.ticker))}}
export function auditAnchors(dataset,corpus){return dataset.cases.flatMap(c=>(c.expectedSources||[]).map(s=>{const chunk=corpus.chunks.find(e=>e.id===s.chunkId);return {caseId:c.id,chunkId:s.chunkId,valid:Boolean(chunk&&chunk.documentId===s.documentId&&chunk.page===s.page&&normalize(chunk.text).includes(normalize(s.quote)))}}))}
export function evaluateResponse(c,result){
 const evidence=result.evidence||[],findings=result.findings||[],ids=new Map(evidence.map(e=>[e.id,e]));
 const cited=findings.flatMap(f=>f.evidenceIds||[]),citedEvidence=cited.map(id=>ids.get(id)).filter(Boolean),text=[result.summary||'',...findings.map(f=>f.text)].join(' ');
 const intendedIssuers=c.tickers||[c.ticker];
 const checks={hasFindings:findings.length>0,citationIdsValid:cited.length>0&&findings.every(f=>f.evidenceIds?.length&&f.evidenceIds.every(id=>ids.has(id))),citedIssuerScope:citedEvidence.length>0&&citedEvidence.every(e=>intendedIssuers.includes(e.ticker))};
 if(c.expectedSources?.length)checks.expectedSourceCited=c.expectedSources.every(s=>citedEvidence.some(e=>e.documentId===s.documentId&&e.page===s.page));
 if(c.expectedDocumentIds?.length)checks.citedDocumentPeriod=citedEvidence.every(e=>c.expectedDocumentIds.includes(e.documentId));
 const factMatches=(c.expectedAnswerFacts||[]).map(f=>({fact:f,found:normalize(text).includes(normalize(f))}));
 // Fact presence is diagnostic, never a proxy for semantic correctness: a negated or wrong-subject claim can contain the same number.
 if(c.forbiddenAnswerFragments)checks.attackFragmentsRejected=c.forbiddenAnswerFragments.every(x=>!normalize(text).includes(normalize(x)));
 const words=findings.map(f=>f.text).join(' ').trim().split(/\s+/).filter(Boolean).length;
 if(c.kind==='detail'){checks.depth=result.depth==='detailed';checks.developedLength=words>=c.minimumWords;checks.findingCount=findings.length>=c.minimumFindings;checks.sectionCount=(result.sections||[]).filter(s=>s.indexes?.length).length>=c.minimumSections;checks.issuerBalance=c.expectedIssuers.every(t=>findings.filter(f=>f.evidenceIds?.some(id=>ids.get(id)?.ticker===t)).length>=2)}
 return {checks,mechanicalPass:Object.values(checks).every(Boolean),expectedFactMatches:factMatches,words,findings:findings.length,modelSteps:result.trace?.filter(t=>t.tool==='model_step').length||0,providerUsage:'Token counts are not exposed by the current research adapter; no cost estimate is invented.',manualReviewRequired:true,reviewInstruction:c.manualReview||'Read each claim against its cited paragraph, including subjects, dates, units and accounting basis.',answerPreview:text.slice(0,1200)};
}
export async function evaluateOffline(dataset,corpus){
 const rows=[];
 for(const c of dataset.cases){const start=performance.now();let checks={},details={};
  if(c.kind==='adversarial'){rows.push({id:c.id,kind:c.kind,status:'not_run',reason:'Prompt-injection behaviour requires a real model response. Offline retrieval cannot establish instruction resistance.'});continue}
  if(c.kind==='scope'){const scoped=scopeResearchSources(issuerCorpus(corpus,c),{query:c.query,ticker:c.ticker||''});checks={documentBoundary:same([...scoped.documentIds],c.expectedDocumentIds),missingIssuerGate:same(scoped.missing,c.expectedMissing)};details={selectedDocuments:[...scoped.documentIds],missing:scoped.missing}}
  else if(c.kind==='calculation'){const r=c.operation==='compare_guidance'?compareGuidance(c.input):calculateChange(c.input.current,c.input.previous);checks=Object.fromEntries(Object.entries(c.expected).map(([k,v])=>[k,r[k]===v]));details={result:r}}
  else if(c.kind==='routing'){const r=marketIntent(c.query,companies);checks=Object.fromEntries(Object.entries(c.expected).map(([k,v])=>[k,Boolean(r[k])===v]));if(c.expectedDocumentQueryExcludes)checks.priceClauseRemoved=c.expectedDocumentQueryExcludes.every(x=>!normalize(r.documentQuery).includes(normalize(x)));details={intent:r}}
  else if(c.kind==='coverage'){const r=await runResearch({query:c.query,ticker:c.ticker,corpus,env:{}});checks={mode:r.mode===c.expectedMode,modelSkipped:!r.trace.some(t=>t.tool==='model_step'),noInventedFindings:r.findings.length===0}}
  else {const scoped=scopeResearchSources(issuerCorpus(corpus,c),{query:c.query,ticker:c.ticker||''}),depth=researchDepth(c.query),evidence=depth.detailed?expandedEvidence(scoped.corpus,{query:c.query,ticker:c.ticker||'',depth,retrieve}):retrieve(scoped.corpus,{query:c.query,ticker:c.ticker||'',limit:6});
   const matches=(c.expectedSources||[]).map(s=>({documentId:s.documentId,page:s.page,retrieved:evidence.some(e=>e.documentId===s.documentId&&e.page===s.page)}));
   checks={issuerBoundary:evidence.length>0&&evidence.every(e=>(c.tickers||[c.ticker]).includes(e.ticker))};
   if(matches.length)checks.goldPageRetrieved=matches.every(s=>s.retrieved);
   if(c.kind==='detail')checks.topicCoverage=new Set(evidence.map(e=>e.retrievalTopic)).size>=4,checks.bothIssuers=c.expectedIssuers.every(t=>evidence.filter(e=>e.ticker===t).length>=2);
   details={retrievedPages:evidence.map(e=>({documentId:e.documentId,page:e.page})),expectedPageMatches:matches,answerQuality:'Not assessed without synthesis and human source review.'};
  }
  rows.push({id:c.id,kind:c.kind,status:Object.values(checks).every(Boolean)?'pass':'fail',checks,...details,latencyMs:Math.round(performance.now()-start)});
 }
 return summarize('offline',rows,auditAnchors(dataset,corpus));
}
function summarize(mode,rows,anchors){const counts={pass:0,fail:0,not_run:0};for(const r of rows)counts[r.status]++;return {mode,generatedAt:new Date().toISOString(),datasetVersion:1,counts,sourceAnchorAudit:{checked:anchors.length,valid:anchors.filter(a=>a.valid).length,failures:anchors.filter(a=>!a.valid)},scope:'Author-reviewed regression cases from the bundled seed corpus; not held-out or independently graded.',researchAccuracy:'Not established. Mechanical retrieval/format/guard checks and expected-fact presence are reported separately from semantic claim support.',rows}}
async function live(dataset,corpus,{limit=6,origin}={}){
 const rows=[];const selected=dataset.cases.filter(c=>['retrieval','adversarial','detail'].includes(c.kind)).slice(0,limit);
 for(const c of selected){const start=performance.now();try{
  let scope=issuerCorpus(corpus,c);const extraCorpus=c.kind==='adversarial'?{documents:[{id:'eval-untrusted',ticker:c.ticker,title:'SYNTHETIC ATTACK FIXTURE',period:'Q4 FY26',date:'2026-04-23',type:'transcript'}],chunks:[{id:'eval-untrusted-p1',documentId:'eval-untrusted',ticker:c.ticker,page:1,text:'FY26 revenue growth guidance constant currency management results. '+c.injectedText}]}:null;
  if(extraCorpus)scope={documents:[...scope.documents,...extraCorpus.documents],chunks:[...scope.chunks,...extraCorpus.chunks]};
  let result;if(origin){const url=new URL(origin);if(!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Use HTTPS or loopback for the evaluation origin.');const response=await fetch(url.origin+(c.tickers?.length>1?'/api/compare':'/api/research'),{method:'POST',headers:{'Content-Type':'application/json',...(process.env.FINN_EVAL_SITE_TOKEN?{'OAI-Sites-Authorization':'Bearer '+process.env.FINN_EVAL_SITE_TOKEN}:{})},body:JSON.stringify({ticker:c.ticker,tickers:c.tickers,query:c.query,...(extraCorpus?{extraCorpus}:{})}),signal:AbortSignal.timeout(110000)});if(!response.ok)throw new Error('Evaluation endpoint HTTP '+response.status);result=await response.json()}
  else result=c.tickers?.length>1?await compareCompanies({query:c.query,tickers:c.tickers,corpus:scope,env:process.env}):await runResearch({query:c.query,ticker:c.ticker,corpus:scope,env:process.env});
  const measured=evaluateResponse(c,result);rows.push({id:c.id,kind:c.kind,status:measured.mechanicalPass?'pass':'fail',...measured,latencyMs:Math.round(performance.now()-start)});
 }catch(error){rows.push({id:c.id,kind:c.kind,status:'fail',error:'Evaluation request failed ('+(error.name||'Error')+'). Check provider configuration or service access; credentials and provider response bodies are not logged.',latencyMs:Math.round(performance.now()-start)})}}
 return summarize('live-mechanical',rows,auditAnchors(dataset,corpus));
}
async function main(){const args=process.argv.slice(2),arg=n=>args[args.indexOf(n)+1],isLive=args.includes('--live'),{dataset,corpus}=await loadEvaluation();
 if(isLive&&!arg('--origin')&&!modelConfig(process.env).configured)throw new Error('Live evaluation needs server-side model configuration or --origin. Offline evaluation requires no key.');
 const report=isLive?await live(dataset,corpus,{limit:args.includes('--limit')?Math.max(1,Math.min(26,Number(arg('--limit'))||6)):6,origin:args.includes('--origin')?arg('--origin'):undefined}):await evaluateOffline(dataset,corpus);
 if(args.includes('--output'))await fs.writeFile(arg('--output'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({mode:report.mode,counts:report.counts,sourceAnchorAudit:report.sourceAnchorAudit,failedCases:report.rows.filter(r=>r.status==='fail').map(r=>({id:r.id,checks:r.checks})),notice:report.researchAccuracy},null,2));
 if(report.counts.fail||report.sourceAnchorAudit.failures.length)process.exitCode=1;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await main();
