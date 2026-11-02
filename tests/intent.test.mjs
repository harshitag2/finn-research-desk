import test from 'node:test';
import assert from 'node:assert/strict';
import createIntentTools from '../src/intent.js';
import { marketIntent, parseCommand, validatePlan, planCommand } from '../src/commands.js';

const companies = [
  ['INFY', 'Infosys'], ['TCS', 'Tata Consultancy Services'], ['HDFCBANK', 'HDFC Bank'], ['LT', 'Larsen & Toubro'],
  ['RELIANCE', 'Reliance Industries'], ['TATASTEEL', 'Tata Steel'], ['ASIANPAINT', 'Asian Paints'], ['PIDILITIND', 'Pidilite Industries'],
].map(([ticker, name]) => ({ ticker, name }));
const intent = (q) => marketIntent(q, companies);

test('combined research-and-price request strips only the price clause from the document question', () => {
  const r = intent('Compare Infosys and TCS on FY27 growth guidance and show their stock prices');
  assert.equal(r.requested, true);
  assert.equal(r.quotesOnly, false);
  assert.equal(r.documentQuery, 'Compare Infosys and TCS on FY27 growth guidance');
  assert.doesNotMatch(r.documentQuery, /price|quote/i);
  const q = intent('What is HDFC Bank loan growth guidance and current share price?');
  assert.equal(q.documentQuery, 'What is HDFC Bank loan growth guidance?');
  const lead = intent('Show stock prices for Infosys and TCS and compare their FY27 guidance');
  assert.equal(lead.documentQuery, 'compare their FY27 guidance');
});

test('price-only requests are recognised without any research vocabulary', () => {
  for (const q of ['TCS current stock price', 'Compare Infosys and TCS stock prices', 'show their prices', 'PIDILITIND current stock price',
    'Show prices for Reliance and HDFC Bank', 'How is TCS trading today?', 'LTP of HDFC Bank', 'Get me a quote for Reliance', 'Tata Steel price']) {
    const r = intent(q);
    assert.equal(r.requested, true, q);
    assert.equal(r.quotesOnly, true, q);
    assert.equal(r.documentQuery, '', q);
  }
});

test('business pricing topics are research questions, not quote requests', () => {
  for (const q of [
    'What does management say about pricing power?',
    'How did input-price inflation affect margins?',
    'How did input prices affect gross margins in FY26?',
    'What is management view on pricing power and the latest input prices for Asian Paints?',
    'What price targets do analysts have for TCS?',
    'What is the target price for Infosys?',
    'Did they raise their prices in Q2?',
    'Were price increases passed through to customers?',
    'Was growth driven by volume or price?',
    'How did crude prices and commodity prices affect Reliance?',
    'Give me direct quotes from management about deal wins',
  ]) {
    const r = intent(q);
    assert.equal(r.requested, false, q);
    assert.equal(r.documentQuery, q, q);
  }
});

test('a sentence can contain both an input-price topic and a stock-price request', () => {
  const r = intent('How did steel prices affect Tata Steel margins, and what is its share price?');
  assert.equal(r.requested, true);
  assert.equal(r.quotesOnly, false);
  assert.equal(r.documentQuery, 'How did steel prices affect Tata Steel margins?');
});

test('the intent factory is self-contained so it can be serialized into the browser bundle', () => {
  const browserCopy = new Function('return (' + createIntentTools.toString() + ')()')();
  const q = 'Compare Infosys and TCS on FY27 growth guidance and show their stock prices';
  assert.deepEqual(browserCopy.marketIntent(q, browserCopy.entityNames(companies)), intent(q));
  assert.doesNotMatch(createIntentTools.toString(), /\(\?<[=!]/, 'regex lookbehind breaks older iOS Safari');
});

test('planner routes mixed, price-only and follow-up requests with the selected companies', () => {
  const mixed = parseCommand('Compare Infosys and TCS on FY27 growth guidance and show their stock prices', { ticker: 'HDFCBANK' }, companies);
  assert.equal(mixed.action, 'compare');
  assert.deepEqual(mixed.tickers, ['INFY', 'TCS']);
  assert.equal(mixed.includePrices, true);
  assert.equal(mixed.documentQuery, 'Compare Infosys and TCS on FY27 growth guidance');

  const priceCompare = parseCommand('Compare Infosys and TCS stock prices', {}, companies);
  assert.equal(priceCompare.action, 'prices');
  assert.deepEqual(priceCompare.tickers, ['INFY', 'TCS']);

  const followUp = parseCommand('show their prices', { ticker: 'INFY', tickers: ['INFY', 'TCS'], view: 'briefing' }, companies);
  assert.equal(followUp.action, 'prices');
  assert.deepEqual(followUp.tickers, ['INFY', 'TCS'], 'a follow-up keeps both selected companies instead of all 18');

  const desk = parseCommand('Show prices', { ticker: 'INFY', tickers: ['INFY', 'TCS'], view: 'research' }, companies);
  assert.deepEqual(desk.tickers, ['INFY', 'TCS']);
  const overview = parseCommand('Show prices', { ticker: 'INFY', tickers: ['INFY'], view: 'briefing' }, companies);
  assert.deepEqual(overview.tickers, [], 'outside the research desk a bare price request opens the portfolio tape');
  assert.deepEqual(parseCommand('Show all prices', { ticker: 'INFY', tickers: ['INFY', 'TCS'], view: 'research' }, companies).tickers, []);

  const pluralResearch = parseCommand('What is their FY27 guidance?', { ticker: 'INFY', tickers: ['INFY', 'TCS'] }, companies);
  assert.equal(pluralResearch.action, 'compare');
  assert.deepEqual(pluralResearch.tickers, ['INFY', 'TCS']);

  const uncovered = parseCommand('PIDILITIND current stock price', {}, companies);
  assert.equal(uncovered.action, 'prices');
  assert.deepEqual(uncovered.tickers, ['PIDILITIND']);

  const pricing = parseCommand('What does HDFC Bank management say about pricing power?', {}, companies);
  assert.equal(pricing.action, 'research');
  assert.equal(pricing.includePrices, false);
  assert.equal(parseCommand('Pause price auto refresh', {}, companies).workspace.operations[0].value, false);
});

test('an unrecognised company in a price request asks for a symbol instead of quoting the current company', async () => {
  const p = parseCommand('Nestle India share price', { ticker: 'INFY', view: 'research' }, companies);
  assert.equal(p.action, 'clarify');
  assert.match(p.message, /NSE symbol/);
  assert.equal((await planCommand({ prompt: 'Nestle India share price', context: { ticker: 'INFY' }, companies, env: {} })).action, 'clarify');
});

test('a model router cannot turn a pricing-power question into a quote request', () => {
  const plan = validatePlan({ action: 'research', tickers: ['INFY'], query: 'pricing power', includePrices: true }, 'What does Infosys say about pricing power?', {}, companies);
  assert.equal(plan.includePrices, false);
});

test('Gemini routing resolves an unfamiliar company name for a price request', async () => {
  const previous = globalThis.fetch;
  let routed = 0;
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith('https://generativelanguage.googleapis.com/'));
    routed++;
    const body = JSON.parse(options.body);
    assert.match(body.systemInstruction.parts[0].text, /stock prices are separate market data/);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ action: 'prices', tickers: ['NESTLEIND'], query: 'Nestle India share price', includePrices: true }) }] } }] });
  };
  try {
    const p = await planCommand({ prompt: 'Nestle India share price', context: { ticker: 'INFY' }, companies, env: { GEMINI_API_KEY: 'test-key' } });
    assert.equal(routed, 1);
    assert.equal(p.action, 'prices');
    assert.deepEqual(p.tickers, ['NESTLEIND']);
    assert.equal(p.planner, 'Gemini intent routing');
  } finally {
    globalThis.fetch = previous;
  }
});

test('price-only commands never call the model router', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('No network call is expected for a familiar price request');
  try {
    const p = await planCommand({ prompt: 'TCS current stock price', context: {}, companies, env: { GEMINI_API_KEY: 'test-key' } });
    assert.equal(p.action, 'prices');
    assert.equal(p.planner, 'workspace rules');
  } finally {
    globalThis.fetch = previous;
  }
});
