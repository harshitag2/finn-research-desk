# Detailed research and workspace controls — 0.11.1

Requests such as “compare infy and tcs in detail” use balanced retrieval across business/demand, revenue/growth, margins/execution, cash/capital allocation and guidance/deals/risks. Narrow detailed questions use the relevant dimensions. Retrieval stays inside the requested issuer and disclosure period. The agent targets developed, cited findings, checks breadth and issuer coverage, and may request one revision before returning an explicitly partial report. It never fills source gaps with invented figures. The original coverage and provider-failure gates remain in place.

## Prompt controls

- Set price alert to 5% and volume alert to 3x
- Only alert me about management changes
- Turn off dividend alerts
- Use compact layout / Use comfortable layout
- Hide market indices / Show market indices
- Use Yahoo as the terminal source (also auto or NSE)
- Add NESTLEIND to terminal / Remove NESTLEIND from terminal
- Pause price updates / Resume price updates (current view)
- Refresh quotes
- Set chart to 3 months (also 1, 6 months or 1 year)
- Set announcements window to 7 days
- Clear screener filters
- Open settings

Preferences and display choices persist on this browser/device and stay in sync with Settings. Existing portfolio-owned symbols cannot be removed through the terminal command. Invalid bounds or unsupported operations are rejected before state changes. Commands invoke an allowlist of native app controls; they cannot run code or modify the site's implementation. Refresh stays at the provider-safe 15-second interval. Changing research preferences marks an existing portfolio analysis for a fresh run.

## Verification

151 unit/integration tests pass, including balanced detailed retrieval, thin-answer repair, citations, period scoping, invalid commands and compound settings. Browser verification confirmed compound 5%/3x/compact changes survive reload, update the digest limits, hide indices, and reject a 500% threshold. Hosted Gemini synthesis and final UI are checked during publication.

## Deployment verification

Always run `node scripts/build.mjs` inside the source workflow before packaging. The deployment archive must include the current depth word-count check and partial-report renderer; source synchronization alone does not rebuild dist. Use a new source revision for a changed deployment artifact.
