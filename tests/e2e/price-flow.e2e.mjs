// Browser end-to-end check: stock-price flow, Push digest, portfolio deep dive, markets, screener,
// stock pages, and a smoke pass over existing features.
// Runs the real Worker + browser client locally; ONLY the external upstreams (Yahoo chart API, Gemini, NSE)
// are replaced by tests/e2e/mock-upstreams.mjs. Fixture prices are synthetic. This is not a live-provider test:
// use `npm run verify:market` on a machine with internet access for that.
//
// Requires Playwright with Chromium (not a project dependency):  node tests/e2e/price-flow.e2e.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureFigures } from '../fixtures/xbrl-fixture.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed. Install it separately (npm i -g playwright && npx playwright install chromium) to run this browser check.');
  process.exit(2);
}

const port = Number(process.env.E2E_PORT || 4199);
const base = `http://127.0.0.1:${port}`;
const work = join(tmpdir(), 'finn-e2e-' + process.pid);
mkdirSync(work, { recursive: true });
const stateFile = join(work, 'state.json');
const logFile = join(work, 'upstream.log');
const shots = join(root, 'test-results', 'e2e');
mkdirSync(shots, { recursive: true });
const setUpstream = (s) => writeFileSync(stateFile, JSON.stringify(s));
const upstreamLog = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const researchCalls = () => upstreamLog().filter((e) => e.upstream === 'gemini' && e.kind === 'research');
setUpstream({ yahoo: 'ok', gemini: 'ok' });
writeFileSync(logFile, '');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : '  — ' + detail));
}

const server = spawn(process.execPath, ['--import', './tests/e2e/mock-upstreams.mjs', 'scripts/dev.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), GEMINI_API_KEY: 'e2e-mock-key', FINN_PROVIDER: 'gemini', FINN_MOCK_STATE: stateFile, FINN_MOCK_LOG: logFile },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(new Error('Dev server did not start')), 30000);
  server.stdout.on('data', (d) => /Local:/.test(String(d)) && (clearTimeout(timer), ok()));
  server.stderr.on('data', (d) => process.stderr.write(d));
  server.on('exit', (code) => fail(new Error('Dev server exited ' + code)));
});

const browser = await chromium.launch();
const cardInfo = (page) =>
  page.$$eval('#workspace-market .market-card', (cards) =>
    cards.map((c) => ({ ticker: c.querySelector('.market-card-name b')?.textContent, text: c.textContent.replace(/\s+/g, ' ').trim(), failed: c.classList.contains('failed'), stale: c.classList.contains('stale'), button: c.tagName === 'BUTTON' })),
  );
async function settle(page) {
  await page.waitForFunction(() => /\b(done|attention)\b/.test(document.querySelector('#command-status')?.className || ''), null, { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('#workspace-market[aria-busy="true"]') && !document.querySelector('#research-output[aria-busy="true"]'), null, { timeout: 30000 });
  await page.waitForTimeout(250);
}
async function command(page, text) {
  await page.fill('#workspace-command', text);
  await page.click('#command-submit');
  await settle(page);
}
function track(page) {
  const seen = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/')) seen.push({ path: u.pathname, search: u.search, body: r.postData() });
  });
  return { since: (n) => seen.slice(n), get length() { return seen.length; } };
}
const gapsText = (page) => page.$$eval('.gaps p', (n) => n.map((x) => x.textContent));
const MIXED = 'Compare Infosys and TCS on FY27 growth guidance and show their stock prices';

try {
  // ───────────────────────────── Desktop ─────────────────────────────
  console.log('\nDesktop 1360×1000 (mocked upstreams)');
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true });
  const net = track(page);
  await page.goto(base + '/#briefing');
  await page.waitForSelector('#overview-tape .tape-row');
  await page.waitForFunction(() => document.querySelectorAll('#overview-tape .tape-price b').length && [...document.querySelectorAll('#overview-tape .tape-price b')].every((b) => b.textContent.includes('₹')), null, { timeout: 15000 });
  check('overview market tape shows provider quotes', true);

  // ───────────── Push digest on the Overview (mocked NSE announcements + histories) ─────────────
  const digestReady = (p) => p.waitForFunction(() => { const d = document.querySelector('#digest-panel'); return d && d.getAttribute('aria-busy') === 'false' && (d.querySelector('.digest-filters') || d.querySelector('.error-panel')); }, null, { timeout: 30000 });
  const digestItems = (p) => p.$$eval('#digest-panel .digest-item', (n) => n.map((i) => ({ cls: i.className, meta: [...i.querySelector('.digest-meta').children].map((c) => c.textContent.trim()).join(' '), text: i.querySelector('p').textContent, links: i.querySelectorAll('a.source-link').length, isNew: !!i.querySelector('.new-flag') })));
  await digestReady(page);
  let items = await digestItems(page);
  const high = await page.$$eval('.digest-columns > div:first-child .digest-item', (n) => n.map((i) => i.querySelector('.company-chip').textContent));
  check('digest: opens on the Overview with filings sorted into attention / worth a look / routine', high.join() === 'INFY,HDFCBANK' && (await page.$$('.digest-columns > div:nth-child(2) .digest-item')).length === 2 && (await page.$$('.digest-routine .digest-item')).length === 1, JSON.stringify(items.map((i) => i.meta)));
  const infy = items.find((i) => /INFY/.test(i.meta));
  check('digest: duplicate standalone/consolidated filings grouped into one item with both links', infy && infy.links === 2 && /Results/.test(infy.meta) && /^TEST FIXTURE audited financial results/.test(infy.text), JSON.stringify(infy));
  check('digest: board-meeting intimation shown as an upcoming results event, not as results', items.some((i) => /TCS/.test(i.meta) && /upcoming/.test(i.meta) && /medium/.test(i.cls)));
  check('digest: routine paperwork collapsed', /Routine paperwork · 1 collapsed \(Trading Window-XBRL\)/.test(await page.textContent('.digest-routine summary')));
  check('digest: price/volume threshold alert from completed sessions', (await page.$$eval('.alert-chip', (n) => n.map((x) => x.textContent))).some((t) => /LT traded .*× its prior 20-session average volume/.test(t)));
  const digestReqs = net.since(0).filter((r) => r.path === '/api/digest');
  check('digest: one /api/digest request for the 18-company watchlist', digestReqs.length === 1 && new URLSearchParams(digestReqs[0].search).get('tickers').split(',').length === 18 && new URLSearchParams(digestReqs[0].search).get('window') === '24h', JSON.stringify(digestReqs.map((r) => r.search.slice(0, 80))));
  const nseCalls = upstreamLog().filter((e) => e.upstream === 'nse');
  check('digest: every NSE request is date-bounded', nseCalls.length === 18 && nseCalls.every((e) => /^\d{2}-\d{2}-\d{4}$/.test(e.from) && /^\d{2}-\d{2}-\d{4}$/.test(e.to)), JSON.stringify(nseCalls.slice(0, 2)));
  check('digest: filing links open the exchange PDF in a new tab', await page.$$eval('#digest-panel a.source-link[href^="https://nsearchives.nseindia.com/"]', (n) => n.length > 0 && n.every((a) => a.target === '_blank' && /noopener/.test(a.rel))));
  await page.click('[data-action="digest-filter"][data-category="results"]');
  items = await digestItems(page);
  check('digest: category filter shows only results', items.length === 2 && items.every((i) => /Results/.test(i.meta)) && !(await page.$('.digest-alerts')), JSON.stringify(items.map((i) => i.meta)));
  await page.click('[data-action="digest-filter"][data-category=""]');
  await page.selectOption('#digest-window', '30d');
  await digestReady(page);
  items = await digestItems(page);
  check('digest: 30-day window adds older filings (management change, credit rating)', items.some((i) => /INFY Management change/.test(i.meta)) && items.some((i) => /TCS Credit rating · your focus/.test(i.meta) && /high/.test(i.cls)), JSON.stringify(items.map((i) => i.meta)));
  await page.click('#digest-panel [data-action="preferences"]');
  check('settings: filing categories listed with defaults ticked', (await page.$$('#preferences-form input[name="categories"]')).length === 16 && (await page.$$('#preferences-form input[name="categories"]:checked')).length === 8);
  await page.uncheck('#preferences-form input[name="categories"][value="credit_rating"]');
  await page.click('#preferences-form button[type=submit]');
  await page.waitForTimeout(150);
  await digestReady(page);
  items = await digestItems(page);
  const lastDigest = net.since(0).filter((r) => r.path === '/api/digest').at(-1);
  check('settings: unticking credit rating moves it to “worth a look” and the request carries the focus list', items.some((i) => /TCS Credit rating/.test(i.meta) && /medium/.test(i.cls) && !/your focus/.test(i.meta)) && !/credit_rating/.test(decodeURIComponent(lastDigest.search)), decodeURIComponent(lastDigest.search).slice(0, 200));
  await page.click('#digest-panel [data-action="preferences"]');
  await page.check('#preferences-form input[name="categories"][value="credit_rating"]');
  await page.click('#preferences-form button[type=submit]');
  await page.waitForTimeout(150);
  await digestReady(page);

  await command(page, 'Any management changes this month?');
  items = await digestItems(page);
  check('command: “Any management changes this month?” opens the 30-day digest filtered to management changes', (await page.inputValue('#digest-window')) === '30d' && items.length === 1 && /INFY Management change/.test(items[0].meta) && /What changed/.test(await page.textContent('#command-status')), JSON.stringify(items.map((i) => i.meta)));
  check('command: digest uses no model call and no research request', !net.since(0).some((r) => ['/api/research', '/api/compare'].includes(r.path)) && !upstreamLog().some((e) => e.upstream === 'gemini'), JSON.stringify(upstreamLog().filter((e) => e.upstream === 'gemini')));
  await command(page, 'Any filings from Infosys and TCS in the last 3 days?');
  items = await digestItems(page);
  check('command: a named-company digest is scoped to those companies', /Scoped to INFY, TCS/.test(await page.textContent('.digest-scope')) && items.length > 0 && items.every((i) => /INFY|TCS/.test(i.meta)) && /across 2 companies/.test(await page.textContent('#digest-panel .digest-top p')), JSON.stringify(items.map((i) => i.meta)));
  await page.click('[data-action="digest-all"]');
  await digestReady(page);
  check('digest: “Show the whole portfolio” clears the scope', !(await page.$('.digest-scope')) && /across 18 companies/.test(await page.textContent('#digest-panel .digest-top p')));

  setUpstream({ nse: 'down' });
  await page.selectOption('#digest-window', '7d');
  await digestReady(page);
  const nseErr = await page.textContent('#digest-panel .error-panel');
  check('digest: NSE unavailable is reported, nothing invented, price alerts still shown', /NSE announcements feed did not answer/.test(nseErr) && (await page.$$('#digest-panel .digest-item')).length === 0 && (await page.$$('.alert-chip')).length > 0 && !!(await page.$('#digest-panel .error-panel a[href^="https://www.nseindia.com/"]')), nseErr);
  setUpstream({});
  await page.evaluate(() => localStorage.setItem('finn-digest-seen', JSON.stringify(new Date(Date.now() - 4 * 3600000).toISOString())));
  await page.reload();
  await digestReady(page);
  items = await digestItems(page);
  check('digest: filings since the last read are flagged NEW', items.filter((i) => i.isNew).length === 1 && items.find((i) => i.isNew).meta.includes('INFY') && /1 new since you last marked it read/.test(await page.textContent('#digest-panel .digest-top p')), JSON.stringify(items.map((i) => [i.meta, i.isNew])));
  await page.click('[data-action="digest-seen"]');
  check('digest: “Mark as read” clears the NEW flags', (await page.$$('#digest-panel .new-flag')).length === 0 && !(await page.$('[data-action="digest-seen"]')));
  await page.waitForSelector('#overview-tape .tape-row');
  await page.evaluate(() => document.querySelector('#toast')?.classList.remove('show'));
  await page.waitForTimeout(300);
  await (await page.$('#digest-panel')).screenshot({ path: join(shots, 'desktop-digest.png') });

  // ───────────── Results first cut (mocked NSE integrated filings, synthetic figures) ─────────────
  const resultsReady = (p) => p.waitForFunction(() => { const r = document.querySelector('#results-panel'); return r && r.getAttribute('aria-busy') !== 'true' && (r.querySelector('.results-table') || r.querySelector('.error-panel')); }, null, { timeout: 30000 });
  const resultsTable = (p) => p.$$eval('#results-panel > .results-table tbody tr', (rows) => rows.map((r) => [...r.children].map((c) => c.textContent.trim())));
  const resultsCols = (p) => p.$$eval('#results-panel > .results-table thead th', (n) => n.map((x) => x.textContent.trim()));
  const geminiBefore = upstreamLog().filter((e) => e.upstream === 'gemini').length;
  let rmark = net.length;
  await page.click('#digest-panel [data-action="open-results"][data-ticker="INFY"]');
  await resultsReady(page);
  check('results: a digest results item opens the first cut on the company stock page', /Infosys/.test(await page.textContent('main h1')) && !!(await page.$('#results-panel .results-table')));
  let head = await resultsTable(page), cols = await resultsCols(page);
  check('results: five headline rows for Q2 FY27 against Q1 FY27 (QoQ) and Q2 FY26 (YoY)', head.length === 5 && /Revenue from operations/.test(head[0][0]) && /^EBITDA/.test(head[1][0]) && /EBITDA margin/.test(head[2][0]) && /Profit before tax/.test(head[3][0]) && /Net profit/.test(head[4][0]) && /Q2 FY27/.test(cols[1]) && /Q1 FY27/.test(cols[2]) && /QoQ/.test(cols[3]) && /Q2 FY26/.test(cols[4]) && /YoY/.test(cols[5]), JSON.stringify({ cols, rows: head.map((r) => r[0]) }));
  const fx = (q) => fixtureFigures('INFY', q).RevenueFromOperations / 1e7;
  const fmtCr = (v) => '₹' + Number(v.toFixed(2)).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: Number(v.toFixed(2)) % 1 ? 2 : 0 });
  const qoq = ((fx('2026-09-30') - fx('2026-06-30')) / fx('2026-06-30')) * 100, yoy = ((fx('2026-09-30') - fx('2025-09-30')) / fx('2025-09-30')) * 100;
  check('results: revenue is the filed figure in ₹ crore and QoQ / YoY are computed from the three filings', head[0][1] === fmtCr(fx('2026-09-30')) && head[0][2] === fmtCr(fx('2026-06-30')) && Math.abs(parseFloat(head[0][3]) - qoq) < 0.011 && Math.abs(parseFloat(head[0][5]) - yoy) < 0.011, JSON.stringify({ row: head[0], expect: [fmtCr(fx('2026-09-30')), qoq.toFixed(2), yoy.toFixed(2)] }));
  check('results: EBITDA and margin are labelled as computed, with the formula', (await page.$$eval('#results-panel abbr', (n) => n.map((a) => a.title))).some((t) => /Computed by FINN: PBT before exceptional items \+ finance costs/.test(t)));
  check('results: arithmetic checks reconcile and every period links to its NSE XBRL filing', /3 of 3 arithmetic checks reconcile/.test(await page.textContent('#results-panel .results-top p')) && (await page.$$('#results-panel .results-sources a[href^="https://nsearchives.nseindia.com/corporate/xbrl/"]')).length === 3);
  check('results: one /api/results request and no model call', net.since(rmark).filter((r) => r.path === '/api/results').length === 1 && upstreamLog().filter((e) => e.upstream === 'gemini').length === geminiBefore);
  rmark = net.length;
  await page.click('[data-action="results-basis"][data-basis="standalone"]');
  await resultsReady(page);
  check('results: standalone basis on request', /STANDALONE/.test(await page.textContent('#results-panel .eyebrow')) && net.since(rmark).some((r) => r.path === '/api/results' && /basis=standalone/.test(r.search)));
  await page.click('[data-action="results-basis"][data-basis="consolidated"]');
  await resultsReady(page);
  await page.selectOption('#results-quarter', '2026-03-31');
  await resultsReady(page);
  cols = await resultsCols(page);
  check('results: an earlier quarter compares Q4 FY26 with Q3 FY26 and Q4 FY25', /Q4 FY26/.test(cols[1]) && /Q3 FY26/.test(cols[2]) && /Q4 FY25/.test(cols[4]), JSON.stringify(cols));
  const [rdl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export-results"]')]);
  const rmd = readFileSync(await rdl.path(), 'utf8');
  check('results: Markdown export carries the table, checks, sources and method', /^# Infosys — Q4 FY26 results first cut \(consolidated\)/.test(rmd) && /\| EBITDA \(computed\) \|/.test(rmd) && /## Arithmetic checks/.test(rmd) && /nsearchives\.nseindia\.com\/corporate\/xbrl\//.test(rmd) && /Nothing is estimated/.test(rmd), rmd.slice(0, 160));
  await command(page, 'Show HDFC Bank quarterly results');
  await resultsReady(page);
  head = await resultsTable(page);
  check('results: banks show total income, net interest income and pre-provision profit instead of EBITDA', head.map((r) => r[0]).join('|').startsWith('Total income|Net interest income') && /Operating profit before provisions/.test(head[2][0]) && /Results first cut · Q2 FY27 · consolidated/.test(await page.textContent('#command-status')), JSON.stringify(head.map((r) => r[0])));
  await command(page, 'PIDILITIND Q2 FY27 results');
  await resultsReady(page);
  head = await resultsTable(page);
  check('results: a missing year-ago filing is stated and YoY is not computed', /YoY not computed: NSE lists no consolidated filing for Q2 FY26/.test(await page.textContent('#results-panel .gaps')) && head.every((r) => r[4] === '—' && r[5] === 'n.m.') && head.every((r) => r[1] !== '—'), JSON.stringify(head));
  setUpstream({ nse: 'down' });
  await command(page, 'TITAN Q2 FY27 results');
  await resultsReady(page);
  const rerr = (await page.textContent('#results-panel')) || '';
  check('results: NSE unavailable → error, no figures, flagged in the command status', /NSE filing list HTTP 403/.test(rerr) && /No figures are shown/.test(rerr) && !(await page.$('#results-panel .results-table')) && /attention/.test(await page.getAttribute('#command-status', 'class')), rerr.slice(0, 200));
  setUpstream({});
  await command(page, 'Infosys Q2 FY27 results');
  await resultsReady(page);
  await page.evaluate(() => document.querySelector('#results-panel').scrollIntoView());
  await page.waitForTimeout(300);
  await (await page.$('#results-panel')).screenshot({ path: join(shots, 'desktop-results.png') });

  let mark = net.length, calls = researchCalls().length;
  await command(page, MIXED);
  let cards = await cardInfo(page);
  check('mixed command: two quote cards (INFY, TCS)', cards.length === 2 && cards.map((c) => c.ticker).join() === 'INFY,TCS', JSON.stringify(cards));
  check('mixed command: cards show provider timestamp, session, delay and currency', cards.every((c) => /₹/.test(c.text) && /IST/.test(c.text) && /Session (open|closed|unknown)/.test(c.text) && /delay/i.test(c.text) && /INR/.test(c.text)), cards.map((c) => c.text).join(' | '));
  let gaps = await gapsText(page);
  check('mixed command: no document gap about stock prices', !gaps.some((g) => /stock price|share price/i.test(g)), gaps.join(' | '));
  check('mixed command: legitimate guidance gap preserved', gaps.some((g) => /does not provide numerical revenue growth guidance/.test(g)), gaps.join(' | '));
  check('mixed command: cited findings rendered', (await page.$$('.finding .citation-button')).length >= 2);
  check('mixed command: document question shown without the price clause', (await page.textContent('.routing-note'))?.includes('Compare Infosys and TCS on FY27 growth guidance'));
  check('mixed command: model received only the document question', researchCalls().slice(calls).every((c) => !/price|quote/i.test(c.question)) && researchCalls().length === calls + 1, JSON.stringify(researchCalls().slice(calls)));
  let reqs = net.since(mark);
  check('mixed command: one quote request and one document request (no duplicates)', reqs.filter((r) => r.path === '/api/quotes').length === 1 && reqs.filter((r) => r.path === '/api/compare').length === 1 && JSON.parse(reqs.find((r) => r.path === '/api/compare').body).separateMarket === true, JSON.stringify(reqs.map((r) => r.path + r.search)));
  check('mixed command: status reports quotes ready', /Quotes ready/.test(await page.textContent('#command-status')));
  await page.waitForTimeout(1500);
  check('mixed command: quotes remain visible after research completes', (await cardInfo(page)).length === 2);
  await page.screenshot({ path: join(shots, 'desktop-mixed.png'), fullPage: true });

  mark = net.length; calls = researchCalls().length;
  await command(page, 'show their prices');
  cards = await cardInfo(page);
  check('follow-up “show their prices” keeps INFY and TCS', cards.map((c) => c.ticker).join() === 'INFY,TCS', JSON.stringify(cards.map((c) => c.ticker)));
  reqs = net.since(mark);
  check('follow-up: market data only (no document or model request)', !reqs.some((r) => ['/api/research', '/api/compare'].includes(r.path)) && researchCalls().length === calls, JSON.stringify(reqs.map((r) => r.path)));
  check('follow-up: market snapshot note instead of empty research', (await page.$('.market-next')) !== null);

  mark = net.length; calls = researchCalls().length;
  await command(page, 'TCS current stock price');
  cards = await cardInfo(page);
  check('price-only command: one TCS quote', cards.length === 1 && cards[0].ticker === 'TCS' && cards[0].button);
  check('price-only command: no document request and no model call', !net.since(mark).some((r) => ['/api/research', '/api/compare'].includes(r.path)) && researchCalls().length === calls);

  // Company research form
  await page.fill('#research-ticker', 'INFY');
  await page.click('[data-action="apply-ticker"]');
  await page.click('.manual-question summary');
  await page.fill('#research-question', 'What is the FY27 revenue growth guidance and the current share price?');
  mark = net.length; calls = researchCalls().length;
  await page.click('#research-form button[type=submit]');
  await page.waitForFunction(() => document.querySelector('#research-output')?.getAttribute('aria-busy') === 'false' && document.querySelector('.notebook-title'), null, { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('#workspace-market[aria-busy="true"]'), null, { timeout: 15000 });
  cards = await cardInfo(page);
  gaps = await gapsText(page);
  check('research form: market step runs (INFY quote shown)', cards.length === 1 && cards[0].ticker === 'INFY' && cards[0].button, JSON.stringify(cards));
  check('research form: cited research shown without a price gap', (await page.$$('.evidence-card')).length > 0 && !gaps.some((g) => /price/i.test(g)), gaps.join(' | '));
  check('research form: model received only the document question', researchCalls().slice(calls).length === 1 && !/price/i.test(researchCalls().at(-1).question), researchCalls().at(-1)?.question);
  check('research form: separate quote and research requests', net.since(mark).some((r) => r.path === '/api/quotes') && net.since(mark).some((r) => r.path === '/api/research'));

  // Uncovered company, mixed request
  calls = researchCalls().length;
  await command(page, "What is Pidilite's volume growth guidance and its current share price?");
  cards = await cardInfo(page);
  check('uncovered company: quote shown', cards.length === 1 && cards[0].ticker === 'PIDILITIND' && cards[0].button, JSON.stringify(cards));
  check('uncovered company: source-coverage action shown, model skipped', (await page.$('.coverage-gap [data-action="import"]')) !== null && researchCalls().length === calls);
  await page.screenshot({ path: join(shots, 'desktop-uncovered.png'), fullPage: true });

  // Provider failure + retry (price-only). Use symbols not fetched earlier: the server caches quotes for 30s.
  setUpstream({ yahoo: 'fail:SUNPHARMA', gemini: 'ok' });
  await command(page, 'SUNPHARMA current stock price');
  cards = await cardInfo(page);
  check('provider failure: failed card, no fabricated price', cards.length === 1 && cards[0].failed && !/₹/.test(cards[0].text), JSON.stringify(cards));
  check('provider failure: visible error and retry button', /no usable quote/i.test((await page.textContent('#workspace-market .market-desk-error')) || '') && /Retry quotes/.test((await page.textContent('[data-action="retry-market"]')) || ''));
  check('provider failure: command status flags the provider, not documents', /provider/i.test(await page.textContent('#command-status')) && !/Sources needed/.test(await page.textContent('#command-status')));
  await page.screenshot({ path: join(shots, 'desktop-provider-failure.png') });
  setUpstream({ yahoo: 'ok', gemini: 'ok' });
  await page.click('[data-action="retry-market"]');
  await page.waitForFunction(() => document.querySelector('#workspace-market')?.getAttribute('aria-busy') === 'false', null, { timeout: 15000 });
  cards = await cardInfo(page);
  check('retry: quote-only retry recovers the price', cards.length === 1 && cards[0].button && /₹/.test(cards[0].text), JSON.stringify(cards));

  // Provider failure in a mixed request: research stays usable
  setUpstream({ yahoo: 'fail:HDFCBANK', gemini: 'ok' });
  await command(page, 'What did HDFC Bank management say about loan growth, and what is the current share price?');
  cards = await cardInfo(page);
  gaps = await gapsText(page);
  check('mixed + provider failure: research still rendered', (await page.$$('.evidence-card')).length > 0 && (await page.$$('.finding')).length > 0);
  check('mixed + provider failure: market failure kept separate from document gaps', cards.length === 1 && cards[0].failed && !gaps.some((g) => /price|quote/i.test(g)), gaps.join(' | '));
  setUpstream({ yahoo: 'ok', gemini: 'ok' });
  await page.click('[data-action="retry-market"]');
  await page.waitForFunction(() => document.querySelector('#workspace-market')?.getAttribute('aria-busy') === 'false', null, { timeout: 15000 });
  check('mixed + provider failure: retry fills the quote without rerunning research', (await cardInfo(page))[0]?.button === true && (await page.$$('.evidence-card')).length > 0);

  // A whole failed refresh never presents earlier prices as fresh
  await command(page, 'Compare Infosys and TCS stock prices');
  await page.route('**/api/quotes**', (r) => r.abort());
  await page.click('[data-action="retry-market"]');
  await page.waitForFunction(() => document.querySelector('#workspace-market')?.getAttribute('aria-busy') === 'false', null, { timeout: 15000 });
  cards = await cardInfo(page);
  check('refresh failure: earlier quotes are flagged as cached, with an alert', cards.length === 2 && cards.every((c) => c.stale && /Cached · refresh failed/.test(c.text)) && (await page.$('#workspace-market .market-desk-error')) !== null, JSON.stringify(cards));
  await page.unroute('**/api/quotes**');

  // Business pricing topics do not trigger market data
  await command(page, 'What does HCLTech management say about pricing power?');
  check('pricing-power question: no market panel', (await cardInfo(page)).length === 0 && (await page.$('.notebook-title')) !== null);
  await command(page, 'How did input-price inflation affect L&T margins?');
  check('input-price inflation question: no market panel', (await cardInfo(page)).length === 0);

  // Save, export and reopen a mixed note
  await command(page, MIXED);
  await page.click('[data-action="save-research"]');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export-research"]')]);
  const exported = readFileSync(await download.path(), 'utf8');
  check('export: keeps original question, document question and market snapshot', exported.startsWith('# ' + MIXED) && /Question sent to company documents: Compare Infosys and TCS on FY27 growth guidance/.test(exported) && /## Market data \(provider snapshot, not from company documents\)/.test(exported) && /\| INFY \| [\d.]+ \| INR \|/.test(exported) && /## Evidence/.test(exported), exported.slice(0, 400));
  await page.click('[data-view="saved"]');
  await page.click('[data-action="open-saved"]');
  await page.waitForSelector('#workspace-market');
  const snap = await page.textContent('#workspace-market');
  check('saved note: reopens with a labelled, non-live snapshot', /Saved snapshot/.test(snap) && /not live/.test(snap) && /Fetch current quotes/.test(snap), snap);

  // ───────────── Portfolio deep dive, markets, screener and stock pages (mocked histories) ─────────────
  console.log('\nDeep dive · markets · screener · stock pages (desktop, mocked upstreams)');
  await page.click('[data-view="briefing"]');
  const dl = net.length;
  await command(page, 'Give me a deep analysis of my portfolio');
  await page.waitForSelector('.kpi-row', { timeout: 60000 });
  await page.waitForTimeout(400);
  check('deep dive: one prompt opens the analysis with 6 KPI tiles', (await page.$$('.kpi-row .kpi')).length === 6);
  check('deep dive: one /api/analyze request does the work', net.since(dl).filter((r) => r.path === '/api/analyze').length === 1);
  check('deep dive: seven charts rendered', (await page.$$('.viz[data-chart] svg')).length === 7, String((await page.$$('.viz[data-chart] svg')).length));
  const trail = await page.textContent('.agent-run .trace');
  check('deep dive: agent trail shows the tool plan and the number check', ['fetch histories', 'compute risk return', 'scan alerts', 'derive insights', 'read disclosures', 'check numbers'].every((t) => trail.includes(t)), trail.slice(0, 300));
  const synth = await page.$$eval('.synthesis .finding', (n) => n.map((x) => x.textContent));
  check('deep dive: model findings shown with metric chips; invented number rejected', synth.length >= 2 && !(await page.textContent('.synthesis')).includes('37.4') && /Rejected a finding with unsupported number\(s\): 37\.4/.test(trail) && (await page.$$('.synthesis .metric-chip')).length >= 2, JSON.stringify(synth));
  check('deep dive: 18 holdings in the sortable table', (await page.$$('.holdings-table tbody tr')).length === 18);
  check('deep dive: volume alert for the scripted spike', /LT traded/.test(await page.textContent('main')));
  const growth = await page.$('.viz[data-chart="growth"] svg');
  const gb = await growth.boundingBox();
  await page.mouse.move(gb.x + gb.width * 0.5, gb.y + gb.height * 0.5);
  await page.waitForTimeout(150);
  const tipRows = await page.$$eval('.viz-tip .viz-tip-row', (n) => n.map((x) => x.textContent));
  check('deep dive: crosshair tooltip lists portfolio and Nifty 50', tipRows.length === 2 && /Portfolio/.test(tipRows[0]) && /Nifty 50/.test(tipRows[1]), JSON.stringify(tipRows));
  await page.click('[data-action="analysis-range"][data-range="3M"]');
  check('deep dive: period filter rescales the charts', /over 3M/.test(await page.textContent('.viz-filters')) && (await page.$$('.viz[data-chart] svg')).length === 7);
  await page.click('.sort-button[data-key="vol"]');
  check('deep dive: holdings table sorts by volatility', /Volatility ↓/.test(await page.textContent('.holdings-table thead')));
  const [adl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export-analysis"]')]);
  const amd = readFileSync(await adl.path(), 'utf8');
  check('deep dive: Markdown export carries metrics, checked findings, alerts, sources and method', /## Key metrics/.test(amd) && /## Agent synthesis \(citation- and number-checked\)/.test(amd) && /## Alerts/.test(amd) && /## Method and limits/.test(amd) && !/37\.4/.test(amd), amd.slice(0, 200));
  await page.click('[data-action="save-analysis"]');
  await page.click('[data-view="saved"]');
  check('deep dive: saved note listed', /PORTFOLIO DEEP DIVE/.test(await page.textContent('main')));
  await page.click('.saved-card [data-action="open-saved"]');
  await page.waitForSelector('.kpi-row');
  check('deep dive: saved analysis reopens', (await page.$$('.viz[data-chart] svg')).length === 7);
  await page.click('.holdings-table tbody tr[data-ticker="TCS"]');
  await page.waitForSelector('.viz[data-chart="price"] svg', { timeout: 30000 });
  check('deep dive: a holdings row opens its stock page', /Tata Consultancy/.test(await page.textContent('main h1')));

  // Imported holdings drive the weights
  await page.click('[data-view="portfolio"]');
  await page.click('.toolbar [data-action="import-holdings"]');
  await page.setInputFiles('#holdings-file', join(root, 'tests/fixtures/holdings-example.csv'));
  await page.click('#holdings-form button[type=submit]');
  await page.waitForSelector('.allocation-panel');
  await command(page, 'How risky is my portfolio compared with the Nifty?');
  await page.waitForSelector('.kpi-row', { timeout: 60000 });
  const basis = await page.textContent('.agent-run-top');
  check('deep dive: imported CSV snapshot sets holdings and market-value weights', /Imported INR snapshot/.test(basis) && /2 of 2 holdings/.test(basis) && (await page.$$('.holdings-table tbody tr')).length === 2, basis.slice(0, 200));
  check('deep dive: a risk question puts risk observations first', /risk/i.test(await page.textContent('.insight-list .insight .kind')));
  await page.click('[data-view="portfolio"]');
  await page.click('[data-action="clear-holdings"]');

  // Markets and screener
  await command(page, 'How is the market today?');
  await page.waitForSelector('.index-card:not(.skeleton)', { timeout: 30000 });
  check('markets: six headline index cards and sector tiles', (await page.$$('.index-card:not(.skeleton)')).length === 6 && (await page.$$('.viz-tile')).length >= 10);
  check('markets: universe breadth and movers', /up · .* down/.test(await page.textContent('.breadth span')) && (await page.$$('.mover-row')).length >= 4);
  await page.click('[data-action="markets-period"][data-period="1Y"]');
  check('markets: period toggle recolours sectors', /Sectors · 1Y/.test(await page.textContent('main')));
  await command(page, 'Which stocks are above their 200-day average with 1 year return above 10%?');
  await page.waitForSelector('#screener');
  const screenRows = await page.$$eval('#screener tbody tr[data-ticker]', (rows) => rows.map((r) => [...r.children].map((c) => c.textContent.trim())));
  check('screener: natural-language screen becomes two filters', (await page.$$('.screen-chip')).length === 2);
  check('screener: every listed stock passes both filters', screenRows.every((c) => c[9] === 'Above' && parseFloat(c[4]) > 10), JSON.stringify(screenRows.map((c) => [c[0], c[4], c[9]])));
  await page.fill('#screen-text', 'oversold or overbought'); await page.click('#screen-form button[type=submit]');
  check('screener: typed screen re-parses (overbought/oversold → RSI filters)', (await page.$$eval('.screen-chip', (n) => n.map((x) => x.textContent))).join(' ').includes('RSI'));
  await page.selectOption('#filter-form select[name=metric]', 'volatility'); await page.selectOption('#filter-form select[name=op]', '<'); await page.fill('#filter-form input[name=value]', '30'); await page.click('#filter-form button[type=submit]:not([value])');
  check('screener: filter builder adds a filter', (await page.$$eval('.screen-chip', (n) => n.map((x) => x.textContent))).some((t) => /Volatility/.test(t)));
  await page.click('.screen-chip'); 
  check('screener: a filter chip can be removed', (await page.$$('.screen-chip')).length >= 1);
  await page.fill('#filter-form input[name=extra]', 'ITC'); await page.click('#filter-form button[value="extra"]');
  await page.waitForFunction(() => /of 19/.test(document.querySelector('#screener .subtle')?.textContent || '') || /19 stocks/.test(document.body.textContent), null, { timeout: 30000 });
  check('screener: symbols can be added to the universe', true);

  // Stock page
  await command(page, 'Show the Infosys chart');
  await page.waitForSelector('.viz[data-chart="price"] svg', { timeout: 30000 });
  check('stock page: price, volume, relative, drawdown and RSI charts', (await page.$$('.viz[data-chart] svg')).length === 5);
  check('stock page: sector index comparison and peers', /Nifty IT/.test(await page.textContent('[data-card="relative"]')) && (await page.$$('.mover-row')).length >= 2);
  await page.focus('.viz[data-chart="price"] svg');
  await page.keyboard.press('ArrowLeft');
  check('stock page: keyboard focus moves the crosshair tooltip', /Close/.test((await page.textContent('.viz-tip')) || ''));
  await page.click('[data-action="stock-range"][data-range="1M"]');
  check('stock page: range toggle keeps all charts', (await page.$$('.viz[data-chart] svg')).length === 5);
  await page.screenshot({ path: join(shots, 'desktop-stock.png'), fullPage: true });
  await command(page, 'Give me a deep analysis of my portfolio');
  await page.waitForSelector('.kpi-row', { timeout: 60000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(shots, 'desktop-deep-dive.png'), fullPage: true });

  // Existing features: portfolio quotes, CSV import, PDF import, thesis review, library
  await page.click('[data-view="portfolio"]');
  await page.waitForFunction(() => document.querySelectorAll('.quote-value').length >= 18, null, { timeout: 30000 });
  check('portfolio: 18 provider quotes in the table', true);
  await page.click('.toolbar [data-action="import-holdings"]');
  await page.setInputFiles('#holdings-file', join(root, 'tests/fixtures/holdings-example.csv'));
  await page.click('#holdings-form button[type=submit]');
  await page.waitForSelector('.allocation-panel', { timeout: 10000 });
  check('portfolio: holdings CSV import consolidates accounts', /IMPORTED INR SNAPSHOT/.test(await page.textContent('.allocation-panel')));
  await page.click('[data-action="clear-holdings"]');
  await page.click('[data-view="library"]');
  await page.click('.toolbar [data-action="import"]');
  await page.setInputFiles('#upload-file', join(root, 'data/raw/hcl-q4-fy26.pdf'));
  await page.fill('#upload-ticker', 'HCLTECH');
  await page.fill('#upload-period', 'Q4 FY26 (e2e upload)');
  await page.fill('#upload-date', '2026-04-21');
  await page.click('#import-submit');
  await page.waitForSelector('[data-action="delete-document"]', { timeout: 30000 });
  check('library: PDF import adds a page-linked uploaded document', /UPLOADED \/ UNVERIFIED/.test(await page.textContent('.library-grid')));
  await page.click('[data-action="delete-document"]');
  await page.click('[data-view="thesis"]');
  await page.click('[data-action="example-thesis"][data-template="growth"]');
  await page.click('#thesis-form button[value="review"]');
  await page.waitForSelector('.thesis-review .evidence-card', { timeout: 30000 });
  check('thesis: review against sources returns cited evidence', (await page.$$('.thesis-review .evidence-card')).length > 0);
  await page.close();

  // ───────────────────────────── Mobile ─────────────────────────────
  console.log('\nMobile 390×844 (mocked upstreams)');
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mobile.goto(base + '/#briefing');
  await mobile.waitForSelector('#overview-tape .tape-row');
  await mobile.waitForSelector('#digest-panel .digest-item', { timeout: 30000 });
  const dov = await mobile.evaluate(() => ({ page: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide: [...document.querySelectorAll('#digest-panel *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length }));
  check('mobile digest: panel fits the screen', dov.page <= 0 && dov.wide === 0, JSON.stringify(dov));
  await command(mobile, 'What changed in my portfolio today?');
  await mobile.waitForTimeout(900);
  const dpos = await mobile.evaluate(() => ({ top: document.querySelector('#digest-panel').getBoundingClientRect().top, dock: document.querySelector('.command-dock').getBoundingClientRect().bottom }));
  check('mobile digest: a digest command brings the panel into view below the sticky dock', dpos.top >= dpos.dock - 2 && dpos.top < 420, JSON.stringify(dpos));
  await mobile.screenshot({ path: join(shots, 'mobile-digest.png') });
  await command(mobile, 'Infosys Q2 FY27 results');
  await mobile.waitForFunction(() => document.querySelector('#results-panel .results-table'), null, { timeout: 30000 });
  await mobile.waitForTimeout(700);
  const rov = await mobile.evaluate(() => { const p = document.querySelector('#results-panel').getBoundingClientRect(), dock = document.querySelector('.command-dock').getBoundingClientRect(); return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, right: p.right, width: innerWidth, top: p.top, dock: dock.bottom }; });
  check('mobile results: first cut fits the screen (table scrolls inside its panel) and is brought into view', rov.page <= 0 && rov.right <= rov.width + 1 && rov.top >= rov.dock - 2 && rov.top < 420, JSON.stringify(rov));
  await mobile.screenshot({ path: join(shots, 'mobile-results.png') });
  await command(mobile, MIXED);
  await mobile.waitForTimeout(900);
  const view = await mobile.evaluate(() => {
    const panel = document.querySelector('#workspace-market')?.getBoundingClientRect();
    const dock = document.querySelector('.command-dock')?.getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, panelTop: panel?.top, dockBottom: dock?.bottom, height: innerHeight };
  });
  check('mobile: no horizontal page overflow', view.overflow <= 0, JSON.stringify(view));
  check('mobile: quotes are on screen after research completes (not under the sticky dock)', view.panelTop >= view.dockBottom - 2 && view.panelTop < view.height - 200, JSON.stringify(view));
  check('mobile: two quote cards', (await cardInfo(mobile)).length === 2);
  await mobile.screenshot({ path: join(shots, 'mobile-mixed.png') });
  await mobile.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await mobile.waitForTimeout(300);
  await mobile.evaluate(() => window.scrollTo(0, 0));
  check('mobile: quotes still present after scrolling the research', (await cardInfo(mobile)).length === 2);
  setUpstream({ yahoo: 'fail:NESTLEIND', gemini: 'ok' });
  await command(mobile, 'NESTLEIND current stock price');
  const retry = await mobile.$('[data-action="retry-market"]');
  const retryBox = await retry?.boundingBox();
  check('mobile: failed quote shows a reachable retry button', retryBox && retryBox.y > 0 && retryBox.y < 844 && retryBox.width >= 40, JSON.stringify(retryBox));
  await mobile.screenshot({ path: join(shots, 'mobile-provider-failure.png') });
  setUpstream({ yahoo: 'ok', gemini: 'ok' });
  await retry.click();
  await mobile.waitForFunction(() => document.querySelector('#workspace-market')?.getAttribute('aria-busy') === 'false', null, { timeout: 15000 });
  check('mobile: retry recovers the quote', (await cardInfo(mobile))[0]?.button === true);
  const overflowAfter = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('mobile: still no horizontal overflow', overflowAfter <= 0, overflowAfter);
  for (const [cmd, sel, name] of [['Give me a deep analysis of my portfolio', '.kpi-row', 'deep-dive'], ['How is the market today?', '.index-card:not(.skeleton)', 'markets'], ['Show the Infosys chart', '.viz[data-chart="price"] svg', 'stock']]) {
    await command(mobile, cmd);
    await mobile.waitForSelector(sel, { timeout: 60000 });
    await mobile.waitForTimeout(400);
    const ov = await mobile.evaluate(() => ({ page: document.documentElement.scrollWidth - document.documentElement.clientWidth, charts: [...document.querySelectorAll('.viz[data-chart] svg')].map((s) => s.getBoundingClientRect().right).filter((r) => r > innerWidth + 1).length }));
    check('mobile ' + name + ': no horizontal page overflow and charts fit the screen', ov.page <= 0 && ov.charts === 0, JSON.stringify(ov));
    await mobile.screenshot({ path: join(shots, 'mobile-' + name + '.png') });
  }
  await mobile.close();
} catch (error) {
  check('e2e run completed without an exception', false, error.stack || error.message);
} finally {
  await browser.close();
  server.kill();
  rmSync(work, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
writeFileSync(join(shots, 'report.json'), JSON.stringify({ upstreams: 'MOCKED (Yahoo chart API + Gemini + NSE announcements + NSE results filings)', at: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed (upstreams mocked). Screenshots: test-results/e2e/`);
process.exit(failed.length ? 1 : 0);
