# Alert horizons, urgency, voice and WhatsApp

Alerts now distinguish Daily (1 completed session), Weekly (5) and Monthly (21) changes. Settings default to ±4%, ±8% and ±15% respectively. Weekly/monthly changes use dividend-adjusted daily closes when available. An unadjusted corporate-split window is excluded. Daily volume compares the prior 20-session average. A threshold move at least twice its configured size triggers urgent review. Adverse wording in a material litigation, credit-rating, pledging or management filing can also trigger urgent review. Other updates remain regular review; thesis/category relevance alone is not urgent evidence. These are review cues, not investment recommendations.

Each scan also saves a per-stock daily/weekly/monthly return snapshot, even below alert thresholds. Source session dates and data gaps stay visible. The existing hourly cloud scan is retained, with stable event keys to prevent duplicate inbox entries. The website checks the persisted inbox once per minute while visible, raises a badge, and shows a toast only for newly observed urgent items. This is separate from 15-second quote refresh. Review, Watch and Dismiss are persisted per profile. Horizons and urgency can be filtered independently.

Commands include “Show weekly urgent alerts”, “Show monthly regular updates”, “Set weekly price alert to 8%”, and “Connect WhatsApp updates”. Threshold changes are deterministic, validated and do not need a model call.

## Voice

The command-bar mic starts recording immediately after the browser grants microphone permission. The input field becomes an inline waveform, elapsed timer, cancel button and finish button. Waveform heights come from the actual microphone samples via Web Audio. Finish sends the clip for transcription and fills the normal prompt field with the recognised command; Search executes it. There is no separate voice form, file chooser or mode picker. Cancel restores the previous draft, stops audio tracks and discards the recording. Navigation, backgrounding and Escape cancel capture. Delayed permission results are discarded after cancellation.

Gemini handles Hindi, English and Hinglish, returning the transcript plus an equivalent command. Unclear speech leaves the draft unchanged. Browser speech recognition is an automatic English fallback where supported when Gemini is unavailable. Recording stops after 45 seconds; clips are limited to 5 MB. FINN does not store raw recordings. No command runs automatically. Browser permission and a working microphone are required.

The one-tap UI is tested with a synthetic MediaStream on an isolated origin, never the user's physical microphone. Tests cover immediate capture, audio-responsive bars, finishing into the prompt without execution, cancellation/draft restoration, denial and narrow layouts. The Gemini transcription endpoint was also verified with a generated spoken English WAV during the original voice release.

Gemini reuses the existing server-side key/model; optional `FINN_VOICE_MODEL` can select another audio-capable model. Sources: [Google audio input guide](https://ai.google.dev/gemini-api/docs/generate-content/audio).

## WhatsApp: setup ready, not connected

The user does not have a messaging account. No WhatsApp credentials or recipient have been configured, and no real WhatsApp messages were sent during implementation. FINN therefore displays Not connected. Do not claim live delivery until a sender, approved template, recipient opt-in and connection test are verified.

Use Meta WhatsApp Cloud API. Configure these **server secrets**, never client code: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_GRAPH_VERSION` (the supported version shown in your Meta setup), optional `WHATSAPP_TEMPLATE_LANGUAGE` (default `en`), `WHATSAPP_APP_SECRET`, and `WHATSAPP_VERIFY_TOKEN`. Approve a template with one body text parameter (`{{1}}`). Save the owner's international phone number and explicit opt-in in FINN. Frequency options are hourly, daily after 18:00 IST, or Friday after 18:00 IST; dispatch occurs on the next successful hourly scan. Urgent submissions bypass digest batching. Only newly observed, active alerts after subscription are eligible. A scheduled digest can also include a new completed-session return snapshot when no threshold alert occurred; an unchanged session snapshot is not resent on every scan.

API acceptance is stored as **accepted**, never **delivered**. Verified signed status callbacks update sent/delivered/read/failed. Stable per-event/per-digest submission keys deduplicate. Ambiguous timeouts are not automatically retried, to avoid duplicate messages; check the provider first. Rejected submissions stay failed and are visible in delivery settings. The settings support pausing, and signed incoming STOP/unsubscribe/pause messages disable the subscription.

The current Vercel website is public. Meta uses `https://finn-research-desk.vercel.app/api/whatsapp/webhook` directly: GET verifies the configured token and POST verifies Meta's HMAC signature. This callback route is independent of visitor sign-in. The old Sites relay reference is retained only for the separate private Sites deployment; it is not required for Vercel.

See [WhatsApp quickstart](whatsapp-quickstart.md) for account setup, the supported `hello_world` connection-test mode, and the transition to an approved FINN template. `hello_world` sends no dynamic body parameters and is test-only. Automatic alerts wait for a non-sample template and callback credentials. Saving enabled delivery settings now also syncs the watchlist and enables its background monitoring profile. Pausing WhatsApp leaves website monitoring enabled. The modal refreshes after saving so the test button reflects the new preference immediately.

Provider reference: [Meta's official WhatsApp collection](https://www.postman.com/meta/whatsapp-business-platform/overview), [message endpoint](https://www.postman.com/meta/whatsapp-business-platform/folder/o48mro7/messages).

Delivery settings and submission states use namespaced records in the existing durable monitor metadata table. No schema migration or live-data backfill is required. Tests use synthetic market/audio/provider responses; real provider speech transcription is checked separately when the hosted Gemini key is available.
