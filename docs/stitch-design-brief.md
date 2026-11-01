Design a complete responsive web application called FINN, an Indian equity research and portfolio workspace built for an ENAM Holdings AI Engineer assignment. This is a working finance product redesign, not a landing page.

REFERENCE AND VISUAL DIRECTION
Use https://www.tickertape.in/ as the reference for typography, spacing, information hierarchy, compact financial tables, stock detail pages, navigation and restrained color. Inspect the reference if possible. Aim for its clean, practical Indian investing-product feel, with FINN's own identity. Do not copy Tickertape's logo, proprietary illustrations or brand assets. If the exact font is not available, use a close clean sans-serif such as Inter with weights 400/500/600; use tabular numerals for prices. No decorative serif, typewriter headings, oversized typography or widely letter-spaced uppercase labels.
Use predominantly white surfaces, a very light gray application background, dark charcoal text, subtle gray borders, and restrained blue for active controls. Gains green, losses red. Light mode first. Small 6–10px corner radii, minimal shadows, 8px spacing scale, 20–24px card padding. Body 14px, secondary text at least 12px, section headings 18–22px. Dense enough for real financial analysis while remaining easy to scan. Create a consistent icon set; no emoji or ornamental star symbols.

PRODUCT AND USERS
An analyst follows Indian NSE equities, monitors a watchlist or imported portfolio, inspects company results and management guidance, compares issuers, and saves an investment thesis with source evidence. A single natural-language input routes requests to relevant tools. The back end uses retrieval over primary company PDFs and Gemini, but the interface should look like a professional investment application, not a chatbot.
Existing capabilities to preserve:
• Market overview, corporate disclosures and portfolio alerts.
• Holdings CSV import, consolidated holdings, weights and sector allocation.
• Portfolio analysis: returns versus Nifty 50, risk, drawdown and correlations.
• Stock screener and stock detail chart with selectable time ranges.
• Market terminal with quote table, daily change, selected-security inspector, source selector, search/sort, pause/resume, manual refresh and actual price-change highlighting.
• Company document research with page-linked citations, management guidance timelines, comparisons, and quarterly financial results.
• Thesis editor: symbol, research lens, what must be true, disconfirming evidence, next review, save and test against sources.
• PDF source library, source import, saved research notes and settings.

DESIGN THE FOLLOWING CONNECTED SCREENS
1. Overview: compact global header with FINN logo, navigation and search/research field. Show market indices strip, portfolio/watchlist summary, market chart, watchlist table, recent corporate filings and upcoming/archived research. Put useful data above the fold, not a marketing hero.
2. Portfolio: value and return metrics, Nifty comparison chart, allocation panel and sortable holdings table, import CSV action. Clearly distinguish illustrative watchlist data from an imported actual portfolio.
3. Research: a company selector, question field and concise suggested queries. Show a structured answer with citations, evidence drawer listing document title/date/page and an optional guidance timeline. Separate quotes visually from document findings. Comparison mode should align companies and metrics. Include an activity detail disclosure without noisy agent branding.
4. Stock detail / markets: company header, price and daily return, source timestamp, chart ranges, key metrics, peer table, financial results tab and disclosures tab.
5. Market terminal: a dense professional quote board, green/red actual changes, source/timestamp per security, selected-security detail panel and compact refresh activity. A dark terminal panel may be used inside the otherwise light app if it improves readability. No fake trades, depth or order book.
6. Thesis: a padded list of company theses and an editor with clear field groups and save/review actions.
7. Source library / saved notes: clean searchable document table with company, period, type, date and page count; PDF import; saved note cards/table.

COPY REQUIREMENTS
Remove all generic AI marketing, poetic taglines and self-congratulatory filler. No "Your desk. One request.", "Independent thinking. Evidence attached.", "Hold the thesis. Question the evidence.", "Let the desk do the work", "Unlock insights", "AI-powered", "Your intelligent copilot", or verbose claims about agents. Use direct labels: Overview, Research, Portfolio, Markets, Terminal, Theses, Documents, Saved. Example input: "Compare Infosys and TCS guidance". Buttons: Search, Compare, Refresh, Import CSV, Add document, Save thesis. Explanations only when they help the user act. Keep material data-quality states: source, exchange time, delayed/cached data, missing documents and provider errors.

TRUTHFUL STATES AND INTERACTIONS
Quotes refresh every 15 seconds while visible; they are provider snapshots, not licensed exchange streaming. NSE access can be blocked and Yahoo fallback must be labelled. Closed-market data retains its last exchange timestamp; do not imply live movement when closed. Missing documents show "Add a company document to research this question" with an import action. Never invent a recommendation, valuation or a missing financial value. Mock numbers in the visual design are layout fixtures only and must be replaced by existing application API data in implementation. Show loading, empty, partial failure and market-closed states.
Use accessible contrast, keyboard focus, properly labelled controls, readable charts and responsive tables with internal scroll rather than page overflow. Desktop reference 1440px; mobile 390px with compact bottom navigation or a more-menu.

OUTPUT
First produce a polished desktop Overview and Research screen establishing the design system, then the connected Portfolio, Terminal, Stock detail, Thesis and Documents screens plus mobile adaptations. Provide rendered designs, reusable color/typography/spacing tokens and exportable HTML/CSS (or equivalent inspectable front-end code). The existing functioning application will be adapted to your output, so prioritize coherent reusable components over static decorative mockups.
