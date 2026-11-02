# Submission covering-note draft

This draft is a preparation artifact. It has not been emailed, and no evaluator audience has been changed by preparing it. Replace the final links after the release passes its own live checks.

**Subject:** ENAM - IIT screening - 2027

Hello ENAM team,

I built FINN as a research workspace around one question: **what changed, which investment assumption does it affect, and what evidence should I inspect next?** It combines a portfolio filing digest with on-demand research grounded in company annual reports and earnings-call transcripts. A single prompt can route research, comparisons, results and market-data requests and apply supported workspace preferences.

The core choices are deliberate:

- **Primary sources before synthesis.** Retrieval is scoped to the issuer and requested disclosure period. Missing periods are explicit rather than silently substituted with older calls. Each generated finding must cite a supplied passage. Prices have a separate data path and never come from financial-document retrieval.
- **Management statements over generic summaries.** The original source-checked Infosys FY26 guidance timeline demonstrates original and revised commitments against delivery. The follow-on work generalizes this into explicit, source-linked commitment records with period and accounting-basis checks. Qualitative commentary is not converted into invented numerical guidance.
- **A concise default, with depth on request.** The workspace prioritizes relevant filings and provides an evidence drill-down; detailed comparisons retrieve across financial topics and check for underdeveloped answers. A large answer is useful only when requested and supported.
- **Bounded, inspectable automation.** Deterministic routing, calculations and validation run in code. Models interpret supplied evidence within a bounded tool loop. The command bar invokes a validated set of application controls and cannot execute arbitrary code. Public quotes are labelled with provider timestamps and session/delay information.
- **Measured limitations.** The repository includes an authored regression set that separates retrieval and period gates from optional live synthesis. Citation validity is not represented as proof of financial correctness. The initial offline evaluation found a genuine guidance-retrieval miss; it is documented rather than hidden.

I chose this direction because the brief emphasizes filtering and promises versus delivery. ENAM Holdings’ public material on management capital allocation, governance and questioning hypotheses informed the thesis-review workflow; I do not claim access to or a copy of ENAM’s internal systems.

The prototype intentionally does not place trades, predict stock prices, assign opaque management scores or claim licensed real-time exchange streaming. Primary-document availability, provider blocking, unsupported financial statement formats and model availability can limit coverage. Browser-local data and any server-persisted monitoring configuration must be described according to the final release's actual state, rather than presented as universal account synchronization.

Next I would broaden independently reviewed issuer coverage, improve source discovery and financial-statement extraction, and evaluate retrieval and claim support on held-out cases before expanding model or infrastructure complexity.

**Prototype:** https://finn-research-desk.ayush2111319.chatgpt.site

**Repository:** add the verified reviewer-accessible repository URL.

**AI build history:** `docs/build-history-visible.md` contains the available recorded user/assistant-visible session, with credentials and hidden/internal material removed. It is not a reconstruction of separate Claude conversations. The decision record below complements that export.

Thank you for reviewing the submission.

## Release checklist before sending

1. Confirm the reviewer can open the deployed site on a phone. It is currently owner-private; invitation depends on the reviewer email/account. Do not assume a private deployment link is evaluator-accessible.
2. Verify the repository URL, permissions, clean checkout setup and documented environment variables. GitHub CLI authentication was not usable during this preparation; do not claim a repository was published until an authenticated push and readback succeed.
3. Export the actual AI build conversations through a supported user/export path. A filtered export of the available local session is included as docs/build-history-visible.md. Obtain separate Claude conversation history if you intend to include it; do not manufacture missing conversations.
4. Run the demo once on the final production revision, not only the local build. Include the fresh evaluation JSON and distinguish offline checks from model-backed answers.
5. Confirm scheduled monitoring is enabled and that a closed-browser scan persisted a result; otherwise describe the monitoring setup as incomplete. Do not call an on-open refresh background push.
6. Retain current known limitations and measured results in the note. Replace the follow-on feature descriptions if final verification shows a different delivered scope.

## Build decision record (summary, not raw AI history)

- Kept price queries separate from company-document research after the app incorrectly tried to answer stock-price questions from PDFs.
- Integrated the provided Claude handoff and retained its source checks, while validating the imported app and correcting numerical provenance checks.
- Added disclosure-period gating after identifying the risk of answering an unindexed recent quarter from old evidence.
- Reworked announcements into a compact filing table and preserved the Tickertape-inspired Inter/white/blue presentation.
- Expanded detailed retrieval and output validation after a detailed comparison returned only two facts.
- Made supported prompt controls apply actual saved preferences, display settings and terminal/chart controls.
- Added a regression evaluation with a real failed retrieval case and explicit semantic-review limits rather than treating unit-test or citation-ID success as research accuracy.

Dates, exact source changes and additional feature verification should be taken from the repository history and release records. This record does not reconstruct missing private conversations.
