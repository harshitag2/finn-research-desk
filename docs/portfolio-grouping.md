# Portfolio grouping

Portfolio and Analysis show an interactive snapshot breakdown, available without a model request.

- Asset classes: Stocks, Mutual Funds, ETFs, Bonds, Gold, Cash, Fixed Deposits, Other and Unclassified. Allocation uses the entire selected account snapshot.
- Stock sectors: direct stocks only; percentages use the stock sleeve as denominator. Funds/ETFs are excluded because constituent look-through is not connected.
- Tap a group to see holdings, allocation, invested cost and unrealised P&L. P&L requires invested cost for every position in a group; missing costs are never treated as zero. This is not XIRR or a period return.
- Account selection recalculates groups and clears prior price-history analysis to avoid mixing scopes.
- Without an import the 18-stock watchlist is explicitly an equal-weight illustration, with no invented portfolio rupee value.

CSV requires `ticker,market_value`; optional `name,sector,account,currency,asset_type,invested_value`. Amounts are INR with at most two decimals. Legacy files without asset_type default to Stocks. Mutual funds may use AMFI/ISIN/custom identifiers. Download the mixed-asset example from Import holdings.

Only NSE-listed Stocks/ETFs enter quotes, price-history analysis and monitoring. Other assets use imported snapshot values. Historical analytics normalise within the eligible listed sleeve (up to 30 holdings), not the whole mixed portfolio. NAV history, fund holdings and fund-sector look-through are not connected.

Prompts such as “sector-wise analysis of my portfolio” and “group my portfolio by asset class” open the breakdown directly.

Validation: pure grouping tests cover mixed assets, multiple accounts, missing/zero costs, unknown labels and zero-value snapshots. The API rejects nonlisted asset classes before any stock-history request. Browser checks use an isolated origin with synthetic upstream data; fixtures are not live financial evidence.
