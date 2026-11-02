# FINN research evaluation

This is a small, reproducible **regression evaluation**, not a claim that FINN has a measured research accuracy rate. The 26 cases were authored after reviewing the bundled source passages, so they are seed-corpus-biased and not held out. Each question's source anchors, diagnostic expected facts and review rubric are inspectable in [evaluation-cases.json](../data/evaluation-cases.json).

## Run it

```powershell
node scripts/evaluate-research.mjs --output evaluation-offline.json
```

No model key or network connection is needed for the offline run. It evaluates retrieval of authored gold pages, issuer/disclosure-period scoping, missing-source refusal, the distinction between market prices and company documents, and deterministic financial calculations. It does not synthesize or judge financial answers. One explicitly adversarial prompt-injection case is reported as `not_run` offline because passage retrieval cannot demonstrate instruction resistance.

Optional end-to-end mode uses the normal model adapter, configured through environment variables or an ignored local `.env`:

```powershell
node --env-file-if-exists=.env scripts/evaluate-research.mjs --live --limit 6 --output evaluation-live.json
```

To test a hosted or local FINN endpoint, add `--origin https://your-finn-site.example`. Owner-private Sites require their service access token in `FINN_EVAL_SITE_TOKEN`; use the supported private-site verification path and never put the token in command arguments, source, a report or a schedule. Without `--origin`, live mode calls the same research functions locally. The default six-case live limit bounds provider use; `--limit 26` includes the adversarial and detailed-report cases. Cases run sequentially and record wall-clock latency. Provider token counts and monetary cost are not exposed by the current adapter; the evaluator does not invent them.

## What the live report measures

- A synthesized answer contains findings with existing citation IDs.
- Cited sources belong to the intended issuer and, for the call-specific gold cases, the selected disclosure.
- Expected source document/page pairs are actually cited, rather than merely retrieved.
- Diagnostic expected fact fragments occur in the answer; these are displayed separately and are **not** treated as proof of a correct claim.
- The detailed comparison covers both companies, enough sections, developed length and enough findings.
- The one synthetic injection attack's marker and fabricated 99% claim are absent.

Every synthesized response still has `manualReviewRequired: true`. A reviewer must judge each claim's speaker, subject, time period, consolidation/currency basis, direction of change, and whether the paragraph supports the conclusion. For example, an answer can contain “1.3%” while reversing a sequential decline into growth, or correctly cite an analyst asking about a peer while falsely treating it as company guidance. Mechanical checks cannot establish semantic entailment.

The live output includes an answer preview for review, never provider keys or raw provider error bodies. The `hasFindings` check will fail a provider fallback for a source-supported question; this distinguishes an unavailable synthesis service from a correct financial response.

## Recorded baseline: 2 November 2026

The first actual offline run returned **24 pass, 1 fail, 1 not run** across 26 cases. All **15 source anchors** resolved to the stated original chunk, document and physical page. Of 12 retrieval questions, 11 retrieved the authored gold page in the top six. The failure was `infy-original-fy26`: the Q4 FY25 call's original FY26 0–3% constant-currency guidance on physical page 4 was absent from the selected pages. This is a real retrieval miss, not a changed gold answer. The synthetic injection case was not run against a model in this baseline.

The query uses “guide”, whereas the existing synonym expansion covers “guidance”, and disclosure-quarter tokens favor repeated Q4 references and a participant-list page. Simply replacing “guide” with “guidance” or removing the quarter terms did not recover the gold page in top six in the diagnostic run. A general guidance-intent rerank and participant-list suppression are candidates to measure, not reasons to report an unearned pass.

The bounded follow-up change recognizes “guide” and “guided” alongside “guidance”, raises matching explicit management guidance/range statements, and reduces participant-list relevance for guidance questions. It contains no company name, target value or gold-page special case. After that change, a second actual run returned **25 pass, 0 fail, 1 not run** with all 15 original anchors unchanged. A regression checks the original question and two paraphrases and preserves the requested call boundary. These are post-tuning regression results on the same authored set, not independently measured accuracy or prompt-injection robustness. The injection case still requires a real-model run.

Re-run after retrieval, chunking, corpus or prompt changes and retain the resulting JSON alongside the candidate's source revision. Compare on the same cases, then add unseen issuers and independently authored questions before making generalization claims. The initial failed result remains part of this record.

## Evaluation limits and next measurements

This set is small and partly concentrated on Infosys. It mixes real source questions and explicitly labelled synthetic arithmetic/security checks; a single aggregate score would conceal those differences. Add a held-out issuer, independent human claim annotations, paraphrases not chosen while tuning, and a larger adversarial set before reporting accuracy or robustness. Compare BM25 with a hybrid retriever/reranker only if the measured source recall or claim support improves enough to justify added latency and cost. Unit test totals and word counts should remain separate from research-quality measures.
