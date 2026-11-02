export const REPORT_DIMENSIONS=[
 {key:'business',title:'Business and demand',query:'business services segments clients industry demand discretionary spending digital cloud artificial intelligence'},
 {key:'growth',title:'Revenue and growth',query:'full year quarterly revenue growth constant currency geographical segment growth'},
 {key:'profitability',title:'Margins and execution',query:'operating margin profitability utilization attrition employee costs execution productivity'},
 {key:'capital',title:'Cash and capital allocation',query:'free cash flow operating cash conversion dividend payout buyback capital allocation balance sheet'},
 {key:'outlook',title:'Guidance, deals and risks',query:'revenue growth guidance outlook deal TCV order book pipeline risks headwinds uncertainty'}
];
export function researchDepth(query){
 const detailed=/\b(in detail|detailed|deep dive|in[ -]depth|comprehensive|thorough|elaborate|go deeper|more detail)\b/i.test(query);
 const focus=/\b(margins?|profitability)\b/i.test(query)?['growth','profitability','outlook']:/\b(cash|dividends?|capital allocation)\b/i.test(query)?['profitability','capital','outlook']:/\b(guidance|outlook|growth|revenues?)\b/i.test(query)?['growth','profitability','outlook']:null;
 const dimensions=detailed?(focus?REPORT_DIMENSIONS.filter(d=>focus.includes(d.key)):REPORT_DIMENSIONS):[];
 return {detailed,dimensions,maxFindings:detailed?18:7,maxOutputTokens:detailed?6500:3500};
}
export function expandedEvidence(corpus,{query,ticker,depth,retrieve}){
 if(!depth.detailed)return retrieve(corpus,{query,ticker,limit:6});
 const issuers=ticker?[ticker]:[...new Set(corpus.documents.map(d=>d.ticker))];
 const selected=[];const seen=new Set();
 // Round-robin by topic/issuer prevents a long annual report from drowning out the other company.
 for(const dimension of depth.dimensions){for(const issuer of issuers){
  const rows=retrieve(corpus,{query:dimension.query,ticker:issuer,limit:2});
  for(const row of rows){const key=row.documentId+':'+row.page;if(!seen.has(key)){seen.add(key);selected.push({...row,retrievalTopic:dimension.key})}}
 }}
 return selected.slice(0,Math.min(36,issuers.length*12));
}
export function detailQuality(findings,evidence,depth){
 if(!depth.detailed)return {sufficient:true,reasons:[]};
 const issuers=[...new Set(evidence.map(e=>e.ticker))],byId=new Map(evidence.map(e=>[e.id,e]));
 const sections=new Set(findings.map(f=>f.section).filter(Boolean));const chars=findings.reduce((n,f)=>n+f.text.length,0);
 const reasons=[];
 if(findings.length<Math.min(issuers.length>1?8:6,depth.dimensions.length*2))reasons.push('Too few substantive findings for a detailed report.');
 if(sections.size<Math.min(4,depth.dimensions.length))reasons.push('Cover the requested report topics with developed findings.');
 if(chars<2400)reasons.push('Explain the evidence, drivers and implications in developed paragraphs rather than isolated facts.');
 const words=findings.map(f=>f.text).join(' ').trim().split(/\s+/).length,minWords=depth.dimensions.length>=5?650:450;
 if(words<minWords)reasons.push('The detailed report is only '+words+' words. Develop the supported analysis to at least '+minWords+' words; explain drivers, issuer differences, periods and qualifications without padding or inventing facts.');
 for(const ticker of issuers){if(findings.filter(f=>f.evidenceIds.some(id=>byId.get(id)?.ticker===ticker)).length<2)reasons.push('Insufficient cited discussion of '+ticker+'.')}
 return {sufficient:!reasons.length,reasons};
}
export function reportSections(findings,depth){return depth.detailed?depth.dimensions.map(d=>({key:d.key,title:d.title,indexes:findings.flatMap((f,i)=>f.section===d.key?[i]:[])})):[]}
