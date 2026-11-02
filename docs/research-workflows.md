# Commitments and cash quality module contracts

## Commitments

`buildCommitments({corpus,ticker,env,signal,now})` retrieves up to three passages per indexed issuer document, extracts explicit numeric management guidance and reported results, validates exact quotations and numbers, then reconciles matching metric, fiscal period, accounting basis and unit. Model-free and provider-failure cases return original evidence without fabricated structured rows.

Records preserve source dates, quote, evidence ID, page, original URL/title, management speaker, metric, target period, unit, basis and low/high or achieved value. Reconciliation retains dated revisions, ignores guidance issued after an actual result when grading it, and exposes `within`, `below`, `above`, `not_yet_due`, `outcome_missing`, `not_comparable` or `no_commitment`. “Above” is simply an arithmetic relation, not an investment recommendation or management quality score. Fiscal periods and accounting bases cannot be silently mixed. Analyst questions and forward guidance reused as achieved outcomes are rejected by conservative guards.

## Cash quality

`buildCashQuality({corpus,ticker,env,signal,sector})` retrieves annual cash-flow/profit/capital-allocation passages and extracts source-quoted amounts for PAT, CFO, capex, working capital, cash, debt, dividends and buybacks. Exact fiscal period, currency scale and reporting scope remain attached. Conflicting extractions of the same field are withheld rather than silently selected. Banks, insurers and recognized NBFCs return `not_applicable` instead of an industrial-company cash-conversion template.

Rows group only identical annual year/scope/unit. `freeCashFlow = CFO - abs(capex outflow)` and `cashConversion = CFO / PAT` are deterministic, with conversion withheld for non-positive PAT. Missing inputs stay null. A capex amount must be explicitly disclosed; the model is forbidden to invent a total by adding unrelated purchases.

## Evidence and limits

All evidence is issuer-scoped and each retained row includes its exact physical source page. These guards establish quote/value provenance and arithmetic consistency, not full semantic entailment or audited extraction accuracy. Fiscal column mapping, whether management is speaking, and what a particular reported amount represents still require source review. Memory caches are bounded to 24 extractions for ten minutes, keyed by extraction version, provider/model, source content and material source metadata. They are isolate-local caches, not durable storage.

## Verification

`node --test tests/research-workflows.test.mjs` passes eight cases: quote/number/period and analyst guards; dated revisions and basis/period mismatches; future outlook vs delivery; correct FCF/conversion; conflicting scope/scale/values and zero PAT; genuine INFY/HCLTECH/LT keyless evidence; source-content cache invalidation; and model cash extraction with code calculations. Real hosted Gemini extraction is verified during the parent integration; test fixtures are not presented as actual company cash amounts.
