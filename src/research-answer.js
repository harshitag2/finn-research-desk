const normal=s=>String(s||'').normalize('NFKC').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();

export function timelineCoverage(query,documents){
 const fy=String(query).match(/\bFY\s*'?(20\d{2}|\d{2})\b/i);
 if(!fy||!/(guidance|outlook)/i.test(query)||!/(chang|revis|through|over the|evol|during|timeline|quarter.by.quarter)/i.test(query))return null;
 const year=fy[1].slice(-2),expected=[1,2,3,4].map(q=>'Q'+q+' FY'+year);
 const companies=[...new Set(documents.map(d=>d.ticker))].map(ticker=>{
  const periods=new Set(documents.filter(d=>d.ticker===ticker&&d.type==='transcript').map(d=>{const p=normal(d.period).match(/^Q\s*([1-4])\s*FY\s*(20\d{2}|\d{2})$/i);return p?'Q'+p[1]+' FY'+p[2].slice(-2):''}));
  return {ticker,available:expected.filter(p=>periods.has(p)),missing:expected.filter(p=>!periods.has(p))};
 });
 return {period:'FY'+year,companies,partial:companies.some(c=>c.missing.length>0),method:'Indexed quarterly transcripts; coverage is not proof that numerical guidance was issued.'};
}

export function finishResearchAnswer(result,{query,documents,review=false}={}){
 if(!['agent','evidence'].includes(result.mode))return result;
 const coverage=timelineCoverage(query,documents),findings=result.findings||[],evidence=result.evidence||[];
 const partial=coverage?.partial;
 const coverageGaps=(coverage?.companies||[]).filter(c=>c.missing.length).map(c=>c.ticker+': '+c.missing.join(', ')+' transcripts are not indexed. A full-year sequence of guidance changes cannot be verified from the available calls.');
 let gaps=[...(result.gaps||[])],context=null,summary=result.summary;
 // Only recognise a first-person policy in a cited company transcript. Missing numbers alone
 // never establish a policy, and an analyst's question must not be promoted to management guidance.
 if(!review&&/guidance/i.test(query)&&new Set(documents.map(d=>d.ticker)).size===1){
  for(const f of findings){for(const id of f.evidenceIds||[]){
   const e=evidence.find(e=>e.id===id);if(!e||e.document?.type!=='transcript')continue;
   const text=normal(e.text),match=/\bwe (?:do not|don't) (?:provide|give) (?:any )?(?:specific |numerical |explicit )?(?:revenue or earnings|revenue|earnings) guidance\b/i.exec(text);
   if(!match)continue;
   const sentenceStart=Math.max(text.lastIndexOf('.',match.index),text.lastIndexOf('?',match.index),text.lastIndexOf('!',match.index))+1;
   const prefix=text.slice(sentenceStart,match.index);
   const sentenceEnd=text.slice(match.index).search(/[.!?]/);
   const end=sentenceEnd<0?Math.min(text.length,match.index+300):match.index+sentenceEnd+1;
   if(/\b(analyst|why|whether|do you|would you|can you)\b/i.test(prefix)||text[end-1]==='?')continue;
   context={kind:'no_numeric_guidance',ticker:e.ticker||e.document.ticker,period:e.document.period,date:e.document.date,page:e.page,evidenceId:e.id,quote:text.slice(sentenceStart,end).trim()};break;
  }if(context)break}
 }
 if(context){
  summary='The indexed '+context.period+' call states that '+context.ticker+' does not provide specific revenue or earnings guidance.'+(partial?' That statement is not a quarter-by-quarter FY history.':'');
  gaps=gaps.filter(g=>!/\b(no .*guidance exists|no .*guidance to track|no revenue guidance|never provides|no guidance was issued)\b/i.test(g));
 }
 if(result.mode==='agent'&&!context&&findings.length)summary=findings[0].text;
 const nextQuestions=context?[{label:'Read demand, deals & risks',query:'Explain '+context.ticker+' growth outlook, demand drivers, deal wins and risks in the '+context.period+' transcript in detail. Keep qualitative commentary separate from numerical targets.'},{label:'Review reported growth & margins',query:'Explain '+context.ticker+' reported revenue growth and margins in the '+context.period+' transcript in detail. Distinguish annual results from sequential quarterly changes.'}]:[];
 return {...result,summary,...(coverage?{timelineCoverage:coverage}:{}),...(context?{answerContext:context,nextQuestions}:{}),...(partial?{depthStatus:'partial',answerStatus:'limited_coverage'}:{}),gaps:[...new Set([...coverageGaps,...gaps])]};
}
