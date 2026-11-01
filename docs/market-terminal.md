# Market terminal — 0.8.0

Open `#terminal` or ask “Open market terminal”. The terminal tracks the current portfolio/watchlist and supports up to ten extra NSE symbols. Quotes poll every 15 seconds while visible; pause, manual refresh, filtering, sorting and a security inspector are available. Session logs contain received snapshots and actual price differences. No generated ticks, trades or order-book activity are shown.

`GET /api/terminal/quotes?tickers=INFY,TCS&source=auto` tries NSE website quote snapshots and labels any Yahoo Finance fallback per security. `source=nse` never silently falls back; `source=yahoo` only uses Yahoo. NSE 401/403/429 or connection failures trigger a two-minute cooldown, without evading access restrictions. The public NSE quote endpoint returned HTTP 403 during verification. Neither public snapshot source is a licensed streaming feed; provider delays can occur. Official exchange streaming requires a subscription or an authorized broker/data vendor connection.

The API validates symbols, currency, prices and timestamps. Older quotes cannot overwrite newer exchange timestamps in the terminal. A failed refresh preserves the last quote marked cached, with unknown session state. Closed markets retain the last exchange timestamp. Memory caches are per Worker instance and are not durable market storage.

Research quote cards and portfolio quotes also poll while their views are visible. The existing Yahoo endpoint can cache up to 30 seconds; terminal snapshots use a 15-second cache. Document research remains separate from market prices. Gemini credentials remain on the server.

Validation: 133 tests, syntax checks, production build and ESM artifact verification passed. Browser checks covered desktop thesis padding, a 390px mobile layout without page overflow, quote filtering, pause/resume, explicit NSE failure and auto fallback. On Sunday 1 November 2026, 18/18 real Yahoo quotes loaded with Friday exchange timestamps and closed-market status. Movement logic is tested with deterministic fixtures because the exchange is closed.
