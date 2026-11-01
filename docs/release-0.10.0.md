# FINN 0.10.0 — research, quotes and workspace refinement

## Research

Explicit earnings-call dates/quarters and “latest transcript” now create a document boundary before retrieval and model tools run. A requested call absent from the index returns a period-coverage message and skips synthesis, including comparisons where just one issuer is missing that call. Earlier periods are not silently substituted. Annual guidance timelines retain earlier disclosures because a guidance target year is not the same as the disclosure's reporting period.

Results expose indexed date ranges, selected periods and selected source dates. The model receives the same coverage limits. Retrieval, further searches, read-passage tools and initial evidence all stay inside the selected documents. This improves period selection; it does not establish semantic correctness of every model interpretation or add documents to the five-issuer index.

## Market data

Overview now polls while visible, with pause/resume, manual refresh and a last-check timestamp. Overview, research and portfolio provider quotes use a shared 15-second cache. Provider timestamp regressions retain the newer quote, explicitly marked cached. Quote status separates closed market, delayed open-session ticks, failed refresh and unknown session state. A recent provider timestamp is not a licensed exchange real-time guarantee. Public NSE quote access can still return 403; the terminal labels its Yahoo fallback.

The terminal can remove custom symbols, shows quote health in the security inspector and updates its symbol count after additions/removals. Actual price differences remain the only trigger for change highlights. Data/state transitions are tested with fixtures; real provider checks before the market opened on 2 November returned closed-session quotes from 30 October.

## UI

Portfolio/stock metrics use compact divided strips; computed analysis observations and source passages use flat rows. Research results show document coverage near the answer, and missing-period messages distinguish a missing disclosure from having no company documents. Text labels, chart/table spacing and mobile layouts follow the existing Inter/blue/white design system. Imports, existing saved data, citations and analysis calculations are retained.

## Verification

142 automated tests cover the original flows plus source boundaries, missing-quarter comparisons, quote-cache expiry, quote health and older-timestamp rejection. Syntax, build and ESM artifact checks are required before publication. Browser verification covers Overview polling controls, latest-call evidence, missing-quarter state, custom terminal symbol add/remove, analysis charts and mobile layout. `scripts/verify-hosted.mjs` mode `release` checks hosted Gemini citations, the latest-call boundary, the no-model missing-period gate and quote metadata without exposing credentials. Local development has no Gemini key; server-side synthesis is verified after deployment.
