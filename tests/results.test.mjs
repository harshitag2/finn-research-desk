// Results first cut: dates and fiscal labels, the NSE filing list, the XBRL reader, period/basis validation,
// derived EBITDA / NII, arithmetic checks, QoQ / YoY, and the end-to-end flow with partial and failed sources.
// XBRL documents come from tests/fixtures/xbrl-fixture.mjs: the real NSE structure with synthetic figures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nseDate, nseStamp, fiscalLabel, quarterFromLabel, priorQuarter, parseFilingList, pickFiling, parseXbrl, quarterFacts, readQuarter, resultsFirstCut, listUrl } from '../src/results.js';
import { fixtureXbrl, fixtureList, fixtureFigures, parseFixtureUrl } from './fixtures/xbrl-fixture.mjs';

test('dates, fiscal quarters and prior periods', () => {
  assert.equal(nseDate('30-SEP-2026'), '2026-09-30');
  assert.equal(nseDate('31-mar-2026'), '2026-03-31');
  assert.equal(nseDate('2026-09-30'), null);
  assert.equal(nseStamp('23-Oct-2026 20:21:12'), '2026-10-23T14:51:12.000Z');
  assert.equal(fiscalLabel('2026-09-30'), 'Q2 FY27');
  assert.equal(fiscalLabel('2026-03-31'), 'Q4 FY26');
  assert.equal(fiscalLabel('2025-12-31'), 'Q3 FY26');
  assert.equal(fiscalLabel('2026-06-30'), 'Q1 FY27');
  assert.equal(quarterFromLabel('Q2 FY27'), '2026-09-30');
  assert.equal(quarterFromLabel('q4fy26'), '2026-03-31');
  assert.equal(quarterFromLabel("Q3 FY'26"), '2025-12-31');
  assert.equal(quarterFromLabel('Q1 2027'), '2026-06-30');
  assert.equal(quarterFromLabel('FY27'), null);
  assert.equal(priorQuarter('2026-09-30'), '2026-06-30');
  assert.equal(priorQuarter('2026-03-31'), '2025-12-31');
  assert.equal(priorQuarter('2026-06-30'), '2026-03-31');
  assert.equal(priorQuarter('2026-09-30', 4), '2025-09-30');
  assert.equal(priorQuarter('2026-03-31', 4), '2025-03-31');
  assert.match(listUrl('M&M'), /symbol=M%26M&type=Integrated%20Filing-%20Financials$/);
});

test('the NSE filing list keeps financial XBRL filings from the archive only', () => {
  const body = fixtureList('LISTCO');
  body.data.push({ ...body.data[0], xbrl: 'https://evil.example/x.xml' }, { ...body.data[0], symbol: 'OTHER' }, { ...body.data[0], qe_Date: 'not a date' });
  const filings = parseFilingList(body, 'LISTCO');
  assert.equal(filings.length, 14, '7 quarters × 2 bases; governance, foreign hosts, other symbols and bad dates dropped');
  const f = filings[0];
  assert.deepEqual([f.quarterEnd, f.basis, f.audited, f.revision, f.taxonomy], ['2026-09-30', 'consolidated', false, false, 'INDAS']);
  assert.equal(f.filedAt, '2026-10-23T13:00:00.000Z');
  assert.match(f.ixbrl, /^https:\/\/nsearchives\.nseindia\.com\/corporate\/ixbrl\//);
  // A revision filed later replaces the original for the same quarter and basis.
  const revised = { ...f, revision: true, filedAt: '2026-11-01T00:00:00.000Z', xbrl: f.xbrl.replace('_WEB', '_REV_WEB') };
  assert.equal(pickFiling([f, revised], '2026-09-30', 'consolidated'), revised);
  assert.equal(pickFiling(filings, '2024-12-31', 'consolidated'), null);
  assert.throws(() => parseFilingList({ nope: true }, 'LISTCO'), /Unexpected NSE filing list/);
});

test('the XBRL reader separates quarter, year-to-date and dimensional facts', () => {
  const parsed = parseXbrl(fixtureXbrl('READCO', '2026-09-30'));
  assert.deepEqual(parsed.contexts.OneD, { start: '2026-07-01', end: '2026-09-30', instant: null, entity: 'READCO', dimensional: false });
  assert.equal(parsed.contexts.OneReportable1D.dimensional, true);
  const q = quarterFacts(parsed, '2026-09-30');
  assert.deepEqual(q.contextIds, ['OneD'], 'year-to-date (FourD) and segment contexts are excluded');
  const f = fixtureFigures('READCO', '2026-09-30');
  assert.equal(q.values.RevenueFromOperations, f.RevenueFromOperations);
  assert.equal(q.values.NatureOfReportStandaloneConsolidated, 'Consolidated');
  assert.equal(parsed.facts.find((x) => x.tag === 'DisclosureOfNotesOnFinancialResultsExplanatoryTextBlock').value, '<p>TEST FIXTURE note & disclosure</p>');
  assert.equal(quarterFacts(parsed, '2026-06-30').contextIds.length, 0);
  assert.throws(() => parseXbrl('<html>Access Denied</html>'), /Not an XBRL instance/);
});

test('readQuarter derives EBITDA, reconciles the filing and validates basis, period, currency and symbol', () => {
  const f = fixtureFigures('CHECKCO', '2026-09-30');
  const r = readQuarter(parseXbrl(fixtureXbrl('CHECKCO', '2026-09-30')), { quarterEnd: '2026-09-30', basis: 'consolidated', taxonomy: 'INDAS', symbol: 'CHECKCO' });
  assert.equal(r.ok, true);
  assert.equal(r.values.ebitda, f.ProfitBeforeExceptionalItemsAndTax + f.FinanceCosts + f.DepreciationDepletionAndAmortisationExpense - f.OtherIncome);
  assert.ok(Math.abs(r.values.ebitdaMargin - (r.values.ebitda / f.RevenueFromOperations) * 100) < 1e-9);
  assert.equal(r.audited, false);
  assert.deepEqual(r.checks.map((c) => c.ok), [true, true, true]);
  const read = (xml, extra = {}) => readQuarter(parseXbrl(xml), { quarterEnd: '2026-09-30', basis: 'consolidated', taxonomy: 'INDAS', symbol: 'CHECKCO', ...extra });
  assert.match(read(fixtureXbrl('CHECKCO', '2026-09-30', 'consolidated', { nature: 'Standalone' })).error, /standalone, not consolidated/);
  assert.match(read(fixtureXbrl('CHECKCO', '2026-09-30', 'consolidated', { reportedEnd: '2026-06-30' })).error, /period ending 2026-06-30/);
  assert.match(read(fixtureXbrl('CHECKCO', '2026-09-30', 'consolidated', { symbolOverride: 'OTHERCO' })).error, /belongs to OTHERCO/);
  assert.match(read(fixtureXbrl('CHECKCO', '2026-09-30'), { taxonomy: 'NBFC' }).error, /NBFC\) is not supported/);
  assert.match(read(fixtureXbrl('CHECKCO', '2026-09-30').replace(/<in-capmkt:ProfitBeforeTax contextRef="OneD"[^\n]*\n/, '')).error, /does not report pbt/);
  // A filing whose own lines do not add up is flagged, not silently trusted.
  const broken = fixtureXbrl('CHECKCO', '2026-09-30').replace(/(<in-capmkt:Income contextRef="OneD"[^>]*>)(\d+)/, (m, a, v) => a + (Number(v) + 5e9));
  const b = read(broken);
  assert.equal(b.ok, true);
  assert.equal(b.checks[0].ok, false);
  assert.match(b.checks[0].detail, /differs by ₹500\.00 crore/);
});

function fixtureFetcher({ lists = {}, failList = new Set(), failXbrl = new Set(), seen = [] } = {}) {
  return async (url) => {
    seen.push(url);
    if (url.startsWith('https://www.nseindia.com/api/integrated-filing-results')) {
      const symbol = new URL(url).searchParams.get('symbol');
      if (failList.has(symbol)) return new Response('Access Denied', { status: 403 });
      return Response.json(lists[symbol] || fixtureList(symbol));
    }
    const p = parseFixtureUrl(url);
    if (!p) return new Response('not found', { status: 404 });
    if (failXbrl.has(p.quarterEnd + ':' + p.symbol)) return new Response('error', { status: 500 });
    return new Response(fixtureXbrl(p.symbol, p.quarterEnd, p.basis), { status: 200, headers: { 'content-type': 'application/xml' } });
  };
}
const crore = (v) => Number((v / 1e7).toFixed(2));
const pct = (a, b) => Number((((a - b) / b) * 100).toFixed(2));

test('resultsFirstCut reads three quarters on one basis and computes QoQ and YoY', async () => {
  const seen = [];
  const r = await resultsFirstCut({ symbol: 'FIRSTCO', company: 'First Co', fetcher: fixtureFetcher({ seen }) });
  assert.equal(r.status, 'ok');
  assert.deepEqual([r.basis, r.taxonomy, r.quarter.label, r.periods.previous.label, r.periods.yearAgo.label], ['consolidated', 'INDAS', 'Q2 FY27', 'Q1 FY27', 'Q2 FY26']);
  const [c, p, y] = ['2026-09-30', '2026-06-30', '2025-09-30'].map((q) => fixtureFigures('FIRSTCO', q));
  const rev = r.rows.find((x) => x.key === 'revenue');
  assert.deepEqual([rev.current, rev.previous, rev.yearAgo], [crore(c.RevenueFromOperations), crore(p.RevenueFromOperations), crore(y.RevenueFromOperations)]);
  assert.equal(rev.qoq, pct(c.RevenueFromOperations, p.RevenueFromOperations));
  assert.equal(rev.yoy, pct(c.RevenueFromOperations, y.RevenueFromOperations));
  const margin = r.rows.find((x) => x.key === 'ebitdaMargin');
  assert.equal(margin.changeUnit, 'pp');
  assert.equal(margin.unit, '%');
  assert.match(r.rows.find((x) => x.key === 'ebitda').derived, /finance costs \+ depreciation/);
  assert.deepEqual(r.rows.filter((x) => x.headline).map((x) => x.key), ['revenue', 'ebitda', 'ebitdaMargin', 'pbt', 'pat']);
  assert.equal(r.rows.find((x) => x.key === 'exceptional').qoq, null, 'a zero base is not a meaningful percentage');
  assert.equal(r.company, 'First Co');
  assert.deepEqual(r.gaps, []);
  assert.match(r.method, /Nothing is estimated/);
  assert.equal(seen.filter((u) => u.includes('/xbrl/')).length, 3, 'one list request and exactly three consolidated instances');
  assert.ok(seen.every((u) => !/STANDALONE/.test(u)));
  assert.equal(r.available.length, 7);
  await resultsFirstCut({ symbol: 'FIRSTCO', fetcher: fixtureFetcher({ seen }) });
  assert.equal(seen.length, 4, 'list and instances are cached');
});

test('a named quarter and basis are honoured; Q4 compares with Q3 and the previous Q4', async () => {
  const r = await resultsFirstCut({ symbol: 'NAMEDCO', quarter: '2026-03-31', basis: 'standalone', fetcher: fixtureFetcher() });
  assert.equal(r.status, 'ok');
  assert.deepEqual([r.quarter.label, r.periods.previous.label, r.periods.yearAgo.label, r.basis], ['Q4 FY26', 'Q3 FY26', 'Q4 FY25', 'standalone']);
  assert.equal(r.rows[0].current, crore(fixtureFigures('NAMEDCO', '2026-03-31', 'standalone').RevenueFromOperations));
  const missing = await resultsFirstCut({ symbol: 'NAMEDCO', quarter: '2024-12-31', fetcher: fixtureFetcher() });
  assert.equal(missing.status, 'not_found');
  assert.match(missing.error, /no results filing for Q3 FY25\. Available: Q2 FY27, Q1 FY27/);
  assert.equal(missing.rows, undefined, 'no figures when the quarter is not filed');
});

test('missing or unreadable comparison filings give a partial first cut with the gap stated', async () => {
  const lists = { PARTCO: fixtureList('PARTCO', { skip: [{ quarter: '2025-09-30', basis: 'consolidated' }] }) };
  const r = await resultsFirstCut({ symbol: 'PARTCO', fetcher: fixtureFetcher({ lists, failXbrl: new Set(['2026-06-30:PARTCO']) }) });
  assert.equal(r.status, 'partial');
  const rev = r.rows.find((x) => x.key === 'revenue');
  assert.deepEqual([rev.previous, rev.qoq, rev.yearAgo, rev.yoy], [null, null, null, null]);
  assert.match(r.gaps.join(' '), /QoQ not computed: NSE archive HTTP 500/);
  assert.match(r.gaps.join(' '), /YoY not computed: NSE lists no consolidated filing for Q2 FY26/);
  assert.equal(r.periods.yearAgo.missing, true);
  assert.ok(r.rows.find((x) => x.key === 'pat').current > 0, 'the current quarter is still shown');
});

test('an unreadable list or current filing shows no figures', async () => {
  const down = await resultsFirstCut({ symbol: 'DOWNCO', fetcher: fixtureFetcher({ failList: new Set(['DOWNCO']) }) });
  assert.deepEqual([down.status, down.error, down.rows], ['unavailable', 'NSE filing list HTTP 403', undefined]);
  const bad = await resultsFirstCut({ symbol: 'BADCO', fetcher: fixtureFetcher({ failXbrl: new Set(['2026-09-30:BADCO']) }) });
  assert.deepEqual([bad.status, bad.error, bad.rows], ['unavailable', 'NSE archive HTTP 500', undefined]);
  const net = await resultsFirstCut({ symbol: 'NETCO', fetcher: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(net.error, 'Could not reach NSE (network error)');
  const empty = await resultsFirstCut({ symbol: 'EMPTYCO', fetcher: async () => Response.json({ data: [] }) });
  assert.equal(empty.status, 'not_found');
});

test('banks use the banking format: total income, derived NII and pre-provision operating profit', async () => {
  const r = await resultsFirstCut({ symbol: 'HDFCBANK', fetcher: fixtureFetcher() });
  assert.equal(r.status, 'ok');
  assert.equal(r.taxonomy, 'BANKING');
  const f = fixtureFigures('HDFCBANK', '2026-09-30');
  const row = (k) => r.rows.find((x) => x.key === k);
  assert.deepEqual(r.rows.filter((x) => x.headline).map((x) => x.label), ['Total income', 'Net interest income', 'Operating profit before provisions', 'Profit before tax', 'Net profit (PAT)']);
  assert.equal(row('nii').current, crore(f.InterestEarned - f.InterestExpended));
  assert.equal(row('ebitda').current, crore(f.OperatingProfitBeforeProvisionAndContingencies));
  assert.deepEqual(r.checks.map((c) => c.ok), [true, true, true]);
  assert.match(r.note, /EBITDA is not meaningful/);
});
