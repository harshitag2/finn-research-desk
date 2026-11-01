import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzePortfolio, checkNumbers } from '../src/deep-dive.js';
import { parseCommand } from '../src/commands.js';
import createIntentTools from '../src/intent.js';

const corpus = JSON.parse(fs.readFileSync(new URL('../data/corpus.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-10-31T09:00:00Z');
function series(symbol, n = 250) {
  let h = 0; for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296);
  let p = symbol.startsWith('^') ? 20000 : 1000;
  return Array.from({ length: n }, (_, i) => (p *= 1 + (rnd() - 0.48) * 0.03 + Math.sin(i / 9) * 0.002));
}
function chart(symbol, failing) {
  if (failing.has(symbol)) return new Response('unavailable', { status: 503 });
  const closes = series(symbol), days = [];
  for (let t = Date.parse('2026-10-30T03:45:00Z') / 1000; days.length < closes.length; t -= 86400) { const d = new Date(t * 1000).getUTCDay(); if (d && d !== 6) days.unshift(t); }
  const ysym = symbol.startsWith('^') || symbol.endsWith('.NS') ? symbol : symbol + '.NS';
  return Response.json({ chart: { result: [{ meta: { symbol: ysym, currency: 'INR', currentTradingPeriod: { regular: { start: days.at(-1), end: days.at(-1) + 22500 } } }, timestamp: days, indicators: { quote: [{ close: closes, volume: closes.map((_, i) => (symbol === 'LT' && i === closes.length - 1 ? 9e6 : 1e6)) }], adjclose: [{ adjclose: closes }] } }] } });
}
const fetcherFor = (failing = new Set()) => async (url) => chart(decodeURIComponent(new URL(url).pathname.split('/').at(-1)).replace(/\.NS$/, ''), failing);
const holdings = [['INFY', 'Technology'], ['TCS', 'Technology'], ['HDFCBANK', 'Banking'], ['LT', 'Industrials'], ['MARUTI', 'Auto'], ['FAILCO', 'Auto']].map(([ticker, sector]) => ({ ticker, sector, name: ticker, weight: 1 }));
const run = (opts = {}) => analyzePortfolio({ prompt: 'Give me a deep analysis of my portfolio', holdings, corpus, env: {}, prefs: { priceThreshold: 4, volumeThreshold: 2 }, fetchOptions: { fetcher: fetcherFor(new Set(['FAILCO.NS', 'FAILCO'])), now: NOW }, ...opts });

test('without the benchmark the deep dive refuses to estimate', async () => {
  const r = await analyzePortfolio({ prompt: 'analyse', holdings, corpus, fetchOptions: { fetcher: fetcherFor(new Set(['^NSEI', 'FAILCO'])), now: NOW } });
  assert.equal(r.mode, 'unavailable');
  assert.equal(r.metrics, undefined);
  assert.match(r.gaps[0], /No figures are estimated/);
});

test('one prompt runs the whole tool plan and every observation is tied to computed metrics', async () => {
  const r = await run();
  assert.equal(r.mode, 'analysis');
  assert.deepEqual(r.trace.map((t) => t.tool), ['plan', 'fetch_histories', 'compute_risk_return', 'scan_alerts', 'compare_sectors', 'derive_insights', 'read_disclosures']);
  assert.equal(r.metrics.holdingsAnalysed, 5);
  assert.deepEqual(r.failures.map((f) => f.ticker), ['FAILCO']);
  assert.match(r.gaps.join(' '), /FAILCO: price history unavailable/);
  assert.match(r.gaps.join(' '), /No model is connected/);
  assert.ok(r.insights.length >= 3);
  for (const i of r.insights) for (const k of i.metricKeys) assert.ok(r.facts[k], 'insight ' + i.id + ' references a computed fact ' + k);
  assert.ok(r.alerts.some((a) => a.ticker === 'LT' && a.type === 'volume'), 'volume spike crosses the user threshold');
  assert.ok(r.evidence.length > 0 && r.evidence.every((e) => ['INFY', 'TCS', 'HDFCBANK', 'LT'].includes(e.ticker)), 'cited passages only from indexed holdings');
  assert.ok(r.insights.some((i) => i.kind === 'coverage' && i.tickers.includes('MARUTI')), 'uncovered holdings are reported as a source gap');
  assert.equal(r.series.portfolio.length, r.series.dates.length);
  assert.equal(r.correlation.matrix.length, 5);
  assert.match(r.method, /not your realised return/);
});

test('number checker accepts referenced metrics and cited passage numbers only', () => {
  const facts = { 'p.vol': { value: 12.345 }, 'p.ret': { value: -9.15 } };
  const evidence = [{ id: 'e1', text: 'We expect revenue growth of 3-5% in FY27 and margins of 20-22%.' }];
  assert.deepEqual(checkNumbers('Volatility is 12.3% and the return was -9.2%.', ['p.vol', 'p.ret'], [], facts, evidence), []);
  assert.deepEqual(checkNumbers('Management guided 3-5% growth for FY27 in Q4.', [], ['e1'], facts, evidence), []);
  assert.deepEqual(checkNumbers('The portfolio will return 37.4% next year.', ['p.vol'], [], facts, evidence), ['37.4']);
  assert.deepEqual(checkNumbers('Below the 200-day average for 3 holdings in 2026.', ['count'], [], {...facts,count:{value:3}}, evidence), []);
});

test('small invented percentages, ratios and counts cannot bypass number grounding',()=>{
  const facts={vol:{value:12.345},count:{value:3}};
  assert.deepEqual(checkNumbers('Expected return is 25% and beta is 2.', ['vol'], [], facts, []),['25','2']);
  assert.deepEqual(checkNumbers('Drawdown is 50 percent, with 14% volatility.', [], [], facts, []),['50','14']);
  assert.deepEqual(checkNumbers('There are 3 holdings.', [], [], facts, []),['3']);
  assert.deepEqual(checkNumbers('There are 3 holdings.', ['count'], [], facts, []),[]);
  assert.deepEqual(checkNumbers('Compare the 1Y return with Nifty 50 and the 200-day average.', [], [], facts, []),[]);
});

test('model synthesis is bounded, scope-checked and stripped of unsupported numbers', async () => {
  const previous = globalThis.fetch;
  let turn = 0;
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith('https://generativelanguage.googleapis.com/'));
    const user = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
    turn++;
    const reply = (x) => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(x) }] } }] });
    if (turn === 1) {
      assert.ok(user.facts.some((f) => f.key === 'portfolio.volatility'));
      return reply({ action: 'search_documents', args: { ticker: 'RELIANCE', query: 'refining margins' } });
    }
    const vol = user.facts?.find((f) => f.key === 'portfolio.volatility') || { value: '' };
    return reply({ action: 'finish', summary: 'Risk is moderate; expect 55.5% upside.', findings: [
      { text: 'Portfolio volatility is ' + vol.value + '.', metricKeys: ['portfolio.volatility'] },
      { text: 'Returns will be 41.2% next year.', metricKeys: ['portfolio.volatility'] },
      { text: 'A finding without any citation.' },
    ] });
  };
  try {
    const r = await run({ env: { GEMINI_API_KEY: 'test-key' } });
    assert.equal(r.mode, 'agent');
    assert.equal(r.synthesis.findings.length, 1);
    assert.match(r.synthesis.summary, /withheld/);
    assert.ok(r.trace.some((t) => t.tool === 'read_disclosures' && /outside the indexed portfolio scope/.test(t.detail)));
    assert.ok(r.trace.some((t) => t.tool === 'check_numbers' && /41\.2/.test(t.detail)));
  } finally {
    globalThis.fetch = previous;
  }
});

test('a failed refresh falls back to the earlier download and says so', async () => {
  const r = await analyzePortfolio({ prompt: 'analyse', holdings, corpus, fetchOptions: { fetcher: fetcherFor(new Set(['^NSEI', 'FAILCO.NS', 'FAILCO'])), now: NOW + 11 * 60000 } });
  assert.equal(r.mode, 'analysis');
  assert.match(r.gaps[0], /Provider refresh failed, so these histories are from an earlier download: Nifty 50/);
});

test('a model failure keeps the computed analysis', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { message: 'quota' } }, { status: 429 });
  try {
    const r = await run({ env: { GEMINI_API_KEY: 'test-key' } });
    assert.equal(r.mode, 'analysis');
    assert.ok(r.metrics.volatility > 0);
    assert.match(r.gaps.join(' '), /HTTP 429/);
  } finally {
    globalThis.fetch = previous;
  }
});

test('commands route deep dives, markets, screens and stock pages without breaking research or prices', () => {
  const c = [['INFY', 'Infosys'], ['TCS', 'Tata Consultancy Services'], ['HDFCBANK', 'HDFC Bank']].map(([ticker, name]) => ({ ticker, name }));
  const p = (q, ctx = { ticker: 'INFY', view: 'research' }) => parseCommand(q, ctx, c);
  assert.equal(p('Give me a deep analysis of my portfolio').action, 'analyze');
  assert.equal(p('How risky is my portfolio compared with the Nifty?').view, 'analysis');
  assert.equal(p('How is the market today?').action, 'markets');
  assert.equal(p('Show sector heatmap and top gainers').action, 'markets');
  const s = p('Which stocks are above their 200-day average with 1 year return above 10%?');
  assert.equal(s.action, 'screen');
  assert.deepEqual(s.screen.filters.map((f) => [f.metric, f.op, f.value]), [['aboveSma200', '=', true], ['return1Y', '>', 10]]);
  assert.deepEqual(p('Show the Infosys chart').tickers, ['INFY']);
  assert.equal(p('Show the chart').action, 'stock');
  assert.equal(p('Open my portfolio').action, 'navigate');
  assert.equal(p('What did management say about market share?').action, 'research');
  assert.equal(p('TCS current stock price').action, 'prices');
  assert.equal(p('Compare Infosys and TCS on FY27 growth guidance and show their stock prices').action, 'compare');
  assert.equal(p('Show prices for my portfolio').action, 'prices');
});

test('screen parser understands common phrasing and ignores what it cannot parse', () => {
  const { parseScreen } = createIntentTools();
  const f = (q) => parseScreen(q).filters.map((x) => [x.metric, x.op, x.value]);
  assert.deepEqual(f('oversold stocks near 52-week lows'), [['rsi14', '<', 30], ['position52', '<', 10]]);
  assert.deepEqual(f('volatility below 25% and beta under 0.8'), [['volatility', '<', 25], ['beta', '<', 0.8]]);
  assert.deepEqual(f('stocks more than 20% below their 52-week high'), [['fromHigh52', '<', -20]]);
  assert.deepEqual(f('within 5% of 52-week high with unusual volume'), [['fromHigh52', '>', -5], ['volumeRatio', '>', 2]]);
  assert.deepEqual(f('6 month return above 15% sorted by volatility'), [['return6M', '>', 15]]);
  assert.equal(parseScreen('6 month return above 15% sorted by lowest volatility').sort.metric, 'volatility');
  assert.equal(parseScreen('6 month return above 15% sorted by lowest volatility').sort.dir, 'asc');
  assert.equal(parseScreen('cheap stocks with great management').recognized, false);
});
