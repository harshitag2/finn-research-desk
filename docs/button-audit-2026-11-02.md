# Button and control audit — 2 November 2026

173 browser checks passed across desktop (1360×1000), phone (390×844), and small phone (320×740). Eight initial harness attempts used ambiguous/outdated selectors, wrong expected copy, or premature assertions; corrected checks passed. No unresolved product failure remains within the tested paths. Repeated company rows share handlers and were sampled across issuers.

Coverage includes all 11 primary navigation destinations; four mobile tabs and seven More destinations; settings save; quote refresh/pause/resume/details; four guidance source buttons; filing windows and routine filter; CSV validation/import/account/search; research launch, manual form, comparisons, citations, save/reopen/export and cancellation; terminal source/search/sort/add/select/remove/refresh/log actions; thesis templates/save/source review/history; cash/commitments/source disclosures; inbox sync/scan/Watch/Dismiss/Restore/pause/enable; source discovery/indexing; PDF rejection/upload/persistence/page inspection/text and JSON exports/removal; screener natural/manual filters, universe extension and every sort/period; stock and analysis chart periods, holdings sorting, analysis save/export/rerun.

The isolated preview used a separate browser origin, ephemeral monitoring database, synthetic Yahoo/Gemini/NSE responses, and the real public HCLTech PDF fixture. No live user portfolio, thesis, preference, or monitor state was changed by these mutation tests.

## Fixed issue

The portfolio Market view could expose a JavaScript TypeError when an upstream daily response omitted indicator, close, or volume arrays. The endpoint now rejects incomplete data with an actionable provider message. It does not invent prices or volumes. The exchange-filings fallback works after a failed quote request. Two regression tests cover missing-array cases and a complete zero-volume response. The full automated suite passes 187 tests.

## Limits

This audit checks application controls, not independent financial accuracy or provider uptime. Repeated row actions were sampled; every external source PDF was not downloaded. Conditional failure and recovery states were simulated. Native email/push delivery and licensed exchange streaming are not configured. The historical standalone Playwright E2E script was not executed; browser testing used the connected browser tools.

The full JSON report retains every passed check, the eight corrected harness attempts, and the rendered-control inventory.
