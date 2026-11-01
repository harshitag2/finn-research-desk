// TEST FIXTURE ONLY. Builds NSE-style "Integrated Filing – Financials" XBRL instances and filing-list rows
// with the same structure as the real feed (contexts OneD / FourD, a dimensional segment context, SEBI
// in-capmkt tags, INDAS and BANKING formats). Every figure is synthetic and internally consistent so the
// arithmetic checks reconcile; company names carry "(TEST FIXTURE)". Never present these as disclosures.

const NS = 'xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:in-capmkt="http://www.sebi.gov.in/xbrl/2025-05-28/in-capmkt" xmlns:xbrldi="http://xbrl.org/2006/xbrldi"';
const pad = (n) => String(n).padStart(2, '0');
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const QUARTERS = ['2026-09-30', '2026-06-30', '2026-03-31', '2025-12-31', '2025-09-30', '2025-06-30', '2025-03-31'];
export const BANKS = new Set(['HDFCBANK', 'ICICIBANK']);

function quarterStart(end) { const [y, m] = end.split('-').map(Number); const sm = m - 2; return y + '-' + pad(sm) + '-01'; }
function fyStart(end) { const [y, m] = end.split('-').map(Number); return (m <= 3 ? y - 1 : y) + '-04-01'; }
const r5 = (v) => Math.round(v / 1e5) * 1e5; // rupees, rounded to ₹1 lakh like real filings

export function fixtureFigures(symbol, quarterEnd, basis = 'consolidated', options = {}) {
  const k = QUARTERS.length - QUARTERS.indexOf(quarterEnd); // older quarters are smaller
  const base = (2000 + [...symbol].reduce((s, c) => s + c.charCodeAt(0), 0) * 10) * 1e7 * (basis === 'standalone' ? 0.8 : 1);
  const R = r5(base * (1 + 0.025 * k) * (quarterEnd.endsWith('-03-31') ? 1.04 : 1));
  if (BANKS.has(symbol) && !options.indas) {
    const interest = r5(R * 0.74), other = r5(R - interest), expended = r5(interest * 0.53), opex = r5(R * 0.22), provisions = r5(R * 0.03);
    const ppop = R - expended - opex, pbt = ppop - provisions, tax = r5(pbt * 0.25), pat = pbt - tax;
    return { taxonomy: 'BANKING', Income: R, InterestEarned: interest, OtherIncome: other, InterestExpended: expended, OperatingExpenses: opex, ExpenditureExcludingProvisionsAndContingencies: expended + opex, OperatingProfitBeforeProvisionAndContingencies: ppop, ProvisionsOtherThanTaxAndContingencies: provisions, ExceptionalItems: 0, ProfitLossFromOrdinaryActivitiesBeforeTax: pbt, TaxExpense: tax, ProfitLossFromOrdinaryActivitiesAfterTax: pat, ProfitLossForThePeriod: pat, ProfitLossAfterTaxesMinorityInterestAndShareOfProfitLossOfAssociates: r5(pat * 0.99), BasicEarningsPerShareAfterExtraordinaryItems: Number((pat / 1.5e10).toFixed(2)) };
  }
  const other = r5(R * 0.02), income = R + other, expenses = r5(R * 0.8), fin = r5(R * 0.004), dep = r5(R * 0.03);
  const pre = income - expenses, exceptional = options.exceptional ?? 0, pbt = pre + exceptional, tax = r5(pbt * 0.26), cont = pbt - tax;
  return { taxonomy: 'INDAS', RevenueFromOperations: R, OtherIncome: other, Income: income, EmployeeBenefitExpense: r5(R * 0.5), FinanceCosts: fin, DepreciationDepletionAndAmortisationExpense: dep, Expenses: expenses, ProfitBeforeExceptionalItemsAndTax: pre, ExceptionalItemsBeforeTax: exceptional, ProfitBeforeTax: pbt, TaxExpense: tax, ProfitLossForPeriodFromContinuingOperations: cont, ProfitLossForPeriod: cont, ProfitOrLossAttributableToOwnersOfParent: r5(cont * 0.995), BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations: Number((cont / 4e9).toFixed(2)) };
}

export function fixtureXbrl(symbol, quarterEnd, basis = 'consolidated', options = {}) {
  const f = fixtureFigures(symbol, quarterEnd, basis, options), start = quarterStart(quarterEnd), ytd = fyStart(quarterEnd);
  const ctx = (id, s, e, dims = '') => `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="https://www.nseindia.com/xbrl">${symbol}</xbrli:identifier>${dims ? `<xbrli:segment>${dims}</xbrli:segment>` : ''}</xbrli:entity><xbrli:period><xbrli:startDate>${s}</xbrli:startDate><xbrli:endDate>${e}</xbrli:endDate></xbrli:period></xbrli:context>`;
  const text = (tag, v, c = 'OneD') => `<in-capmkt:${tag} contextRef="${c}">${v}</in-capmkt:${tag}>`;
  const num = (tag, v, c = 'OneD') => `<in-capmkt:${tag} contextRef="${c}" unitRef="${/EarningsPerShare/.test(tag) ? 'INRPerShare' : 'INR'}" decimals="${/EarningsPerShare/.test(tag) ? 'INF' : '-5'}">${v}</in-capmkt:${tag}>`;
  const figures = Object.entries(f).filter(([k]) => k !== 'taxonomy');
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<xbrli:xbrl ${NS}>
${ctx('OneD', start, quarterEnd)}
${ctx('FourD', ytd, quarterEnd)}
${ctx('OneReportable1D', start, quarterEnd, '<xbrldi:explicitMember dimension="in-capmkt:SegmentsAxis">in-capmkt:ReportableSegment1Member</xbrldi:explicitMember>')}
${text('Symbol', options.symbolOverride || symbol)}
${text('NameOfTheCompany', symbol + ' Limited (TEST FIXTURE)')}
${text('DescriptionOfPresentationCurrency', 'INR')}
${text('LevelOfRounding', 'Crores')}
${text('DateOfStartOfReportingPeriod', start)}
${text('DateOfEndOfReportingPeriod', options.reportedEnd || quarterEnd)}
${text('WhetherResultsAreAuditedOrUnaudited', 'Unaudited')}
${text('NatureOfReportStandaloneConsolidated', options.nature || (basis === 'consolidated' ? 'Consolidated' : 'Standalone'))}
${figures.map(([k, v]) => num(k, v)).join('\n')}
${figures.filter(([k]) => !/EarningsPerShare/.test(k)).map(([k, v]) => num(k, v * 2, 'FourD')).join('\n')}
${num(f.taxonomy === 'BANKING' ? 'Income' : 'RevenueFromOperations', 1, 'OneReportable1D')}
<in-capmkt:DisclosureOfNotesOnFinancialResultsExplanatoryTextBlock contextRef="OneD">&lt;p&gt;TEST FIXTURE note &amp; disclosure&lt;/p&gt;</in-capmkt:DisclosureOfNotesOnFinancialResultsExplanatoryTextBlock>
</xbrli:xbrl>
`;
}

const stamp = (iso) => { const d = new Date(Date.parse(iso + 'T00:00:00Z') + 23 * 86400000); return pad(d.getUTCDate()) + '-' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + '-' + d.getUTCFullYear() + ' 18:30:00'; };
export const fixtureXbrlUrl = (symbol, quarterEnd, basis) => `https://nsearchives.nseindia.com/corporate/xbrl/INTEGRATED_FILING_${BANKS.has(symbol) ? 'BANKING' : 'INDAS'}_TEST_${encodeURIComponent(symbol)}_${quarterEnd.replace(/-/g, '')}_${basis.toUpperCase()}_WEB.xml`;
export function fixtureList(symbol, { skip = [] } = {}) {
  const data = [];
  for (const q of QUARTERS) for (const basis of ['consolidated', 'standalone']) {
    if (skip.some((s) => s.quarter === q && (!s.basis || s.basis === basis))) continue;
    const [y, m, d] = q.split('-');
    data.push({ type: 'Integrated Filing- Financials', type_Sub: 'Original', symbol, smName: symbol + ' Limited (TEST FIXTURE)', cmName: symbol + ' Limited (TEST FIXTURE)', qe_Date: d + '-' + MON[+m - 1] + '-' + y, consolidated: basis === 'consolidated' ? 'Consolidated' : 'Standalone', audited: 'Un-Audited', creation_Date: stamp(q), broadcast_Date: stamp(q), xbrl: fixtureXbrlUrl(symbol, q, basis), ixbrl: fixtureXbrlUrl(symbol, q, basis).replace('/xbrl/', '/ixbrl/').replace('_WEB.xml', '_iXBRL_WEB.html'), xbrlFileSize: '48 KB' });
  }
  data.push({ type: 'Integrated Filing- Governance', type_Sub: 'New', symbol, qe_Date: '30-SEP-2026', xbrl: 'https://nsearchives.nseindia.com/corporate/xbrl/INTEGRATED_FILING_GOVERNANCE_TEST_WEB.xml' });
  return { data, size: data.length, page: 1, totalCount: data.length };
}
// Parse a fixture URL back into its parts (used by the e2e upstream mock).
export function parseFixtureUrl(url) {
  const m = String(url).match(/INTEGRATED_FILING_(?:INDAS|BANKING)_TEST_([^_]+)_(\d{4})(\d{2})(\d{2})_(CONSOLIDATED|STANDALONE)_WEB\.xml$/);
  return m ? { symbol: decodeURIComponent(m[1]), quarterEnd: m[2] + '-' + m[3] + '-' + m[4], basis: m[5].toLowerCase() } : null;
}
