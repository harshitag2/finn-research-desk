import {retrieve,runResearch} from './research.js';
export const LENSES=[
 {id:'business',title:'Business quality',question:'What makes this business durable?',keywords:'competitive advantage pricing customer retention competition segments growth',source:'https://www.enam.com/about-us.html'},
 {id:'management',title:'Management & capital allocation',question:'What did management promise, and where did it put the money?',keywords:'guidance execution capital allocation acquisitions capex return dividend buyback',source:'https://www.enam.com/investment-philosophy.html'},
 {id:'cash',title:'Cash quality',question:'Does the growth turn into cash?',keywords:'operating cash flow conversion working capital receivables capital expenditure borrowings',source:'https://www.enam.com/investment-philosophy.html'},
 {id:'downside',title:'Downside resilience',question:'What could permanently impair this business?',keywords:'risks debt liquidity leverage contingent liabilities headwinds client concentration',source:'https://www.enam.com/investment-philosophy.html'},
 {id:'governance',title:'Governance',question:'What do disclosures reveal about stewardship?',keywords:'related party transactions auditor qualification governance remuneration directors controls',source:'https://www.enam.com/about-us.html'}
];
export function collectThesisEvidence({corpus,ticker,thesis,disconfirm,lens}){
 const scope=LENSES.find(l=>l.id===lens)||LENSES[0];
 const supporting=retrieve(corpus,{ticker,query:thesis+' '+scope.keywords,limit:4});
 const challenging=retrieve(corpus,{ticker,query:disconfirm+' risks headwinds decline uncertainty '+scope.keywords,limit:4});
 const evidence=[...new Map([...supporting,...challenging].map(e=>[e.id,e])).values()];
 return {scope,evidence,evidenceGroups:[{label:'Thesis search',ids:supporting.map(e=>e.id)},{label:'Counter-evidence search',ids:challenging.map(e=>e.id)}]};
}
export async function reviewThesis({corpus,ticker,thesis,disconfirm,lens,env={},signal}){
 const collected=collectThesisEvidence({corpus,ticker,thesis,disconfirm,lens});
 const query='Test this investment thesis using '+collected.scope.title.toLowerCase()+': '+thesis+' What evidence could disprove it? '+disconfirm;
 const result=await runResearch({query,ticker,corpus,env,signal,review:{thesis,disconfirm,lens:collected.scope.title},initialEvidence:collected.evidence});
 result.query='Testing the '+collected.scope.title.toLowerCase()+' thesis.';
 result.reviewContext={thesis,disconfirm,lens:collected.scope.id,ticker};result.evidenceGroups=collected.evidenceGroups;
 result.trace.unshift({tool:'thesis_review',detail:'Search the thesis and its disconfirming condition separately. Lens: '+collected.scope.title,ms:0});
 if(result.mode==='evidence')result.gaps.unshift('Search groups are retrieval routes, not judgments that a passage supports or disproves your thesis.');
 return result;
}
