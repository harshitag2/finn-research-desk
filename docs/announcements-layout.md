# Company announcements — 0.9.1

Replaces the Overview's two-column priority cards and promotional headings with a single chronological filing table. Each row shows company, category, disclosure summary, exchange timestamp and filing/research links. Price/volume alerts use a separate plain row group. Category selection, optional routine filings, read markers, window selection, refresh and company-scoped commands remain available. Source, methodology and date window are inspectable in a disclosure below the table.

The backend classification, alert calculations and source links are unchanged. No generated financial data or new data provider is introduced.

Validation: 133 tests, syntax checks, production build and ESM artifact checks passed. Browser checks used real NSE data: category filtering returned the selected management-change row; including routine filings expanded three visible rows to six; source details opened correctly. At 390px the table scrolls inside its panel. Desktop proof is saved in `../output/verification-announcements-2026-11-01/announcements.jpg` outside the deployment archive.
