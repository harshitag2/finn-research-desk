// Endpoint tests for the deep dive, markets, universe/screener and stock pages, against the built Worker
// (run `npm run build` first). Yahoo daily histories are replaced by deterministic fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker from '../dist/server/index.js';

const failing = new Set(['DOWNCO']);
const seen = [];
function daily(symbol) {
  const n = 250, days = [];
  for (let t = Math.floor(Date.now() / 1000) - 86400 * 2; days.length < n; t -= 86400) { const d = new Date(t * 1000).getUTCDay(); if (d && d !== 6) days.unshift(t); }
  let p = symbol.startsWith('^') || symbol.startsWith('NIFTY') ? 20000 : 500 + symbol.length * 37;
  const close = days.map((_, i) => (p *= 1 + Math.sin(i / 7 + symbol.length) * 0.01 + 0.0004));
  return { chart: { result: [{ meta: { symbol: symbol.startsWith('^') || symbol.startsWith('NIFTY') ? symbol : symbol + '.NS', currency: 'INR' }, timestamp: days, indicators: { quote: [{ close, volume: close.map(() => 1e6) }], adjclose: [{ adjclose: close }] } }] } };
}
const real = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = String(typeof input === 'string' ? input : input.url);
  if (url.startsWith('https://query1.finance.yahoo.com/v8/finance/chart/')) {
    const u = new URL(url), raw = decodeURIComponent(u.pathname.split('/').at(-1)), sym = raw.startsWith('NIFTY') ? raw : raw.replace(/\.NS$/, '');
    seen.push(sym);
    if (failing.has(sym)) return new Response('down', { status: 503 });
    assert.equal(u.searchParams.get('interval'), '1d');
    return Response.json(daily(sym));
  }
  if (url.startsWith('https://generativelanguage.googleapis.com/')) throw new Error('No model call expected in these tests');
  return real(input, options);
};
const call = (path, body) => worker.fetch(new Request('https://finn.test' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), {}, {});

test('/api/analyze rejects nonlisted asset classes before requesting stock history',async()=>{
 const before=seen.length,response=await call('/api/analyze',{holdings:[{ticker:'120503',assetType:'Mutual Funds',marketValue:100000}]});
 assert.equal(response.status,400);assert.match((await response.json()).error,/snapshot allocation/);assert.equal(seen.length,before);
});

test('/api/analyze runs the deep dive on the illustrative watchlist by default', async () => {
  const r = await (await call('/api/analyze', { prompt: 'How risky is my portfolio?' })).json();
  assert.equal(r.mode, 'analysis');
  assert.equal(r.metrics.holdingsRequested, 18);
  assert.equal(r.metrics.holdingsAnalysed, 18);
  assert.ok(Number.isFinite(r.metrics.volatility) && Number.isFinite(r.metrics.beta));
  assert.equal(r.insights[0].kind, 'risk', 'a risk question puts risk observations first');
  assert.ok(seen.includes('^NSEI') && seen.includes('^CNXIT'), 'benchmark and sector indices are fetched');
});

test('/api/analyze uses imported market values as weights and validates holdings', async () => {
  const r = await (await call('/api/analyze', { holdings: [{ ticker: 'INFY', marketValue: 300000, sector: 'Technology' }, { ticker: 'DOWNCO', marketValue: 100000 }, { ticker: 'TCS', marketValue: 100000, sector: 'Technology' }] })).json();
  assert.deepEqual(r.holdings.map((h) => [h.ticker, h.weight]), [['INFY', 75], ['TCS', 25]], 'weights renormalise over holdings with history');
  assert.deepEqual(r.failures.map((f) => f.ticker), ['DOWNCO']);
  assert.equal((await call('/api/analyze', { holdings: [{ ticker: '../x', weight: 1 }] })).status, 400);
  assert.equal((await call('/api/analyze', { holdings: [{ ticker: 'INFY', weight: -1 }] })).status, 400);
});

test('/api/markets returns verified NSE/BSE index series with period returns', async () => {
  const r = await (await call('/api/markets')).json();
  const nifty = r.indices.find((i) => i.symbol === '^NSEI');
  assert.equal(nifty.name, 'Nifty 50');
  assert.ok(Number.isFinite(nifty.returns['1Y']) && nifty.spark.length > 10);
  assert.equal(r.indices.length, 18);
  assert.ok(r.indices.every((i) => i.error || i.sessionDate));
});

test('/api/universe feeds the screener and reports failures separately', async () => {
  const r = await (await call('/api/universe?tickers=INFY,TCS,DOWNCO')).json();
  assert.deepEqual(r.stocks.map((s) => s.ticker), ['INFY', 'TCS']);
  assert.deepEqual(r.failures.map((f) => f.ticker), ['DOWNCO']);
  assert.ok(['aboveSma200', 'rsi14', 'volatility', 'fromHigh52', 'volumeRatio'].every((k) => k in r.stocks[0]));
  assert.equal((await call('/api/universe?tickers=../x')).status, 400);
  assert.equal((await call('/api/universe?tickers=' + Array.from({ length: 41 }, (_, i) => 'T' + i).join(','))).status, 400);
});

test('/api/stock returns the chart series, index comparison and peers, and never estimates a missing price', async () => {
  const r = await (await call('/api/stock?ticker=INFY&sector=Technology&peers=TCS,HCLTECH')).json();
  assert.equal(r.metrics.series.close.length, 250);
  assert.equal(r.relative.sector.name, 'Nifty IT');
  assert.equal(r.relative.stock[0], 100);
  assert.deepEqual(r.peers.map((p) => p.ticker), ['TCS', 'HCLTECH']);
  const down = await call('/api/stock?ticker=DOWNCO');
  assert.equal(down.status, 502);
  assert.match((await down.json()).error, /No prices are estimated/);
});

test('served browser bundle includes the chart kit and compiles', async () => {
  const code = await (await call('/app.js')).text();
  assert.doesNotThrow(() => new vm.Script(code));
  assert.match(code, /viz-tip/);
  assert.match(code, /Portfolio deep dive/);
  const html = await (await call('/')).text();
  assert.match(html, /data-view="analysis"/);
  assert.match(html, /data-view="markets"/);
});
