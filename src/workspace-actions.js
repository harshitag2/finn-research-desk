// This factory is shared with the browser. It permits app controls, never source code, shell or URLs.
export default function createWorkspaceActions(){
 const views=['briefing','research','portfolio','library','thesis','saved','analysis','markets','stock','terminal'];
 const sources=['auto','nse','yahoo'],ranges=['1M','3M','6M','1Y'],windows=['24h','3d','7d','30d'];
 const categories={insider_trading:/insider trad/i,capex:/capex|capital expenditure/i,postal_ballot:/postal ballots?/i,agm_egm:/agm|egm|general meetings?/i,results:/results?|earnings results?/i,management_change:/management|directors?|ceo|cfo/i,dividend:/dividends?/i,litigation:/litigation|regulatory|penalt/i,credit_rating:/credit ratings?/i,'M&A':/acquisitions?|mergers?|m&a/i,fund_raise:/fund.?rais/i,pledging:/pledging|pledges?/i,bonus_split:/bonus|splits?/i,earnings_call:/earnings calls?/i,investor_meetings:/investor meetings?/i,press_release:/press releases?/i};
 const ticker=t=>typeof t==='string'&&/^[A-Z0-9&-]{1,24}$/.test(t);
 function validate(plan){
  if(!plan||!Array.isArray(plan.operations)||!plan.operations.length||plan.operations.length>8)throw new Error('Unsupported workspace request.');
  return {operations:plan.operations.map(o=>{
   if(!o||typeof o!=='object')throw new Error('Invalid workspace action.');
   if(o.type==='threshold'){const bounds=o.key==='priceThreshold'?[0.1,50]:o.key==='volumeThreshold'?[1,20]:null;if(!bounds||!Number.isFinite(o.value)||o.value<bounds[0]||o.value>bounds[1])throw new Error('Price alerts accept 0.1–50%; volume alerts accept 1–20×.');return {type:o.type,key:o.key,value:o.value}}
   if(o.type==='focus'){if(!['replace','add','remove'].includes(o.mode)||!Array.isArray(o.values)||!o.values.length||o.values.some(v=>!Object.hasOwn(categories,v)))throw new Error('Unsupported alert category.');return {type:o.type,mode:o.mode,values:[...new Set(o.values)]}}
   if(o.type==='terminal_source'){if(!sources.includes(o.value))throw new Error('Choose auto, NSE or Yahoo.');return {type:o.type,value:o.value}}
   if(o.type==='terminal_symbol'){if(!ticker(o.ticker)||!['add','remove'].includes(o.mode))throw new Error('Use a valid NSE symbol.');return {type:o.type,mode:o.mode,ticker:o.ticker}}
   if(o.type==='density'){if(!['compact','comfortable'].includes(o.value))throw new Error('Choose compact or comfortable density.');return {type:o.type,value:o.value}}
   if(o.type==='indices'){if(typeof o.value!=='boolean')throw new Error('Choose show or hide indices.');return {type:o.type,value:o.value}}
   if(o.type==='auto_refresh'){if(typeof o.value!=='boolean'||!views.includes(o.view))throw new Error('Invalid refresh control.');return {type:o.type,value:o.value,view:o.view}}
   if(o.type==='refresh'){if(!views.includes(o.view))throw new Error('Invalid refresh view.');return {type:o.type,view:o.view}}
   if(o.type==='chart_range'){if(!ranges.includes(o.value))throw new Error('Use 1M, 3M, 6M or 1Y.');return {type:o.type,value:o.value}}
   if(o.type==='digest_window'){if(!windows.includes(o.value))throw new Error('Use 24h, 3d, 7d or 30d.');return {type:o.type,value:o.value}}
   if(['open_preferences','clear_filters'].includes(o.type))return {type:o.type};
   throw new Error('This command cannot change application code or run arbitrary actions.');
  })};
 }
 function parse(prompt,context={},companies=[]){
  const s=String(prompt).trim(),lower=s.toLowerCase(),operations=[],view=views.includes(context.view)?context.view:'briefing';
  // Questions and quoted instructions in source passages must not become app mutations.
  const action=/^(?:please\s+)?(?:set|change|update|adjust|switch|use|make|hide|show|enable|disable|turn|pause|stop|resume|start|refresh|add|remove|clear|reset|open|only\s+alert|alert\s+me)\b/i.test(s);
  if(!action||/\b(?:javascript|execute|shell|api key|password|delete all|deploy|source code|rewrite the website)\b/i.test(s))return null;
  if(/\b(price|price alerts?|price move)\b/i.test(s)&&/\b(set|change|update|adjust)\b/i.test(s)){
   const m=s.match(/\bprice(?:\s+(?:alerts?|move|threshold|limit|change|percentage))*\s*(?:to|at|of|=|:)?\s*(\d+(?:\.\d+)?)\s*%/i)||s.match(/\b(\d+(?:\.\d+)?)\s*%\s*(?:price\s*)?alert/i);if(m)operations.push({type:'threshold',key:'priceThreshold',value:+m[1]});
  }
  if(/\bvolume\b/i.test(s)&&/\b(set|change|update|adjust)\b/i.test(s)){const m=s.match(/\bvolume(?:\s+(?:alerts?|threshold|limit|multiple))*\s*(?:to|at|of|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:x|×|times)?/i);if(m)operations.push({type:'threshold',key:'volumeThreshold',value:+m[1]})}
  if(/\b(?:alert me|only alert|turn (?:on|off)|enable|disable|add|remove)\b/i.test(s)&&/\balerts?\b/i.test(s)){
   const values=Object.entries(categories).filter(([,r])=>r.test(s)).map(([c])=>c);if(values.length)operations.push({type:'focus',mode:/\bonly\b/i.test(s)?'replace':/\b(?:off|disable|remove)\b/i.test(s)?'remove':'add',values});
  }
  if(/\b(source|feed|data provider)\b/i.test(s)&&/\b(yahoo|nse|auto)\b/i.test(s)){operations.push({type:'terminal_source',value:/\byahoo\b/i.test(s)?'yahoo':/\bauto\b/i.test(s)?'auto':'nse'})}
  if(/\b(?:add|remove)\b/i.test(s)&&/\bterminal\b/i.test(s)){
   const m=s.match(/\b(add|remove)\s+(.+?)\s+(?:to|from)\s+(?:the\s+|my\s+)?terminal\b/i);
   if(m){const name=m[2].trim(),known=companies.find(c=>[c.ticker,c.name,...(c.aliases||[])].some(n=>String(n).toLowerCase()===name.toLowerCase()));const symbol=known?.ticker||name.toUpperCase().replace(/\.NS$/,'');if(!ticker(symbol))return {error:'Use the NSE symbol, for example “Add NESTLEIND to terminal”.'};operations.push({type:'terminal_symbol',mode:m[1].toLowerCase(),ticker:symbol})}
  }
  if(/\b(compact|comfortable)\b/i.test(s)&&/\b(layout|density|table|view|mode)\b/i.test(s))operations.push({type:'density',value:/\bcompact\b/i.test(s)?'compact':'comfortable'});
  if(/\b(?:indices|index strip|market ticker)\b/i.test(s)&&/\b(?:hide|show)\b/i.test(s))operations.push({type:'indices',value:!/^\s*(?:please\s+)?hide\b/i.test(s)});
  if(/^(?:please\s+)?(?:pause|stop|resume|start|enable|disable|turn (?:on|off))\b/i.test(s)&&/\b(?:refresh|updates?|prices?|feed)\b/i.test(s))operations.push({type:'auto_refresh',value:!/\b(?:pause|stop|disable|off)\b/i.test(s),view});
  if(/^(?:please\s+)?refresh\b/i.test(s)&&/\b(?:prices?|quotes?|terminal|market|data)\b/i.test(s))operations.push({type:'refresh',view});
  const range=s.match(/\b(1|3|6)\s*(?:months?|m)\b|\b(1)\s*(?:years?|y)\b/i);
  if(range&&/\bchart|chart period\b/i.test(s))operations.push({type:'chart_range',value:range[1]?range[1]+'M':'1Y'});
  if(/\b(?:digest|announcements?|filings?)\b/i.test(s)&&/\b(?:window|period|last|past)\b/i.test(s)){
   const m=s.match(/\b(3|7|30)\s*days?\b|\b(24)\s*hours?\b|\b(week|month)\b/i);if(m)operations.push({type:'digest_window',value:m[1]?m[1]+'d':m[2]?'24h':m[3].toLowerCase()==='week'?'7d':'30d'});
  }
  if(/\b(?:clear|reset)\b.*\b(?:screener|screen|filters?)\b/i.test(s))operations.push({type:'clear_filters'});
  if(/^(?:please\s+)?(?:open|show|change|update|adjust)\s+(?:my\s+|the\s+)?(?:preferences|settings)\s*[.!]?$/i.test(s))operations.push({type:'open_preferences'});
  if(!operations.length){if(/\b(?:website|design|theme|colou?r|font)\b/i.test(s))return {error:'I can change table density, show/hide indices, preferences, charts, filters and terminal controls. Try “Use compact layout” or “Open settings”.'};if(/\b(?:preferences|settings|layout|density|alert threshold|refresh interval)\b/i.test(s))return {error:'Try “Set price alert to 5% and volume alert to 3x”, “Use compact layout”, or “Open settings”. Refresh is fixed at 15 seconds.'};return null}
  try{return validate({operations})}catch(error){return {error:error.message}}
 }
 function prepare(plan,current){
  const valid=validate(plan),next={prefs:{...current.prefs,categories:[...(current.prefs.categories||[])]},display:{...current.display},terminalExtra:[...(current.terminalExtra||[])],terminalSource:current.terminalSource},effects=[],changes=[];
  for(const o of valid.operations){
   if(o.type==='threshold'){next.prefs[o.key]=o.value;changes.push((o.key==='priceThreshold'?'Price alert: ±':'Volume alert: ')+o.value+(o.key==='priceThreshold'?'%':'×'))}
   else if(o.type==='focus'){next.prefs.categories=o.mode==='replace'?o.values:o.mode==='add'?[...new Set([...next.prefs.categories,...o.values])]:next.prefs.categories.filter(c=>!o.values.includes(c));changes.push('Alert categories updated')}
   else if(o.type==='density'){next.display.density=o.value;changes.push('Layout: '+o.value)}
   else if(o.type==='indices'){next.display.showIndices=o.value;changes.push('Market indices '+(o.value?'shown':'hidden'))}
   else if(o.type==='terminal_source'){next.terminalSource=o.value;effects.push(o);changes.push('Terminal source: '+o.value)}
   else if(o.type==='terminal_symbol'){
    if(o.mode==='remove'&&(current.watchlist||[]).includes(o.ticker))throw new Error('Portfolio symbols stay in the terminal. Manage your portfolio through its holdings import.');
    if(o.mode==='add'&&!(current.watchlist||[]).includes(o.ticker)&&!next.terminalExtra.includes(o.ticker)){if(next.terminalExtra.length>=10)throw new Error('The terminal supports ten custom symbols. Remove one first.');next.terminalExtra.push(o.ticker)}
    if(o.mode==='remove')next.terminalExtra=next.terminalExtra.filter(t=>t!==o.ticker);effects.push(o);changes.push(o.ticker+(o.mode==='add'?' added to':' removed from')+' terminal');
   }else{effects.push(o);changes.push(({open_preferences:'Settings opened',clear_filters:'Screener filters cleared',refresh:'Quote refresh requested',auto_refresh:'Automatic refresh '+(o.value?'resumed':'paused'),chart_range:'Chart period: '+o.value,digest_window:'Announcement window: '+o.value})[o.type])}
  }
  return {next,effects,changes};
 }
 return {parse,validate,prepare};
}
