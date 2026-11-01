// Price analytics for the portfolio deep dive, market overview, screener and stock pages.
// Every number here is computed in code from provider daily histories (Yahoo Finance chart API,
// dividend-adjusted closes where supplied). Nothing is estimated by a model, and nothing here is
// fundamentals: valuation ratios and financial statements are out of scope without a licensed feed.

export const INDICES = {
  '^NSEI': 'Nifty 50',
  '^BSESN': 'Sensex',
  '^NSEBANK': 'Nifty Bank',
  '^CNXIT': 'Nifty IT',
  'NIFTY_FIN_SERVICE.NS': 'Nifty Financial Services',
  '^CNXAUTO': 'Nifty Auto',
  '^CNXFMCG': 'Nifty FMCG',
  '^CNXPHARMA': 'Nifty Pharma',
  '^CNXMETAL': 'Nifty Metal',
  '^CNXENERGY': 'Nifty Energy',
  '^CNXINFRA': 'Nifty Infrastructure',
  '^CNXREALTY': 'Nifty Realty',
  '^CNXPSUBANK': 'Nifty PSU Bank',
  '^CNXCONSUM': 'Nifty India Consumption',
  '^CNXPSE': 'Nifty PSE',
  '^NSEMDCP50': 'Nifty Midcap 50',
  '^CNX100': 'Nifty 100',
  '^INDIAVIX': 'India VIX',
};
export const BENCHMARK = '^NSEI';
// Closest sector index for the watchlist's sector labels. Sectors without a clean NSE index map to null.
export const SECTOR_INDEX = {
  Technology: '^CNXIT', Banking: '^NSEBANK', 'Financial Services': 'NIFTY_FIN_SERVICE.NS', Auto: '^CNXAUTO', Consumer: '^CNXFMCG',
  Healthcare: '^CNXPHARMA', Pharma: '^CNXPHARMA', Industrials: '^CNXINFRA', Energy: '^CNXENERGY', Metals: '^CNXMETAL', Realty: '^CNXREALTY',
};
export const PERIODS = { '1W': 5, '1M': 21, '3M': 63, '6M': 126, '1Y': null };
const TTL = 10 * 60 * 1000;
const cache = new Map();
const inflight = new Map();
const TRADING_DAYS = 252;

export const isIndex = (s) => Object.prototype.hasOwnProperty.call(INDICES, s);
export const validSymbol = (s) => isIndex(s) || /^[A-Z0-9&-]{1,24}$/.test(String(s));
export const yahooSymbol = (s) => (isIndex(s) ? s : s + '.NS');
const istDate = (sec) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(sec * 1000));

export function normalizeHistory(raw, symbol, now = Date.now()) {
  const result = raw?.chart?.result?.[0];
  const meta = result?.meta;
  const expected = yahooSymbol(symbol).toUpperCase();
  if (!meta || !Array.isArray(result.timestamp)) throw new Error('No price history was returned for this symbol.');
  if (meta.symbol && meta.symbol.toUpperCase() !== expected) throw new Error('Provider returned a different security.');
  if (meta.currency && meta.currency !== 'INR') throw new Error('Unexpected history currency.');
  const q = result.indicators?.quote?.[0] || {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose;
  const rows = [];
  result.timestamp.forEach((t, i) => {
    const close = q.close?.[i];
    if (!Number.isFinite(t) || !Number.isFinite(close) || close <= 0 || t * 1000 > now + 300000) return;
    const a = adj?.[i];
    rows.push({
      t, date: istDate(t), close, adj: Number.isFinite(a) && a > 0 ? a : close,
      high: Number.isFinite(q.high?.[i]) ? q.high[i] : null, low: Number.isFinite(q.low?.[i]) ? q.low[i] : null,
      volume: Number.isFinite(q.volume?.[i]) ? q.volume[i] : null,
    });
  });
  // Keep one row per IST session date (the provider can repeat the live session).
  const byDate = new Map();
  for (const r of rows) byDate.set(r.date, r);
  const daily = [...byDate.values()].sort((a, b) => a.t - b.t);
  if (daily.length < 30) throw new Error('Not enough daily history for analysis.');
  const session = meta.currentTradingPeriod?.regular;
  const last = daily.at(-1);
  const lastPartial = Boolean(session && Number.isFinite(session.start) && Number.isFinite(session.end) && now >= session.start * 1000 && now < session.end * 1000 && last.date === istDate(session.start));
  const dividends = Object.values(result.events?.dividends || {})
    .filter((d) => Number.isFinite(d.date) && Number.isFinite(d.amount) && d.amount > 0)
    .map((d) => ({ date: istDate(d.date), amount: d.amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const splits = Object.values(result.events?.splits || {}).map((s) => ({ date: istDate(s.date), ratio: String(s.splitRatio || '') }));
  return {
    symbol, name: isIndex(symbol) ? INDICES[symbol] : meta.longName || meta.shortName || symbol, kind: isIndex(symbol) ? 'index' : 'equity',
    currency: meta.currency || 'INR', rows: daily, dividends, splits, lastPartial,
    asOf: Number.isFinite(meta.regularMarketTime) ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    adjusted: Array.isArray(adj), source: 'Yahoo Finance daily history', fetchedAt: new Date(now).toISOString(),
  };
}

export async function fetchHistory(symbol, { fetcher = fetch, now = Date.now() } = {}) {
  if (!validSymbol(symbol)) throw new Error('Invalid symbol.');
  const key = symbol;
  const old = cache.get(key);
  if (old && now - old.at < TTL) return old.value;
  if (inflight.has(key)) return inflight.get(key);
  const task = (async () => {
    try {
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(yahooSymbol(symbol)) + '?range=1y&interval=1d&events=div%2Csplit';
      const response = await fetcher(url, { headers: { 'User-Agent': 'Mozilla/5.0 FINN research prototype' }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('History source HTTP ' + response.status);
      const value = normalizeHistory(await response.json(), symbol, now);
      cache.set(key, { at: now, value });
      return value;
    } catch (error) {
      if (old) return { ...old.value, stale: true, error: 'Refresh failed; using the history fetched at ' + old.value.fetchedAt + '.' };
      throw new Error(error.name === 'TimeoutError' ? 'The history provider timed out.' : error.message === 'fetch failed' ? 'Could not reach the history provider (network error).' : error.message);
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, task);
  return task;
}

export async function fetchHistories(symbols, options = {}) {
  const unique = [...new Set(symbols)].filter(validSymbol).slice(0, 45);
  const out = {};
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(5, unique.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= unique.length) break;
      try { out[unique[i]] = { ok: true, data: await fetchHistory(unique[i], options) }; }
      catch (error) { out[unique[i]] = { ok: false, error: error.message || 'History unavailable' }; }
    }
  }));
  return out;
}

// ── Pure math ────────────────────────────────────────────────────────────────────────────────────
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
export function stdev(a) {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
export const returnsOf = (values) => values.slice(1).map((v, i) => v / values[i] - 1);
export function covariance(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}
export function correlation(a, b) {
  const c = covariance(a, b), sa = stdev(a), sb = stdev(b);
  return c === null || !sa || !sb ? null : Math.max(-1, Math.min(1, c / (sa * sb)));
}
export function beta(asset, market) {
  const c = covariance(asset, market), v = covariance(market, market);
  return c === null || !v ? null : c / v;
}
export const annualizedVolatility = (returns) => { const s = stdev(returns); return s === null ? null : s * Math.sqrt(TRADING_DAYS) * 100; };
export function drawdown(values) {
  let peak = -Infinity, max = 0, peakAt = 0, troughAt = 0, maxPeakAt = 0;
  const series = values.map((v, i) => {
    if (v > peak) { peak = v; peakAt = i; }
    const d = (v / peak - 1) * 100;
    if (d < max) { max = d; troughAt = i; maxPeakAt = peakAt; }
    return d;
  });
  return { series, max, current: series.at(-1) ?? 0, peakIndex: maxPeakAt, troughIndex: troughAt };
}
export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let s = 0;
  values.forEach((v, i) => { s += v; if (i >= n) s -= values[i - n]; if (i >= n - 1) out[i] = s / n; });
  return out;
}
export function rsi(values, n = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) { const d = values[i] - values[i - 1]; if (d >= 0) gain += d; else loss -= d; }
  gain /= n; loss /= n;
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}
export function periodReturns(rows) {
  const adj = rows.map((r) => r.adj), last = adj.at(-1), out = {};
  for (const [label, days] of Object.entries(PERIODS)) {
    const base = days === null ? adj[0] : adj[adj.length - 1 - days];
    out[label] = Number.isFinite(base) && base > 0 ? (last / base - 1) * 100 : null;
  }
  const year = rows.at(-1).date.slice(0, 4);
  const lastPrevYear = [...rows].reverse().find((r) => r.date.slice(0, 4) < year);
  out.YTD = lastPrevYear ? (last / lastPrevYear.adj - 1) * 100 : null;
  return out;
}
export function riskContributions(weights, returnMatrix) {
  const n = weights.length;
  const cov = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => covariance(returnMatrix[i], returnMatrix[j]) ?? 0));
  const sigmaW = cov.map((row) => row.reduce((s, c, j) => s + c * weights[j], 0));
  const variance = weights.reduce((s, w, i) => s + w * sigmaW[i], 0);
  return variance > 0 ? weights.map((w, i) => (w * sigmaW[i]) / variance) : weights.map(() => null);
}
export const effectiveHoldings = (weights) => { const h = weights.reduce((s, w) => s + w * w, 0); return h > 0 ? 1 / h : null; };

// Align histories on the benchmark's session dates. Short gaps are forward-filled; a series that
// covers less than 80% of the window is excluded from portfolio maths rather than extrapolated.
export function alignOn(dates, rows) {
  const byDate = new Map(rows.map((r) => [r.date, r.adj]));
  const firstDate = rows[0]?.date;
  let last = null, filled = 0, covered = 0;
  const values = dates.map((d) => {
    if (byDate.has(d)) { last = byDate.get(d); covered++; return last; }
    if (last !== null && d > firstDate) { filled++; return last; }
    return null;
  });
  return { values, coverage: covered / dates.length, filled };
}

const round = (x, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);
const downsample = (arr, max = 260) => (arr.length <= max ? arr : arr.filter((_, i) => i % Math.ceil(arr.length / max) === 0 || i === arr.length - 1));

export function stockMetrics(history, benchmark, { includeSeries = false } = {}) {
  const rows = history.rows;
  const complete = history.lastPartial ? rows.slice(0, -1) : rows;
  const closes = rows.map((r) => r.close), adj = rows.map((r) => r.adj);
  const last = rows.at(-1), prev = rows.at(-2);
  const r = returnsOf(adj);
  let b = null, corr = null;
  if (benchmark) {
    const bench = alignOn(rows.map((x) => x.date), benchmark.rows).values;
    const pairs = r.map((x, i) => [x, bench[i] && bench[i + 1] ? bench[i + 1] / bench[i] - 1 : null]).filter((p) => p[1] !== null);
    b = beta(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
    corr = correlation(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
  }
  const highs = rows.map((x) => x.high ?? x.close), lows = rows.map((x) => x.low ?? x.close);
  const high52 = Math.max(...highs), low52 = Math.min(...lows);
  const s50 = sma(closes, 50), s200 = sma(closes, 200), rs = rsi(closes, 14);
  const dd = drawdown(adj);
  const vols = complete.map((x) => x.volume).filter(Number.isFinite);
  const lastVolume = complete.at(-1)?.volume ?? null;
  const avgVolume = vols.length > 21 ? mean(vols.slice(-21, -1)) : null;
  const yearAgo = rows.at(-1).date.replace(/^(\d{4})/, (y) => String(Number(y) - 1));
  const trailingDividend = history.dividends.filter((d) => d.date > yearAgo).reduce((s, d) => s + d.amount, 0);
  const completeLast = complete.at(-1), completePrev = complete.at(-2);
  const metrics = {
    symbol: history.symbol, name: history.name, kind: history.kind, sessionDate: last.date, lastPartial: history.lastPartial,
    price: round(last.close), previousClose: round(prev?.close),
    change1D: prev ? round((last.close / prev.close - 1) * 100) : null,
    sessionChange: completePrev ? round((completeLast.close / completePrev.close - 1) * 100) : null, completedSession: completeLast?.date || null,
    returns: Object.fromEntries(Object.entries(periodReturns(rows)).map(([k, v]) => [k, round(v)])),
    volatility: round(annualizedVolatility(r)), beta: round(b), correlation: round(corr),
    maxDrawdown: round(dd.max), drawdownFromPeak: round(dd.current),
    high52: round(high52), low52: round(low52), fromHigh52: round((last.close / high52 - 1) * 100), position52: round(high52 > low52 ? ((last.close - low52) / (high52 - low52)) * 100 : null, 1),
    sma50: round(s50.at(-1)), sma200: round(s200.at(-1)),
    aboveSma50: s50.at(-1) === null ? null : last.close > s50.at(-1), aboveSma200: s200.at(-1) === null ? null : last.close > s200.at(-1),
    rsi14: round(rs.at(-1), 1), lastVolume, avgVolume20: avgVolume === null ? null : Math.round(avgVolume), volumeRatio: avgVolume && lastVolume ? round(lastVolume / avgVolume) : null,
    trailingDividend: round(trailingDividend), dividendYield: trailingDividend > 0 ? round((trailingDividend / last.close) * 100) : null,
    sessions: rows.length, adjusted: history.adjusted, stale: Boolean(history.stale), asOf: history.asOf, fetchedAt: history.fetchedAt,
    spark: downsample(closes.slice(-60), 60).map((v) => round(v)),
  };
  if (includeSeries) {
    metrics.series = {
      dates: rows.map((x) => x.date), close: closes.map((v) => round(v)), volume: rows.map((x) => x.volume),
      sma50: s50.map((v) => round(v)), sma200: s200.map((v) => round(v)), rsi: rs.map((v) => round(v, 1)), drawdown: dd.series.map((v) => round(v)),
    };
    metrics.dividends = history.dividends;
    metrics.splits = history.splits;
  }
  return metrics;
}

// Threshold alerts on the last COMPLETED session, using the investor's own preferences.
export function alertsFor(metrics, prefs = {}) {
  const price = Number(prefs.priceThreshold) > 0 ? Number(prefs.priceThreshold) : 4;
  const volume = Number(prefs.volumeThreshold) > 0 ? Number(prefs.volumeThreshold) : 2;
  const out = [];
  for (const m of metrics) {
    if (Number.isFinite(m.sessionChange) && Math.abs(m.sessionChange) > price)
      out.push({ ticker: m.symbol, type: 'price', severity: Math.abs(m.sessionChange) > 2 * price ? 'risk' : 'watch', value: m.sessionChange, threshold: price, session: m.completedSession, text: m.symbol + ' moved ' + (m.sessionChange > 0 ? '+' : '') + m.sessionChange.toFixed(2) + '% on ' + m.completedSession + ', beyond your ±' + price + '% threshold.' });
    if (Number.isFinite(m.volumeRatio) && m.volumeRatio > volume)
      out.push({ ticker: m.symbol, type: 'volume', severity: m.volumeRatio > 2 * volume ? 'risk' : 'watch', value: m.volumeRatio, threshold: volume, session: m.completedSession, text: m.symbol + ' traded ' + m.volumeRatio.toFixed(2) + '× its prior 20-session average volume on ' + m.completedSession + ' (threshold ' + volume + '×).' });
  }
  return out.sort((a, b) => (a.severity === b.severity ? Math.abs(b.value) - Math.abs(a.value) : a.severity === 'risk' ? -1 : 1));
}

// Back-test of TODAY's weights over the past year. This is not the investor's realised return: there is
// no transaction history, so weights are held constant (daily rebalanced) and the label says so.
export function portfolioAnalytics({ holdings, histories, benchmark, prefs = {} }) {
  const dates = benchmark.rows.map((r) => r.date);
  const notes = [];
  const usable = [];
  for (const h of holdings) {
    const entry = histories[h.ticker];
    if (!entry?.ok) { notes.push(h.ticker + ': price history unavailable (' + (entry?.error || 'not requested') + '); excluded from portfolio maths.'); continue; }
    const aligned = alignOn(dates, entry.data.rows);
    if (aligned.coverage < 0.8) { notes.push(h.ticker + ': history covers only ' + Math.round(aligned.coverage * 100) + '% of the year; excluded from portfolio maths.'); continue; }
    usable.push({ ...h, history: entry.data, aligned: aligned.values });
  }
  if (!usable.length) throw new Error('No holding had enough price history to analyse.');
  const start = usable.reduce((s, h) => Math.max(s, h.aligned.findIndex((v) => v !== null)), 0);
  const window = dates.slice(start);
  const totalWeight = usable.reduce((s, h) => s + h.weight, 0);
  const weights = usable.map((h) => h.weight / totalWeight);
  const returnMatrix = usable.map((h) => returnsOf(h.aligned.slice(start)));
  const benchValues = benchmark.rows.slice(start).map((r) => r.adj);
  const benchReturns = returnsOf(benchValues);
  const portReturns = benchReturns.map((_, t) => usable.reduce((s, h, i) => s + weights[i] * returnMatrix[i][t], 0));
  const growth = [100];
  portReturns.forEach((x) => growth.push(growth.at(-1) * (1 + x)));
  const benchGrowth = benchValues.map((v) => (v / benchValues[0]) * 100);
  const dd = drawdown(growth), benchDd = drawdown(benchGrowth);
  const ret = (series, days) => { const base = days === null ? series[0] : series[series.length - 1 - days]; return Number.isFinite(base) ? (series.at(-1) / base - 1) * 100 : null; };
  const periods = Object.fromEntries(Object.entries(PERIODS).map(([k, d]) => [k, { portfolio: round(ret(growth, d)), benchmark: round(ret(benchGrowth, d)) }]));
  const perHolding = usable.map((h) => stockMetrics(h.history, benchmark));
  const rc = riskContributions(weights, returnMatrix);
  const n = usable.length;
  const corr = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : round(correlation(returnMatrix[i], returnMatrix[j])))));
  const pairs = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (corr[i][j] !== null) pairs.push(corr[i][j]);
  const sectors = {};
  usable.forEach((h, i) => { const s = h.sector || 'Unclassified'; sectors[s] = (sectors[s] || 0) + weights[i]; });
  const holdingsOut = usable.map((h, i) => ({
    ticker: h.ticker, name: h.name || perHolding[i].name, sector: h.sector || 'Unclassified', weight: round(weights[i] * 100), riskShare: round(rc[i] === null ? null : rc[i] * 100),
    contribution1Y: perHolding[i].returns['1Y'] === null ? null : round(weights[i] * perHolding[i].returns['1Y']), metrics: perHolding[i],
  }));
  const sorted = [...weights].sort((a, b) => b - a);
  const metrics = {
    holdingsAnalysed: n, holdingsRequested: holdings.length, window: { from: window[0], to: window.at(-1), sessions: window.length },
    periods, volatility: round(annualizedVolatility(portReturns)), benchmarkVolatility: round(annualizedVolatility(benchReturns)),
    beta: round(beta(portReturns, benchReturns)), correlation: round(correlation(portReturns, benchReturns)),
    maxDrawdown: round(dd.max), benchmarkMaxDrawdown: round(benchDd.max), drawdownFromPeak: round(dd.current), benchmarkDrawdownFromPeak: round(benchDd.current),
    effectiveHoldings: round(effectiveHoldings(weights), 1), topWeight: round(sorted[0] * 100), top3Weight: round(sorted.slice(0, 3).reduce((s, w) => s + w, 0) * 100),
    averageCorrelation: round(pairs.length ? mean(pairs) : null),
    belowSma200: holdingsOut.filter((h) => h.metrics.aboveSma200 === false).map((h) => h.ticker),
    nearHigh52: holdingsOut.filter((h) => h.metrics.fromHigh52 > -5).map((h) => h.ticker),
    farFromHigh52: holdingsOut.filter((h) => h.metrics.fromHigh52 < -25).map((h) => h.ticker),
    sectors: Object.entries(sectors).map(([sector, w]) => ({ sector, weight: round(w * 100) })).sort((a, b) => b.weight - a.weight),
  };
  return {
    metrics, holdings: holdingsOut, correlation: { tickers: usable.map((h) => h.ticker), matrix: corr },
    alerts: alertsFor(perHolding, prefs),
    series: { dates: window, portfolio: growth.map((v) => round(v)), benchmark: benchGrowth.map((v) => round(v)), drawdown: dd.series.map((v) => round(v)), benchmarkDrawdown: benchDd.series.map((v) => round(v)) },
    benchmark: { symbol: benchmark.symbol, name: benchmark.name, metrics: stockMetrics(benchmark, null) },
    notes,
  };
}
