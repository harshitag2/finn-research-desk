// Quarterly results first cut, computed in code from the company's own exchange filing.
//
// Source: NSE's "Integrated Filing – Financials" list for a symbol, which links one machine-readable XBRL
// instance per quarter and basis (consolidated / standalone), filed by the company under SEBI LODR
// Regulation 33. Each instance carries the reported quarter and the year to date only, so the previous
// quarter and the year-ago quarter are read from their own filings, on the same basis, and QoQ / YoY are
// computed here. EBITDA is not a reported line in Indian results: it is derived with a stated formula.
// Banks file under a different taxonomy; for them pre-provision operating profit stands in for EBITDA.
// Nothing is estimated, interpolated or taken from secondary data.

const UA = { 'User-Agent': 'Mozilla/5.0 (FINN research prototype)', Accept: 'application/json, application/xml, text/xml', Referer: 'https://www.nseindia.com/companies-listing/corporate-integrated-filing' };
export const listUrl = (symbol) => 'https://www.nseindia.com/api/integrated-filing-results?index=equities&symbol=' + encodeURIComponent(symbol) + '&type=Integrated%20Filing-%20Financials';
const ARCHIVE = /^https:\/\/nsearchives\.nseindia\.com\/corporate\//;
const MONTH = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
const pad = (n) => String(n).padStart(2, '0');
const CRORE = 1e7;

// "30-SEP-2026" → "2026-09-30"
export function nseDate(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m || !(m[2].toUpperCase() in MONTH)) return null;
  return m[3] + '-' + pad(MONTH[m[2].toUpperCase()] + 1) + '-' + pad(m[1]);
}
// "23-Oct-2026 20:21:12" (IST) → ISO
export function nseStamp(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m || !(m[2].toUpperCase() in MONTH)) return null;
  return new Date(Date.UTC(+m[3], MONTH[m[2].toUpperCase()], +m[1], +m[4] - 5, +m[5] - 30, +m[6])).toISOString();
}
// Indian fiscal year runs April–March: the quarter ending 30 Sep 2026 is Q2 FY27.
export function fiscalLabel(quarterEnd) {
  const m = String(quarterEnd).match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!m) return quarterEnd;
  const y = +m[1], mo = +m[2], q = mo === 6 ? 1 : mo === 9 ? 2 : mo === 12 ? 3 : mo === 3 ? 4 : null;
  if (!q) return quarterEnd;
  return 'Q' + q + ' FY' + String(mo === 3 ? y : y + 1).slice(-2);
}
// "Q2 FY27" → "2026-09-30"
export function quarterFromLabel(text) {
  const m = String(text || '').match(/\bq\s*([1-4])\s*(?:fy\s*'?)?(\d{2}|\d{4})\b/i);
  if (!m) return null;
  const q = +m[1], fy = m[2].length === 2 ? 2000 + +m[2] : +m[2];
  return q === 4 ? fy + '-03-31' : (fy - 1) + (q === 1 ? '-06-30' : q === 2 ? '-09-30' : '-12-31');
}
// Quarter end shifted back by n quarters (always a calendar quarter end).
export function priorQuarter(quarterEnd, quarters = 1) {
  const [y, m] = quarterEnd.split('-').map(Number);
  const total = y * 12 + (m - 1) - 3 * quarters, ny = Math.floor(total / 12), nm = (total % 12) + 1;
  return ny + '-' + pad(nm) + '-' + pad(new Date(Date.UTC(ny, nm, 0)).getUTCDate());
}

export function parseFilingList(body, symbol) {
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : null;
  if (!rows) throw new Error('Unexpected NSE filing list');
  return rows
    .filter((r) => /financial/i.test(String(r.type || '')) && (!r.symbol || String(r.symbol).toUpperCase() === symbol))
    .map((r) => {
      const xbrl = typeof r.xbrl === 'string' && ARCHIVE.test(r.xbrl) ? r.xbrl : '';
      return {
        symbol, company: String(r.smName || r.cmName || symbol).slice(0, 120), quarterEnd: nseDate(r.qe_Date),
        basis: /consolidated/i.test(r.consolidated || '') ? 'consolidated' : /standalone/i.test(r.consolidated || '') ? 'standalone' : null,
        audited: /un-?audited/i.test(r.audited || '') ? false : /audited/i.test(r.audited || '') ? true : null,
        revision: /revis/i.test(r.type_Sub || ''), filedAt: nseStamp(r.creation_Date) || nseStamp(r.broadcast_Date),
        xbrl, ixbrl: typeof r.ixbrl === 'string' && ARCHIVE.test(r.ixbrl) ? r.ixbrl : '',
        taxonomy: (xbrl.match(/INTEGRATED_FILING_([A-Z]+)_/) || [])[1] || null, size: String(r.xbrlFileSize || '').slice(0, 20),
      };
    })
    .filter((f) => f.quarterEnd && f.basis && f.xbrl);
}
// The latest filing (originals and revisions alike) for one quarter and basis.
export function pickFiling(filings, quarterEnd, basis) {
  return filings.filter((f) => f.quarterEnd === quarterEnd && f.basis === basis).sort((a, b) => String(b.filedAt).localeCompare(String(a.filedAt)))[0] || null;
}

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
// A small, dependency-free reader for flat XBRL instances: contexts (period + whether dimensional) and facts.
export function parseXbrl(xml) {
  const text = String(xml || '');
  if (!/<(?:[\w-]+:)?xbrl\b/.test(text)) throw new Error('Not an XBRL instance');
  const contexts = {};
  for (const m of text.matchAll(/<(?:[\w-]+:)?context\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?context>/g)) {
    const body = m[2], get = (name) => (body.match(new RegExp('<(?:[\\w-]+:)?' + name + '\\b[^>]*>\\s*([^<]*?)\\s*<')) || [])[1] || null;
    contexts[m[1]] = { start: get('startDate'), end: get('endDate'), instant: get('instant'), entity: get('identifier'), dimensional: /<(?:[\w-]+:)?(?:explicitMember|typedMember)\b/.test(body) };
  }
  const facts = [];
  for (const m of text.matchAll(/<([\w-]+):([\w-]+)\b([^>]*?\bcontextRef="([^"]+)"[^>]*)>([^<]*)<\/\1:\2>/g)) {
    const attrs = m[3], unit = (attrs.match(/\bunitRef="([^"]+)"/) || [])[1] || null, raw = decode(m[5].trim());
    facts.push({ tag: m[2], context: m[4], unit, decimals: (attrs.match(/\bdecimals="([^"]+)"/) || [])[1] || null, value: unit && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw });
  }
  return { contexts, facts };
}
const days = (a, b) => (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;
// Facts reported for the three months ending on quarterEnd, without dimensions (the entity-wide totals).
export function quarterFacts(parsed, quarterEnd) {
  const ids = Object.entries(parsed.contexts).filter(([, c]) => !c.dimensional && c.start && c.end === quarterEnd && days(c.start, c.end) >= 80 && days(c.start, c.end) <= 100).map(([id]) => id);
  const values = {}, contexts = {};
  for (const f of parsed.facts) if (ids.includes(f.context) && !(f.tag in values)) { values[f.tag] = f.value; contexts[f.tag] = f.context; }
  // Document-level facts (basis, currency, period) are reported against the same context in NSE's instances.
  return { contextIds: ids, values, contexts, start: ids.length ? parsed.contexts[ids[0]].start : null };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pick = (v, ...tags) => { for (const t of tags) if (num(v[t]) !== null) return { value: v[t], tag: t }; return { value: null, tag: tags[0] }; };

// Each template lists the headline rows (the brief's Revenue / EBITDA / PBT / PAT), then supporting lines.
const TEMPLATES = {
  INDAS: {
    rows: [
      { key: 'revenue', label: 'Revenue from operations', headline: true, tags: ['RevenueFromOperations'] },
      { key: 'ebitda', label: 'EBITDA', headline: true, derived: 'PBT before exceptional items + finance costs + depreciation & amortisation − other income', from: ['pbtPreExceptional', 'financeCosts', 'depreciation', 'otherIncome'], calc: (x) => x.pbtPreExceptional + x.financeCosts + x.depreciation - x.otherIncome },
      { key: 'ebitdaMargin', label: 'EBITDA margin', headline: true, unit: '%', derived: 'EBITDA ÷ revenue from operations', from: ['ebitda', 'revenue'], calc: (x) => (x.revenue ? (x.ebitda / x.revenue) * 100 : null) },
      { key: 'pbt', label: 'Profit before tax', headline: true, tags: ['ProfitBeforeTax'] },
      { key: 'pat', label: 'Net profit (PAT)', headline: true, tags: ['ProfitLossForPeriod'] },
      { key: 'patOwners', label: 'PAT attributable to owners', tags: ['ProfitOrLossAttributableToOwnersOfParent'] },
      { key: 'eps', label: 'Basic EPS', unit: '₹', tags: ['BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations', 'BasicEarningsLossPerShareFromContinuingOperations'] },
      { key: 'otherIncome', label: 'Other income', tags: ['OtherIncome'] },
      { key: 'financeCosts', label: 'Finance costs', tags: ['FinanceCosts'] },
      { key: 'depreciation', label: 'Depreciation & amortisation', tags: ['DepreciationDepletionAndAmortisationExpense'] },
      { key: 'pbtPreExceptional', label: 'PBT before exceptional items', tags: ['ProfitBeforeExceptionalItemsAndTax'] },
      { key: 'exceptional', label: 'Exceptional items', tags: ['ExceptionalItemsBeforeTax'] },
      { key: 'tax', label: 'Tax expense', tags: ['TaxExpense'] },
    ],
    required: ['revenue', 'pbt', 'pat'],
    checks: [
      { name: 'Total income = revenue + other income', tags: ['Income'], test: (x, v) => [v.Income, x.revenue + x.otherIncome] },
      { name: 'PBT before exceptional items = total income − total expenses', tags: ['Income', 'Expenses'], test: (x, v) => [x.pbtPreExceptional, v.Income - v.Expenses] },
      { name: 'Profit from continuing operations = PBT − tax', tags: ['ProfitLossForPeriodFromContinuingOperations'], test: (x, v) => [v.ProfitLossForPeriodFromContinuingOperations, x.pbt - x.tax] },
    ],
    note: 'EBITDA is not a line in Indian results filings. FINN derives it as PBT before exceptional items + finance costs + depreciation & amortisation − other income; a company\'s own "operating profit" or EBIT figure may differ.',
  },
  BANKING: {
    rows: [
      { key: 'revenue', label: 'Total income', headline: true, tags: ['Income'] },
      { key: 'nii', label: 'Net interest income', headline: true, derived: 'interest earned − interest expended', from: ['interestEarned', 'interestExpended'], calc: (x) => x.interestEarned - x.interestExpended },
      { key: 'ebitda', label: 'Operating profit before provisions', headline: true, tags: ['OperatingProfitBeforeProvisionAndContingencies'] },
      { key: 'pbt', label: 'Profit before tax', headline: true, tags: ['ProfitLossFromOrdinaryActivitiesBeforeTax'] },
      { key: 'pat', label: 'Net profit (PAT)', headline: true, tags: ['ProfitLossForThePeriod'] },
      { key: 'patOwners', label: 'PAT after minority interest and associates', tags: ['ProfitLossAfterTaxesMinorityInterestAndShareOfProfitLossOfAssociates'] },
      { key: 'eps', label: 'Basic EPS', unit: '₹', tags: ['BasicEarningsPerShareAfterExtraordinaryItems', 'BasicEarningsPerShareBeforeExtraordinaryItems'] },
      { key: 'interestEarned', label: 'Interest earned', tags: ['InterestEarned'] },
      { key: 'interestExpended', label: 'Interest expended', tags: ['InterestExpended'] },
      { key: 'otherIncome', label: 'Other income', tags: ['OtherIncome'] },
      { key: 'provisions', label: 'Provisions and contingencies (other than tax)', tags: ['ProvisionsOtherThanTaxAndContingencies'] },
      { key: 'tax', label: 'Tax expense', tags: ['TaxExpense'] },
    ],
    required: ['revenue', 'pbt', 'pat'],
    checks: [
      { name: 'Total income = interest earned + other income', tags: ['Income'], test: (x) => [x.revenue, x.interestEarned + x.otherIncome] },
      { name: 'Pre-provision operating profit = total income − expenditure excluding provisions', tags: ['ExpenditureExcludingProvisionsAndContingencies'], test: (x, v) => [x.ebitda, x.revenue - v.ExpenditureExcludingProvisionsAndContingencies] },
      { name: 'Profit after tax from ordinary activities = PBT − tax', tags: ['ProfitLossFromOrdinaryActivitiesAfterTax'], test: (x, v) => [v.ProfitLossFromOrdinaryActivitiesAfterTax, x.pbt - x.tax] },
    ],
    note: 'Banks file under SEBI\'s banking format, where EBITDA is not meaningful. FINN shows pre-provision operating profit (as reported) in its place and derives net interest income as interest earned − interest expended.',
  },
};

// Pull one quarter's figures out of a parsed instance and validate the document against the request.
export function readQuarter(parsed, { quarterEnd, basis, taxonomy, symbol }) {
  const template = TEMPLATES[taxonomy];
  if (!template) return { ok: false, error: 'This filing format (' + (taxonomy || 'unknown') + ') is not supported yet.' };
  const q = quarterFacts(parsed, quarterEnd), v = q.values;
  if (!q.contextIds.length) return { ok: false, error: 'The filing has no figures for the three months ending ' + quarterEnd + '.' };
  const nature = String(v.NatureOfReportStandaloneConsolidated || ''), currency = String(v.DescriptionOfPresentationCurrency || 'INR'), reportedEnd = v.DateOfEndOfReportingPeriod;
  if (nature && !new RegExp(basis, 'i').test(nature)) return { ok: false, error: 'The filing is ' + nature.toLowerCase() + ', not ' + basis + '.' };
  if (currency.toUpperCase() !== 'INR') return { ok: false, error: 'Figures are not in INR (' + currency + ').' };
  if (reportedEnd && reportedEnd !== quarterEnd) return { ok: false, error: 'The filing reports a period ending ' + reportedEnd + ', not ' + quarterEnd + '.' };
  const sym = v.Symbol || v.NSESymbol;
  if (sym && String(sym).toUpperCase() !== symbol) return { ok: false, error: 'The filing belongs to ' + sym + ', not ' + symbol + '.' };
  const x = {}, tags = {};
  for (const row of template.rows) if (row.tags) { const p = pick(v, ...row.tags); x[row.key] = p.value; tags[row.key] = p.tag; }
  for (const row of template.rows) if (row.calc) { x[row.key] = row.from.every((k) => num(x[k]) !== null) ? row.calc(x) : null; }
  const missing = template.required.filter((k) => num(x[k]) === null);
  if (missing.length) return { ok: false, error: 'The filing does not report ' + missing.join(', ') + ' in the expected form.' };
  const checks = template.checks.map((c) => {
    if (c.tags.some((t) => num(v[t]) === null)) return { name: c.name, ok: null, detail: 'not reported' };
    const [a, b] = c.test(x, v);
    if (num(a) === null || num(b) === null) return { name: c.name, ok: null, detail: 'inputs missing' };
    const diff = Math.abs(a - b), ok = diff <= Math.max(CRORE, Math.abs(a) * 0.005);
    return { name: c.name, ok, detail: ok ? 'reconciles' : 'differs by ₹' + (diff / CRORE).toFixed(2) + ' crore' };
  });
  return { ok: true, values: x, tags, checks, context: q.contexts[tags.revenue] || q.contextIds[0], start: q.start, audited: /unaudited|un-audited/i.test(String(v.WhetherResultsAreAuditedOrUnaudited || '')) ? false : /audited/i.test(String(v.WhetherResultsAreAuditedOrUnaudited || '')) ? true : null, rounding: v.LevelOfRounding || null };
}

const pct = (cur, base) => (num(cur) === null || num(base) === null || base <= 0 ? null : Number((((cur - base) / base) * 100).toFixed(2)));
const pp = (cur, base) => (num(cur) === null || num(base) === null ? null : Number((cur - base).toFixed(2)));

// Assemble rows with QoQ and YoY from up to three read quarters (current required).
export function firstCut({ symbol, company, taxonomy, basis, periods }) {
  const template = TEMPLATES[taxonomy], cur = periods.current, prev = periods.previous, ago = periods.yearAgo;
  const rows = template.rows.map((row) => {
    const pick = (p) => (p && p.read?.ok ? p.read.values[row.key] : null);
    const c = pick(cur), p = pick(prev), y = pick(ago), percent = row.unit === '%', perShare = row.unit === '₹';
    const show = (v) => (num(v) === null ? null : percent || perShare ? Number(v.toFixed(2)) : Number((v / CRORE).toFixed(2)));
    return {
      key: row.key, label: row.label, headline: Boolean(row.headline), unit: percent ? '%' : perShare ? '₹' : '₹ crore',
      current: show(c), previous: show(p), yearAgo: show(y),
      qoq: percent ? pp(c, p) : pct(c, p),
      yoy: percent ? pp(c, y) : pct(c, y), changeUnit: percent ? 'pp' : '%',
      derived: row.derived || null, tag: cur?.read?.ok ? cur.read.tags[row.key] || null : null,
    };
  }).filter((r) => r.current !== null || r.previous !== null || r.yearAgo !== null);
  const period = (p, quarterEnd) => p && p.filing ? { quarterEnd, label: fiscalLabel(quarterEnd), basis, audited: p.read?.ok ? p.read.audited ?? p.filing.audited : p.filing.audited, filedAt: p.filing.filedAt, revision: p.filing.revision, xbrl: p.filing.xbrl, ixbrl: p.filing.ixbrl, context: p.read?.ok ? p.read.context : null, error: p.read?.ok ? null : p.read?.error || null } : { quarterEnd, label: fiscalLabel(quarterEnd), basis, missing: true };
  const gaps = [];
  if (!prev?.read?.ok) gaps.push('QoQ not computed: ' + (prev?.read?.error || 'NSE lists no ' + basis + ' filing for ' + fiscalLabel(periods.previousEnd) + '.'));
  if (!ago?.read?.ok) gaps.push('YoY not computed: ' + (ago?.read?.error || 'NSE lists no ' + basis + ' filing for ' + fiscalLabel(periods.yearAgoEnd) + '.'));
  const failed = cur.read.checks.filter((c) => c.ok === false);
  if (failed.length) gaps.push('Arithmetic check did not reconcile in the filing: ' + failed.map((c) => c.name + ' (' + c.detail + ')').join('; ') + '. Read the original before relying on the derived figures.');
  return {
    status: !prev?.read?.ok || !ago?.read?.ok ? 'partial' : 'ok', symbol, company, taxonomy, basis,
    quarter: { end: periods.currentEnd, label: fiscalLabel(periods.currentEnd), start: cur.read.start },
    periods: { current: period(cur, periods.currentEnd), previous: period(prev, periods.previousEnd), yearAgo: period(ago, periods.yearAgoEnd) },
    rows, checks: cur.read.checks, gaps, note: template.note,
    method: 'Figures are the company\'s own XBRL results filing on NSE (' + basis + ', ₹ crore converted from rupees); the previous and year-ago quarters come from their own filings on the same basis. QoQ and YoY are computed by FINN; margins change in percentage points. Nothing is estimated.',
    source: 'NSE integrated filing – financials (XBRL)',
  };
}

const cache = new Map();
async function cached(key, ttl, now, load) {
  const hit = cache.get(key);
  if (hit && now - hit.at < ttl) return hit.value;
  const value = await load();
  cache.set(key, { at: now, value });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return value;
}
function readable(error, what) {
  if (error.name === 'TimeoutError') return what + ' timed out';
  if (error.message === 'fetch failed') return 'Could not reach ' + what + ' (network error)';
  return error.message;
}
export async function fetchFilingList(symbol, { fetcher = fetch, now = Date.now() } = {}) {
  return cached('list:' + symbol, 20 * 60 * 1000, now, async () => {
    const r = await fetcher(listUrl(symbol), { headers: UA, signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error('NSE filing list HTTP ' + r.status);
    return parseFilingList(await r.json(), symbol);
  });
}
export async function fetchInstance(url, { fetcher = fetch, now = Date.now() } = {}) {
  if (!ARCHIVE.test(url)) throw new Error('Unexpected filing location');
  return cached('xbrl:' + url, 6 * 3600 * 1000, now, async () => {
    const r = await fetcher(url, { headers: UA, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('NSE archive HTTP ' + r.status);
    const length = Number(r.headers?.get?.('content-length'));
    if (length > 12e6) throw new Error('Filing too large to read here');
    return parseXbrl(await r.text());
  });
}

// End to end: list → choose quarter and basis → read three filings → first cut.
export async function resultsFirstCut({ symbol, company = '', quarter = null, basis = null, fetcher = fetch, now = Date.now() }) {
  let filings;
  try { filings = await fetchFilingList(symbol, { fetcher, now }); } catch (error) {
    return { status: 'unavailable', symbol, error: readable(error, 'NSE'), gaps: ['The exchange filing list could not be read, so no figures are shown.'] };
  }
  if (!filings.length) return { status: 'not_found', symbol, error: 'NSE lists no machine-readable results filing for ' + symbol + '.', gaps: [] };
  const quarters = [...new Set(filings.map((f) => f.quarterEnd))].sort().reverse();
  const currentEnd = quarter || quarters[0];
  if (!quarters.includes(currentEnd)) return { status: 'not_found', symbol, error: 'NSE lists no results filing for ' + fiscalLabel(currentEnd) + '. Available: ' + quarters.slice(0, 6).map(fiscalLabel).join(', ') + '.', available: quarters.map((q) => ({ end: q, label: fiscalLabel(q) })), gaps: [] };
  const chosenBasis = basis || (pickFiling(filings, currentEnd, 'consolidated') ? 'consolidated' : 'standalone');
  const previousEnd = priorQuarter(currentEnd, 1), yearAgoEnd = priorQuarter(currentEnd, 4);
  const plan = { current: pickFiling(filings, currentEnd, chosenBasis), previous: pickFiling(filings, previousEnd, chosenBasis), yearAgo: pickFiling(filings, yearAgoEnd, chosenBasis) };
  if (!plan.current) return { status: 'not_found', symbol, error: 'NSE lists no ' + chosenBasis + ' results filing for ' + fiscalLabel(currentEnd) + '.', gaps: [] };
  const taxonomy = plan.current.taxonomy;
  if (!TEMPLATES[taxonomy]) return { status: 'unsupported', symbol, error: 'FINN does not read the ' + (taxonomy || 'unknown') + ' results format yet.', filing: plan.current, gaps: [] };
  const ends = { current: currentEnd, previous: previousEnd, yearAgo: yearAgoEnd };
  const periods = { currentEnd, previousEnd, yearAgoEnd };
  await Promise.all(Object.entries(plan).map(async ([k, filing]) => {
    if (!filing) { periods[k] = null; return; }
    let read;
    try {
      read = filing.taxonomy !== taxonomy ? { ok: false, error: 'The ' + fiscalLabel(ends[k]) + ' filing uses a different format (' + filing.taxonomy + ').' } : readQuarter(await fetchInstance(filing.xbrl, { fetcher, now }), { quarterEnd: ends[k], basis: chosenBasis, taxonomy, symbol });
    } catch (error) { read = { ok: false, error: readable(error, 'the NSE archive') }; }
    periods[k] = { filing, read };
  }));
  if (!periods.current.read.ok) return { status: 'unavailable', symbol, error: periods.current.read.error, filing: plan.current, gaps: ['The ' + fiscalLabel(currentEnd) + ' filing could not be read, so no figures are shown.'] };
  return { ...firstCut({ symbol, company: company || plan.current.company, taxonomy, basis: chosenBasis, periods }), available: quarters.map((q) => ({ end: q, label: fiscalLabel(q) })), fetchedAt: new Date(now).toISOString() };
}
