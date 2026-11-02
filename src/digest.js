import { fetchHistories } from './analytics.js';
import {horizonAlerts as makeHorizonAlerts,marketSnapshot} from './alert-rules.js';

// Push digest: exchange announcements for the portfolio over a chosen window, classified into the
// reference document's categories, prioritised so material filings come first and routine paperwork is
// collapsed, plus price/volume threshold crossings over the same window. Classification is deterministic
// (NSE's own category label + text cues); summaries are NSE's one-line text with boilerplate removed.
// Nothing is inferred from the PDFs, and no figures are extracted from them.

export const CATEGORIES = ['results', 'M&A', 'fund_raise', 'management_change', 'litigation', 'insider_trading', 'earnings_call', 'investor_meetings', 'credit_rating', 'dividend', 'bonus_split', 'capex', 'press_release', 'postal_ballot', 'agm_egm', 'pledging', 'unclassified'];
export const CATEGORY_LABELS = {
  results: 'Results', 'M&A': 'M&A', fund_raise: 'Fund raise', management_change: 'Management change', litigation: 'Litigation / regulatory',
  insider_trading: 'Insider trading', earnings_call: 'Earnings call', investor_meetings: 'Investor meetings', credit_rating: 'Credit rating',
  dividend: 'Dividend', bonus_split: 'Bonus / split', capex: 'Capex', press_release: 'Press release', postal_ballot: 'Postal ballot', agm_egm: 'AGM / EGM',
  pledging: 'Pledging', unclassified: 'Other filing',
};
export const DEFAULT_FOCUS = ['results', 'M&A', 'management_change', 'litigation', 'fund_raise', 'credit_rating', 'pledging', 'bonus_split'];
export const WINDOWS = { '24h': 1, '3d': 3, '7d': 7, '30d': 30 };

// Ordered rules: the first match wins. [category, materiality, test(desc, text), options]
// options.fixed keeps the materiality even when the investor marks the category as one they care about;
// options.upcoming marks notices of a future event (e.g. a board meeting that will consider results).
const INTIMATION = /board meeting intimation|intimation of board meeting|prior intimation/;
// A board meeting announced for a future date, whatever NSE label it was filed under.
const UPCOMING = /\bmeeting of the board of directors\b[^.]{0,80}\b(is|will be) (scheduled|held)\b|\bboard meeting\b[^.]{0,40}\b(is|will be) (scheduled|held)\b/;
// NSE files many different disclosures under a bare "Updates" / "General Updates" label; their text decides.
const GENERIC = /^(general )?updates?$/;
const AGENDA = /bonus|split|sub-?division|buy ?back|dividend|fund|raising|issue of|qip|preferential|rights issue|debenture|merger|amalgamation|demerger|acquisition|scheme of arrangement/;
const RULES = [
  ['results', 'medium', (d, t) => (INTIMATION.test(d) || UPCOMING.test(t) || (/board meeting/.test(d) && /\b(is|will be|to be) (scheduled|held)\b|scheduled on|proposes to consider|to consider and approve/.test(t))) && /results/.test(t), { fixed: true, upcoming: true }],
  // Other intimations are routine unless the agenda names a corporate action, which the later rules classify.
  ['unclassified', 'routine', (d, t) => (INTIMATION.test(d) || UPCOMING.test(t)) && !AGENDA.test(t), { upcoming: true }],
  ['M&A', 'medium', (d, t) => /incorporation of (a |an )?(wholly[- ]owned )?(step[- ]down )?subsidiar/.test(d + ' ' + t) || /\bincorporated\b.*\bsubsidiar/.test(t), { fixed: true }],
  ['results', 'high', (d, t) => /financial result|integrated filing.*financial/.test(d) || (/outcome of board meeting|board meeting/.test(d) && /financial results|results for the (quarter|year|half)|audited|unaudited/.test(t))],
  ['pledging', 'high', (d, t) => /pledge|encumbrance/.test(d + ' ' + t)],
  ['bonus_split', 'high', (d, t) => /bonus|sub-?division|stock split|split of (equity )?shares/.test(d + ' ' + t)],
  ['M&A', 'medium', (d, t) => /other restructuring|strike off/.test(d) || /business transfer agreement|slump sale|transfer of (the |its )?business/.test(t)],
  ['M&A', 'high', (d, t) => /acquisition|amalgamation|merger|demerger|scheme of arrangement|sale or disposal|joint venture|divest/.test(d) || /\b(acquire|acquisition of|merger|amalgamation|demerger|joint venture|stake sale|divestment)\b/.test(t)],
  ['management_change', 'high', (d, t) => /change in management|change in director|resignation|appointment|cessation|key managerial|kmp/.test(d) || /\b(appointed|appointment of|resign(ed|ation)|cessation|re-?appointment)\b.*\b(director|ceo|cfo|chief|managing|company secretary|kmp|key managerial)\b/.test(t) || /\bresign(ed|ation)\b.*\bauditors?\b|\bauditors?\b.*\bresign(ed|ation)\b/.test(t)],
  ['litigation', 'high', (d, t) => /action\(s\) taken or orders passed|litigation|dispute|penalt|regulatory|show cause|insolvency|nclt order/.test(d) || /\b(penalty|show cause|tribunal|litigation|demand order|tax demand|order passed|fine of|insolvency)\b/.test(t)],
  ['fund_raise', 'medium', (d, t) => (/buy ?back|rights issue|qualified institution|qip|preferential|issue of securities|debenture|commercial paper|raising of funds|fund raising|initial public offer|\bipo\b|offer for sale|listing of (its |the )?(equity )?shares|trading in (the )?equity shares of/.test(d + ' ' + t) || /allotment of securities/.test(d)) && !/esop|esps|esos|employee stock/.test(t)],
  ['credit_rating', 'medium', (d) => /credit rating/.test(d)],
  ['insider_trading', 'medium', (d, t) => /insider trading|sast|regulation 29|regulation 31|reg\. 7|disclosure of acquisition/.test(d + ' ' + t)],
  ['dividend', 'medium', (d, t) => /dividend/.test(d) || ((/record date/.test(d) || GENERIC.test(d)) && /\bdividend\b/.test(t))],
  ['earnings_call', 'medium', (d, t) => (/con\.? call|conference call|earnings call/.test(d) && /earnings call|conference call|transcript|audio|recording|results/.test(t)) || (GENERIC.test(d) && /earnings call|conference call|call transcript|audio recording|investors'? call/.test(t))],
  ['investor_meetings', 'routine', (d, t) => /analyst|institutional investor|investor meet/.test(d) || (GENERIC.test(d) && /investor conference|analysts?\/?(institutional )?investors? meet|schedule of (analyst|investor) meet/.test(t))],
  ['postal_ballot', 'routine', (d, t) => /postal ballot/.test(d + ' ' + t)],
  ['agm_egm', 'routine', (d, t) => /\bagm\b|\begm\b|annual general meeting|extraordinary general meeting|shareholders meeting/.test(d + ' ' + t)],
  ['capex', 'medium', (d, t) => /capex|capacity|expansion|new plant|commission(ing|ed)|greenfield|brownfield/.test(d + ' ' + t)],
  ['press_release', 'medium', (d) => /press release|bagging|receiving of orders|order win|monthly business update|business update|investor presentation|rumou?r verification|clarification|launch/.test(d)],
  ['unclassified', 'routine', (d, t) => /newspaper|certificate under sebi|depositories and participants|esop|esos|esps|options to purchase securities|trading window|loss of share|duplicate share|investor complaint|compliance certificate|general updates|copy of|statement of deviation|guarantees|surety|record date|book closure|change in registered office|reconciliation of share capital/.test(d) || (GENERIC.test(d) && /employees? stock option|\besops?\b|\besos\b|trading window|newspaper/.test(t))],
  ['press_release', 'medium', (d) => /^updates?$/.test(d)],
  // An outcome that names no results or corporate action is still worth opening; it is not presented as results.
  ['unclassified', 'medium', (d) => /outcome of (the )?board meeting/.test(d)],
];

export function classifyAnnouncement({ desc = '', text = '' }) {
  const d = String(desc).toLowerCase().trim(), t = String(text).toLowerCase();
  const upcoming = INTIMATION.test(d) || UPCOMING.test(t);
  for (const [category, materiality, test, options = {}] of RULES) if (test(d, t)) return { category, materiality, fixed: Boolean(options.fixed), upcoming: Boolean(options.upcoming) || upcoming };
  return { category: 'unclassified', materiality: 'routine', fixed: false, upcoming };
}

// "Infosys Limited has informed the Exchange regarding 'X'." → "X". Text that only repeats the category is dropped.
export function summarise(text, desc) {
  let s = String(text || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[^.]{0,120}?\b(?:has|have)\s+(?:informed|submitted to|intimated)\s+(?:the\s+)?(?:exchange|exchanges)\s*(?:,\s*)?(?:about|regarding|that|of)?\s*/i, '');
  s = s.replace(/^['"‘“]+|['"’”.]+$/g, '').trim();
  if (!s || s.toLowerCase() === String(desc || '').toLowerCase() || s.length < 8) return '';
  return s.charAt(0).toUpperCase() + s.slice(1, 220);
}

const pad = (n) => String(n).padStart(2, '0');
const nseDate = (d) => pad(d.getUTCDate()) + '-' + pad(d.getUTCMonth() + 1) + '-' + d.getUTCFullYear();
// "2026-10-30 18:50:50" (IST) → ISO
export const istToIso = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 5, +m[5] - 30, +m[6])).toISOString() : null; };

const cache = new Map();
export async function fetchAnnouncements(ticker, { days = 7, fetcher = fetch, now = Date.now() } = {}) {
  const key = ticker + ':' + days, hit = cache.get(key);
  if (hit && now - hit.at < 10 * 60 * 1000) return hit.value;
  const ist = new Date(now + 5.5 * 3600 * 1000), from = new Date(ist.getTime() - days * 86400000);
  const url = 'https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=' + encodeURIComponent(ticker) + '&from_date=' + nseDate(from) + '&to_date=' + nseDate(ist);
  const response = await fetcher(url, { headers: { 'User-Agent': 'Mozilla/5.0 (FINN research prototype)', Accept: 'application/json', Referer: 'https://www.nseindia.com/companies-listing/corporate-filings-announcements' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('NSE announcements HTTP ' + response.status);
  const body = await response.json();
  const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : null;
  if (!rows) throw new Error('Unexpected NSE response');
  const value = rows.slice(0, 200).map((r) => {
    const desc = String(r.desc || r.subject || '').slice(0, 200), text = String(r.attchmntText || '').slice(0, 600);
    return { ticker, company: String(r.sm_name || ticker).slice(0, 120), at: istToIso(r.sort_date || r.an_dt) || null, nseCategory: desc, text, url: typeof r.attchmntFile === 'string' && r.attchmntFile.startsWith('https://') ? r.attchmntFile : '', size: String(r.attFileSize || r.fileSize || '').slice(0, 20), id: String(r.seq_id || desc + r.sort_date) };
  });
  cache.set(key, { at: now, value });
  return value;
}

// Each completed session in the window is checked against the investor's thresholds.
export function windowAlerts(history, sessions, prefs = {}) {
  const price = Number(prefs.priceThreshold) > 0 ? Number(prefs.priceThreshold) : 4, vol = Number(prefs.volumeThreshold) > 0 ? Number(prefs.volumeThreshold) : 2;
  const rows = history.lastPartial ? history.rows.slice(0, -1) : history.rows, out = [];
  for (let i = Math.max(21, rows.length - sessions); i < rows.length; i++) {
    const r = rows[i], p = rows[i - 1], change = (r.close / p.close - 1) * 100;
    const base = rows.slice(i - 20, i).map((x) => x.volume).filter(Number.isFinite), avg = base.length >= 10 ? base.reduce((s, x) => s + x, 0) / base.length : null;
    if (Math.abs(change) > price) out.push({ ticker: history.symbol, type: 'price', date: r.date, value: Number(change.toFixed(2)), threshold: price, severity: Math.abs(change) > 2 * price ? 'high' : 'medium', text: history.symbol + ' ' + (change > 0 ? 'rose' : 'fell') + ' ' + Math.abs(change).toFixed(2) + '% on ' + r.date + ' (threshold ±' + price + '%).' });
    if (avg && Number.isFinite(r.volume) && r.volume / avg > vol) out.push({ ticker: history.symbol, type: 'volume', date: r.date, value: Number((r.volume / avg).toFixed(2)), threshold: vol, severity: r.volume / avg > 2 * vol ? 'high' : 'medium', text: history.symbol + ' traded ' + (r.volume / avg).toFixed(2) + '× its prior 20-session average volume on ' + r.date + ' (threshold ' + vol + '×).' });
  }
  return out;
}

export async function buildDigest({ tickers, names = {}, window = '24h', prefs = {}, focus = DEFAULT_FOCUS, fetcher = fetch, now = Date.now(), includePrices = true }) {
  const days = WINDOWS[window] || 1, cutoff = now - days * 86400000;
  const unique = [...new Set(tickers)].slice(0, 30);
  const results = {};
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, unique.length) }, async () => {
    for (;;) { const i = next++; if (i >= unique.length) break; try { results[unique[i]] = { ok: true, rows: await fetchAnnouncements(unique[i], { days: Math.max(days, 1) + 1, fetcher, now }) }; } catch (error) { results[unique[i]] = { ok: false, error: error.name === 'TimeoutError' ? 'NSE timed out' : error.message === 'fetch failed' ? 'Could not reach NSE (network error)' : error.message }; } }
  }));
  const focusSet = new Set(focus.filter((c) => CATEGORIES.includes(c)));
  const rank = { high: 0, medium: 1, routine: 2 };
  // Several PDFs filed together with identical text (e.g. standalone and consolidated) become one item.
  const grouped = new Map();
  for (const r of unique.flatMap((t) => (results[t].ok ? results[t].rows : [])).filter((r) => !r.at || Date.parse(r.at) >= cutoff)) {
    const key = r.ticker + '|' + r.nseCategory + '|' + r.text.trim().toLowerCase() + '|' + String(r.at || '').slice(0, 13);
    const g = grouped.get(key);
    if (g) { if (r.url && !g.links.includes(r.url)) g.links.push(r.url); g.filings++; } else grouped.set(key, { ...r, links: r.url ? [r.url] : [], filings: 1 });
  }
  const items = [...grouped.values()]
    .map((r) => {
      const c = classifyAnnouncement({ desc: r.nseCategory, text: r.text });
      const materiality = !c.fixed && focusSet.has(c.category) && c.materiality !== 'high' && c.category !== 'unclassified' ? 'high' : c.materiality;
      return { ...r, company: names[r.ticker] || r.company, category: c.category, label: CATEGORY_LABELS[c.category], materiality, upcoming: c.upcoming, focus: focusSet.has(c.category), summary: summarise(r.text, r.nseCategory) };
    })
    .sort((a, b) => rank[a.materiality] - rank[b.materiality] || (b.at || '').localeCompare(a.at || ''));
  const counts = {};
  for (const i of items) counts[i.category] = (counts[i.category] || 0) + 1;
  const failures = unique.filter((t) => !results[t].ok).map((t) => ({ ticker: t, error: results[t].error }));
  let priceAlerts = [], priceFailures = [], horizonAlerts = [], horizonSnapshots = [];
  if (includePrices) {
    const h = await fetchHistories(unique, { fetcher, now });
    const sessions = window === '24h' ? 1 : window === '3d' ? 3 : window === '7d' ? 5 : 21;
    for (const t of unique) { if (h[t]?.ok){priceAlerts.push(...windowAlerts(h[t].data, sessions, prefs));horizonAlerts.push(...makeHorizonAlerts(h[t].data,prefs));const snapshot=marketSnapshot(h[t].data);if(snapshot)horizonSnapshots.push(snapshot)} else priceFailures.push({ ticker: t, error: h[t]?.error }); }
    priceAlerts.sort((a, b) => (a.severity === b.severity ? b.date.localeCompare(a.date) || Math.abs(b.value) - Math.abs(a.value) : a.severity === 'high' ? -1 : 1));
  }
  return {
    window, days, from: new Date(cutoff).toISOString(), to: new Date(now).toISOString(),
    status: failures.length === unique.length ? 'unavailable' : failures.length ? 'partial' : 'ok',
    items, counts, focus: [...focusSet], priceAlerts, horizonAlerts, horizonSnapshots, failures, priceFailures,
    summary: { filings: items.length, attention: items.filter((i) => i.materiality === 'high').length, worthALook: items.filter((i) => i.materiality === 'medium').length, routine: items.filter((i) => i.materiality === 'routine').length, priceAlerts: priceAlerts.length },
    source: 'NSE corporate announcements (exchange feed) · Yahoo Finance daily history',
    notice: 'Classified from NSE\'s category label and summary text; open the filing for the full disclosure. Price alerts use completed sessions and your thresholds. Evaluated when you open the digest — FINN does not monitor in the background.',
    fetchedAt: new Date(now).toISOString(),
  };
}
