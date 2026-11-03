# FINN on Vercel

Production: https://finn-research-desk.vercel.app

Verification on 3 November 2026: 224 automated tests passed. Production checks verified unauthorized API blocking, private sign-in, PostgreSQL reads and a persistent configuration write/read, quotes, and extraction of a 24-page company PDF into 46 passages.

The Vercel project `finn-research-desk` runs the existing application through a Node.js Function in `api/index.js`. The frontend and API share an origin. The previous Cloudflare/Sites deployment is retained separately.

## Backend and database

Neon's free PostgreSQL resource `finn-database` is connected to the production project. `DATABASE_URL` is supplied by the integration. `deploy/postgres.js` adapts FINN's small D1 statement interface to parameterized PostgreSQL queries. It preserves affected-row counts for atomic scan leases and alert/delivery deduplication. The migration creates tables and indexes without dropping existing records.

The initial migration copied 41 alerts and two monitoring profiles from D1. Personal records are mapped to the authenticated Vercel owner. Event hashes are recomputed with that identity to preserve deduplication. Old scan runs, expiring locks, stale market snapshots and old hosting schedule metadata are not copied. Fresh scans regenerate snapshots. This database backs monitoring settings, inbox events, scan runs and delivery state. Holdings imports, notes, theses and imported PDF text continue to use browser storage; they are not automatically synchronized between the two domains. Import the original holdings CSV again on the new origin.

## Public access and secrets

`FINN_PUBLIC_ACCESS=true` opens the website without a password. Public visitors receive a random signed, Secure, HttpOnly anonymous workspace cookie. The backend discards incoming ChatGPT identity headers and assigns each visitor their own storage identity. New visitors do not fall back to shared or owner monitoring records. Existing signed owner sessions retain access to the owner's migrated alerts. The original access secret remains server-side for owner access and rollback; public visitors never need it. The scheduled scan endpoint still requires its separate bearer secret. Anonymous workspaces are browser identities, not recoverable accounts: clearing cookies creates a new workspace.

Gemini credentials remain server-side. `FINN_PROVIDER=gemini` and `FINN_MODEL=gemini-3.1-flash-lite` configure the existing research and transcription adapters. Never place secrets in `vercel.json`, client code or Git. Gemini generation was verified before production configuration; provider capacity and quotas still apply.

## Monitoring

`.github/workflows/monitor.yml` calls the production `/api/cron` endpoint hourly. GitHub Secrets `FINN_MONITOR_URL` and `FINN_MONITOR_TOKEN` supply its target and bearer token. `FINN_MONITOR_TOKEN` matches Vercel's `CRON_SECRET`. This token authorizes the scan endpoint only and cannot sign in to the website. GitHub scheduled runs can be delayed; this is hourly polling, not a guaranteed real-time service. A manual workflow dispatch verifies the first run. Vercel Hobby cron is not used for the hourly job.

WhatsApp remains unconnected until the owner supplies a WhatsApp Business provider account, credentials and opt-in. No real messages are sent by this deployment setup.

## Runtime limits

Vercel's request-size ceiling requires manual PDF uploads and microphone clips below 4 MB, allowing multipart overhead. The UI advertises and checks the PDF limit. Original-source PDF discovery/import fetches the document on the backend. The function has a 300-second maximum duration. Existing market data remains provider snapshots with exchange timestamps, not an official licensed NSE/BSE streaming feed.

## Commands

```powershell
npm ci
node scripts/build-vercel.mjs
npx vercel env pull .env.vercel.local --environment production
node --env-file=.env.vercel.local scripts/migrate-postgres.mjs
npx vercel deploy --prod
node scripts/verify-vercel.mjs https://finn-research-desk.vercel.app
```

`scripts/configure-vercel.mjs` is a one-time interactive setup helper. It reads secret input without echo, creates ignored local credentials and passes secrets through stdin to the CLI. `scripts/import-monitor.mjs` imports the ignored `.local/d1-migration.json` export. Neither local file is uploaded to Vercel or committed.
