// TEST HARNESS ONLY. Preload with `node --import ./tests/e2e/mock-upstreams.mjs scripts/dev.mjs`.
// It replaces the external upstreams (Yahoo chart API, Gemini and the NSE announcements feed) with
// scripted fixtures so the real Worker, orchestrator and browser client can be exercised offline.
// Fixture prices and filings are synthetic and must never be presented as market data or disclosures.
// NSE category labels below follow real feed labels; every text says TEST FIXTURE.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { fixtureList, fixtureXbrl, parseFixtureUrl } from '../fixtures/xbrl-fixture.mjs';

const realFetch = globalThis.fetch;
const STATE_FILE = process.env.FINN_MOCK_STATE || '';
const LOG_FILE = process.env.FINN_MOCK_LOG || '';

function state() {
  try {
    return STATE_FILE && existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
  } catch {
    return {};
  }
}
function log(entry) {
  if (LOG_FILE) appendFileSync(LOG_FILE, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

// Last completed NSE session before "now": weekdays 09:15–15:30 IST (03:45–10:00 UTC).
function lastSession(now = Date.now()) {
  const d = new Date(now);
  for (let back = 0; back < 7; back++) {
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const start = day.getTime() + (3 * 60 + 45) * 60000;
    const end = day.getTime() + 10 * 3600000;
    if (start <= now) return { start: start / 1000, end: end / 1000, last: Math.min(now, end - 1000) / 1000 };
  }
  throw new Error('No session');
}

const BASE = { INFY: 1523.4, TCS: 3088.15, HCLTECH: 1612.0, LT: 3655.2, HDFCBANK: 1988.75, PIDILITIND: 2890.5, RELIANCE: 1410.3, NESTLEIND: 1189.0 };
function chart(ticker) {
  const base = BASE[ticker] ?? 1000 + [...ticker].reduce((s, c) => s + c.charCodeAt(0), 0);
  const s = lastSession();
  const points = 30;
  const timestamp = Array.from({ length: points }, (_, i) => Math.round(s.last - (points - 1 - i) * 60));
  const close = timestamp.map((_, i) => Number((base * (1 + Math.sin(i / 4) * 0.004)).toFixed(2)));
  return {
    chart: {
      result: [
        {
          meta: {
            currency: 'INR',
            symbol: ticker + '.NS',
            exchangeName: 'NSI',
            fullExchangeName: 'NSE',
            longName: ticker + ' (TEST FIXTURE)',
            regularMarketTime: Math.round(s.last),
            regularMarketPrice: close.at(-1),
            previousClose: Number((base * 0.99).toFixed(2)),
            regularMarketDayHigh: Math.max(...close),
            regularMarketDayLow: Math.min(...close),
            regularMarketVolume: 1234567,
            exchangeDataDelayedBy: 0,
            currentTradingPeriod: { regular: { start: s.start, end: s.end } },
          },
          timestamp,
          indicators: { quote: [{ close }] },
        },
      ],
      error: null,
    },
  };
}

// Deterministic synthetic daily history (one year of weekday sessions) for stocks and indices.
function seeded(symbol) {
  let h = 2166136261;
  for (const c of symbol) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
const INDEX_LEVEL = { '^NSEI': 23050, '^BSESN': 74460, '^NSEBANK': 54690, '^CNXIT': 32600, '^INDIAVIX': 15.3 };
function dailyChart(symbol) {
  const yahooSymbol = symbol.startsWith('^') || symbol.endsWith('.NS') ? symbol : symbol + '.NS';
  const base = INDEX_LEVEL[symbol] ?? BASE[symbol] ?? (symbol.startsWith('^') || symbol.startsWith('NIFTY') ? 10000 : 1000 + [...symbol].reduce((s, c) => s + c.charCodeAt(0), 0));
  const rnd = seeded(symbol), market = seeded('MARKET'), s = lastSession();
  const days = [];
  for (let t = s.start; days.length < 248; t -= 86400) { const d = new Date(t * 1000).getUTCDay(); if (d !== 0 && d !== 6) days.unshift(t); }
  const beta = symbol.startsWith('^') ? 1 : 0.6 + rnd() * 0.9, drift = (rnd() - 0.45) * 0.0016, idio = symbol === '^INDIAVIX' ? 0.04 : 0.008 + rnd() * 0.012;
  let p = base * (0.75 + rnd() * 0.4);
  const close = [], high = [], low = [], volume = [];
  for (let i = 0; i < days.length; i++) {
    const m = (market() - 0.5) * 0.022, e = (rnd() - 0.5) * 2 * idio;
    p = Math.max(1, p * (1 + drift + beta * m + e));
    close.push(Number(p.toFixed(2))); high.push(Number((p * 1.008).toFixed(2))); low.push(Number((p * 0.992).toFixed(2)));
    volume.push(symbol.startsWith('^') ? 0 : Math.round(1e6 * (0.6 + rnd()) * (i === days.length - 1 && symbol === 'LT' ? 4 : 1)));
  }
  const divIndex = days.length - 90, dividends = symbol.startsWith('^') ? {} : { [days[divIndex]]: { amount: Number((close[divIndex] * 0.01).toFixed(2)), date: days[divIndex] } };
  const adj = close.map((c, i) => (i < divIndex || symbol.startsWith('^') ? Number((c * 0.99).toFixed(2)) : c));
  return { chart: { result: [{ meta: { currency: 'INR', symbol: yahooSymbol, exchangeName: 'NSI', fullExchangeName: 'NSE', instrumentType: symbol.startsWith('^') ? 'INDEX' : 'EQUITY', longName: symbol + ' (TEST FIXTURE)', regularMarketTime: Math.round(s.last), regularMarketPrice: close.at(-1), currentTradingPeriod: { regular: { start: s.start, end: s.end } } }, timestamp: days, events: { dividends }, indicators: { quote: [{ close, high, low, volume, open: close }], adjclose: [{ adjclose: adj }] } }], error: null } };
}

function yahoo(url) {
  const u = new URL(url);
  const raw = decodeURIComponent(u.pathname.split('/').at(-1));
  const ticker = raw.replace(/\.NS$/, '') === raw ? raw : raw.startsWith('NIFTY') ? raw : raw.replace(/\.NS$/, '');
  const daily = u.searchParams.get('interval') === '1d' && u.searchParams.get('range') === '1y';
  const mode = state().yahoo || 'ok';
  log({ upstream: 'yahoo', ticker, daily, mode });
  if (mode === 'down' || (mode.startsWith('fail:') && mode.slice(5).split(',').includes(ticker)))
    return new Response('{"chart":{"error":{"code":"Service Unavailable"}}}', { status: 503 });
  return Response.json(daily ? dailyChart(ticker) : chart(ticker));
}

function gemini(options) {
  const body = JSON.parse(options.body);
  const system = body.systemInstruction?.parts?.[0]?.text || '';
  const user = JSON.parse(body.contents?.[0]?.parts?.[0]?.text || '{}');
  const mode = state().gemini || 'ok';
  if (/Route a request/.test(system)) {
    log({ upstream: 'gemini', kind: 'router', prompt: user.prompt, mode });
    const plan = /nestl/i.test(user.prompt)
      ? { action: /price|quote/i.test(user.prompt) ? 'prices' : 'research', tickers: ['NESTLEIND'], query: user.prompt, includePrices: false, view: 'research' }
      : { action: 'research', tickers: [user.context?.ticker || 'INFY'], query: user.prompt, includePrices: false, view: 'research' };
    return reply(plan);
  }
  if (/portfolio analyst/.test(system)) {
    log({ upstream: 'gemini', kind: 'deep-dive', question: user.question, facts: (user.facts || []).length, mode });
    if (mode === 'down') return Response.json({ error: { message: 'Mock quota exceeded' } }, { status: 429 });
    const f = Object.fromEntries((user.facts || []).map((x) => [x.key, x]));
    const findings = [];
    if (f['portfolio.return.1Y'] && f['benchmark.return.1Y']) findings.push({ text: 'Over the year the back-tested portfolio returned ' + f['portfolio.return.1Y'].value + ' against ' + f['benchmark.return.1Y'].value + ' for the Nifty 50.', metricKeys: ['portfolio.return.1Y', 'benchmark.return.1Y'] });
    if (f['portfolio.volatility']) findings.push({ text: 'Portfolio volatility is ' + f['portfolio.volatility'].value + ' annualised.', metricKeys: ['portfolio.volatility'] });
    findings.push({ text: 'Scripted unsupported claim: the portfolio will return 37.4% next year.', metricKeys: ['portfolio.volatility'] });
    const passage = (user.passages || [])[0];
    if (passage) findings.push({ text: passage.ticker + ' management commentary is cited from the indexed disclosure.', evidenceIds: [passage.id] });
    return reply({ action: 'finish', summary: 'Scripted deep-dive synthesis for testing.', findings, nextQuestions: ['Which holdings drive my portfolio risk?'] });
  }
  log({ upstream: 'gemini', kind: 'research', question: user.question, ticker: user.ticker, notes: user.notes || null, mode });
  if (mode === 'down') return Response.json({ error: { message: 'Mock quota exceeded' } }, { status: 429 });
  const evidence = user.initialEvidence || [];
  const byTicker = new Map();
  for (const e of evidence) if (!byTicker.has(e.ticker)) byTicker.set(e.ticker, e);
  const findings = [...byTicker.values()].map((e) => ({
    text: `${e.ticker}: scripted test finding that cites the retrieved ${e.document?.period || ''} passage on page ${e.page}.`,
    evidenceIds: [e.id],
  }));
  const gaps = [];
  // Reproduces the original defect: if a price clause reaches the document model it reports a document gap.
  if (/\b(stock|share|market)\s+prices?\b|\bprices?\b|\bquotes?\b/i.test(user.question || ''))
    gaps.push('Stock price data is not available in the provided financial documents.');
  if (/TCS/.test(user.question || '') && /guidance/i.test(user.question || ''))
    gaps.push('TCS does not provide numerical revenue growth guidance in the indexed transcript.');
  return reply({ action: 'finish', summary: 'Scripted test synthesis.', findings, gaps });
}
// NSE corporate announcements. Times are relative to "now" so every digest window has content.
// sort_date is IST wall time, formatted the way the real feed formats it.
function istStamp(ms) {
  const d = new Date(ms + 5.5 * 3600000), p = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
}
const H = 3600000;
const FILINGS = {
  INFY: [
    [3, 'Outcome of Board Meeting', 'has informed the Exchange about TEST FIXTURE audited financial results for the quarter, standalone and consolidated', 2],
    [26, 'Analysts/Institutional Investor Meet/Con. Call Updates', 'has informed the Exchange about TEST FIXTURE schedule of analyst meetings'],
    [5 * 24, 'Change in Directors/ Key Managerial Personnel/ Auditor/ Compliance Officer/ Share Transfer Agent', 'has informed the Exchange regarding TEST FIXTURE appointment of a new Chief Financial Officer'],
  ],
  TCS: [
    [5, 'Board Meeting Intimation', 'has informed the Exchange that a meeting of the Board of Directors is scheduled to consider and approve TEST FIXTURE financial results'],
    [10 * 24, 'Credit Rating', 'has informed the Exchange about TEST FIXTURE reaffirmation of its credit rating'],
  ],
  HDFCBANK: [
    [8, 'Action(s) taken or orders passed', 'has informed the Exchange about TEST FIXTURE penalty order passed by a regulator'],
    [2 * 24, 'Copy of Newspaper Publication', 'has informed the Exchange about TEST FIXTURE newspaper publication'],
  ],
  LT: [
    [6, 'Bagging/Receiving of orders/contracts', 'has informed the Exchange about TEST FIXTURE receipt of a large order'],
    [40, 'Updates', 'has informed the Exchange about TEST FIXTURE incorporation of a wholly owned subsidiary'],
  ],
  PIDILITIND: [[12, 'Trading Window-XBRL', 'has informed the Exchange about TEST FIXTURE closure of trading window']],
};
function nse(url) {
  const u = new URL(url), ticker = u.searchParams.get('symbol') || '';
  const mode = state().nse || 'ok';
  log({ upstream: 'nse', ticker, from: u.searchParams.get('from_date'), to: u.searchParams.get('to_date'), mode });
  if (!u.searchParams.get('from_date') || !u.searchParams.get('to_date')) return new Response('unbounded request refused by the test harness', { status: 400 });
  if (mode === 'down' || (mode.startsWith('fail:') && mode.slice(5).split(',').includes(ticker))) return new Response('<html>Access Denied</html>', { status: 403 });
  const now = Date.now(), rows = [];
  (FILINGS[ticker] || []).forEach(([hoursAgo, desc, text, copies = 1], i) => {
    for (let c = 0; c < copies; c++)
      rows.push({ symbol: ticker, desc, attchmntText: ticker + ' Limited ' + text, attchmntFile: 'https://nsearchives.nseindia.com/corporate/TEST-FIXTURE-' + ticker + '-' + i + '-' + c + '.pdf', sort_date: istStamp(now - hoursAgo * H), an_dt: '', sm_name: ticker + ' (TEST FIXTURE)', seq_id: ticker + i + c, attFileSize: '120 KB' });
  });
  return Response.json(rows);
}
// NSE integrated filings (results first cut): filing list + XBRL instances with synthetic figures.
// PIDILITIND has no consolidated year-ago filing, to exercise the partial state.
function integrated(url) {
  const mode = state().nse || 'ok';
  if (url.startsWith('https://www.nseindia.com/api/integrated-filing-results')) {
    const symbol = new URL(url).searchParams.get('symbol') || '';
    log({ upstream: 'nse-results-list', symbol, mode });
    if (mode === 'down' || (mode.startsWith('fail:') && mode.slice(5).split(',').includes(symbol))) return new Response('<html>Access Denied</html>', { status: 403 });
    return Response.json(fixtureList(symbol, { skip: symbol === 'PIDILITIND' ? [{ quarter: '2025-09-30', basis: 'consolidated' }] : [] }));
  }
  const p = parseFixtureUrl(url);
  log({ upstream: 'nse-archive', file: url.split('/').pop(), mode });
  if (mode === 'down') return new Response('<html>Access Denied</html>', { status: 403 });
  return p ? new Response(fixtureXbrl(p.symbol, p.quarterEnd, p.basis), { status: 200, headers: { 'content-type': 'application/xml' } }) : new Response('Not found', { status: 404 });
}
function reply(json) {
  return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] });
}

globalThis.fetch = async (input, options = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('https://query1.finance.yahoo.com/v8/finance/chart/')) return yahoo(url);
  if (url.startsWith('https://generativelanguage.googleapis.com/')) return gemini(options);
  if (url.startsWith('https://www.nseindia.com/api/corporate-announcements')) return nse(url);
  if (url.startsWith('https://www.nseindia.com/api/integrated-filing-results') || url.startsWith('https://nsearchives.nseindia.com/corporate/xbrl/')) return integrated(url);
  if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) return realFetch(input, options);
  log({ upstream: 'blocked', url });
  return new Response(JSON.stringify({ error: 'External network disabled in the test harness' }), { status: 503 });
};
console.log('[mock-upstreams] Yahoo, Gemini, NSE announcements and NSE results filings are mocked for this process. Fixture prices, filings and figures are synthetic.');
