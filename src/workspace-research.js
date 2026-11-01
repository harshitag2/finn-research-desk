import {marketIntent,compareCompanies} from './commands.js';
import {runResearch} from './research.js';
import {fetchQuotes} from './market.js';

// Market prices and company documents are separate evidence systems. This orchestrator is used by
// /api/research and /api/compare: it removes price-only clauses before a question reaches the document
// model, fetches quotes from the market-data provider (unless the browser fetches them itself), and
// keeps a failure in one system from hiding or relabelling the other.
export const PRICE_NOTE='Stock prices for this request are retrieved separately from a market-data provider. Do not search company documents for current share prices and do not report their absence from documents as a gap.';

const usable=q=>Number.isFinite(q?.price)&&q.price>0;

export function marketEnvelope(tickers,response,error){
 if(!tickers.length)return {status:'needs_scope',tickers:[],quotes:[],error:'Name a company to request its market quote.'};
 if(error||!Array.isArray(response?.quotes)){
  const reason=String(error?.message||'No quote response was returned.').slice(0,200);
  return {status:'unavailable',tickers,quotes:tickers.map(ticker=>({ticker,price:null,error:reason})),source:'Yahoo Finance',error:'The market-data provider did not respond: '+reason+' Company-document research is unaffected; retry quotes separately.',fetchedAt:new Date().toISOString()};
 }
 const quotes=tickers.map(ticker=>response.quotes.find(q=>q?.ticker===ticker)||{ticker,price:null,error:'No quote returned for this symbol.'});
 const shown=quotes.filter(usable).length,fresh=quotes.filter(q=>usable(q)&&!q.stale).length,cached=shown-fresh;
 const warning=shown<quotes.length?(shown?'Some symbols returned no provider quote.':'The market-data provider returned no usable quote.'):cached?cached+' cached quote'+(cached===1?' is':'s are')+' shown because the provider refresh failed; check each exchange timestamp.':'';
 return {status:fresh===quotes.length?'ready':shown?'partial':'unavailable',tickers,quotes,source:response.source||'Yahoo Finance',notice:response.notice||'Quotes may be delayed. This is not a licensed real-time exchange feed.',fetchedAt:response.fetchedAt||new Date().toISOString(),...(warning?{error:warning}:{})};
}

export async function investigateWorkspace({query,tickers=[],companies=[],corpus,env={},includePrices=false,separateMarket=false,quoteProvider=fetchQuotes,research=runResearch,compare=compareCompanies}){
 const started=Date.now(),scope=[...new Set(tickers)].slice(0,3);
 const intent=marketIntent(query,companies);
 const wantsPrices=intent.requested||includePrices===true;
 const quotesOnly=intent.requested&&intent.quotesOnly;
 const documentQuery=intent.requested&&intent.documentQuery?intent.documentQuery:query;
 const notes=wantsPrices?[PRICE_NOTE]:[];
 const route={tool:'route_request',detail:wantsPrices?(quotesOnly?'Price-only request: market data only; company documents and model synthesis skipped.':'Mixed request: market data for '+(scope.join(', ')||'no company')+'; documents receive “'+documentQuery.slice(0,160)+'”.'):'Document research request.',ms:0};

 const marketTask=wantsPrices&&!separateMarket
  ?(scope.length?Promise.resolve().then(()=>quoteProvider(scope)).then(r=>marketEnvelope(scope,r),e=>marketEnvelope(scope,null,e)):Promise.resolve(marketEnvelope([])))
  :Promise.resolve(null);
 const documentTask=quotesOnly?Promise.resolve(null):Promise.resolve()
  .then(()=>scope.length>1?compare({query:documentQuery,tickers:scope,corpus,env,notes}):research({query:documentQuery,ticker:scope[0]||'',corpus,env,notes}))
  .catch(error=>({mode:'error',summary:'Company-document research could not be completed.',findings:[],evidence:[],trace:[{tool:'research_error',detail:String(error?.message||'Research failed').slice(0,200),ms:Date.now()-started}],gaps:['Document research failed: '+String(error?.message||'unknown error').slice(0,200)+'. Market data, if requested, is reported separately.']}));
 const [document,market]=await Promise.all([documentTask,marketTask]);

 const marketTrace=market?[{tool:'fetch_quotes',detail:market.quotes.filter(usable).length+' / '+market.tickers.length+' quotes from '+(market.source||'the market-data provider')+' ('+market.status+'), independent of company documents.',ms:Date.now()-started}]:wantsPrices&&separateMarket?[{tool:'fetch_quotes',detail:'Quotes are requested separately by the workspace.',ms:0}]:[];
 const base={query,documentQuery:quotesOnly?'':documentQuery,scope,marketRequested:wantsPrices,...(market?{market}:{})};
 if(!document)return {mode:'market',...base,summary:'Market quotes only. No company documents or model synthesis were used.',findings:[],evidence:[],gaps:[],trace:[route,...marketTrace],generatedAt:new Date().toISOString()};
 return {...document,...base,scope:document.scope||scope,trace:[route,...marketTrace,...(document.trace||[])]};
}
