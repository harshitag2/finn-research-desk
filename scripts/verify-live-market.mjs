// LIVE provider check. Run on a machine with internet access:
//   node scripts/verify-live-market.mjs                      # provider adapter only (src/market.js → Yahoo)
//   node scripts/verify-live-market.mjs http://127.0.0.1:4173 # also checks a running FINN server end to end
// It prints exactly what the provider returned (price, exchange timestamp, session, delay flag) and fails if any
// requested quote is missing. It never substitutes or estimates a price. No credentials are read or printed.
import { fetchQuotes } from '../src/market.js';

const server = process.argv[2] ? new URL(process.argv[2]).origin : '';
const tickers = (process.env.FINN_VERIFY_TICKERS || 'INFY,TCS,HDFCBANK,PIDILITIND').split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
const row = (q) => ({ ticker: q.ticker, price: q.price, currency: q.currency, asOf: q.asOf, session: q.marketState, delayMinutes: q.delayMinutes, stale: q.stale, error: q.error });
let failed = false;

console.log(JSON.stringify({ check: 'provider_adapter', at: new Date().toISOString(), tickers }));
const direct = await fetchQuotes(tickers);
for (const q of direct.quotes) {
  console.log(JSON.stringify(row(q)));
  if (!Number.isFinite(q.price)) failed = true;
}
console.log(JSON.stringify({ notice: direct.notice }));

if (server) {
  const call = async (path, body) => {
    const r = await fetch(server + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const data = await r.json();
    if (!r.ok) throw new Error(path + ' → HTTP ' + r.status + ': ' + (data.error || ''));
    return data;
  };
  const quotes = await call('/api/quotes?tickers=' + encodeURIComponent(tickers.join(',')));
  console.log(JSON.stringify({ check: 'server_quotes', server, quotes: quotes.quotes.map(row) }));
  if (quotes.quotes.some((q) => !Number.isFinite(q.price))) failed = true;

  const mixed = await call('/api/compare', { tickers: ['INFY', 'TCS'], query: 'Compare Infosys and TCS on FY27 growth guidance and show their stock prices' });
  const priceGap = (mixed.gaps || []).filter((g) => /stock price|share price/i.test(g));
  console.log(JSON.stringify({ check: 'server_mixed_request', mode: mixed.mode, documentQuery: mixed.documentQuery, market: mixed.market?.status, quotes: mixed.market?.quotes?.map(row), findings: mixed.findings?.length, evidence: mixed.evidence?.length, gaps: mixed.gaps }));
  if (mixed.market?.status !== 'ready' || priceGap.length) failed = true;

  const priceOnly = await call('/api/research', { ticker: 'PIDILITIND', query: 'PIDILITIND current stock price' });
  console.log(JSON.stringify({ check: 'server_price_only_uncovered', mode: priceOnly.mode, market: priceOnly.market?.status, quote: priceOnly.market?.quotes?.map(row) }));
  if (priceOnly.mode !== 'market' || priceOnly.market?.status !== 'ready') failed = true;
}
console.log(failed ? 'LIVE CHECK FAILED: at least one quote or check above did not pass.' : 'LIVE CHECK PASSED. Quotes may be delayed; this is not a licensed real-time exchange feed.');
// Let pending HTTP handles close naturally; a forced exit can trigger libuv's
// UV_HANDLE_CLOSING assertion on Windows even after every live check passed.
process.exitCode = failed ? 1 : 0;
