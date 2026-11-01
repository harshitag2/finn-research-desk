// Endpoint regression tests for the stock-price fix. They exercise the built Worker (run `npm run build`
// first) with the two external upstreams replaced by fixtures: Yahoo's chart API and Gemini.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker from '../dist/server/index.js';

const NOW = Date.now();
const upstream = { yahoo: [], gemini: [], failYahoo: new Set() };
function chart(ticker) {
  const t = Math.floor(NOW / 1000) - 120;
  return {
    chart: { result: [{
      meta: { symbol: ticker + '.NS', currency: 'INR', regularMarketPrice: 1234.5, previousClose: 1200, regularMarketTime: t, exchangeDataDelayedBy: 0, fullExchangeName: 'NSE', currentTradingPeriod: { regular: { start: t - 20000, end: t + 60 } } },
      timestamp: [t - 60, t], indicators: { quote: [{ close: [1230, 1234.5] }] },
    }] },
  };
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, options = {}) => {
  const url = String(typeof input === 'string' ? input : input.url);
  if (url.startsWith('https://query1.finance.yahoo.com/v8/finance/chart/')) {
    const ticker = decodeURIComponent(new URL(url).pathname.split('/').at(-1)).replace(/\.NS$/, '');
    upstream.yahoo.push(ticker);
    return upstream.failYahoo.has(ticker) ? new Response('unavailable', { status: 503 }) : Response.json(chart(ticker));
  }
  if (url.startsWith('https://generativelanguage.googleapis.com/')) {
    const user = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
    upstream.gemini.push(user);
    const gaps = /price|quote/i.test(user.question || '') ? ['Stock price data is not available in the provided financial documents.'] : [];
    const first = [...new Map((user.initialEvidence || []).map((e) => [e.ticker, e])).values()];
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ action: 'finish', findings: first.map((e) => ({ text: e.ticker + ' finding', evidenceIds: [e.id] })), gaps }) }] } }] });
  }
  return realFetch(input, options);
};
const call = (path, body, env = {}) =>
  worker.fetch(new Request('https://finn.test' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), env, {});
const reset = () => { upstream.yahoo.length = 0; upstream.gemini.length = 0; };
const MIXED = 'Compare Infosys and TCS on FY27 growth guidance and show their stock prices';

test('/api/compare: the reported request returns two quotes and cited research without a price gap', async () => {
  reset();
  const r = await (await call('/api/compare', { tickers: ['INFY', 'TCS'], query: MIXED }, { GEMINI_API_KEY: 'test-key' })).json();
  assert.equal(r.mode, 'agent');
  assert.equal(r.findings.length, 2);
  assert.ok(r.findings.every((f) => f.evidenceIds.every((id) => r.evidence.some((e) => e.id === id))));
  assert.equal(r.market.status, 'ready');
  assert.deepEqual(r.market.quotes.map((q) => q.ticker), ['INFY', 'TCS']);
  assert.ok(r.market.quotes.every((q) => q.price === 1234.5 && q.currency === 'INR' && q.asOf && q.marketState && 'delayMinutes' in q));
  assert.deepEqual(r.gaps, []);
  assert.equal(upstream.gemini.length, 1);
  assert.doesNotMatch(upstream.gemini[0].question, /price/i);
  assert.equal(r.query, MIXED);
});

test('/api/research (company research form path) also runs the market step', async () => {
  reset();
  const r = await (await call('/api/research', { ticker: 'HDFCBANK', query: 'What did management say about loan growth, and what is the current share price?' })).json();
  assert.equal(r.mode, 'evidence');
  assert.ok(r.evidence.length && r.evidence.every((e) => e.ticker === 'HDFCBANK'));
  assert.equal(r.market.status, 'ready');
  assert.deepEqual(upstream.yahoo, ['HDFCBANK']);
  assert.ok(!r.gaps.some((g) => /price/i.test(g)));
});

test('price-only research and comparison requests never call Gemini, even when a key is configured', async () => {
  reset();
  const env = { GEMINI_API_KEY: 'test-key' };
  const single = await (await call('/api/research', { ticker: 'TCS', query: 'TCS current stock price' }, env)).json();
  const pair = await (await call('/api/compare', { tickers: ['INFY', 'TCS'], query: 'Compare Infosys and TCS stock prices' }, env)).json();
  const uncovered = await (await call('/api/research', { ticker: 'PIDILITIND', query: 'PIDILITIND current stock price' }, env)).json();
  for (const r of [single, pair, uncovered]) {
    assert.equal(r.mode, 'market');
    assert.equal(r.market.status, 'ready');
    assert.equal(r.evidence.length, 0);
  }
  assert.equal(upstream.gemini.length, 0);
});

test('mixed request for an uncovered company shows its quote and the source-coverage path', async () => {
  reset();
  const r = await (await call('/api/research', { ticker: 'PIDILITIND', query: 'What is Pidilite volume growth guidance and its share price?' }, { GEMINI_API_KEY: 'test-key' })).json();
  assert.equal(r.mode, 'coverage');
  assert.equal(r.market.status, 'ready');
  assert.equal(r.market.quotes[0].ticker, 'PIDILITIND');
  assert.equal(upstream.gemini.length, 0);
});

test('a provider failure is reported as market data, not as a missing document', async () => {
  reset();
  upstream.failYahoo.add('LT');
  try {
    const r = await (await call('/api/research', { ticker: 'LT', query: 'What is the FY26 revenue guidance and the current share price?' })).json();
    assert.equal(r.mode, 'evidence');
    assert.ok(r.evidence.length > 0, 'document research remains usable');
    assert.equal(r.market.status, 'unavailable');
    assert.equal(r.market.quotes[0].price, null);
    assert.match(r.market.quotes[0].error, /HTTP 503/);
    assert.ok(!r.gaps.some((g) => /price/i.test(g)));
    const retry = await (await call('/api/quotes?tickers=LT')).json();
    assert.equal(retry.quotes[0].price, null, 'a retry does not invent a price while the provider is down');
  } finally {
    upstream.failYahoo.delete('LT');
  }
  const recovered = await (await call('/api/quotes?tickers=LT')).json();
  assert.equal(recovered.quotes[0].price, 1234.5, 'the quote-only retry path recovers independently');
});

test('the browser can ask the server to skip quotes it fetches itself', async () => {
  reset();
  const r = await (await call('/api/compare', { tickers: ['INFY', 'TCS'], query: MIXED, separateMarket: true })).json();
  assert.equal(r.market, undefined);
  assert.equal(r.marketRequested, true);
  assert.equal(r.documentQuery, 'Compare Infosys and TCS on FY27 growth guidance');
  assert.deepEqual(upstream.yahoo, []);
});

test('/api/command keeps the selected companies for follow-ups and separates pricing topics', async () => {
  const plan = async (prompt, context) => (await call('/api/command', { prompt, context })).json();
  const followUp = await plan('show their prices', { ticker: 'INFY', tickers: ['INFY', 'TCS'], view: 'research' });
  assert.equal(followUp.action, 'prices');
  assert.deepEqual(followUp.tickers, ['INFY', 'TCS']);
  const mixed = await plan(MIXED, { ticker: 'HDFCBANK' });
  assert.equal(mixed.action, 'compare');
  assert.equal(mixed.includePrices, true);
  const topic = await plan('What does management say about pricing power and input prices?', { ticker: 'HDFCBANK' });
  assert.equal(topic.action, 'research');
  assert.equal(topic.includePrices, false);
  const target = await plan('What price targets do analysts give Infosys?', {});
  assert.equal(target.includePrices, false);
  const bad = await call('/api/command', { prompt: 'show their prices', context: { tickers: ['../../x'], view: 'https://evil.test' } });
  assert.equal(bad.status, 200);
  assert.deepEqual((await bad.json()).tickers, []);
});

test('served browser bundle compiles and includes the shared intent classifier', async () => {
  const code = await (await call('/app.js')).text();
  assert.doesNotThrow(() => new vm.Script(code), 'app.js must parse as a browser script');
  assert.match(code, /xco/, 'intent tools are serialized for the browser');
  assert.match(code, /retry-market/);
});
