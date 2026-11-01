// Deliberately self-contained, like client.js and portfolio.js: the Worker uses this factory on the
// server and also serializes it into /app.js so the browser and server classify requests identically.
// Do not reference module-scope values or imports from inside the function. Avoid regex lookbehind
// (unsupported by older iOS Safari, which would break the whole browser bundle).
export default function createIntentTools() {
  'use strict';

  const aliases = {
    INFY: ['infosys'],
    TCS: ['tata consultancy', 'tata consultancy services'],
    HCLTECH: ['hcl', 'hcltech', 'hcl tech'],
    LT: ['l&t', 'larsen', 'larsen & toubro', 'larsen and toubro'],
    HDFCBANK: ['hdfc bank'],
    ICICIBANK: ['icici bank'],
    RELIANCE: ['reliance'],
    BHARTIARTL: ['airtel', 'bharti airtel'],
    HINDUNILVR: ['hul', 'hindustan unilever'],
    SUNPHARMA: ['sun pharma'],
    DRREDDY: ['dr reddy', 'dr. reddy', 'dr reddys', "dr reddy's"],
    MARUTI: ['maruti'],
    'M&M': ['mahindra', 'mahindra & mahindra'],
    TITAN: ['titan'],
    ASIANPAINT: ['asian paints'],
    ULTRACEMCO: ['ultratech'],
    TATASTEEL: ['tata steel'],
    PIDILITIND: ['pidilite'],
  };

  // Uppercase words that are finance vocabulary or commands, not company symbols.
  const NOT_SYMBOLS = new Set(
    ('NSE BSE INR USD US UK EU IT AI GST CEO CFO COO MD AGM EGM QIP IPO OFS PDF CSV EBITDA EBIT PAT PBT EPS ROE ROCE ROA NIM NPA GNPA NNPA ' +
      'CASA FCF CAGR ARPU YOY QOQ TTM LTP CMP OK SHOW OPEN COMPARE PRICES PRICE GUIDANCE RESEARCH EXPORT SAVE AND THE FOR OF')
      .split(' '),
  );

  const NOUN = /\b(prices?|quotes?|ltp|cmp|bhav(?:copy)?)\b/gi;
  const PLACEHOLDER = /^xco\d+x$/;

  // Market-price cues. Business pricing (power, increases, inputs, targets) is checked first.
  const BUSINESS_WORDS = [
    'input', 'inputs', 'raw', 'materials?', 'commodit(?:y|ies)', 'steel', 'iron', 'ore', 'crude', 'oil', 'gas', 'lng', 'fuel', 'diesel',
    'petrol', 'energy', 'coal', 'power', 'electricity', 'cement', 'metals?', 'alumini?um', 'copper', 'zinc', 'rubber', 'palm', 'gold',
    'silver', 'food', 'grain', 'wheat', 'wage', 'labou?r', 'products?', 'selling', 'realis(?:ation|ed)', 'realiz(?:ation|ed)', 'transfer',
    'contract', 'deal', 'unit', 'list', 'offer', 'issue', 'ipo', 'exercise', 'strike', 'floor', 'target', 'fair', 'intrinsic', 'import',
    'export', 'wholesale', 'retail', 'consumer', 'tariffs?', 'freight', 'shipping', 'components?', 'chips?', 'memory', 'drugs?', 'generics?',
    'api', 'asp', 'service', 'services', 'subscription', 'ticket', 'room', 'property', 'housing', 'land', 'home', 'car', 'vehicle', 'mrp',
    'procurement', 'purchase', 'bond', 'treasury', 'spot', 'benchmark', 'menu', 'tea', 'coffee', 'cotton', 'yarn', 'paper', 'pulp',
  ];
  const BUSINESS_BEFORE = new RegExp('\\b(?:' + BUSINESS_WORDS.join('|') + ')[\\s-]+$', 'i');
  const BUSINESS_VERB_BEFORE =
    /\b(?:rais(?:e|es|ed|ing)|increas(?:e|es|ed|ing)|hik(?:e|es|ed|ing)|cut|cuts|cutting|lower(?:ed|ing)?|reduc(?:e|es|ed|ing)|take|takes|took|taken|taking|pass(?:es|ed|ing)?\s+(?:on|through)|set|sets|setting|charg(?:e|es|ed|ing)|negotiat(?:e|es|ed|ing)|(?:rise|rising|fall|decline|drop|increase|inflation|volatility|softening|movement|changes?|swings?)\s+in)\s+(?:its\s+|their\s+|the\s+|our\s+|higher\s+|lower\s+)?$/i;
  const TARGET_AFTER =
    /^[\s-]*(?:targets?|bands?|to[\s-](?:earnings|book|sales)|\/\s*(?:earnings|book|e|b|sales)\b|multiples?|ratio)/i;
  const BUSINESS_AFTER =
    /^[\s-]*(?:increases?|hikes?|cuts?|reductions?|rises?|rising|inflation|deflation|pressures?|erosion|realis\w*|realiz\w*|wars?|competition|competitiveness|elasticity|discovery|sensitivity|mix|points?|tiers?|plans?|caps?|controls?|regulations?|negotiations?|escalations?|pass[\s-]?through|parity|hedg\w*|per\s+(?:unit|tonne|ton|kg|litre|liter|sq|square|barrel|mmbtu|kwh)|(?:were|was|have been|has been|had been)\s+(?:raised|cut|increased|reduced|hiked))/i;
  const BUSINESS_OBJECT_AFTER =
    /^\s+(?:of|for|on)\s+(?:the\s+|its\s+|their\s+|our\s+)?(?:steel|crude|oil|gas|inputs?|raw|commodit|products?|services?|cement|power|electricity|coal|fuel|homes?|cars?|vehicles?|drugs?|medicines?|goods|materials?|components?|food|tea|coffee)/i;
  const STRONG_MARKET_BEFORE =
    /(?:\b(?:stock|stocks|share|shares|equity|market|trading|traded|closing|last[\s-]traded|nse|bse|intraday|live|real[\s-]?time)|xco\d+x(?:'s|'|s)?)\s+(?:(?:stock|share|market|trading|closing|current|latest|live)\s+)?$/i;
  const WEAK_MARKET_BEFORE = /\b(?:current|latest|today'?s|delayed|recent)\s+$/i;
  const DISPLAY_BEFORE =
    /\b(?:show|shows|showing|give|get|fetch|display|pull|check|track|see|add|include|including|list|bring\s+up|update|refresh|load|what(?:'s|\s+is|\s+are|\s+were)|how\s+much\s+(?:is|are)|tell\s+me)\s+(?:me\s+|us\s+)?(?:(?:the|their|its|both|all|these|those|each|current|latest|live|today'?s)\s+)*$/i;
  const OBJECT_AFTER =
    /^\s+(?:for|of|on)\s+(?:the\s+)?(?:xco\d+x|their|its|them|both|these|those|all|my|each|the\s+(?:stocks?|shares|companies))|^\s+xco\d+x/i;
  const DETERMINERS_ONLY = /^\s*(?:(?:the|their|its|both|all|these|those|each)\s+)+$/i;
  const DISPLAY_VERB = /\b(?:show|give|fetch|display|get|include|add|pull|track|load|refresh)\b/i;
  const SPEECH =
    /\b(?:management|managements|ceo|cfo|md|coo|chair(?:man|person|woman)?|founders?|promoters?|analysts?|said|says|say|saying|stated|comments?|commentary|remarks?|transcripts?|con-?calls?|calls?|verbatim|statements?|words|testimonials?|interviews?)\b/i;
  const TRADING_PHRASE =
    /\btrad(?:ing|es)\s+at\b|\bhow\s+(?:is|are)\b[^.?!,;]{0,40}\btrading(?:\s+(?:today|now|right\s+now))?\s*[?.!]?\s*$/i;
  const RESEARCH =
    /\b(?:guidance|guided?|outlook|forecasts?|targets?|revenues?|sales|growth|grow(?:ing|n)?|margins?|ebitda|ebit|profits?|profitability|pat|pbt|earnings|eps|income|cash|cashflows?|fcf|debt|borrowings?|leverage|capex|capital|orders?|backlog|deals?|wins?|loans?|deposits?|nim|npas?|assets?|credit|provisions?|management|ceo|cfo|commentary|said|says|say|strategy|strategic|risks?|headwinds?|tailwinds?|demand|pricing|costs?|inflation|governance|allocation|dividends?|buybacks?|valuations?|annual|reports?|transcripts?|calls?|concalls?|segments?|business|thesis|bull|bear|fundamentals?|balance|sheet|working|receivables?|attrition|headcount|utili[sz]ation|results?|quarters?|quarterly|q[1-4]|fy\s?\d{2,4}|h[12]|explain|why|analy[sz]e|analysis|investigate|research|trends?|trajector(?:y|ies)|narrative|promised?|delivered?|execution|clients?|customers?|volumes?|subscribers?|arpu|exposure|competition|competitive|moat|cagr|roe|roce|roa|payout|acquisitions?|merger|expansion|capacity|plants?|launch(?:es)?|products?|exports?|imports?|regulat\w*|litigation|pledg\w*|insider|ratings?|performance|operations?|operating)\b/i;
  const FILLER = new Set(
    ('show shows showing give get fetch display pull check track see add include including list bring up update refresh load me us the their ' +
      "its both all these those each current latest live today todays today's now right currently what whats what's is are was were how much " +
      'please too also as well and plus with for of on in at a an nse bse stock stocks share shares market trading traded price prices quote ' +
      'quotes ltp cmp bhav bhavcopy them it they compare comparing versus vs side by between data level levels rs inr again same can you could ' +
      'would i want need to know tell do does there where which delayed real time realtime intraday closing last value values figure figures ' +
      'number numbers lookup look view workspace desk card cards ticker tickers symbol symbols company companies along alongside together then ' +
      'my our just only quick quickly')
      .split(' '),
  );
  const SEPARATOR =
    /(\s*(?:[,;]|\.(?=\s)|\?(?=\s)|!(?=\s)|\b(?:and|also|plus|as well as|along with|alongside|together with|with|then)\b)\s*)/i;

  function entityNames(companies) {
    return (Array.isArray(companies) ? companies : []).flatMap((c) =>
      typeof c === 'string' ? [c] : [c?.ticker, c?.name, ...(aliases[c?.ticker] || [])],
    );
  }

  // Replace company names and symbols with stable placeholders (xco0x, xco1x…) so that
  // "Tata Steel price" is read as a company followed by price, not steel prices.
  function mask(text, entities) {
    const lower = text.toLowerCase();
    const taken = new Uint8Array(text.length);
    const spans = [];
    const claim = (start, end) => {
      for (let i = start; i < end; i++) if (taken[i]) return;
      for (let i = start; i < end; i++) taken[i] = 1;
      spans.push([start, end]);
    };
    const names = [...new Set((entities || []).map((e) => String(e || '').trim()).filter((e) => e.length >= 2))].sort(
      (a, b) => b.length - a.length,
    );
    for (const name of names) {
      const needle = name.toLowerCase();
      for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + 1)) {
        const end = at + needle.length;
        if (!/[a-z0-9]/.test(lower[at - 1] || '') && !/[a-z0-9]/.test(lower[end] || '')) claim(at, end);
      }
    }
    const letters = text.replace(/[^A-Za-z]/g, '');
    const shouting = letters.length > 8 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6;
    if (!shouting)
      for (const m of text.matchAll(/\$?\b([A-Z][A-Z0-9&-]{1,23})(?:\.NS|\.BO)?\b/g)) {
        const symbol = m[1];
        if (NOT_SYMBOLS.has(symbol) || /^(?:FY\d+|Q[1-4](?:FY\d+)?|H[12](?:FY\d+)?|\d+)$/.test(symbol)) continue;
        claim(m.index, m.index + m[0].length);
      }
    spans.sort((a, b) => a[0] - b[0]);
    const found = [];
    let masked = '';
    let last = 0;
    for (const [start, end] of spans) {
      masked += text.slice(last, start) + 'xco' + found.length + 'x';
      found.push(text.slice(start, end));
      last = end;
    }
    return { masked: masked + text.slice(last), found };
  }
  const unmask = (text, found) => text.replace(/xco(\d+)x/g, (_, i) => found[Number(i)] ?? '');

  function isMarketNoun(clause, index, word, fullText) {
    const w = word.toLowerCase();
    if (w === 'ltp' || w === 'cmp' || w.startsWith('bhav')) return true;
    const before = clause.slice(0, index);
    const after = clause.slice(index + word.length);
    if (w.startsWith('quote')) {
      if (/\b(?:stock|share|market|live|latest|current|price|nse|bse|real[\s-]?time|delayed|intraday)\s+$/i.test(before)) return true;
      if (SPEECH.test(fullText)) return false;
      return (
        STRONG_MARKET_BEFORE.test(before) ||
        DISPLAY_BEFORE.test(before) ||
        OBJECT_AFTER.test(after) ||
        DETERMINERS_ONLY.test(before) ||
        (!before.trim() && DISPLAY_VERB.test(fullText))
      );
    }
    if (BUSINESS_BEFORE.test(before) || TARGET_AFTER.test(after) || BUSINESS_OBJECT_AFTER.test(after)) return false;
    if (STRONG_MARKET_BEFORE.test(before)) return true;
    if (BUSINESS_VERB_BEFORE.test(before) || BUSINESS_AFTER.test(after)) return false;
    if (WEAK_MARKET_BEFORE.test(before) || DISPLAY_BEFORE.test(before) || OBJECT_AFTER.test(after)) return true;
    if (DETERMINERS_ONLY.test(before)) return true;
    return !before.trim() && DISPLAY_VERB.test(fullText) && !RESEARCH.test(after);
  }

  const words = (text) =>
    (text.toLowerCase().replace(/'s\b/g, '').match(/[a-z0-9&]+/g) || []).filter((t) => !PLACEHOLDER.test(t));

  // Classifies whether a request asks for traded stock prices and returns the question that should
  // reach company documents. Clauses that only ask for prices are removed from the document query;
  // business pricing topics (pricing power, input-price inflation, price targets) are left intact.
  function marketIntent(query, entities = []) {
    const original = String(query || '').replace(/\s+/g, ' ').trim();
    if (!original) return { requested: false, quotesOnly: false, documentQuery: '', unresolved: [] };
    const { masked, found } = mask(original, entities);
    const parts = masked.split(SEPARATOR);
    const clauses = [];
    for (let i = 0; i < parts.length; i += 2) clauses.push({ text: parts[i] || '', separator: i ? parts[i - 1] : '' });
    let requested = false;
    for (const clause of clauses) {
      let market = TRADING_PHRASE.test(clause.text);
      for (const m of clause.text.matchAll(NOUN)) if (isMarketNoun(clause.text, m.index, m[0], masked)) market = true;
      const residual = words(clause.text.replace(NOUN, ' ')).filter((t) => !FILLER.has(t));
      clause.market = market;
      clause.residual = residual;
      clause.marketOnly = market && !residual.length;
      clause.fillerOnly = !market && !residual.length;
      if (market) requested = true;
    }
    if (!requested) return { requested: false, quotesOnly: false, documentQuery: original, unresolved: [] };
    clauses.forEach((c) => (c.drop = c.marketOnly));
    for (let changed = true; changed; ) {
      changed = false;
      clauses.forEach((c, i) => {
        if (!c.drop && c.fillerOnly && (clauses[i - 1]?.drop || clauses[i + 1]?.drop)) changed = c.drop = true;
      });
    }
    let rebuilt = '';
    clauses.forEach((c, i) => {
      if (c.drop || !c.text.trim()) return;
      rebuilt += (rebuilt ? c.separator : '') + c.text;
      // Keep sentence punctuation that separated this clause from a removed price clause.
      const next = clauses[i + 1];
      const mark = next && next.drop ? (next.separator.match(/[?.!]/) || [''])[0] : '';
      if (mark && !/[?.!]$/.test(rebuilt)) rebuilt += mark;
    });
    let documentQuery = unmask(rebuilt, found)
      .replace(/\s+([?.!,;])/g, '$1')
      .replace(/^[\s,;.]+|[\s,;]+$/g, '')
      .replace(/\s+(?:and|also|plus|with|then)$/i, '')
      .trim();
    if (documentQuery && /[?]$/.test(original) && !/[?.!]$/.test(documentQuery)) documentQuery += '?';
    const kept = clauses.filter((c) => !c.drop);
    const researchLeft = kept.some((c) => RESEARCH.test(c.text) || c.residual.some((t) => RESEARCH.test(t)));
    const unresolved = researchLeft ? [] : [...new Set(kept.flatMap((c) => c.residual))].filter((t) => t.length > 1);
    return { requested: true, quotesOnly: !researchLeft, documentQuery: researchLeft ? documentQuery : '', unresolved };
  }

  // Natural-language screen → validated filter list over price-derived metrics. Unknown phrases are ignored
  // (and reported), never guessed. Metric ids match the screener columns in the browser.
  const SCREEN_LABELS = {
    change1D: 'Day change %', return1W: '1W return %', return1M: '1M return %', return3M: '3M return %', return6M: '6M return %',
    returnYTD: 'YTD return %', return1Y: '1Y return %', volatility: 'Volatility %', beta: 'Beta', fromHigh52: 'From 52W high %',
    position52: 'Position in 52W range %', rsi14: 'RSI (14)', aboveSma50: 'Above 50-day avg', aboveSma200: 'Above 200-day avg',
    volumeRatio: 'Volume vs 20-day avg', dividendYield: 'Trailing dividend yield %', drawdownFromPeak: 'Below 1Y peak %',
  };
  function parseScreen(text, { volumeThreshold = 2 } = {}) {
    const s = String(text || '').toLowerCase().replace(/[’']/g, '');
    const filters = [];
    const add = (metric, op, value) => { if (!filters.some((f) => f.metric === metric && f.op === op)) filters.push({ metric, op, value, label: SCREEN_LABELS[metric] }); };
    const GT = /^(above|over|greater than|more than|higher than|at least|>|>=)$/;
    const opOf = (w) => (GT.test(w) ? '>' : '<');
    const CMP = '(above|over|greater than|more than|higher than|at least|>=|>|below|under|less than|lower than|at most|<=|<)';
    for (const m of s.matchAll(/\b(above|over|below|under)\s+(?:their|the|its)?\s*(50|200)[\s-]?(?:day|d)\b(?:\s*(?:moving\s+)?(?:average|dma|sma|ma))?/g))
      add(m[2] === '50' ? 'aboveSma50' : 'aboveSma200', '=', m[1] === 'above' || m[1] === 'over');
    const periods = [
      ['return1Y', '(?:1[\\s-]?(?:year|yr|y)|one[\\s-]year|12[\\s-]month|annual|1y)'], ['returnYTD', '(?:ytd|year[\\s-]to[\\s-]date)'],
      ['return6M', '(?:6[\\s-]?(?:month|m)|six[\\s-]month)'], ['return3M', '(?:3[\\s-]?(?:month|m)|three[\\s-]month)'],
      ['return1M', '(?:1[\\s-]?(?:month|m)|one[\\s-]month)'], ['return1W', '(?:1[\\s-]?(?:week|w)|one[\\s-]week)'],
    ];
    for (const [metric, p] of periods)
      for (const m of s.matchAll(new RegExp('\\b' + p + '\\s+(?:return|returns|gain|gains|performance)\\s+(?:of\\s+)?' + CMP + '\\s+(-?\\d+(?:\\.\\d+)?)\\s*%?', 'g'))) add(metric, opOf(m[1]), Number(m[2]));
    for (const m of s.matchAll(new RegExp('\\bvolatility\\s+(?:of\\s+)?' + CMP + '\\s+(\\d+(?:\\.\\d+)?)\\s*%?', 'g'))) add('volatility', opOf(m[1]), Number(m[2]));
    for (const m of s.matchAll(new RegExp('\\bbeta\\s+(?:of\\s+)?' + CMP + '\\s+(\\d+(?:\\.\\d+)?)', 'g'))) add('beta', opOf(m[1]), Number(m[2]));
    if (/\blow[\s-]beta\b/.test(s)) add('beta', '<', 1);
    if (/\bhigh[\s-]beta\b/.test(s)) add('beta', '>', 1);
    for (const m of s.matchAll(new RegExp('\\brsi\\s*(?:\\(?14\\)?)?\\s+' + CMP + '\\s+(\\d+(?:\\.\\d+)?)', 'g'))) add('rsi14', opOf(m[1]), Number(m[2]));
    if (/\boversold\b/.test(s)) add('rsi14', '<', 30);
    if (/\boverbought\b/.test(s)) add('rsi14', '>', 70);
    for (const m of s.matchAll(/within\s+(\d+(?:\.\d+)?)\s*%\s+of\s+(?:their|the|its)?\s*52[\s-]?week\s+highs?/g)) add('fromHigh52', '>', -Number(m[1]));
    if (/\bnear\s+(?:their|the|its)?\s*52[\s-]?week\s+highs?\b/.test(s)) add('fromHigh52', '>', -5);
    for (const m of s.matchAll(/(?:more than\s+|at least\s+)?(\d+(?:\.\d+)?)\s*%\s+(?:or more\s+)?(?:below|off|under)\s+(?:their|the|its)?\s*52[\s-]?week\s+highs?/g)) add('fromHigh52', '<', -Number(m[1]));
    if (/\bnear\s+(?:their|the|its)?\s*52[\s-]?week\s+lows?\b/.test(s)) add('position52', '<', 10);
    if (/\b(?:volume spikes?|unusual volume|high volume|volume surge)\b/.test(s)) add('volumeRatio', '>', volumeThreshold);
    for (const m of s.matchAll(new RegExp('\\bdividend yield\\s+(?:of\\s+)?' + CMP + '\\s+(\\d+(?:\\.\\d+)?)\\s*%?', 'g'))) add('dividendYield', opOf(m[1]), Number(m[2]));
    if (/\b(?:dividend payers|pay(?:s|ing)? dividends)\b/.test(s)) add('dividendYield', '>', 0);
    for (const m of s.matchAll(/\b(?:drawdown|down from (?:the|their|its)? ?peak)\s+(?:worse than|deeper than|of more than|more than|greater than|over|beyond)\s+(\d+(?:\.\d+)?)\s*%/g)) add('drawdownFromPeak', '<', -Number(m[1]));
    if (/\b(?:gainers|up today|rose today|advanc(?:ers|ing))\b/.test(s)) add('change1D', '>', 0);
    if (/\b(?:losers|down today|fell today|declin(?:ers|ing))\b/.test(s)) add('change1D', '<', 0);
    const sortMap = [['return1Y', /1[\s-]?y(?:ear)? return|one[\s-]year return|annual return/], ['return1M', /1[\s-]?m(?:onth)? return/], ['volatility', /volatility/], ['beta', /beta/], ['rsi14', /rsi/], ['fromHigh52', /52[\s-]?week/], ['dividendYield', /dividend yield/], ['volumeRatio', /volume/], ['change1D', /day(?:'s)? (?:change|move)|today/]];
    const sortText = (s.match(/\b(?:sort(?:ed)?|rank(?:ed)?|order(?:ed)?)\s+by\s+([^,.;]+)/) || [])[1] || '';
    const sortMetric = sortText ? (sortMap.find(([, r]) => r.test(sortText)) || [])[0] : null;
    const sort = sortMetric ? { metric: sortMetric, dir: /\b(?:lowest|ascending|least|smallest)\b/.test(sortText) ? 'asc' : 'desc' } : filters[0] ? { metric: filters[0].metric, dir: filters[0].op === '<' ? 'asc' : 'desc' } : { metric: 'return1Y', dir: 'desc' };
    return { filters, sort, recognized: filters.length > 0 || Boolean(sortMetric) };
  }

  return { marketIntent, entityNames, aliases, parseScreen, SCREEN_LABELS };
}
