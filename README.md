# FINN — The research desk

Current integrated version: **0.11.1**. Detailed research now retrieves by topic and issuer, produces sectioned cited reports, and requests one revision when the first draft is too shallow. The command bar applies validated preferences, display options, terminal controls, chart periods and screener resets. 151 automated tests pass. See [the agent controls and research update](docs/agent-controls.md).

An investment workspace controlled from one natural-language command bar. A graphite navigation rail, source-backed guidance visualization, market tape, comparison canvas and page-level evidence inspector support the research workflow.

The public-company research in [docs/enam-research.md](docs/enam-research.md) informed two additions: a falsifiable company thesis file and a small multi-account holdings snapshot workflow. These are product interpretations of public information, not claimed copies of ENAM's internal systems. MProfit is an adjacent ENAM-backed investment, not an integration partner of this prototype.

## Run locally

Requires Node.js 22.10+ (tested with Node 24) and npm.

```powershell
npm ci
npm run dev
```

Open the printed local address, usually `http://127.0.0.1:4173`. The local server binds to loopback. Restart `npm run dev` after editing source files; the small development adapter bundles at startup.

No model key is required to browse the briefing, inspect the guidance example, import a PDF, retrieve evidence, save notes, or export research.

## Connect a model

Copy `.env.example` to `.env` for local development. Use production runtime secrets for hosted deployment; never commit keys. Supported adapters:

| Provider value | Configuration |
| --- | --- |
| `compatible` | `FINN_MODEL`, `FINN_API_KEY`, full `FINN_API_URL` ending in your provider's chat-completions endpoint |
| `gemini` (default) | `GEMINI_API_KEY` (also accepts `GOOGLE_API_KEY` or `FINN_API_KEY`), optional `FINN_MODEL`; default `gemini-3.1-flash-lite`, using the official `generateContent` REST endpoint |
| `ollama` | `FINN_MODEL`, `FINN_API_URL` such as `http://127.0.0.1:11434/api/chat`; local development only |

Select a model that can return valid JSON. The agent uses a provider-neutral JSON action protocol rather than provider-specific function-calling schemas. Production Workers cannot reach a laptop's localhost Ollama instance.

Without a configured model, the app explicitly displays **Evidence mode**. It returns original passages and citations, not a simulated model answer. The deployed app now has a server-side Gemini secret and uses `gemini-3.1-flash-lite`. On October 31, a live grounded research request returned Infosys FY27 operating-margin guidance with a valid transcript-page citation. The key was authenticated against Google's model catalogue. Gemini 3.8 Flash was overloaded during testing and Gemini 2.5 Flash rejected new-user access; the working Flash-Lite model was selected after actual generation checks. Provider quota, availability and output quality still depend on the account and source coverage.

## Command workspace

The persistent command bar accepts research, comparisons, quotes, navigation, source discovery, PDF/CSV import flows, thesis files, save/export and price refresh controls. Ctrl/Command K focuses it. Examples:

- `What changed in my portfolio today?` · `Any management changes this month?`
- `Infosys Q2 FY27 results` · `How were TCS results?` · `Show HDFC Bank quarterly results`
- `Compare Infosys and TCS on FY27 growth guidance and show their prices`
- `What did HDFC Bank management say about loan growth through FY26?`
- `Show prices for Reliance and HDFC Bank`
- `Find disclosures for ICICI Bank`
- `Open my portfolio`
- `Save this research note`

### Portfolio deep dive, markets, screener and stock pages (0.5.0)

One request — `Give me a deep analysis of my portfolio`, `How risky is my portfolio compared with the Nifty?`, `Which holdings drive my portfolio risk?` — runs a bounded agent (`src/deep-dive.js`) over your imported holdings (weights from market values) or the illustrative watchlist (equal weights):

1. **fetch_histories** — one year of daily prices for every holding, the Nifty 50 and the sector indices you hold (Yahoo Finance, dividend-adjusted closes; 18 NSE/BSE index series verified live).
2. **compute_risk_return** — back-test of today's weights (not your realised return): period returns vs Nifty 50, annualised volatility, beta, correlation, max and current drawdown, effective number of holdings, pairwise correlation matrix and each holding's share of portfolio risk.
3. **scan_alerts** — every holding's last *completed* session against your ±price % and volume × thresholds.
4. **compare_sectors** — each holding's 1Y return against its closest sector index.
5. **derive_insights** — rule-based observations, each tied to the computed metrics it states.
6. **read_disclosures** — cited passages from indexed annual reports/transcripts for the flagged holdings.
7. **model synthesis** (Gemini, optional, ≤ 4 steps, may request two more document searches) → **check_numbers** — every finding must cite metric keys or passages, and any number not among its cited metrics or passages is rejected (the rejection is shown in the agent trail).

The page shows KPI tiles, growth of ₹100 vs Nifty 50 and drawdown (crosshair tooltips, 1M/3M/6M/1Y), risk share vs weight, return vs volatility scatter, sector exposure, contribution to return, a correlation heatmap, alerts, sector indices, a sortable holdings table with 52-week range bars, cited management commentary, the method and the agent trail; save/export as Markdown. **Markets** shows six headline indices, a sector heat grid by period, breadth, gainers/losers, volume spikes and names near 52-week highs within your universe. The **screener** filters that universe (plus symbols you add) on price-derived metrics from natural language (`above their 200-day average with 1 year return above 10%`, `oversold`, `near 52-week highs`) or a filter builder. **Stock pages** (`Show the Infosys chart`) show price with 50/200-day averages, volume, performance vs Nifty 50 and the sector index, drawdown, RSI, key numbers, dividends and peers.

Deliberately not included: valuation ratios and financial statements (need a licensed fundamentals feed — figures are never estimated), analyst forecasts and price targets (secondary data, excluded by the brief's primary-source rule), news, mutual funds, shareholding patterns, proprietary sentiment indices, broker sync and background push notifications. Chart colours were validated for colour-vision deficiency and contrast; every chart has hover/keyboard tooltips and its numbers are also in a table or caption.

### Push digest: what changed and why you should care (0.6.0)

The Overview opens with a **What changed** panel for your imported holdings (or the illustrative watchlist), over the last 24 hours by default (3 days, 7 days or 30 days on request). `GET /api/digest` (`src/digest.js`) does two things:

1. **Exchange filings.** One date-bounded request per company to NSE's corporate-announcements feed (four at a time, 10-minute cache). Each filing is classified into the reference document's categories — results, M&A, fund raise, management change, litigation/regulatory, insider trading, earnings call, investor meetings, credit rating, dividend, bonus/split, capex, press release, postal ballot, AGM/EGM, pledging — from NSE's own category label and its one-line summary. Rules are deterministic and were tuned on 255 live filings for the 18 watchlist names; no model is involved. Duplicate standalone/consolidated filings are grouped, board-meeting notices are marked *upcoming* rather than treated as results, and routine paperwork (newspaper copies, ESOP allotments, trading-window notices, depository certificates) is collapsed. Filings in the categories you tick under **What I care about** are raised to *Needs your attention*.
2. **Threshold alerts.** Every completed session in the window is checked against your ±price % and volume × thresholds, using the same daily histories as the deep dive.

Each item links to the exchange PDF, opens the company's research desk, and (for results) its price chart. Filings newer than the last time you marked the digest read are flagged **NEW**. Commands route here too: `What changed in my portfolio today?`, `Any management changes this month?`, `Any filings from Infosys and TCS in the last 3 days?` (scoped to those companies), `Any new orders for L&T this week?`. If NSE does not answer the server, the panel says so, links to NSE and still shows price alerts. Not included yet: the results first cut (Revenue/EBITDA/PBT/PAT QoQ/YoY from the filing), background-of-the-incoming-person for management changes, BSE as a second source, and background monitoring or OS push — FINN evaluates the digest when you open it.

### Results first cut (0.7.0)

`Infosys Q2 FY27 results`, `How were TCS results?`, the **Results first cut** button on a results filing in the digest, or any stock page opens a first cut of the latest (or named) quarter. `GET /api/results?ticker=&quarter=&basis=` (`src/results.js`):

1. Reads NSE's **Integrated Filing – Financials** list for the company: one machine-readable XBRL instance per quarter and basis, filed by the company itself under SEBI LODR Regulation 33.
2. Picks the latest filing (revisions replace originals) on one basis — consolidated where filed, standalone on request — for the quarter, the previous quarter and the same quarter a year earlier. Each instance carries only its own quarter and year to date, so three filings are read.
3. Parses each instance with a small dependency-free XBRL reader, keeps only entity-wide figures for the three months ending on the quarter date (year-to-date and segment contexts are ignored) and validates the basis, period end, currency and symbol stated in the filing.
4. Reports **revenue, EBITDA, EBITDA margin, PBT and PAT** with QoQ and YoY computed in code (margins in percentage points), plus supporting lines (PAT to owners, EPS, other income, finance costs, D&A, exceptional items, tax). EBITDA is not a reported line in Indian results, so it is derived — PBT before exceptional items + finance costs + D&A − other income — and labelled *computed*. Banks file a different format: total income, net interest income (derived), pre-provision operating profit (reported), PBT and PAT.
5. Checks the filing's own arithmetic (total income, PBT, PAT from continuing operations) and shows any line that does not reconcile.

Every period links to its XBRL filing (and the human-readable iXBRL page where NSE provides one); the table exports as Markdown. A missing or unreadable comparison filing is stated and that comparison is left blank; an unreachable NSE or unreadable current filing shows no figures at all. Run live on 1 Nov 2026 against the real filings for Infosys, HDFC Bank, Tata Steel, L&T and Reliance: all three arithmetic checks reconciled for each.

### Stock prices and documents are separate evidence

A request can mix research and prices, e.g. `Compare Infosys and TCS on FY27 growth guidance and show their stock prices`. One shared classifier (`src/intent.js`, used by the server planner, the research orchestrator and — serialized into `/app.js` — the browser) splits it:

- **Price clauses** (`stock/share price`, `quote`, `LTP`, `CMP`, `how is X trading`) go only to the market-data provider (`/api/quotes`, Yahoo Finance). Quotes are never read from, or expected in, company documents.
- **The remaining question** goes to the document pipeline. The original wording is kept for the UI and export; the research note shows exactly what the documents were asked. When prices were requested, the model is also told that prices are handled elsewhere, so it cannot report their absence as a document gap.
- **Business pricing topics stay research**: pricing power, price increases, input/commodity/steel/crude prices, price targets and P/E are not quote requests.
- **Price-only requests** (`TCS current stock price`, `Compare Infosys and TCS stock prices`, `PIDILITIND current stock price`) skip documents, the coverage gate and the model entirely.
- **Follow-ups** such as `show their prices` or `what is their FY27 guidance?` keep the companies already on the desk. An unrecognised company name in a price request asks for its NSE symbol (or is resolved by Gemini routing when configured) instead of quoting the current company.

Both the command bar and the company research form (and research prompts/briefs) use one browser pipeline. It requests quotes and document research independently, keyed to the investigation so late responses cannot overwrite newer work. The market panel has its own loading, partial, failure and **quote-only retry** states, shows the provider's exchange timestamp, currency, session (derived from the provider's trading-period window), the provider's delay flag (or "Delay not stated" when Yahoo omits it — it currently does), and cached/stale labels. A failed refresh never presents an earlier price as fresh. Missing documents show the source-coverage path beside a successful quote; a provider failure is reported as a market-data failure, never as missing documents. Saved notes and Markdown exports keep the dated quote snapshot; reopened snapshots are labelled "not live" until refreshed.

Familiar commands and company aliases resolve deterministically; unfamiliar research phrasing can use Gemini intent routing. The server validates actions, ticker syntax, scope size and view names. Plans cannot execute code or arbitrary URLs. Follow-up research uses the current company. This is a bounded workspace agent, not arbitrary control over every UI setting. Recent commands stay on this device and can be rerun.

The coverage gate skips the model when no documents exist. Comparison requires sources for every selected issuer and initially retrieves three passages per issuer. Coverage means documents exist, not that every requested period or metric is supported. Missing-source cards retain the question and offer discovery, PDF import and indexed alternatives. Discovery finds links; it does not automatically ingest or monitor those sites.

## Research architecture

```text
Official PDFs / user PDF import
        ↓
Page-preserving text extraction → overlapping chunks → issuer + period metadata
        ↓
BM25 retrieval with finance-query expansions and explicit call-date scoping
        ↓
Bounded research agent (up to five model decisions)
        ├─ search_documents: issuer / document type / reporting period filters
        ├─ read_passage: inspect a cited source page
        ├─ calculate_change: arithmetic executed in code
        └─ compare_guidance: reject mismatched periods and accounting bases
        ↓
Validate cited chunk IDs → findings + evidence + tool trail + gaps
```

This is retrieval-augmented generation when a model is connected. BM25 is the retrieval baseline; a vector database is not needed for this corpus. Semantic embeddings, reranking and persistent server-side document storage are future improvements, not features being silently claimed.

The server runs as an ES-module Worker. A small Node HTTP adapter serves the same Worker locally. The frontend uses native browser modules and CSS, with no frontend framework dependency. `unpdf` handles user PDF imports; the reproducible seed ingestion script uses Python `pypdf`.

### Grounding rules

- Pull research uses company annual reports and earnings-call transcripts, not news or broker commentary.
- Search is restricted to the selected issuer, or the explicitly selected two or three issuers in a comparison. Uploaded chunks inherit their document's issuer server-side, regardless of client chunk metadata.
- A finding must cite retrieved chunk IDs; uncited findings and invented citation IDs are discarded.
- Citation validation proves provenance, not semantic entailment. The original passage is always available for review.
- Guidance and delivery must match fiscal period and accounting basis before the comparison tool issues a status.
- Analyst questions and qualitative commentary are not numerical management guidance.
- Provider failure or an exhausted tool budget falls back to original evidence.
- Retrieved document text is treated as untrusted input in the agent's instructions. Prompt-injection resistance is not a formally verified guarantee.

## Source corpus

Twelve real documents, five issuers, 1,804 page-aware passages:

- Infosys: Q4 FY25, Q1–Q4 FY26 transcripts and the FY26 integrated annual report.
- TCS: Q4 FY26 transcript.
- HCLTech: Q4 FY26 transcript.
- Larsen & Toubro: Q2 FY26 transcript.
- HDFC Bank: Q2, Q3 and Q4 FY26 transcripts from its official investor-relations site. Q1 FY26 is not indexed; answers must disclose that limit when comparing the entire year.

`data/sources.json` records the official URLs. Where the company host was unavailable, an official NSE filing copy was used. Some NSE files contain both a press conference and an earnings call, plus cover letters. Page citations therefore use **physical pages in that exact PDF**, not the printed page number within a subdocument.

The Infosys guidance timeline in `data/guidance.json` is a deliberately source-checked structured example. It retains the dated revisions and compares FY26 constant-currency revenue growth with FY26 actual growth. It is not presented as a dynamically generated answer. Free-form questions, including those about a newly imported ticker, run through the general retrieval pipeline.

Rebuild the corpus (requires Python with `pypdf`):

```powershell
python scripts/ingest_sources.py
python scripts/ingest_sources.py --offline
```

Run `python scripts/ingest_sources.py --help` for supported refresh options. Raw PDFs are cached under `data/raw/` and excluded from Git; extracted passages retain source attribution. The ingestion report includes failures; each corpus document includes its PDF checksum.

## Product workflows

1. **Briefing:** a historical replay of real disclosures, with source-checked editorial headlines, company/date/period and original-source links. The April 2026 window is explicit. Last 24 hours can correctly show an empty state.
2. **Research:** any NSE ticker, a research question, relevant passages, optional model-led tool execution, citations, known gaps, saved notes and Markdown export.
3. **Portfolio:** latest provider prices and day changes for every watchlist/imported NSE ticker. The market tape refreshes every 60 seconds while the portfolio page is visible, pauses when hidden or in another app view, and supports manual refresh/pause. Per-price details show the exchange timestamp, session, previous close, volume and recent intraday chart. Yahoo quotes may be delayed: this is not a licensed tick-by-tick exchange feed. Quote timestamps remain unchanged when a cached value is shown. Separate Market requests fetch completed daily close/volume; EOD alert thresholds use completed sessions and exclude the tested session from the volume baseline.
4. **Exchange filings:** the Overview digest (above) and a company's filing list both use date-bounded NSE announcement requests with deterministic classification. Access failures are shown honestly; no exchange restrictions are bypassed and nothing is invented to fill a gap.
5. **Discover / import:** links to reports and transcripts discovered from the selected company's Screener page. Download an original and import its PDF to make its contents searchable. Link discovery is separate from successful ingestion.
6. **Library:** seed documents plus device-local uploads. Original sources open at their cited physical page. Uploads are labelled as having unverified provenance.
7. **Thesis file:** save a company belief, a disconfirming condition, one of five diligence lenses and a next-review date. Testing the thesis searches both routes and records a dated snapshot of that exact thesis version, citations and tool trail. Keyless search groups are not support/refutation labels; optional model stance labels require valid evidence citations. Up to eight reviews per file remain on this device. Dates do not schedule background activity.
8. **Portfolio snapshot:** import a generic INR CSV with `ticker,market_value` and optional `name,sector,account,currency`. Values remain browser-local. Duplicate account/ticker rows, conflicting sectors, unsupported currencies and malformed values are rejected. Positions across accounts consolidate into company weights and sector exposure. This is not an MProfit API, proprietary-export parser, live revaluation, tax engine or XIRR calculation.

## Persistence and data handling

- Uploaded document text is stored in **IndexedDB on this device**, not a durable cloud database.
- The PDF is sent to the app server for parsing. Its bytes are not intentionally stored server-side.
- Research requests send the selected issuer's uploaded text to the app server. When synthesis is enabled, the model provider receives retrieved passages and questions.
- Saved notes, alert thresholds, digest categories and the digest's last-read time use localStorage. They do not synchronize across devices.
- Thesis files, their bounded review histories and imported holdings snapshots also use localStorage. Holdings values are not included in research/model requests. A thesis and its disconfirming condition are sent for processing only when the user tests them.
- Server provider secrets are never sent to the browser.
- New Sites deployments are owner-private. A public evaluator link and a GitHub submission repository require separate sharing/publishing decisions.

## Validate and build

```powershell
npm run check
npm run build          # tests import dist/server/index.js — build first
npm test
node scripts/validate-artifact.mjs
npm run test:e2e       # optional: browser suite, needs Playwright + Chromium installed separately
npm run verify:market  # optional: LIVE Yahoo check; add a server URL to check a running FINN end to end
```

**Results first cut verification (0.7.0, 2026-11-01).** `npm test`: 127 pass (adds fiscal-quarter labels and prior periods, the NSE filing list, the XBRL reader, basis/period/currency/symbol validation, derived EBITDA and NII, a filing that does not reconcile, QoQ/YoY, named quarters and bases, partial and failed sources, the banking format, `/api/results`, results routing, and a fix so “How did growth compare with guidance?” is single-company research). `npm run test:e2e`: 111 / 111 with mocked NSE results filings. Live: `src/results.js` read the real NSE XBRL filings in a desktop browser for five companies (IT, bank, steel, engineering, conglomerate); every arithmetic check reconciled. The Worker itself did not reach NSE from a cloud host.

**Push digest verification (0.6.0, 2026-10-31).** `npm test`: 113 pass (adds the classifier on real NSE labels, generic-update and upcoming-meeting rules, summaries, IST timestamps, the date-bounded request, window alerts, grouping/focus/sorting, partial and unavailable feeds, `/api/digest` and `/api/announcements`, and digest command routing). `npm run test:e2e`: 98 / 98 browser checks with mocked Yahoo/Gemini/NSE, desktop and 390 px. Live: `src/digest.js` ran in a desktop browser against the real NSE feed for all 18 watchlist names — 24 h: 10 filings, 7 days: 83, 30 days: 255, no failures, about 3 s each. Whether NSE answers a cloud-hosted Worker was not verified; the panel reports that case honestly.

**Deep-dive verification (0.5.0, 2026-10-31).** `npm test`: 98 pass (adds analytics maths, history validation, deep-dive agent incl. number rejection and model failure, routing and screen parsing, and `/api/analyze`, `/api/markets`, `/api/universe`, `/api/stock`). `npm run test:e2e`: 77 / 77 browser checks with mocked Yahoo/Gemini, desktop and 390 px. Live: FINN's analytics module ran in a desktop browser against live Yahoo histories for a six-stock sample portfolio plus four indices; 52-week highs/lows matched Yahoo's own fields. The Worker itself was not run against live Yahoo, and live Gemini synthesis was not exercised.

**Stock-price fix verification (0.4.0, 2026-10-31).** 77 automated tests pass (47 earlier + 30 new: shared intent classifier, planner follow-ups, orchestrator, `/api/research` + `/api/compare` + `/api/command` endpoints, provider failure/retry, served browser bundle). The browser suite (`tests/e2e/price-flow.e2e.mjs`) runs the real Worker and client with **mocked** Yahoo/Gemini upstreams and passes 45/45 checks across desktop and a 390-pixel mobile viewport, including both entry points, follow-ups, uncovered companies, provider failure + retry, stale labelling, pricing-power negatives, save/export/reopen, and smoke checks of portfolio quotes, CSV import, PDF import and thesis review. Separately, Yahoo's live chart API was checked from a normal desktop network (all requested NSE symbols returned HTTP 200 in INR); captured live responses were replayed through the server and browser. A live Gemini call was **not** made in this session; see `handoff/VERIFICATION.md` in the handoff package.

Earlier tests cover command intent and aliases, compound comparisons and quotes, bounded plan validation, missing-source gating, balanced multi-company retrieval, issuer isolation, period/type filtering, a newly ingested ticker, missing evidence, zero-base arithmetic, mismatched guidance periods, citation rejection, model tool calls using a mock provider, tool budget, provider fallback, API routes and actual PDF parsing. The real-PDF integration test skips on a fresh checkout until raw PDFs have been downloaded. Mock-provider tests do not verify an actual provider's availability.

Initial verification: 19 automated checks passed, including cross-quarter retrieval coverage and a real HCLTech PDF import. Read-only live integration requests returned an Infosys EOD quote dated October 30, 2026, 24 discovered disclosure links and 40 NSE announcement rows. Desktop and 390-pixel mobile browser previews were inspected; the mobile page had no horizontal overflow. The owner-private hosted deployment requires ChatGPT sign-in; local browser QA used the same Worker code through the local adapter.

ENAM-informed additions extend verification to 30 checks, including two-route thesis retrieval, cited stance validation, a mocked model review, multi-account consolidation, decimal precision, duplicate detection, malformed CSV/currency rejection and undefined zero-value weights.

The market/Gemini update extends automated coverage to 47 checks. Tests cover quote issuer/currency validation, exact exchange timestamps, open/closed sessions, missing comparison bases, partial batch failures, cache freshness, marked stale fallback, bounded upstream batches, Gemini key aliases, header-only credentials, quota failures, a bounded transient-error retry and cited model output. A live batch returned valid quotes for all 18 portfolio stocks. A real Gemini research request completed with validated citations; live provider checks are separate from the repeatable mock-based tests. Browser QA verified all 18 prices, pause/manual refresh and quote provenance, plus the 390-pixel mobile layout without horizontal overflow.

Gemini actions use a constrained JSON response schema. If the initial retrieved passages answer a question, the agent is instructed to finish immediately instead of requesting redundant tool rounds. This reduced the live guidance check to one model call. A hosted check before this refinement exposed a later-step provider timeout; the app retained the retrieved evidence and displayed the timeout reason.

Gemini HTTP 503 responses get at most one retry, recorded in the tool trail and sharing the original 35-second model-request deadline. Longer Retry-After instructions and quota/authentication errors are surfaced without automatic repetition. Provider availability can still cause evidence-only fallback even with a valid key.

The additions were also exercised through the browser: save and test a thesis, edit it and retain its earlier review, import the illustrative three-row CSV, verify the consolidated INR 300,000 total and 66.7%/33.3% company/sector weights, and filter the second account to INR 80,000. Both new pages were checked at a 390-pixel viewport without horizontal overflow.

`npm run build` emits `dist/server/index.js` and `.openai/hosting.json` for the Sites Worker deployment. The hosting project identity remains in the tracked source manifest.

## Scope and deliberate tradeoffs

Implemented: mobile workspace; actual source ingestion; general issuer-scoped retrieval; source citations; bounded configurable agent; numerical tools; paper trail; device-local imports/bookmarks; historical briefing; on-demand market/filing integrations.

Also implemented: source-informed diligence lenses, versioned company thesis reviews, review-date cues, and a browser-local INR portfolio snapshot with account consolidation and exposure calculations. The example watchlist replaces ITC with Pidilite as a limited ENAM-oriented demo choice; it is not ENAM's actual portfolio or a full mandate-compliance screen.

Not implemented: scheduled ingestion, continuous monitoring, operating-system push notifications, management-background enrichment, results formats other than Ind AS and banking (NBFC, insurance), full portfolio fundamentals, all eight research sections, verified people-background enrichment, OCR, automatic PDF import from discovered URLs, or durable multi-user storage. Some source providers block automated requests; errors remain visible. The initial research corpus is historical and covers five issuers, not all 18 watchlist names. There are no buy/sell recommendations or trade execution.

## Suggested demo

1. Type `Infosys Q2 FY27 results`: revenue, EBITDA, margin, PBT and PAT for three quarters with QoQ/YoY computed, EBITDA labelled as computed, three XBRL sources and the filing's own arithmetic checked. Switch to Standalone or an earlier quarter, then try `Show HDFC Bank quarterly results`.
2. Open the Overview: the **What changed** digest. Switch to 7 days, filter to Results, tick a category under *What I care about*, then type `Any management changes this month?`.
3. Run `Give me a deep analysis of my portfolio`; open the agent trail, hover the charts, tap a holding for its stock page, then try `How is the market today?` and `Which stocks are above their 200-day average with 1 year return above 10%?`.
4. Open the briefing and explain the historical-replay label.
5. Open the source-checked Infosys guidance note and its five PDF passages.
6. Ask how revenue guidance changed through FY26; inspect citations and the research trail.
7. Try an unfamiliar ticker, discover documents, import a real transcript, and research it.
8. Run `Compare Infosys and TCS on FY27 growth guidance and show their stock prices`, then `show their prices` and `PIDILITIND current stock price`: quotes and cited research stay separate, and the price-only requests skip documents and the model.
9. Open a portfolio Market view, adjust price/volume thresholds, and show source freshness or a clear provider error.
10. Save/export a research note and test the mobile layout.

## Assignment handoff

Before submission: confirm the evaluator can access the deployment; push source to the chosen GitHub repository; retain coding-agent conversation exports; write the covering note describing this final scope honestly. Gemini is configured and has passed a real cited-answer check. The assessment email is not sent by this app or build workflow.

### Implementation references

- [unpdf: serverless PDF extraction](https://github.com/unjs/unpdf)
- [Gemini generateContent REST reference](https://ai.google.dev/api/generate-content)
- [Gemini thinking configuration](https://ai.google.dev/gemini-api/docs/generate-content/thinking)

