// Endpoint tests for the Push digest and the per-company announcements feed, against the built Worker
// (run `npm run build` first). NSE and Yahoo are replaced by fixtures; texts are written for the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import { parseCommand } from '../src/commands.js';

const nseSeen = [];
let nseDown = false;
const H = 3600000;
const ist = (ms) => { const d = new Date(ms + 5.5 * H), p = (n) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`; };
const filing = (symbol, hoursAgo, desc, text) => ({ symbol, desc, attchmntText: `${symbol} Limited has informed the Exchange about ${text}`, attchmntFile: `https://nsearchives.nseindia.com/corporate/${symbol}-${hoursAgo}.pdf`, sort_date: ist(Date.now() - hoursAgo * H), sm_name: symbol + ' Limited', seq_id: symbol + hoursAgo });
const FEED = {
  INFY: [filing('INFY', 3, 'Outcome of Board Meeting', 'audited financial results for the quarter'), filing('INFY', 50, 'Change in Directors/ Key Managerial Personnel/ Auditor/ Compliance Officer/ Share Transfer Agent', 'appointment of a Chief Financial Officer')],
  TCS: [filing('TCS', 4, 'Copy of Newspaper Publication', 'newspaper publication'), filing('TCS', 20, 'Credit Rating', 'reaffirmation of its credit rating')],
  ANNCO: [filing('ANNCO', 30, 'Action(s) taken or orders passed', 'a penalty order passed by a regulator')],
};
function daily(symbol) {
  const days = [];
  for (let t = Math.floor(Date.now() / 1000) - 86400 * 2; days.length < 60; t -= 86400) { const d = new Date(t * 1000).getUTCDay(); if (d && d !== 6) days.unshift(t); }
  const close = days.map((_, i) => (i === days.length - 1 && symbol === 'INFY' ? 110 : 100)), volume = days.map(() => 1e6);
  return { chart: { result: [{ meta: { symbol: symbol + '.NS', currency: 'INR' }, timestamp: days, indicators: { quote: [{ close, volume }], adjclose: [{ adjclose: close }] } }] } };
}
const real = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = String(typeof input === 'string' ? input : input.url);
  if (url.startsWith('https://www.nseindia.com/api/corporate-announcements')) {
    const u = new URL(url), symbol = u.searchParams.get('symbol');
    nseSeen.push({ symbol, from: u.searchParams.get('from_date'), to: u.searchParams.get('to_date') });
    if (nseDown || symbol === 'NSEFAIL') return new Response('<html>Access Denied</html>', { status: 403 });
    return Response.json(FEED[symbol] || []);
  }
  if (url.startsWith('https://query1.finance.yahoo.com/v8/finance/chart/')) {
    const raw = decodeURIComponent(new URL(url).pathname.split('/').at(-1)).replace(/\.NS$/, '');
    return Response.json(daily(raw));
  }
  if (url.startsWith('https://generativelanguage.googleapis.com/')) throw new Error('No model call expected in these tests');
  return real(input, options);
};
const get = (path) => worker.fetch(new Request('https://finn.test' + path), {}, {});
const days = (a, b) => { const p = (s) => { const [d, m, y] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return (p(b) - p(a)) / 86400000; };

test('/api/digest validates the scope', async () => {
  assert.equal((await get('/api/digest')).status, 400);
  assert.equal((await get('/api/digest?tickers=../../etc')).status, 400);
  const many = Array.from({ length: 31 }, (_, i) => 'CO' + i).join(',');
  assert.equal((await get('/api/digest?tickers=' + many)).status, 400);
});

test('/api/digest returns classified filings and threshold alerts for the window', async () => {
  const r = await (await get('/api/digest?tickers=INFY,TCS&window=24h&price=4&volume=2')).json();
  assert.equal(r.status, 'ok');
  assert.equal(r.window, '24h');
  assert.deepEqual(r.items.map((i) => [i.ticker, i.category, i.materiality]), [['INFY', 'results', 'high'], ['TCS', 'credit_rating', 'high'], ['TCS', 'unclassified', 'routine']]);
  assert.equal(r.items[0].company, 'Infosys', 'portfolio names are used');
  assert.equal(r.items[0].label, 'Results');
  assert.ok(r.items[0].links[0].startsWith('https://nsearchives.nseindia.com/'));
  assert.equal(r.priceAlerts.length, 1);
  assert.match(r.priceAlerts[0].text, /^INFY rose 10\.00% on .* \(threshold ±4%\)\.$/);
  const calls = nseSeen.filter((s) => ['INFY', 'TCS'].includes(s.symbol));
  assert.ok(calls.length === 2 && calls.every((s) => days(s.from, s.to) === 2), 'a 24h digest asks NSE for a bounded two-day range');
  assert.match(r.source, /NSE corporate announcements/);
});

test('/api/digest honours the focus list, window and clamps thresholds', async () => {
  const r = await (await get('/api/digest?tickers=INFY,TCS&window=7d&focus=results,not-a-category&price=999&volume=0')).json();
  assert.deepEqual(r.focus, ['results']);
  assert.equal(r.items.find((i) => i.category === 'credit_rating').materiality, 'medium', 'ratings are not raised when the investor did not pick them');
  assert.equal(r.items.find((i) => i.category === 'management_change').materiality, 'high');
  assert.deepEqual(r.priceAlerts, [], 'price threshold clamps to 50%, so a 10% move is not an alert');
  const none = await (await get('/api/digest?tickers=TCS&window=7d&focus=')).json();
  assert.deepEqual(none.focus, [], 'an empty focus list is respected');
  const odd = await (await get('/api/digest?tickers=TCS&window=forever')).json();
  assert.equal(odd.window, '24h');
});

test('/api/digest separates an unavailable exchange feed from price alerts', async () => {
  nseDown = true;
  try {
    const r = await (await get('/api/digest?tickers=HCLTECH,LT&window=3d')).json();
    assert.equal(r.status, 'unavailable');
    assert.deepEqual(r.items, []);
    assert.deepEqual(r.failures.map((f) => f.error), ['NSE announcements HTTP 403', 'NSE announcements HTTP 403']);
    assert.ok(Array.isArray(r.priceAlerts) && r.priceFailures.length === 0, 'price alerts still evaluated from market data');
  } finally {
    nseDown = false;
  }
  const partial = await (await get('/api/digest?tickers=INFY,NSEFAIL&window=24h')).json();
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.failures.map((f) => f.ticker), ['NSEFAIL']);
});

test('/api/announcements uses a bounded 30-day request and returns classified rows', async () => {
  const r = await (await get('/api/announcements?ticker=ANNCO')).json();
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].category, r[0].materiality, r[0].source], ['Litigation / regulatory', 'high', 'NSE']);
  assert.equal(r[0].details, 'A penalty order passed by a regulator');
  const call = nseSeen.find((s) => s.symbol === 'ANNCO');
  assert.equal(days(call.from, call.to), 30);
  const failed = await get('/api/announcements?ticker=NSEFAIL');
  assert.equal(failed.status, 502);
  assert.match((await failed.json()).error, /Exchange feed unavailable \(NSE announcements HTTP 403\)\. Archived company sources remain available\./);
});

test('digest requests route from the command bar with window, filter and scope', () => {
  const companies = [{ ticker: 'INFY', name: 'Infosys' }, { ticker: 'TCS', name: 'Tata Consultancy Services' }, { ticker: 'LT', name: 'Larsen & Toubro' }, { ticker: 'ICICIBANK', name: 'ICICI Bank' }];
  const p = (q, ctx = {}) => parseCommand(q, ctx, companies);
  assert.deepEqual([p('What changed in my portfolio today?', { ticker: 'INFY' }).action, p('What changed in my portfolio today?', { ticker: 'INFY' }).tickers], ['digest', []], 'portfolio digest is not narrowed to the open company');
  assert.deepEqual(p('Any management changes this month?').digest, { window: '30d', filter: 'management_change' });
  assert.deepEqual(p('Any results announcements this week?').digest, { window: '7d', filter: 'results' });
  assert.deepEqual(p('Any new orders for L&T this week?').digest, { window: '7d', filter: 'press_release' });
  assert.deepEqual(p('Any filings from Infosys and TCS in the last 3 days?').tickers, ['INFY', 'TCS']);
  assert.deepEqual(p('Any new filings from them?', { ticker: 'INFY', tickers: ['INFY', 'TCS'] }).tickers, ['INFY', 'TCS']);
  assert.equal(p('Any litigation or penalties this month?').digest.filter, 'litigation');
  assert.equal(p('What changed in my portfolio today?').view, 'briefing');
  // Neighbouring requests keep their own routes.
  assert.equal(p('Find disclosures for ICICI Bank').action, 'discover');
  assert.equal(p('What is the Infosys share price?').action, 'prices');
  assert.equal(p('What is the dividend policy of TCS?').action, 'research');
  assert.equal(p('Compare Infosys and TCS filings').action, 'compare');
  assert.equal(p('Give me a deep analysis of my portfolio').action, 'analyze');
});
