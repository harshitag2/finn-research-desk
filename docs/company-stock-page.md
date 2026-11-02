# Company lookup and personal investment card

The header search offers company-name/symbol matches and opens a stock page for plain issuer queries such as `Reliance`, `Infosys` or `search Reliance`. Research sentences retain the research path. The public Yahoo Finance security directory extends discovery beyond the sample watchlist; only NSE equities/ETFs are accepted. Directory failures preserve local watchlist/import matches. Search results show stored quotes as snapshots, not fresh ticks.

The stock page independently requests the latest available quote and refreshes every 15 seconds while visible. The price, day's movement, recent intraday series, exchange timestamp, provider and session state remain separate from daily historical charts and company disclosures. Older exchange snapshots cannot replace newer quotes. Failed refreshes retain and label cached prices. Closed-market prices may stay unchanged; there is no licensed streaming feed or simulated movement.

“Your investment” uses imported holdings only. A sample watchlist does not imply ownership. An account selector controls aggregation and the card shows snapshot allocation, invested amount, quantity, average invested cost, estimated marked value, unrealised P&L and the position's daily price change.

CSV adds optional `quantity` (nonnegative, up to eight decimals). When every account position has quantity, estimated value is quantity × latest INR quote and day change is quantity × per-share daily change. Cost/P&L requires invested_value on every constituent position. Partial quantities fall back to the dated imported market value, never guessed units. Missing costs remain unavailable. These calculations exclude fees and taxes and are not broker sync or XIRR. Quantities and invested amounts remain in browser storage.

Tests cover company routing versus research, directory filtering/failure, multiple accounts, missing quantities/costs, cached quotes and currency checks. Browser verification uses synthetic holdings/upstreams on a separate local origin, including outside-watchlist Coforge discovery and 390px/320px layouts. Live market snapshots are separately verified after publication.
