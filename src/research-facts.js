// Shared extraction guards. Citation presence is not semantic proof; retain the exact source text.
export const normalizeQuote=s=>String(s||'').normalize('NFKC').replace(/[‘’]/g,"'").replace(/[–—−]/g,'-').replace(/\s+/g,' ').trim();
export function supportedQuote(row,evidence){
 const source=evidence.find(e=>e.id===row.evidenceId),quote=normalizeQuote(row.quote);
 if(!source||quote.length<25||quote.length>1800||!normalizeQuote(source.text).includes(quote))return null;
 return {source,quote};
}
export function quoteNumbers(text){
 const values=[];for(const m of normalizeQuote(text).matchAll(/(?:\(?[-+]?\d[\d,]*(?:\.\d+)?\)?)/g)){let raw=m[0],value=Number(raw.replace(/[(),]/g,''));if(raw.startsWith('(')&&raw.endsWith(')'))value=-value;if(Number.isFinite(value))values.push(value)}return values;
}
export const numberSupported=(value,text)=>Number.isFinite(value)&&quoteNumbers(text).some(n=>Math.abs(n-value)<1e-8);
export function validPeriod(value){return typeof value==='string'&&/^(?:FY\d{2}|Q[1-4] FY\d{2})$/.test(value)}
export function periodSupported(period,text,document){
 if(!validPeriod(period))return false;
 const s=normalizeQuote(text).toLowerCase(),fy=period.match(/FY(\d{2})/)[1],year=2000+Number(fy);
 const annual=new RegExp('(?:fy|fiscal(?: year)?|financial year)\\s*[\\\' -]*(?:20)?'+fy+'\\b','i');
 const yearRange=new RegExp(String(year-1)+'\\s*[-/]\\s*(?:'+year+'|'+fy+')\\b');
 const q=period.match(/^Q([1-4])/);
 const quarter=!q||new RegExp('(?:q|quarter\\s*)'+q[1]+'\\b|\\b'+['','first','second','third','fourth'][Number(q[1])]+' quarter','i').test(s);
 return quarter&&(annual.test(s)||yearRange.test(s)||(!q&&document?.type==='annual_report'&&document?.period===period));
}
export const sourceRef=source=>({evidenceId:source.id,documentId:source.documentId,page:source.page,date:source.document?.date||'',url:source.document?.url||'',title:source.document?.title||''});
export async function extractionKey(version,ticker,evidence,config){
 const value=version+'|'+ticker+'|'+config.provider+'|'+config.model+'|'+evidence.map(e=>JSON.stringify({documentId:e.documentId,page:e.page,text:e.text,date:e.document?.date,period:e.document?.period,type:e.document?.type,url:e.document?.url})).join('|');
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function boundedCache(max=24,ttl=600000){const entries=new Map();return {get(key){const x=entries.get(key);if(!x||Date.now()-x.at>ttl){entries.delete(key);return null}return structuredClone(x.value)},set(key,value){if(entries.size>=max)entries.delete(entries.keys().next().value);entries.set(key,{at:Date.now(),value:structuredClone(value)})}}}
export function extractionFailure(error,config={}){
 const status=Number.isInteger(error?.status)&&error.status>=100&&error.status<=599?error.status:null;
 const type=['SyntaxError','TimeoutError','AbortError','TypeError','RangeError'].includes(error?.name)?error.name:'ProviderError';
 let safeDetail=typeof error?.safeDetail==='string'?error.safeDetail:'';
 if(config.key)safeDetail=safeDetail.split(config.key).join('[redacted]');
 safeDetail=safeDetail.replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/(?:AIza|AQ\.)[A-Za-z0-9_.-]{15,}/g,'[redacted]').replace(/([?&](?:key|token|api_key)=)[^\s&]+/gi,'$1[redacted]').replace(/[\r\n]+/g,' ').slice(0,300);
 return {tool:'extraction_error',status,errorType:type,...(safeDetail?{safeDetail}:{}),detail:status?'Provider rejected extraction (HTTP '+status+').'+(safeDetail?' '+safeDetail:''):type==='SyntaxError'?'The model returned incomplete or invalid JSON.':type==='TimeoutError'||type==='AbortError'?'The extraction request exceeded its deadline or was cancelled.':'The extraction could not be completed; inspect provider configuration and retry.'};
}
