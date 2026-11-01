import HTML from './index.html';
import CSS from './styles.css';
import WORKSPACE_CSS from './workspace.css';
import STITCH_CSS from './stitch.css';
import boot from './client.js';
import createPortfolioTools from './portfolio.js';
import createIntentTools from './intent.js';
import {LENSES,reviewThesis} from './diligence.js';
import {fetchQuotes} from './market.js';
import {terminalQuotes} from './exchange-quotes.js';
import createTerminalTools from './terminal-tools.js';
import {modelConfig} from './model-config.js';
import {planCommand} from './commands.js';
import {investigateWorkspace} from './workspace-research.js';
import {analyzePortfolio} from './deep-dive.js';
import {fetchHistories,stockMetrics,alignOn,INDICES,BENCHMARK,SECTOR_INDEX} from './analytics.js';
import createChartTools from './charts.js';
import {resultsFirstCut,quarterFromLabel,fiscalLabel} from './results.js';
import {buildDigest,fetchAnnouncements,classifyAnnouncement,summarise,CATEGORIES,CATEGORY_LABELS,DEFAULT_FOCUS,WINDOWS} from './digest.js';
import corpus from '../data/corpus.json';
import guidance from '../data/guidance.json';
import {runResearch,retrieve,chunkPages} from './research.js';
import {extractText,getDocumentProxy} from 'unpdf';

const PORTFOLIO=[['INFY','Infosys','Technology'],['TCS','Tata Consultancy Services','Technology'],['HCLTECH','HCLTech','Technology'],['LT','Larsen & Toubro','Industrials'],['RELIANCE','Reliance Industries','Diversified'],['HDFCBANK','HDFC Bank','Banking'],['ICICIBANK','ICICI Bank','Banking'],['BHARTIARTL','Bharti Airtel','Telecom'],['PIDILITIND','Pidilite Industries','Materials'],['HINDUNILVR','Hindustan Unilever','Consumer'],['SUNPHARMA','Sun Pharma','Healthcare'],['DRREDDY','Dr. Reddy’s','Healthcare'],['MARUTI','Maruti Suzuki','Auto'],['M&M','Mahindra & Mahindra','Auto'],['TITAN','Titan','Consumer'],['ASIANPAINT','Asian Paints','Materials'],['ULTRACEMCO','UltraTech Cement','Materials'],['TATASTEEL','Tata Steel','Materials']].map(([ticker,name,sector])=>({ticker,name,sector}));
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const cleanTicker=s=>String(s||'').toUpperCase().replace(/\.(NS|BO)$/,'').trim();
const validTicker=s=>/^[A-Z0-9&-]{1,24}$/.test(s);
async function readJSON(request,max=2500000){if(Number(request.headers.get('content-length'))>max)throw new Error('Request too large');const t=await request.text();if(t.length>max)throw new Error('Request too large');return JSON.parse(t);}
function combine(extra){
 if(!extra||!Array.isArray(extra.documents)||!Array.isArray(extra.chunks))return corpus;
 const documents=extra.documents.slice(0,20).filter(d=>typeof d.id==='string'&&validTicker(d.ticker)&&typeof d.title==='string').map(d=>({...d,url:typeof d.url==='string'&&d.url.startsWith('https://')?d.url:'',title:d.title.slice(0,250),provenance:'user_upload'}));
 const ids=new Set(documents.map(d=>d.id));const byId=new Map(documents.map(d=>[d.id,d]));
 const chunks=extra.chunks.slice(0,1500).filter(c=>ids.has(c.documentId)&&typeof c.text==='string'&&typeof c.id==='string'&&Number.isInteger(c.page)&&c.page>0).map(c=>({...c,ticker:byId.get(c.documentId).ticker,text:c.text.slice(0,2000)}));
 return {documents:[...corpus.documents,...documents],chunks:[...corpus.chunks,...chunks]};
}
function briefing(){
 const specs=[{ticker:'INFY',query:'How did FY26 revenue growth compare with final guidance, and what is the FY27 outlook?',headline:'3.1% delivered. Now examine the next outlook.',deck:'FY26 constant-currency growth landed within the final 3–3.5% range. The next year’s guidance is a separate question.',label:'GUIDANCE WATCH',priority:'focus'},{ticker:'HCLTECH',query:'What assumptions and risks underpin HCLTech’s FY27 revenue growth guidance?',headline:'A 1–4% outlook, with conditions attached.',deck:'FY27 constant-currency revenue growth guidance includes a soft spending scenario and further client ramp-downs at the lower end.',label:'MANAGEMENT COMMENTARY',priority:'watch'},{ticker:'TCS',query:'Does TCS provide explicit revenue or earnings guidance? Separate management targets from qualitative commentary.',headline:'A useful absence: no numerical guidance.',deck:'TCS says it does not provide specific revenue or earnings guidance. Its outlook should not be turned into invented targets.',label:'RESEARCH QUESTION',priority:'watch'},{ticker:'LT',query:'How does L&T link its FY26 revenue growth guidance to second-half execution and working capital?',headline:'15% growth guidance. Execution is the test.',deck:'Management maintained FY26 revenue growth guidance, expecting stronger execution in the second half.',label:'BUSINESS TRAJECTORY',priority:'watch'}];
 return specs.map((s,i)=>{
  const documents=corpus.documents.filter(d=>d.ticker===s.ticker&&d.type==='transcript').sort((a,b)=>b.date.localeCompare(a.date));const doc=documents[0];
  if(!doc)return null;const evidence=retrieve(corpus,{query:s.query,ticker:s.ticker,period:doc.period,limit:1})[0];
  return {...s,id:'brief-'+i,company:PORTFOLIO.find(c=>c.ticker===s.ticker)?.name||s.ticker,date:doc.date,document:doc,evidence,category:'earnings_call'};
 }).filter(Boolean);
}
async function quotes(ticker){
 const key='quote:'+ticker;const cached=cache.get(key);if(cached&&Date.now()-cached.time<900000)return cached.value;
 const response=await fetch('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(ticker+'.NS')+'?range=3mo&interval=1d',{headers:{'User-Agent':'Mozilla/5.0 FINN research prototype'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Market data provider unavailable (HTTP '+response.status+')');
 const raw=await response.json();const r=raw.chart?.result?.[0];if(!r?.timestamp)throw new Error('No market data for this ticker');
 const q=r.indicators.quote[0];const now=new Date();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(now);const marketClosed=now.getUTCHours()*60+now.getUTCMinutes()>=630;
 const days=r.timestamp.map((t,i)=>({date:new Date(t*1000).toISOString().slice(0,10),close:q.close[i],volume:q.volume[i]})).filter(d=>Number.isFinite(d.close)&&Number.isFinite(d.volume)&&(d.date!==today||marketClosed));
 if(days.length<2)throw new Error('Not enough completed sessions');const last=days.at(-1),prev=days.at(-2),history=days.slice(-21,-1),average=history.reduce((s,d)=>s+d.volume,0)/history.length;
 const value={ticker,currency:r.meta?.currency||'INR',...last,changePercent:(last.close-prev.close)/prev.close*100,volumeRatio:average?last.volume/average:null,averageVolume:average,averageSessions:history.length,history:days.slice(-30),source:'Yahoo Finance · unadjusted daily close',fetchedAt:new Date().toISOString()};cache.set(key,{time:Date.now(),value});return value;
}
const cache=new Map();
async function discover(ticker){
 const url='https://www.screener.in/company/'+encodeURIComponent(ticker)+'/consolidated/';
 const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(16000)});
 if(!response.ok)throw new Error('Document discovery unavailable (HTTP '+response.status+'). Add a company report or transcript using Import PDF.');
 const text=await response.text();const links=[];const seen=new Set();
 for(const m of text.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  const label=m[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();let href;try{href=new URL(m[1].replace(/&amp;/g,'&'),url).href}catch{continue}
  if(!href.startsWith('https://')||seen.has(href))continue;
  if(/(?:concall|transcript|annual.report)/i.test(label+' '+href)){seen.add(href);links.push({url:href,label:label||'Company disclosure',type:/transcript|concall/i.test(label+' '+href)?'transcript':'annual_report'});}
 }
 return {ticker,source:url,links:links.slice(0,24),note:'Discovery links only. Import the original PDF to make its contents searchable. External availability varies.'};
}
// Exchange filings for one company: always a bounded 30-day window (an unbounded NSE request returns years of history).
async function announcements(ticker){
 try{
  const rows=await fetchAnnouncements(ticker,{days:30});
  return rows.slice(0,40).map(r=>{const c=classifyAnnouncement({desc:r.nseCategory,text:r.text});return {ticker,subject:r.nseCategory,details:summarise(r.text,r.nseCategory)||r.text,date:r.at,url:r.url,category:CATEGORY_LABELS[c.category],materiality:c.materiality,source:'NSE'}});
 }catch(error){throw new Error('Exchange feed unavailable ('+error.message+'). Archived company sources remain available.')}
}
export default {async fetch(request,env={}){
 const url=new URL(request.url);const path=url.pathname;
 try{
  if(request.method==='GET'&&path==='/')return new Response(HTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}});
  if(request.method==='GET'&&path==='/styles.css')return new Response(CSS+'\n'+WORKSPACE_CSS+'\n'+STITCH_CSS,{headers:{'Content-Type':'text/css; charset=utf-8'}});
  if(request.method==='GET'&&path==='/app.js')return new Response('('+boot.toString()+')(('+createPortfolioTools.toString()+')(),('+createIntentTools.toString()+')(),('+createChartTools.toString()+')(),('+createTerminalTools.toString()+')());',{headers:{'Content-Type':'application/javascript; charset=utf-8'}});
  if(request.method==='GET'&&path==='/api/diligence')return json({lenses:LENSES,method:'A product interpretation of ENAM’s public investment approach, not its internal research system.',sources:[{title:'ENAM investment philosophy',url:'https://www.enam.com/investment-philosophy.html'},{title:'ENAM approach and governance',url:'https://www.enam.com/about-us.html'},{title:'ENAM culture and objectivity',url:'https://www.enam.com/culture.html'}]});
  if(request.method==='GET'&&path==='/api/library'){const config=modelConfig(env);return json({documents:corpus.documents,chunkCount:corpus.chunks.length,portfolio:PORTFOLIO,providerConfigured:config.configured,provider:config.provider,model:config.model,version:'0.9.0',digest:{categories:CATEGORY_LABELS,defaultFocus:DEFAULT_FOCUS,windows:Object.keys(WINDOWS)}})}
  if(request.method==='POST'&&path==='/api/command'){
   const body=await readJSON(request,12000),prompt=String(body.prompt||'').trim();
   if(prompt.length<3||prompt.length>1200)return json({error:'Enter a workspace request of 3–1,200 characters.'},400);
   const context={ticker:cleanTicker(body.context?.ticker),tickers:(Array.isArray(body.context?.tickers)?body.context.tickers:[]).map(cleanTicker).filter(validTicker).slice(0,3),view:['briefing','research','portfolio','library','thesis','saved'].includes(body.context?.view)?body.context.view:''};
   return json(await planCommand({prompt,context,companies:PORTFOLIO,env}));
  }
  if(request.method==='POST'&&path==='/api/compare'){
   const body=await readJSON(request),tickers=[...new Set((Array.isArray(body.tickers)?body.tickers:[]).map(cleanTicker))],query=String(body.query||'').trim().slice(0,1200);
   if(tickers.length<2||tickers.length>3||tickers.some(t=>!validTicker(t))||query.length<3)return json({error:'Choose two or three valid NSE companies and enter a comparison question.'},400);
   return json(await investigateWorkspace({query,tickers,companies:PORTFOLIO,corpus:combine(body.extraCorpus),env,includePrices:body.includePrices===true,separateMarket:body.separateMarket===true}));
  }
  if(request.method==='GET'&&path==='/api/quotes'){
   const tickers=String(url.searchParams.get('tickers')||'').split(',').map(cleanTicker).filter(Boolean);
   if(!tickers.length||tickers.length>50||tickers.some(t=>!validTicker(t)))return json({error:'Request between 1 and 50 valid NSE tickers.'},400);
   return json(await fetchQuotes(tickers));
  }
  if(request.method==='GET'&&path==='/api/terminal/quotes'){
   const tickers=String(url.searchParams.get('tickers')||'').split(',').map(cleanTicker).filter(Boolean),source=url.searchParams.get('source')||'auto';
   if(!tickers.length||tickers.length>50||tickers.some(t=>!validTicker(t))||!['auto','nse','yahoo'].includes(source))return json({error:'Request 1–50 valid NSE symbols and choose auto, nse or yahoo.'},400);
   return json(await terminalQuotes(tickers,{source}));
  }
  if(request.method==='POST'&&path==='/api/analyze'){
   const body=await readJSON(request),prompt=String(body.prompt||'Give me a deep analysis of my portfolio').trim().slice(0,1200);
   const raw=Array.isArray(body.holdings)&&body.holdings.length?body.holdings:PORTFOLIO.map(c=>({...c,weight:1}));
   const holdings=[];
   for(const h of raw.slice(0,30)){const ticker=cleanTicker(h.ticker),weight=Number(h.weight??h.marketValue??1);if(!validTicker(ticker)||!Number.isFinite(weight)||weight<0)return json({error:'Holdings need valid NSE tickers and non-negative weights or market values.'},400);if(weight>0&&!holdings.some(x=>x.ticker===ticker))holdings.push({ticker,weight,name:String(h.name||PORTFOLIO.find(c=>c.ticker===ticker)?.name||ticker).slice(0,80),sector:String(h.sector||PORTFOLIO.find(c=>c.ticker===ticker)?.sector||'Unclassified').slice(0,40)})}
   if(!holdings.length)return json({error:'Add at least one holding with a positive weight.'},400);
   const prefs={priceThreshold:Math.min(50,Math.max(0.1,Number(body.prefs?.priceThreshold)||4)),volumeThreshold:Math.min(20,Math.max(1,Number(body.prefs?.volumeThreshold)||2))};
   return json(await analyzePortfolio({prompt,holdings,corpus:combine(body.extraCorpus),env,prefs}));
  }
  if(request.method==='GET'&&path==='/api/markets'){
   const symbols=Object.keys(INDICES),h=await fetchHistories(symbols);
   const bench=h[BENCHMARK]?.ok?h[BENCHMARK].data:null;
   const indices=symbols.map(symbol=>h[symbol]?.ok?{symbol,...stockMetrics(h[symbol].data,symbol===BENCHMARK?null:bench)}:{symbol,name:INDICES[symbol],error:h[symbol]?.error||'unavailable'});
   return json({indices,sectorMap:SECTOR_INDEX,source:'Yahoo Finance daily history (dividend-adjusted closes where supplied)',notice:'Index levels come from the provider and may be delayed. A session still in progress is labelled as partial.',fetchedAt:new Date().toISOString()});
  }
  if(request.method==='GET'&&path==='/api/universe'){
   const tickers=[...new Set(String(url.searchParams.get('tickers')||'').split(',').map(cleanTicker).filter(Boolean))];
   if(!tickers.length||tickers.length>40||tickers.some(t=>!validTicker(t)))return json({error:'Request between 1 and 40 valid NSE tickers.'},400);
   const h=await fetchHistories([BENCHMARK,...tickers]),bench=h[BENCHMARK]?.ok?h[BENCHMARK].data:null;
   return json({stocks:tickers.filter(t=>h[t]?.ok).map(t=>({ticker:t,...stockMetrics(h[t].data,bench)})),failures:tickers.filter(t=>!h[t]?.ok).map(t=>({ticker:t,error:h[t]?.error||'unavailable'})),benchmark:bench?{symbol:BENCHMARK,name:'Nifty 50',returns:stockMetrics(bench,null).returns}:null,source:'Yahoo Finance daily history',fetchedAt:new Date().toISOString()});
  }
  if(request.method==='GET'&&path==='/api/stock'){
   const ticker=cleanTicker(url.searchParams.get('ticker')),sector=String(url.searchParams.get('sector')||PORTFOLIO.find(c=>c.ticker===ticker)?.sector||'').slice(0,40);
   if(!validTicker(ticker))return json({error:'Invalid NSE ticker.'},400);
   const peers=[...new Set(String(url.searchParams.get('peers')||'').split(',').map(cleanTicker).filter(t=>validTicker(t)&&t!==ticker))].slice(0,8);
   const sectorIndex=SECTOR_INDEX[sector]||null;
   const h=await fetchHistories([ticker,BENCHMARK,...(sectorIndex?[sectorIndex]:[]),...peers]);
   if(!h[ticker]?.ok)return json({error:ticker+': '+(h[ticker]?.error||'price history unavailable')+'. No prices are estimated.'},502);
   const stock=h[ticker].data,bench=h[BENCHMARK]?.ok?h[BENCHMARK].data:null,dates=stock.rows.map(r=>r.date);
   const rebase=series=>{const v=alignOn(dates,series.rows).values,first=v.find(x=>x!==null);return v.map(x=>x===null||!first?null:Number((x/first*100).toFixed(2)))};
   const own=stock.rows.map(r=>Number((r.adj/stock.rows[0].adj*100).toFixed(2)));
   return json({ticker,sector,metrics:stockMetrics(stock,bench,{includeSeries:true}),relative:{dates,stock:own,benchmark:bench?{name:'Nifty 50',values:rebase(bench)}:null,sector:sectorIndex&&h[sectorIndex]?.ok?{symbol:sectorIndex,name:INDICES[sectorIndex],values:rebase(h[sectorIndex].data),metrics:stockMetrics(h[sectorIndex].data,bench)}:null},peers:peers.filter(t=>h[t]?.ok).map(t=>({ticker:t,...stockMetrics(h[t].data,bench)})),failures:[BENCHMARK,...peers].filter(t=>!h[t]?.ok).map(t=>({ticker:t,error:h[t]?.error})),source:'Yahoo Finance daily history',fetchedAt:new Date().toISOString()});
  }
  if(request.method==='GET'&&path==='/api/results'){
   const ticker=cleanTicker(url.searchParams.get('ticker'));if(!validTicker(ticker))return json({error:'Invalid NSE ticker.'},400);
   const q=String(url.searchParams.get('quarter')||'').trim(),quarter=/^\d{4}-(03-31|06-30|09-30|12-31)$/.test(q)?q:q?quarterFromLabel(q):null;
   if(q&&!quarter)return json({error:'Use a quarter such as Q2 FY27 or 2026-09-30.'},400);
   const b=url.searchParams.get('basis'),basis=['consolidated','standalone'].includes(b)?b:null;
   return json(await resultsFirstCut({symbol:ticker,company:PORTFOLIO.find(c=>c.ticker===ticker)?.name||'',quarter,basis}));
  }
  if(request.method==='GET'&&path==='/api/digest'){
   const tickers=[...new Set(String(url.searchParams.get('tickers')||'').split(',').map(cleanTicker).filter(Boolean))];
   if(!tickers.length||tickers.length>30||tickers.some(t=>!validTicker(t)))return json({error:'Request between 1 and 30 valid NSE tickers.'},400);
   const window=Object.keys(WINDOWS).includes(url.searchParams.get('window'))?url.searchParams.get('window'):'24h';
   const focus=String(url.searchParams.get('focus')||'').split(',').filter(c=>CATEGORIES.includes(c));
   const prefs={priceThreshold:Math.min(50,Math.max(0.1,Number(url.searchParams.get('price'))||4)),volumeThreshold:Math.min(20,Math.max(1,Number(url.searchParams.get('volume'))||2))};
   return json(await buildDigest({tickers,names:Object.fromEntries(PORTFOLIO.map(c=>[c.ticker,c.name])),window,prefs,focus:url.searchParams.has('focus')?focus:DEFAULT_FOCUS}));
  }
  if(request.method==='GET'&&path==='/api/briefing')return json({items:briefing(),mode:'archive',note:'Historical source replay. These are research prompts, not live market alerts.'});
  if(request.method==='GET'&&path==='/api/case-study')return json({...guidance,evidence:[...guidance.revisions,guidance.actual].map(r=>{const c=corpus.chunks.find(c=>c.id===r.evidenceId);return c?{...c,document:corpus.documents.find(d=>d.id===c.documentId)}:null}).filter(Boolean)});
  if(request.method==='POST'&&path==='/api/research'){
   const body=await readJSON(request);const query=String(body.query||'').trim().slice(0,1200),ticker=cleanTicker(body.ticker);
   if(query.length<3||ticker&&!validTicker(ticker))return json({error:'Enter a question and a valid NSE ticker.'},400);
   return json(await investigateWorkspace({query,tickers:ticker?[ticker]:[],companies:PORTFOLIO,corpus:combine(body.extraCorpus),env,includePrices:body.includePrices===true,separateMarket:body.separateMarket===true}));
  }
  if(request.method==='POST'&&path==='/api/review'){
   const body=await readJSON(request);const ticker=cleanTicker(body.ticker),thesis=String(body.thesis||'').trim(),disconfirm=String(body.disconfirm||'').trim();
   if(!validTicker(ticker)||thesis.length<10||thesis.length>1000||disconfirm.length<10||disconfirm.length>1000||!LENSES.some(l=>l.id===body.lens))return json({error:'Choose a research lens, an NSE ticker, and a thesis and disconfirming condition of 10–1,000 characters each.'},400);
   return json(await reviewThesis({ticker,thesis,disconfirm,lens:body.lens,corpus:combine(body.extraCorpus),env}));
  }
  if(request.method==='POST'&&path==='/api/search'){
   const body=await readJSON(request);return json({evidence:retrieve(combine(body.extraCorpus),{query:String(body.query||'').slice(0,1200),ticker:cleanTicker(body.ticker),limit:8})});
  }
  if(request.method==='POST'&&path==='/api/ingest'){
   if(Number(request.headers.get('content-length'))>16000000)return json({error:'PDF must be smaller than 15 MB.'},413);
   const form=await request.formData(),file=form.get('file'),ticker=cleanTicker(form.get('ticker'));
   if(!validTicker(ticker)||!file||typeof file.arrayBuffer!=='function')return json({error:'Choose a PDF and enter an NSE ticker.'},400);
   if(file.size>15000000)return json({error:'PDF must be smaller than 15 MB.'},413);
   const bytes=new Uint8Array(await file.arrayBuffer());if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')return json({error:'The file is not a PDF.'},400);
   const pdf=await getDocumentProxy(bytes);if(pdf.numPages>350){await pdf.loadingTask.destroy();return json({error:'For this prototype, import reports of up to 350 pages.'},413)}
   let result;try{result=await extractText(pdf,{mergePages:false})}finally{await pdf.loadingTask.destroy()}
   const pages=Array.isArray(result.text)?result.text:[result.text];
   if(pages.join('').trim().length<150)return json({error:'No readable text found. This PDF may need OCR; use a text-based original.'},422);
   const type=form.get('type')==='annual_report'?'annual_report':'transcript';
   const document={id:'upload-'+crypto.randomUUID(),ticker,title:String(file.name).slice(0,200),type,date:String(form.get('date')||new Date().toISOString().slice(0,10)),period:String(form.get('period')||'Unspecified').slice(0,50),url:'',pages:result.totalPages,provenance:'user_upload'};
   return json({document,chunks:chunkPages(pages,document),note:'Stored on this device after import. Uploaded provenance is not independently verified.'});
  }
  if(request.method==='GET'&&['/api/quote','/api/discover','/api/announcements'].includes(path)){
   const ticker=cleanTicker(url.searchParams.get('ticker'));if(!validTicker(ticker))return json({error:'Invalid NSE ticker.'},400);
   return json(path==='/api/quote'?await quotes(ticker):path==='/api/discover'?await discover(ticker):await announcements(ticker));
  }
  if(path==='/favicon.svg')return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#224b3e"/><text x="18" y="46" font-family="Georgia" font-size="52" fill="#f4f0e7">f</text><circle cx="45" cy="44" r="4" fill="#dfb361"/></svg>',{headers:{'Content-Type':'image/svg+xml'}});
  return json({error:'Not found'},404);
 }catch(error){return json({error:error.message||'Request could not be completed.'},502)}
}};
