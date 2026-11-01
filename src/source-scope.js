// A document boundary, not an estimate of what management said in an unindexed period.
function quarter(value){const m=String(value).match(/\bQ\s*([1-4])\s*(?:FY\s*'?\s*)?(20\d{2}|\d{2})\b/i);return m?'Q'+m[1]+' FY'+m[2].slice(-2):null}
function requestedDate(query){
 const iso=query.match(/\b(20\d{2}-\d{2}-\d{2})\b/),words=query.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i);
 if(!iso&&!words)return null;const value=iso?iso[1]:words[1]+' '+words[2]+', '+words[3];const date=new Date(value+' 12:00:00 UTC');
 if(!Number.isFinite(date.getTime())||words&&date.getUTCDate()!==+words[2]||iso&&date.toISOString().slice(0,10)!==iso[1])return null;
 return date.toISOString().slice(0,10);
}
export function scopeResearchSources(corpus,{query='',ticker=''}={}){
 const base=corpus.documents.filter(d=>!ticker||d.ticker===ticker),issuers=[...new Set(base.map(d=>d.ticker))];
 const call=/\b(transcripts?|earnings calls?|conference calls?)\b/i.test(query)||/\bmanagement\b.*\b(say|said|commentary)\b/i.test(query);
 const period=call?quarter(query):null,date=call?requestedDate(query):null,latest=call&&!period&&!date&&/\b(latest|most recent)\b/i.test(query);
 const constrained=Boolean(period||date||latest);
 let docs=base;
 if(date)docs=base.filter(d=>d.date===date&&d.type==='transcript');
 else if(period)docs=base.filter(d=>quarter(d.period)===period&&d.type==='transcript');
 else if(latest)docs=issuers.flatMap(t=>{const calls=base.filter(d=>d.ticker===t&&d.type==='transcript');const last=calls.map(d=>d.date||'').sort().at(-1);return calls.filter(d=>last&&d.date===last)});
 const ids=new Set(docs.map(d=>d.id)),missing=constrained?issuers.filter(t=>!docs.some(d=>d.ticker===t)):[];
 const coverage={requested:date||period||(latest?'Latest indexed transcript':null),constrained,companies:issuers.map(t=>{const all=base.filter(d=>d.ticker===t),dates=all.map(d=>d.date).filter(Boolean).sort();const selected=docs.filter(d=>d.ticker===t),selectedDates=selected.map(d=>d.date).filter(Boolean).sort();return {ticker:t,documentCount:all.length,selectedCount:selected.length,from:dates[0]||null,through:dates.at(-1)||null,selectedThrough:selectedDates.at(-1)||null,selectedPeriods:constrained?[...new Set(selected.map(d=>d.period).filter(Boolean))]:[]}})};
 return {corpus:{documents:docs,chunks:corpus.chunks.filter(c=>ids.has(c.documentId))},coverage,missing,documentIds:ids};
}
