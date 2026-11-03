# Submission verification — 3 November 2026 (IST)

Public prototype: https://finn-research-desk.vercel.app

## What was checked

- Production home and library open without a password; Gemini is configured server-side.
- Visitor inboxes are isolated from the migrated owner/shared records, including when a caller spoofs an owner header. The scheduled scan endpoint rejects requests without its token.
- Vercel Node backend connects to Neon PostgreSQL. An authenticated no-op monitoring configuration write was read back from persistent storage.
- A real company PDF was extracted on the deployed backend: 24 pages, 46 passages.
- Quote endpoints returned provider data with source/session timestamps. This is not licensed real-time exchange streaming.
- Generated test speech was transcribed by the hosted Gemini audio endpoint into an equivalent company-price command. The user's physical microphone was not activated by this audit.
- Eleven mobile navigation paths opened their expected workspaces: Overview, Research, Portfolio, Markets, Terminal, Documents, Inbox, Management & cash, Analysis, Theses and Saved. Browser console errors: none observed during these navigation checks. This is a smoke audit, not a guarantee of every possible interaction.
- The hourly GitHub monitoring workflow completed successfully: https://github.com/harshitag2/finn-research-desk/actions/runs/41678405029. Scheduled jobs can be delayed by GitHub.
- The final automated suite contains 227 passing tests, including the provider-failure message regression.

## Research evaluation

The authored 26-case offline regression returned **25 pass, 0 fail, 1 not run**. All 15 source anchors resolved. The not-run case is adversarial synthesis, which an offline retriever cannot establish.

The six-case hosted synthesis run initially returned **4 pass, 2 fail**. Both failed cases returned evidence mode without generated findings. Repeating those two requests produced source-grounded answers: original Infosys FY26 guidance of 0–3% constant-currency growth, and a 1.3% sequential constant-currency revenue decline in Q4 FY26. The first failed report is retained; retries are not silently substituted for it. Provider/model availability remains a limit. A misleading fallback instruction to connect a model, even when a configured provider failed, was corrected to report unavailable synthesis while preserving original source passages.

These are seed-corpus regression and mechanical citation/format checks, not an independently measured financial-answer accuracy rate. Claims still need source review.

## Deliberate limits

- WhatsApp integration is prepared but not connected to a provider account; no delivery claim is made.
- Holdings, notes, theses and imported PDF text remain browser-local. Monitoring settings, inbox state and scan/delivery records are persisted in PostgreSQL.
- Manual PDFs are limited to 4 MB on Vercel. Source discovery can fetch supported original disclosures on the backend; scanned PDFs require OCR outside this prototype.
- Unsupported statement structures, absent issuer periods, source-host blocking and provider quotas can limit answers.
- The available sanitized conversation export is in `build-history-visible.md`. It ends on 2 November; the follow-up summary is not represented as a verbatim transcript of unavailable conversations. Separate raw Claude history is not reconstructed.

## Follow-up build decisions (summary, not raw conversation)

Public market requests were separated from document retrieval after a price question incorrectly used PDF evidence. Detailed research gained topic-based retrieval and an output-depth check. Mobile watchlist overflow was repaired. Voice input was changed from a separate settings form to one-tap inline dictation after user feedback. The runtime was ported from Cloudflare/D1 to Vercel/Neon with signed visitor identities, parameterized SQL, migrated alerts and a protected hourly scan. The public website opens without a password while preserving personal monitoring isolation.
