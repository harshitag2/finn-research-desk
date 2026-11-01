import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHistory, fetchHistory, stdev, returnsOf, correlation, beta, annualizedVolatility, drawdown, sma, rsi,
  periodReturns, riskContributions, effectiveHoldings, alignOn, stockMetrics, alertsFor, portfolioAnalytics, yahooSymbol, validSymbol,
} from '../src/analytics.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const NOW = Date.parse('2026-10-31T09:00:00Z');
// A year of weekday sessions ending on Friday 30 Oct 2026, built from a list of closes.
function chartFrom(symbol, closes, { adj, volume, dividends, currency = 'INR', session } = {}) {
  const days = [];
  for (let t = Date.parse('2026-10-30T03:45:00Z') / 1000; days.length < closes.length; t -= 86400) { const d = new Date(t * 1000).getUTCDay(); if (d && d !== 6) days.unshift(t); }
  return { chart: { result: [{ meta: { symbol: yahooSymbol(symbol), currency, regularMarketTime: days.at(-1) + 22000, currentTradingPeriod: { regular: session || { start: days.at(-1), end: days.at(-1) + 22500 } } }, timestamp: days, events: dividends ? { dividends } : {}, indicators: { quote: [{ close: closes, high: closes.map((c) => c * 1.01), low: closes.map((c) => c * 0.99), volume: volume || closes.map(() => 1000) }], adjclose: [{ adjclose: adj || closes }] } }] } };
}
const walk = (n, start, f) => Array.from({ length: n }, (_, i) => Number((start * f(i)).toFixed(4)));

test('basic statistics are exact on known inputs', () => {
  close(stdev([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7));
  assert.deepEqual(returnsOf([100, 110, 99]).map((x) => Number(x.toFixed(4))), [0.1, -0.1]);
  close(correlation([1, 2, 3, 4], [2, 4, 6, 8]), 1);
  close(correlation([1, 2, 3, 4], [8, 6, 4, 2]), -1);
  close(beta([0.02, -0.04, 0.06], [0.01, -0.02, 0.03]), 2);
  close(annualizedVolatility([0.01, -0.01, 0.01, -0.01]), stdev([0.01, -0.01, 0.01, -0.01]) * Math.sqrt(252) * 100);
  const dd = drawdown([100, 120, 90, 110]);
  close(dd.max, -25);
  close(dd.current, (110 / 120 - 1) * 100);
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  assert.equal(rsi(walk(30, 100, (i) => 1 + i / 100), 14).at(-1), 100, 'a series that only rises has RSI 100');
  close(effectiveHoldings([0.25, 0.25, 0.25, 0.25]), 4);
  close(effectiveHoldings([1]), 1);
});

test('risk contributions sum to one and favour the volatile holding', () => {
  const a = [0.01, -0.01, 0.02, -0.02, 0.01, -0.01], b = a.map((x) => x * 3), c = [0.005, 0.004, -0.006, 0.003, -0.002, 0.001];
  const rc = riskContributions([1 / 3, 1 / 3, 1 / 3], [a, b, c]);
  close(rc.reduce((s, x) => s + x, 0), 1);
  assert.ok(rc[1] > rc[0] && rc[0] > rc[2]);
});

test('history normalisation validates the security, uses adjusted closes and keeps dividends', () => {
  const n = 60, closes = walk(n, 100, (i) => 1 + i / 200), adj = closes.map((c, i) => (i < 30 ? c * 0.99 : c));
  const raw = chartFrom('INFY', closes, { adj, dividends: { a: { date: Date.parse('2026-08-03T03:45:00Z') / 1000, amount: 5 } } });
  const h = normalizeHistory(raw, 'INFY', NOW);
  assert.equal(h.rows.length, n);
  assert.equal(h.rows[0].adj, adj[0]);
  assert.equal(h.rows[0].close, closes[0]);
  assert.equal(h.dividends[0].amount, 5);
  assert.equal(h.lastPartial, false, 'a Saturday run sees a completed Friday session');
  assert.throws(() => normalizeHistory(chartFrom('TCS', closes), 'INFY', NOW), /different security/);
  assert.throws(() => normalizeHistory(chartFrom('INFY', closes, { currency: 'USD' }), 'INFY', NOW), /currency/);
  assert.throws(() => normalizeHistory(chartFrom('INFY', closes.slice(0, 10)), 'INFY', NOW), /Not enough/);
  assert.equal(yahooSymbol('^NSEI'), '^NSEI');
  assert.equal(yahooSymbol('INFY'), 'INFY.NS');
  assert.equal(validSymbol('../x'), false);
  const intraday = normalizeHistory(chartFrom('INFY', closes), 'INFY', Date.parse('2026-10-30T06:00:00Z'));
  assert.equal(intraday.lastPartial, true, 'during market hours the last bar is a session in progress');
});

test('stock metrics report returns, trend, range and volume against the completed session', () => {
  const n = 250, closes = walk(n, 100, (i) => 1 + i / 250), volume = closes.map((_, i) => (i === n - 1 ? 5000 : 1000));
  const bench = normalizeHistory(chartFrom('^NSEI', walk(n, 20000, (i) => 1 + i / 500)), '^NSEI', NOW);
  const m = stockMetrics(normalizeHistory(chartFrom('INFY', closes, { volume }), 'INFY', NOW), bench, { includeSeries: true });
  close(m.returns['1Y'], Number(((closes.at(-1) / closes[0] - 1) * 100).toFixed(2)));
  assert.equal(m.aboveSma200, true);
  assert.equal(m.aboveSma50, true);
  assert.equal(m.volumeRatio, 5);
  assert.ok(m.fromHigh52 <= 0 && m.position52 > 90);
  assert.equal(m.series.close.length, n);
  const alerts = alertsFor([m], { priceThreshold: 4, volumeThreshold: 2 });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, 'volume');
  assert.match(alerts[0].text, /5\.00× its prior 20-session average/);
});

test('portfolio analytics back-test current weights, align histories and exclude short ones honestly', () => {
  const n = 250;
  const benchRows = walk(n, 20000, (i) => 1 + 0.1 * Math.sin(i / 20) + i / 1000);
  const bench = normalizeHistory(chartFrom('^NSEI', benchRows), '^NSEI', NOW);
  const same = normalizeHistory(chartFrom('AAA', benchRows.map((v) => v / 100)), 'AAA', NOW);
  const histories = { AAA: { ok: true, data: same }, BBB: { ok: false, error: 'HTTP 503' }, CCC: { ok: true, data: normalizeHistory(chartFrom('CCC', walk(40, 50, () => 1)), 'CCC', NOW) } };
  const a = portfolioAnalytics({ holdings: [{ ticker: 'AAA', weight: 1, sector: 'Technology' }, { ticker: 'BBB', weight: 1 }, { ticker: 'CCC', weight: 1 }], histories, benchmark: bench });
  assert.equal(a.metrics.holdingsAnalysed, 1);
  assert.equal(a.notes.length, 2);
  assert.match(a.notes.join(' '), /BBB: price history unavailable/);
  assert.match(a.notes.join(' '), /CCC: history covers only/);
  close(a.metrics.beta, 1);
  close(a.metrics.periods['1Y'].portfolio, a.metrics.periods['1Y'].benchmark);
  assert.equal(a.holdings[0].weight, 100);
  close(a.holdings[0].riskShare, 100);
  assert.equal(a.series.portfolio.length, a.series.dates.length);
  const aligned = alignOn(['2026-01-01', '2026-01-02', '2026-01-05'], [{ date: '2026-01-01', adj: 10 }, { date: '2026-01-05', adj: 12 }]);
  assert.deepEqual(aligned.values, [10, 10, 12]);
  assert.equal(aligned.filled, 1);
});

test('history fetch caches, reports provider failures and never invents a series', async () => {
  let calls = 0;
  const raw = chartFrom('CACHEDCO', walk(60, 100, () => 1));
  const ok = await fetchHistory('CACHEDCO', { fetcher: async () => { calls++; return Response.json(raw); }, now: NOW });
  await fetchHistory('CACHEDCO', { fetcher: async () => { calls++; throw new Error('no'); }, now: NOW + 1000 });
  assert.equal(calls, 1);
  const stale = await fetchHistory('CACHEDCO', { fetcher: async () => new Response('x', { status: 503 }), now: NOW + 11 * 60000 });
  assert.equal(stale.stale, true);
  assert.equal(stale.rows.length, ok.rows.length);
  await assert.rejects(fetchHistory('NEVERCO', { fetcher: async () => new Response('x', { status: 503 }), now: NOW }), /HTTP 503/);
  await assert.rejects(fetchHistory('OFFLINECO', { fetcher: async () => { throw new TypeError('fetch failed'); }, now: NOW }), /Could not reach the history provider/);
});

test('period returns use dividend-adjusted closes and YTD starts at the prior year-end', () => {
  const rows = [
    { date: '2025-12-30', adj: 90 }, { date: '2025-12-31', adj: 100 }, { date: '2026-01-02', adj: 105 }, { date: '2026-10-30', adj: 110 },
  ];
  const r = periodReturns(rows);
  close(r.YTD, 10);
  close(r['1Y'], (110 / 90 - 1) * 100);
});
