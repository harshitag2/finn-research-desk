// Push digest: classifier, summaries, IST timestamps, the date-bounded NSE request, window alerts and
// digest assembly. NSE category labels below are real feed labels (seen in the live run recorded in
// handoff/VERIFICATION.md); the texts are written for the test and are not real disclosures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAnnouncement, summarise, istToIso, fetchAnnouncements, windowAlerts, buildDigest, DEFAULT_FOCUS, CATEGORIES, CATEGORY_LABELS } from '../src/digest.js';

const c = (desc, text = '') => classifyAnnouncement({ desc, text });

test('classifier maps real NSE labels to the reference categories and materiality', () => {
  assert.deepEqual(c('Outcome of Board Meeting', 'Infosys Limited has informed the Exchange about audited financial results for the quarter'), { category: 'results', materiality: 'high', fixed: false, upcoming: false });
  assert.deepEqual(c('Integrated Filing- Financial', 'Quarterly integrated filing'), { category: 'results', materiality: 'high', fixed: false, upcoming: false });
  assert.equal(c('Change in Directors/ Key Managerial Personnel/ Auditor/ Compliance Officer/ Share Transfer Agent', 'appointment of a new Chief Financial Officer').category, 'management_change');
  assert.equal(c('Action(s) taken or orders passed', 'penalty order passed by a regulator').category, 'litigation');
  assert.equal(c('Credit Rating', 'reaffirmation of rating').category, 'credit_rating');
  assert.equal(c('Bagging/Receiving of orders/contracts', 'receipt of a large order').category, 'press_release');
  assert.deepEqual(c('Copy of Newspaper Publication', 'newspaper publication'), { category: 'unclassified', materiality: 'routine', fixed: false, upcoming: false });
  assert.equal(c('Trading Window-XBRL', 'closure of trading window').materiality, 'routine');
  assert.equal(c('Analysts/Institutional Investor Meet/Con. Call Updates', 'schedule of analyst meetings').category, 'investor_meetings');
  assert.equal(c('Analysts/Institutional Investor Meet/Con. Call Updates', 'audio recording of the earnings call').category, 'earnings_call');
  assert.equal(c('Shareholders meeting', 'notice of the annual general meeting').category, 'agm_egm');
  assert.equal(c('Dividend', 'interim dividend declared').category, 'dividend');
  assert.equal(c('Record Date', 'record date for the purpose of interim dividend').category, 'dividend');
  assert.equal(c('Record Date', 'record date for a corporate action').materiality, 'routine');
  assert.equal(c('Allotment of Securities', 'allotment of shares under the ESOP scheme').materiality, 'routine', 'employee stock allotments are not a fund raise');
  assert.equal(c('Allotment of Securities', 'allotment of non-convertible debentures').category, 'fund_raise');
  assert.equal(c('Updates', 'general corporate update').category, 'press_release');
  assert.equal(c('Disclosure of Pledged Shares', 'creation of pledge by promoter').category, 'pledging');
});

test('generic "Updates" filings are classified by their text (patterns from the live run)', () => {
  assert.equal(c('Updates', "'Earnings Call Transcript'.").category, 'earnings_call');
  assert.equal(c('General Updates', "Audio Recording of the investors' call held on 27th October 2026.").category, 'earnings_call');
  assert.equal(c('Analysts/Institutional Investor Meet/Con. Call Updates', 'Link of Recording').category, 'earnings_call');
  assert.deepEqual(c('Updates', "' Investor Conference'."), { category: 'investor_meetings', materiality: 'routine', fixed: false, upcoming: false });
  assert.equal(c('General Updates', 'Updates on the Business Transfer Agreement with a wholly owned subsidiary').category, 'M&A');
  assert.equal(c('General Updates', 'Initial Public Offer of a subsidiary').category, 'fund_raise');
  assert.equal(c('General Updates', 'Trading in equity shares of the subsidiary will commence from tomorrow').category, 'fund_raise');
  assert.equal(c('Updates', 'The Board approved the payment of an interim dividend').category, 'dividend');
  assert.equal(c('Updates', 'Transfer of equity shares by the Employees Stock Option Trust to grantees').materiality, 'routine');
  assert.equal(c('Updates', 'Company announces expansion of a development centre').category, 'capex');
  assert.equal(c('General Updates', 'Resignation of the statutory auditor').category, 'management_change');
  assert.equal(c('General Updates', 'General Updates').materiality, 'routine');
  // An outcome naming no results is worth opening, but it is not labelled as results.
  assert.deepEqual(c('Outcome of Board Meeting', 'Outcome of the Board Meeting held on 28th October, 2026.'), { category: 'unclassified', materiality: 'medium', fixed: false, upcoming: false });
  assert.equal(CATEGORY_LABELS.unclassified, 'Other filing');
});

test('board-meeting intimations are upcoming events, classified by their agenda', () => {
  // NSE sometimes files the notice under an analyst-meet label; the text still marks it as upcoming.
  assert.deepEqual(c('Analysts/Institutional Investor Meet/Con. Call Updates', 'The meeting of the Board of Directors of the Company is scheduled on October 30, inter alia, to consider raising of funds'), { category: 'fund_raise', materiality: 'medium', fixed: false, upcoming: true });
  assert.equal(c('Analysts/Institutional Investor Meet/Con. Call Updates', 'The meeting of the Board of Directors of the Company is scheduled on October 30 to consider the financial results').upcoming, true);
  assert.deepEqual(c('Board Meeting Intimation', 'a meeting of the Board of Directors is scheduled on 16-Oct-2026 to consider and approve financial results'), { category: 'results', materiality: 'medium', fixed: true, upcoming: true });
  assert.deepEqual(c('Board Meeting Intimation', 'a meeting of the Board of Directors is scheduled to consider general business'), { category: 'unclassified', materiality: 'routine', fixed: false, upcoming: true });
  assert.deepEqual(c('Board Meeting Intimation', 'a meeting of the Board of Directors is scheduled to consider a proposal for bonus issue'), { category: 'bonus_split', materiality: 'high', fixed: false, upcoming: true });
  assert.equal(c('Board Meeting Intimation', 'to consider fund raising by issue of debentures').category, 'fund_raise');
  // A subsidiary incorporation is M&A but stays "worth a look" even when M&A is a focus category.
  assert.deepEqual(c('Updates', 'incorporation of a wholly owned subsidiary'), { category: 'M&A', materiality: 'medium', fixed: true, upcoming: false });
  assert.equal(c('Acquisition', 'acquisition of 100% stake in a software company').materiality, 'high');
  for (const k of CATEGORIES) assert.ok(CATEGORY_LABELS[k], 'label for ' + k);
  for (const k of DEFAULT_FOCUS) assert.ok(CATEGORIES.includes(k));
});

test('summaries drop exchange boilerplate and empty repeats; IST stamps become ISO', () => {
  assert.equal(summarise("Infosys Limited has informed the Exchange regarding 'Press release on large deal'.", 'Updates'), 'Press release on large deal');
  assert.equal(summarise('TCS Limited has informed the Exchange about Copy of Newspaper Publication', 'Copy of Newspaper Publication'), '');
  assert.equal(summarise('', 'Updates'), '');
  assert.ok(summarise('x'.repeat(400), 'Updates').length <= 220);
  assert.equal(istToIso('2026-10-30 18:50:50'), '2026-10-30T13:20:50.000Z');
  assert.equal(istToIso('2026-10-30T00:10:00'), '2026-10-29T18:40:00.000Z');
  assert.equal(istToIso('not a date'), null);
});

const NOW = Date.parse('2026-10-31T06:00:00Z'); // 11:30 IST
const ist = (ms) => { const d = new Date(ms + 5.5 * 3600000), p = (n) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`; };
const H = 3600000;
const row = (symbol, hoursAgo, desc, text, n = 0) => ({ symbol, desc, attchmntText: text, attchmntFile: `https://nsearchives.nseindia.com/corporate/${symbol}-${hoursAgo}-${n}.pdf`, sort_date: ist(NOW - hoursAgo * H), sm_name: symbol + ' Ltd', seq_id: symbol + hoursAgo + n, attFileSize: '90 KB' });

function nseFetcher(feed, seen = [], failing = new Set()) {
  return async (url, options) => {
    if (url.startsWith('https://www.nseindia.com/api/corporate-announcements')) {
      const u = new URL(url), symbol = u.searchParams.get('symbol');
      seen.push({ symbol, from: u.searchParams.get('from_date'), to: u.searchParams.get('to_date'), headers: options?.headers });
      if (failing.has(symbol)) return new Response('Access Denied', { status: 403 });
      return Response.json(feed[symbol] || []);
    }
    throw new Error('unexpected request ' + url);
  };
}

test('fetchAnnouncements makes a date-bounded request and keeps only safe attachment links', async () => {
  const seen = [];
  const feed = { BOUNDA: [row('BOUNDA', 2, 'Updates', 'BOUNDA Ltd has informed the Exchange about a plant visit'), { ...row('BOUNDA', 3, 'Updates', 'x'), attchmntFile: 'javascript:alert(1)' }] };
  const rows = await fetchAnnouncements('BOUNDA', { days: 8, fetcher: nseFetcher(feed, seen), now: NOW });
  assert.equal(seen.length, 1);
  assert.deepEqual([seen[0].from, seen[0].to], ['23-10-2026', '31-10-2026'], 'from/to dates in IST, never an unbounded history request');
  assert.match(seen[0].headers.Referer, /nseindia\.com/);
  assert.equal(rows[0].at, new Date(NOW - 2 * H).toISOString().replace(/\.\d{3}Z$/, '.000Z'));
  assert.equal(rows[0].company, 'BOUNDA Ltd');
  assert.equal(rows[1].url, '', 'non-https attachment links are dropped');
  await fetchAnnouncements('BOUNDA', { days: 8, fetcher: nseFetcher(feed, seen), now: NOW + 60000 });
  assert.equal(seen.length, 1, 'repeat requests within ten minutes use the cache');
  await assert.rejects(fetchAnnouncements('DENIEDCO', { days: 2, fetcher: nseFetcher({}, [], new Set(['DENIEDCO'])), now: NOW }), /HTTP 403/);
  await assert.rejects(fetchAnnouncements('ODDSHAPE', { days: 2, fetcher: async () => Response.json({ unexpected: true }), now: NOW }), /Unexpected NSE response/);
});

function history(symbol, closes, volumes, lastPartial = false) {
  return { symbol, lastPartial, rows: closes.map((close, i) => ({ date: '2026-09-' + String(i + 1).padStart(2, '0'), close, volume: volumes[i] })) };
}

test('window alerts check each completed session in the window against the thresholds', () => {
  const closes = Array(25).fill(100), volumes = Array(25).fill(1000);
  closes[22] = 105.5; // +5.5% vs 100
  closes[23] = 105.5;
  volumes[24] = 5000; // 5× the prior 20
  closes[24] = 106;
  const one = windowAlerts(history('ALRT', closes, volumes), 1, { priceThreshold: 4, volumeThreshold: 2 });
  assert.deepEqual(one.map((a) => a.type), ['volume'], 'one session: only the latest completed day');
  assert.equal(one[0].severity, 'high', '5× is more than double the 2× threshold');
  const three = windowAlerts(history('ALRT', closes, volumes), 3, { priceThreshold: 4, volumeThreshold: 2 });
  assert.deepEqual(three.map((a) => a.type).sort(), ['price', 'volume']);
  assert.match(three.find((a) => a.type === 'price').text, /ALRT rose 5\.50% on 2026-09-23 \(threshold ±4%\)/);
  // A live (partial) session is never treated as complete.
  const partial = windowAlerts(history('ALRT', closes, volumes, true), 1, { priceThreshold: 4, volumeThreshold: 2 });
  assert.deepEqual(partial, []);
  assert.deepEqual(windowAlerts(history('ALRT', closes, volumes), 3, { priceThreshold: 10, volumeThreshold: 10 }), []);
});

test('buildDigest groups duplicate filings, applies the window and focus, and sorts by materiality', async () => {
  const feed = {
    DGA: [
      row('DGA', 2, 'Outcome of Board Meeting', 'DGA Ltd has informed the Exchange about audited financial results for the quarter', 0),
      row('DGA', 2, 'Outcome of Board Meeting', 'DGA Ltd has informed the Exchange about audited financial results for the quarter', 1),
      row('DGA', 30, 'Copy of Newspaper Publication', 'newspaper publication'),
      row('DGA', 6 * 24, 'Credit Rating', 'DGA Ltd has informed the Exchange about reaffirmation of its credit rating'),
    ],
    DGB: [
      row('DGB', 5, 'Board Meeting Intimation', 'a meeting of the Board of Directors is scheduled to consider and approve financial results'),
      row('DGB', 9, 'Updates', 'DGB Ltd has informed the Exchange about incorporation of a wholly owned subsidiary'),
      row('DGB', 10, 'Credit Rating', 'DGB Ltd has informed the Exchange about a rating upgrade'),
    ],
  };
  const d = await buildDigest({ tickers: ['DGA', 'DGB', 'DGA'], names: { DGA: 'Digest A' }, window: '24h', fetcher: nseFetcher(feed), now: NOW, includePrices: false });
  assert.equal(d.status, 'ok');
  assert.equal(d.items.length, 4, 'the duplicate results filing is grouped; items older than 24h are excluded');
  const results = d.items.find((i) => i.ticker === 'DGA' && i.category === 'results');
  assert.equal(results.filings, 2);
  assert.equal(results.links.length, 2);
  assert.equal(results.company, 'Digest A');
  assert.equal(results.summary, 'Audited financial results for the quarter');
  assert.deepEqual(d.items.map((i) => i.materiality), ['high', 'high', 'medium', 'medium'], 'sorted high before medium');
  assert.equal(d.items.find((i) => i.category === 'credit_rating').materiality, 'high', 'credit rating is a default focus category, raised to attention');
  assert.equal(d.items.find((i) => i.category === 'M&A').materiality, 'medium', 'fixed rules keep their materiality');
  const upcoming = d.items.find((i) => i.ticker === 'DGB' && i.category === 'results');
  assert.equal(upcoming.upcoming, true);
  assert.equal(upcoming.materiality, 'medium');
  assert.deepEqual(d.counts, { results: 2, 'M&A': 1, credit_rating: 1 });
  assert.deepEqual(d.summary, { filings: 4, attention: 2, worthALook: 2, routine: 0, priceAlerts: 0 });
  assert.match(d.notice, /does not monitor in the background/);

  const week = await buildDigest({ tickers: ['DGA', 'DGB'], window: '7d', focus: [], fetcher: nseFetcher(feed), now: NOW, includePrices: false });
  assert.equal(week.items.length, 6);
  assert.equal(week.items.filter((i) => i.category === 'credit_rating').every((i) => i.materiality === 'medium' && !i.focus), true, 'without focus, ratings stay medium');
  assert.equal(week.items.at(-1).materiality, 'routine', 'routine paperwork sorts last');
});

test('buildDigest reports partial and unavailable feeds without inventing items', async () => {
  const feed = { OKCO: [row('OKCO', 1, 'Updates', 'OKCO Ltd has informed the Exchange about a product launch')] };
  const partial = await buildDigest({ tickers: ['OKCO', 'BADCO'], window: '24h', fetcher: nseFetcher(feed, [], new Set(['BADCO'])), now: NOW, includePrices: false });
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.failures, [{ ticker: 'BADCO', error: 'NSE announcements HTTP 403' }]);
  assert.equal(partial.items.length, 1);
  const down = await buildDigest({ tickers: ['DOWNA', 'DOWNB'], window: '7d', fetcher: async () => { throw new TypeError('fetch failed'); }, now: NOW, includePrices: false });
  assert.equal(down.status, 'unavailable');
  assert.equal(down.items.length, 0);
  assert.equal(down.failures[0].error, 'Could not reach NSE (network error)');
});

test('buildDigest adds threshold alerts from daily histories over the matching number of sessions', async () => {
  const days = [];
  for (let t = Math.floor(NOW / 1000) - 86400 * 2; days.length < 60; t -= 86400) { const d = new Date(t * 1000).getUTCDay(); if (d && d !== 6) days.unshift(t); }
  const close = days.map(() => 200), volume = days.map(() => 1e6);
  close[59] = 190; // −5% on the last completed session
  close[56] = 210; close[57] = 200; // +5% and −4.76% three and two sessions back
  const fetcher = async (url, options) => {
    if (url.startsWith('https://query1.finance.yahoo.com/v8/finance/chart/')) return Response.json({ chart: { result: [{ meta: { symbol: 'PXA.NS', currency: 'INR' }, timestamp: days, indicators: { quote: [{ close, volume }], adjclose: [{ adjclose: close }] } }] } });
    return nseFetcher({})(url, options);
  };
  const day = await buildDigest({ tickers: ['PXA'], window: '24h', prefs: { priceThreshold: 4, volumeThreshold: 3 }, fetcher, now: NOW });
  assert.deepEqual(day.priceAlerts.map((a) => [a.type, a.value]), [['price', -5]]);
  const week = await buildDigest({ tickers: ['PXA'], window: '7d', prefs: { priceThreshold: 4, volumeThreshold: 3 }, fetcher, now: NOW });
  assert.equal(week.priceAlerts.length, 3);
  assert.equal(week.summary.priceAlerts, 3);
  assert.deepEqual(week.priceFailures, []);
});
