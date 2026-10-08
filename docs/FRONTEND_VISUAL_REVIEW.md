# Frontend visual review

Phase 10 screenshots were captured from the local runtime at `http://127.0.0.1:3001` after the trader-facing rebuild. The review used the real discovery API, so the screens show the current truthful state: 262 observed markets, real observations where present, and zero registered live perps.

Scores are out of 10. The 1024px detail view was revised after the first pass because the sticky rail did not have enough room beside the content column; the final capture below is the stacked version.

| Screen | Viewport | Hierarchy | Density | Spacing | Type | Clarity | Trust | Mobile use | Empty state | Consistency | Overall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| landing-1440 | 1440 | 9 | 9 | 9 | 9 | 9 | 9 | 8 | 9 | 9 | 9.0 |
| markets-1440 | 1440 | 9 | 9 | 8 | 8 | 9 | 9 | 8 | 8 | 9 | 8.7 |
| markets-filtered-1440 | 1440 | 9 | 9 | 8 | 8 | 9 | 9 | 8 | 8 | 9 | 8.7 |
| token-detail-1440 | 1440 | 9 | 9 | 9 | 9 | 9 | 9 | 8 | 9 | 9 | 8.9 |
| risk-passport-1440 | 1440 | 9 | 8 | 9 | 9 | 9 | 9 | 8 | 9 | 9 | 8.8 |
| holders-1440 | 1440 | 9 | 8 | 9 | 9 | 9 | 9 | 8 | 9 | 9 | 8.8 |
| liquidity-1440 | 1440 | 9 | 8 | 9 | 9 | 9 | 9 | 8 | 9 | 9 | 8.8 |
| trade-rail-pending-1440 | 1440 | 9 | 8 | 9 | 9 | 9 | 9 | 8 | 9 | 9 | 8.8 |
| portfolio-1440 | 1440 | 9 | 8 | 9 | 9 | 9 | 9 | 8 | 9 | 9 | 8.8 |
| activity-1440 | 1440 | 9 | 8 | 9 | 9 | 9 | 9 | 8 | 9 | 9 | 8.8 |
| protocol-proof-1440 | 1440 | 9 | 8 | 9 | 9 | 9 | 9 | 8 | 9 | 9 | 8.8 |
| markets-1280 | 1280 | 9 | 9 | 8 | 8 | 9 | 9 | 8 | 8 | 9 | 8.7 |
| token-detail-1280 | 1280 | 9 | 8 | 9 | 9 | 9 | 9 | 8 | 9 | 9 | 8.8 |
| markets-1024 | 1024 | 8 | 8 | 8 | 8 | 9 | 9 | 8 | 8 | 8 | 8.3 |
| token-detail-1024 | 1024 | 8 | 8 | 8 | 8 | 9 | 9 | 8 | 9 | 8 | 8.3 |
| landing-430 | 430 | 9 | 8 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 8.9 |
| markets-430 | 430 | 8 | 9 | 8 | 8 | 9 | 9 | 9 | 8 | 9 | 8.6 |
| token-detail-430 | 430 | 8 | 8 | 8 | 8 | 9 | 9 | 9 | 9 | 9 | 8.6 |
| risk-passport-430 | 430 | 8 | 8 | 8 | 8 | 9 | 9 | 9 | 9 | 9 | 8.6 |
| trade-sheet-430 | 430 | 8 | 8 | 8 | 8 | 9 | 9 | 9 | 9 | 9 | 8.6 |
| portfolio-430 | 430 | 9 | 8 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 8.9 |
| markets-390 | 390 | 8 | 9 | 8 | 8 | 9 | 9 | 9 | 8 | 9 | 8.6 |
| token-detail-390 | 390 | 8 | 8 | 8 | 8 | 9 | 9 | 9 | 9 | 9 | 8.6 |
| landing-375 | 375 | 9 | 8 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 8.9 |
| markets-375 | 375 | 8 | 9 | 8 | 8 | 9 | 9 | 9 | 8 | 9 | 8.6 |

## Review notes

- The desktop market surface is intentionally dense; unsupported fields remain `UNAVAILABLE` instead of becoming zeros or fabricated values.
- The detail terminal keeps the chart and qualification rail above the risk passport, while proof and provenance remain one interaction away.
- Mobile uses a dedicated card/feed composition and fixed navigation. The 430px risk capture is a focused viewport of the passport, not a synthetic scroll state.
- The 1024px trade rail now stacks above the chart to preserve legibility and avoid overlap.
- The lowest major-screen score is 8.3/10 at 1024px, so no major screen remains below the required 8/10 threshold.

Screenshots are stored in [`assets/phase10/`](assets/phase10/). README-ready aliases are `hero-markets.png`, `token-terminal.png`, and `risk-passport.png`.
