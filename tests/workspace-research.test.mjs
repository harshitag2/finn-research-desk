import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { investigateWorkspace, marketEnvelope, PRICE_NOTE } from '../src/workspace-research.js';
import { compareCompanies } from '../src/commands.js';
import { runResearch } from '../src/research.js';

const corpus = JSON.parse(fs.readFileSync(new URL('../data/corpus.json', import.meta.url), 'utf8'));
const companies = [
  ['INFY', 'Infosys'], ['TCS', 'Tata Consultancy Services'], ['HDFCBANK', 'HDFC Bank'], ['PIDILITIND', 'Pidilite Industries'],
].map(([ticker, name]) => ({ ticker, name }));
const MIXED = 'Compare Infosys and TCS on FY27 growth guidance and show their stock prices';
const quote = (ticker, extra = {}) => ({
  ticker, price: 1500, currency: 'INR', previousClose: 1490, change: 10, changePercent: 0.67, asOf: '2026-10-30T09:59:00.000Z',
  fetchedAt: '2026-10-31T06:00:00.000Z', marketState: 'closed', exchange: 'NSE', delayMinutes: 0, source: 'Yahoo Finance', stale: false, ...extra,
});
const provider = (calls, failing = []) => async (tickers) => {
  calls.push(tickers);
  return { quotes: tickers.map((t) => (failing.includes(t) ? { ticker: t, price: null, error: 'Quote source HTTP 503' } : quote(t))), source: 'Yahoo Finance', notice: 'Quotes may be delayed.', fetchedAt: '2026-10-31T06:00:00.000Z' };
};
const noModel = () => assert.fail('No document research or model call is expected for this request');

test('mixed request returns quotes for each company alongside document research that never saw the price clause', async () => {
  const calls = [];
  let documentArgs;
  const r = await investigateWorkspace({
    query: MIXED, tickers: ['INFY', 'TCS'], companies, corpus, quoteProvider: provider(calls),
    compare: async (args) => { documentArgs = args; return compareCompanies(args); },
  });
  assert.deepEqual(calls, [['INFY', 'TCS']]);
  assert.equal(documentArgs.query, 'Compare Infosys and TCS on FY27 growth guidance');
  assert.deepEqual(documentArgs.notes, [PRICE_NOTE]);
  assert.equal(r.query, MIXED, 'the UI and export keep the original question');
  assert.equal(r.documentQuery, 'Compare Infosys and TCS on FY27 growth guidance');
  assert.equal(r.mode, 'evidence');
  assert.ok(r.evidence.length > 0);
  assert.deepEqual(new Set(r.evidence.map((e) => e.ticker)), new Set(['INFY', 'TCS']));
  assert.equal(r.market.status, 'ready');
  assert.deepEqual(r.market.quotes.map((q) => [q.ticker, q.price, q.currency, q.asOf]), [['INFY', 1500, 'INR', '2026-10-30T09:59:00.000Z'], ['TCS', 1500, 'INR', '2026-10-30T09:59:00.000Z']]);
  assert.ok(!r.gaps.some((g) => /price/i.test(g)), 'no document gap about stock prices');
  assert.deepEqual(r.trace.slice(0, 2).map((t) => t.tool), ['route_request', 'fetch_quotes']);
});

test('price-only requests use market data without documents, coverage or the model', async () => {
  for (const [query, tickers] of [['TCS current stock price', ['TCS']], ['Compare Infosys and TCS stock prices', ['INFY', 'TCS']], ['PIDILITIND current stock price', ['PIDILITIND']]]) {
    const calls = [];
    const r = await investigateWorkspace({ query, tickers, companies, corpus, env: { GEMINI_API_KEY: 'unused' }, quoteProvider: provider(calls), research: noModel, compare: noModel });
    assert.equal(r.mode, 'market', query);
    assert.deepEqual(calls, [tickers]);
    assert.equal(r.market.status, 'ready');
    assert.equal(r.evidence.length, 0);
    assert.equal(r.gaps.length, 0);
    assert.equal(r.documentQuery, '');
  }
});

test('missing company documents do not hide a successful quote', async () => {
  const calls = [];
  const r = await investigateWorkspace({
    query: 'What guidance did Pidilite give on volume growth, and what is its current share price?', tickers: ['PIDILITIND'], companies, corpus,
    env: { GEMINI_API_KEY: 'unused' }, quoteProvider: provider(calls),
  });
  assert.equal(r.mode, 'coverage');
  assert.deepEqual(r.coverage.tickers, ['PIDILITIND']);
  assert.ok(!r.trace.some((t) => t.tool === 'model_step'), 'the model is skipped without sources');
  assert.equal(r.market.status, 'ready');
  assert.equal(r.market.quotes[0].price, 1500);
  assert.ok(!r.gaps.some((g) => /price/i.test(g)));
});

test('a quote-provider failure stays separate from document research', async () => {
  const thrown = await investigateWorkspace({
    query: MIXED, tickers: ['INFY', 'TCS'], companies, corpus, quoteProvider: async () => { throw new Error('Quote source HTTP 503'); },
  });
  assert.equal(thrown.mode, 'evidence', 'research is still returned');
  assert.ok(thrown.evidence.length > 0);
  assert.equal(thrown.market.status, 'unavailable');
  assert.match(thrown.market.error, /market-data provider did not respond/);
  assert.match(thrown.market.error, /research is unaffected/);
  assert.ok(thrown.market.quotes.every((q) => q.price === null && /503/.test(q.error)), 'no price is invented');
  assert.ok(!thrown.gaps.some((g) => /price|document/i.test(g) && /quote|price/i.test(g)), 'provider failure is not reported as a document gap');

  const partial = await investigateWorkspace({ query: MIXED, tickers: ['INFY', 'TCS'], companies, corpus, quoteProvider: provider([], ['TCS']) });
  assert.equal(partial.market.status, 'partial');
  assert.equal(partial.market.quotes.find((q) => q.ticker === 'INFY').price, 1500);
  assert.equal(partial.market.quotes.find((q) => q.ticker === 'TCS').price, null);
});

test('a document-research failure does not hide quotes', async () => {
  const r = await investigateWorkspace({
    query: 'What is HDFC Bank loan growth guidance and current share price?', tickers: ['HDFCBANK'], companies, corpus,
    quoteProvider: provider([]), research: async () => { throw new Error('research backend offline'); },
  });
  assert.equal(r.mode, 'error');
  assert.match(r.gaps[0], /Document research failed: research backend offline/);
  assert.equal(r.market.status, 'ready');
});

test('when the browser fetches quotes itself the server only does documents', async () => {
  const r = await investigateWorkspace({ query: MIXED, tickers: ['INFY', 'TCS'], companies, corpus, separateMarket: true, quoteProvider: () => assert.fail('duplicate quote request') });
  assert.equal(r.market, undefined);
  assert.equal(r.marketRequested, true);
  assert.equal(r.documentQuery, 'Compare Infosys and TCS on FY27 growth guidance');
});

test('requests without a price clause keep their original document path', async () => {
  const r = await investigateWorkspace({ query: 'What does management say about pricing power?', tickers: ['INFY'], companies, corpus, quoteProvider: () => assert.fail('no quotes requested') });
  assert.equal(r.marketRequested, false);
  assert.equal(r.market, undefined);
  assert.equal(r.query, 'What does management say about pricing power?');
});

test('Gemini receives only the document question and preserves legitimate guidance gaps', async () => {
  const previous = globalThis.fetch;
  const questions = [];
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith('https://generativelanguage.googleapis.com/'));
    const user = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
    questions.push(user);
    // The scripted model behaves like the original defect: it reports a gap if prices reach it.
    const gaps = ['TCS does not provide numerical revenue growth guidance.'];
    if (/price|quote/i.test(user.question)) gaps.push('Stock price data is not available in the provided financial documents.');
    const byTicker = [...new Map(user.initialEvidence.map((e) => [e.ticker, e])).values()];
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ action: 'finish', findings: byTicker.map((e) => ({ text: e.ticker + ' finding', evidenceIds: [e.id] })), gaps }) }] } }] });
  };
  try {
    const r = await investigateWorkspace({ query: MIXED, tickers: ['INFY', 'TCS'], companies, corpus, env: { GEMINI_API_KEY: 'test-key' }, quoteProvider: provider([]) });
    assert.equal(questions.length, 1);
    assert.doesNotMatch(questions[0].question, /price|quote/i);
    assert.ok(questions[0].notes.includes(PRICE_NOTE));
    assert.ok(questions[0].notes.some(n => n.startsWith('Indexed document coverage:') && n.includes('2026-05-29')));
    assert.equal(r.mode, 'agent');
    assert.equal(r.findings.length, 2);
    assert.deepEqual(r.gaps, ['TCS does not provide numerical revenue growth guidance.']);
    assert.equal(r.market.status, 'ready');
  } finally {
    globalThis.fetch = previous;
  }
});

test('market envelope never reports a missing quote as available', () => {
  assert.equal(marketEnvelope([]).status, 'needs_scope');
  const e = marketEnvelope(['INFY', 'TCS'], { quotes: [quote('INFY')] });
  assert.equal(e.status, 'partial');
  assert.equal(e.quotes[1].price, null);
  assert.equal(marketEnvelope(['INFY'], { quotes: [quote('INFY', { price: 0 })] }).status, 'unavailable');
});

test('research without prices is unchanged for direct runResearch callers', async () => {
  const r = await runResearch({ query: 'cash from operations', ticker: 'INFY', corpus });
  assert.equal(r.mode, 'evidence');
  assert.ok(r.evidence.every((e) => e.ticker === 'INFY'));
});

test('a cached quote returned after a failed provider refresh is never summarised as fresh', () => {
  const e = marketEnvelope(['INFY', 'TCS'], { quotes: [quote('INFY'), quote('TCS', { stale: true, error: 'Source refresh failed; showing the last successful quote.' })] });
  assert.equal(e.status, 'partial');
  assert.match(e.error, /1 cached quote is shown because the provider refresh failed/);
  assert.equal(e.quotes[1].stale, true);
});
