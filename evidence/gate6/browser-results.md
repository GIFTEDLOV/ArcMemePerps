# Browser and E2E results

## Automated browser regression

- `pnpm e2e`: **16/16 passed** (desktop and mobile projects).
- Covered landing, Product market, stale-oracle review handling, Product/Stress isolation, exact market-id search, detail tabs, primary routes, API outage, wrong-network wallet state, and mobile overflow.
- No browser console errors were reported in the inspected final sessions.
- Production preview was served on port `3001` with `VITE_API_URL=http://127.0.0.1:8787/api/v1`.

## Manual browser inspection

Inspected rendered routes: landing, command center, markets, market detail, Risk Passport, holders, deployer, proof, portfolio, activity, Earn/LP, profile, competition hub/detail, notifications, attention, system status, and settings.

The live Product market has no historical price series and an old oracle observation. The final rendered state says `Insufficient historical series`, shows `ORACLE STALE`, and disables risk-increasing review. No review screenshot was fabricated for the stale state.

## Captures

- `landing-desktop.png`
- `command-center-desktop.png`
- `markets-desktop.png`
- `market-detail-desktop.png`
- `proof-security-desktop.png`
- `system-status-desktop.png`
- `portfolio-desktop.png`
- `earn-desktop.png`
- `profile-desktop.png`
- `competition-desktop.png`
- `notifications-desktop.png`
- `mobile-markets.png`
- `mobile-market-detail.png`
- `mobile-markets-375.png`
- `mobile-market-detail-375.png`
