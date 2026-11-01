// Endpoint and routing tests for the results first cut, against the built Worker (run `npm run build` first).
// NSE's filing list and archive are replaced by fixtures with the real structure and synthetic figures.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import { parseCommand } from '../src/commands.js';
import { fixtureXbrl, fixtureList, fixtureFigures, parseFixtureUrl } from './fixtures/xbrl-fixture.mjs';

const seen = [];
let listDown = false;
const real = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = String(typeof input === 'string' ? input : input.url);
  if (url.startsWith('https://www.nseindia.com/api/integrated-filing-results')) {
    seen.push(url);
    if (listDown) return new Response('<html>Access Denied</html>', { status: 403 });
    return Response.json(fixtureList(new URL(url).searchParams.get('symbol')));
  }
  if (url.startsWith('https://nsearchives.nseindia.com/')) {
    seen.push(url);
    const p = parseFixtureUrl(url);
    return p ? new Response(fixtureXbrl(p.symbol, p.quarterEnd, p.basis)) : new Response('missing', { status: 404 });
  }
  if (url.startsWith('https://generativelanguage.googleapis.com/')) throw new Error('No model call expected');
  return real(input, options);
};
const get = (path) => worker.fetch(new Request('https://finn.test' + path), {}, {});

test('/api/results validates ticker and quarter', async () => {
  assert.equal((await get('/api/results')).status, 400);
  assert.equal((await get('/api/results?ticker=../etc')).status, 400);
  const bad = await get('/api/results?ticker=INFY&quarter=sometime');
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /Q2 FY27/);
});

test('/api/results returns the latest consolidated first cut with portfolio names', async () => {
  const r = await (await get('/api/results?ticker=INFY')).json();
  assert.equal(r.status, 'ok');
  assert.equal(r.company, 'Infosys');
  assert.deepEqual([r.quarter.label, r.basis, r.taxonomy], ['Q2 FY27', 'consolidated', 'INDAS']);
  const rev = r.rows.find((x) => x.key === 'revenue');
  assert.equal(rev.current, Number((fixtureFigures('INFY', '2026-09-30').RevenueFromOperations / 1e7).toFixed(2)));
  assert.equal(typeof rev.qoq, 'number');
  assert.equal(typeof rev.yoy, 'number');
  assert.ok(r.periods.current.xbrl.startsWith('https://nsearchives.nseindia.com/corporate/xbrl/'));
  assert.equal(seen.filter((u) => /symbol=INFY/.test(u)).length, 1);
});

test('/api/results accepts a fiscal label or a date, and a basis', async () => {
  const label = await (await get('/api/results?ticker=TCS&quarter=Q4%20FY26')).json();
  assert.deepEqual([label.quarter.end, label.periods.previous.label, label.periods.yearAgo.label], ['2026-03-31', 'Q3 FY26', 'Q4 FY25']);
  const date = await (await get('/api/results?ticker=TCS&quarter=2026-06-30&basis=standalone')).json();
  assert.deepEqual([date.quarter.label, date.basis], ['Q1 FY27', 'standalone']);
  const bank = await (await get('/api/results?ticker=ICICIBANK')).json();
  assert.equal(bank.taxonomy, 'BANKING');
  assert.equal(bank.rows[1].label, 'Net interest income');
});

test('/api/results reports an unreachable NSE without figures', async () => {
  listDown = true;
  try {
    const r = await get('/api/results?ticker=LT');
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.deepEqual([body.status, body.error, body.rows], ['unavailable', 'NSE filing list HTTP 403', undefined]);
  } finally { listDown = false; }
});

test('results requests route from the command bar', () => {
  const companies = [{ ticker: 'INFY', name: 'Infosys' }, { ticker: 'TCS', name: 'Tata Consultancy Services' }, { ticker: 'HDFCBANK', name: 'HDFC Bank' }, { ticker: 'LT', name: 'Larsen & Toubro' }];
  const p = (q, ctx = {}) => parseCommand(q, ctx, companies);
  assert.deepEqual([p('Infosys Q2 FY27 results').action, p('Infosys Q2 FY27 results').tickers, p('Infosys Q2 FY27 results').results], ['results', ['INFY'], { quarter: '2026-09-30' }]);
  assert.deepEqual(p('Q4 FY26 results for Infosys').results, { quarter: '2026-03-31' });
  assert.equal(p('How were TCS results?').action, 'results');
  assert.equal(p('Show HDFC Bank quarterly results').action, 'results');
  assert.equal(p('results first cut for L&T').action, 'results');
  assert.equal(p('What were the latest quarterly numbers for TCS?').action, 'results');
  assert.deepEqual(p('Latest results', { ticker: 'LT' }).tickers, ['LT']);
  assert.equal(p('Latest results').action, 'clarify');
  assert.equal(p('Infosys Q2 FY27 results').view, 'stock');
  // Neighbours keep their routes.
  assert.equal(p('What did Infosys management say about Q2 results?').action, 'research');
  assert.equal(p('Any results announcements this week?').action, 'digest');
  assert.equal(p('Compare Infosys and TCS quarterly results').action, 'compare');
  assert.equal(p('Show the Infosys chart').action, 'stock');
  // A metric compared with guidance is single-issuer research, not a company comparison.
  assert.deepEqual([p('How did FY26 revenue growth compare with final guidance?', { ticker: 'INFY' }).action, p('How did FY26 revenue growth compare with final guidance?', { ticker: 'INFY' }).tickers], ['research', ['INFY']]);
  assert.equal(p('Compare Infosys', { ticker: 'TCS' }).action, 'clarify');
});
