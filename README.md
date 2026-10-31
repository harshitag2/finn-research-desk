# FINN — The research desk

A mobile-first investor workspace built around a briefing, a research notebook, and the original evidence. Warm paper, restrained green, editorial typography, financial tables and compact source cards establish a coherent visual direction.

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

## Research architecture

```text
Official PDFs / user PDF import
        ↓
Page-preserving text extraction → overlapping chunks → issuer + period metadata
        ↓
BM25 retrieval with small finance-query expansions
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
- Search is restricted to the selected issuer. Uploaded chunks inherit their document's issuer server-side, regardless of client chunk metadata.
- A finding must cite retrieved chunk IDs; uncited findings and invented citation IDs are discarded.
- Citation validation proves provenance, not semantic entailment. The original passage is always available for review.
- Guidance and delivery must match fiscal period and accounting basis before the comparison tool issues a status.
- Analyst questions and qualitative commentary are not numerical management guidance.
- Provider failure or an exhausted tool budget falls back to original evidence.
- Retrieved document text is treated as untrusted input in the agent's instructions. Prompt-injection resistance is not a formally verified guarantee.

## Source corpus

Nine real documents, four issuers, 1,670 page-aware passages:

- Infosys: Q4 FY25, Q1–Q4 FY26 transcripts and the FY26 integrated annual report.
- TCS: Q4 FY26 transcript.
- HCLTech: Q4 FY26 transcript.
- Larsen & Toubro: Q2 FY26 transcript.

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
4. **Exchange filings:** attempts an on-demand NSE announcement request. Access failures are shown honestly; no exchange restrictions are bypassed and prices are not invented.
5. **Discover / import:** links to reports and transcripts discovered from the selected company's Screener page. Download an original and import its PDF to make its contents searchable. Link discovery is separate from successful ingestion.
6. **Library:** seed documents plus device-local uploads. Original sources open at their cited physical page. Uploads are labelled as having unverified provenance.
7. **Thesis file:** save a company belief, a disconfirming condition, one of five diligence lenses and a next-review date. Testing the thesis searches both routes and records a dated snapshot of that exact thesis version, citations and tool trail. Keyless search groups are not support/refutation labels; optional model stance labels require valid evidence citations. Up to eight reviews per file remain on this device. Dates do not schedule background activity.
8. **Portfolio snapshot:** import a generic INR CSV with `ticker,market_value` and optional `name,sector,account,currency`. Values remain browser-local. Duplicate account/ticker rows, conflicting sectors, unsupported currencies and malformed values are rejected. Positions across accounts consolidate into company weights and sector exposure. This is not an MProfit API, proprietary-export parser, live revaluation, tax engine or XIRR calculation.

## Persistence and data handling

- Uploaded document text is stored in **IndexedDB on this device**, not a durable cloud database.
- The PDF is sent to the app server for parsing. Its bytes are not intentionally stored server-side.
- Research requests send the selected issuer's uploaded text to the app server. When synthesis is enabled, the model provider receives retrieved passages and questions.
- Saved notes and alert thresholds use localStorage. They do not synchronize across devices.
- Thesis files, their bounded review histories and imported holdings snapshots also use localStorage. Holdings values are not included in research/model requests. A thesis and its disconfirming condition are sent for processing only when the user tests them.
- Server provider secrets are never sent to the browser.
- New Sites deployments are owner-private. A public evaluator link and a GitHub submission repository require separate sharing/publishing decisions.

## Validate and build

```powershell
npm run check
npm run build
npm test
node scripts/validate-artifact.mjs
```

Tests cover issuer isolation, period/type filtering, a newly ingested ticker, missing evidence, zero-base arithmetic, mismatched guidance periods, citation rejection, model tool calls using a mock provider, tool budget, provider fallback, API routes and actual PDF parsing. The real-PDF integration test skips on a fresh checkout until raw PDFs have been downloaded. Mock-provider tests do not verify an actual provider's availability.

Initial verification: 19 automated checks passed, including cross-quarter retrieval coverage and a real HCLTech PDF import. Read-only live integration requests returned an Infosys EOD quote dated October 30, 2026, 24 discovered disclosure links and 40 NSE announcement rows. Desktop and 390-pixel mobile browser previews were inspected; the mobile page had no horizontal overflow. The owner-private hosted deployment requires ChatGPT sign-in; local browser QA used the same Worker code through the local adapter.

ENAM-informed additions extend verification to 30 checks, including two-route thesis retrieval, cited stance validation, a mocked model review, multi-account consolidation, decimal precision, duplicate detection, malformed CSV/currency rejection and undefined zero-value weights.

The market/Gemini update extends automated coverage to 40 checks. Tests cover quote issuer/currency validation, exact exchange timestamps, open/closed sessions, missing comparison bases, partial batch failures, cache freshness, marked stale fallback, bounded upstream batches, Gemini key aliases, header-only credentials, quota failures and cited model output. A live batch returned valid quotes for all 18 portfolio stocks. A real Gemini research request completed with validated citations; live provider checks are separate from the repeatable mock-based tests. Browser QA verified all 18 prices, pause/manual refresh and quote provenance, plus the 390-pixel mobile layout without horizontal overflow.

The additions were also exercised through the browser: save and test a thesis, edit it and retain its earlier review, import the illustrative three-row CSV, verify the consolidated INR 300,000 total and 66.7%/33.3% company/sector weights, and filter the second account to INR 80,000. Both new pages were checked at a 390-pixel viewport without horizontal overflow.

`npm run build` emits `dist/server/index.js` and `.openai/hosting.json` for the Sites Worker deployment. The hosting project identity remains in the tracked source manifest.

## Scope and deliberate tradeoffs

Implemented: mobile workspace; actual source ingestion; general issuer-scoped retrieval; source citations; bounded configurable agent; numerical tools; paper trail; device-local imports/bookmarks; historical briefing; on-demand market/filing integrations.

Also implemented: source-informed diligence lenses, versioned company thesis reviews, review-date cues, and a browser-local INR portfolio snapshot with account consolidation and exposure calculations. The example watchlist replaces ITC with Pidilite as a limited ENAM-oriented demo choice; it is not ENAM's actual portfolio or a full mandate-compliance screen.

Not implemented: scheduled ingestion, continuous monitoring, operating-system push notifications, full portfolio fundamentals, all eight research sections, verified people-background enrichment, OCR, automatic PDF import from discovered URLs, or durable multi-user storage. Some source providers block automated requests; errors remain visible. The initial research corpus is historical and covers four issuers, not all 18 watchlist names. There are no buy/sell recommendations or trade execution.

## Suggested demo

1. Open the briefing and explain the historical-replay label.
2. Open the source-checked Infosys guidance note and its five PDF passages.
3. Ask how revenue guidance changed through FY26; inspect citations and the research trail.
4. Try an unfamiliar ticker, discover documents, import a real transcript, and research it.
5. Open a portfolio Market view, adjust price/volume thresholds, and show source freshness or a clear provider error.
6. Save/export a research note and test the mobile layout.

## Assignment handoff

Before submission: confirm the evaluator can access the deployment; push source to the chosen GitHub repository; retain coding-agent conversation exports; write the covering note describing this final scope honestly. Gemini is configured and has passed a real cited-answer check. The assessment email is not sent by this app or build workflow.

### Implementation references

- [unpdf: serverless PDF extraction](https://github.com/unjs/unpdf)
- [Gemini generateContent REST reference](https://ai.google.dev/api/generate-content)
- [Gemini thinking configuration](https://ai.google.dev/gemini-api/docs/generate-content/thinking)

