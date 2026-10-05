# Gate 6 audit matrix

## Scope and freeze

| Check                     | Result                                                                      |
| ------------------------- | --------------------------------------------------------------------------- |
| Contract source SHA       | PASS — `0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b` |
| Contract source changed   | NO                                                                          |
| Product deployment target | `arc-testnet-product-v2` only                                               |
| Stress deployment use     | Proof/security evidence only                                                |
| Mainnet write             | NO                                                                          |
| Contract redeployment     | NO                                                                          |

| Current backend source SHA | `0x3003a13ddddf5f5d675bad7dfc45e0888050d62d0232fb497c59abebbb6a3fd3` |

## Browser route audit

The following routes were opened in the rendered browser, with desktop and responsive checks where applicable:

`/`, `/app`, `/markets`, `/markets/:marketId`, `/portfolio`, `/activity`, `/earn`, `/profile/:address`, `/competitions`, `/competitions/:id`, `/notifications`, `/attention`, `/proof`, `/system`, `/settings`.

| Surface                    | Result                               | Notes                                                                                                    |
| -------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Landing                    | PASS                                 | Product thesis, Arc Testnet state, qualification story, and proof CTA are visible.                       |
| Command center             | PASS                                 | Attention-first hierarchy; live health and market data retain unavailable/error states.                  |
| Markets                    | PASS                                 | Exact market-id search, lifecycle/status filters, sorting, truthful unavailable fields, responsive rows. |
| Market detail              | PASS with live safety block          | Tabs work; chart is truthful no-history state; stale oracle disables risk-increasing review.             |
| Risk Passport              | PASS                                 | PASS/WATCH/BLOCK/UNKNOWN/UNAVAILABLE remain distinct with provenance/freshness where supplied.           |
| Holders / deployer / depth | PASS                                 | Resource tabs render canonical responses and explicit unavailable values.                                |
| Portfolio / activity       | PASS                                 | Activity uses the live wallet activity envelope; no fabricated positive state.                           |
| Earn / LP                  | PASS                                 | Displays assets, NAV, share price, liabilities, insurance, liquidity, and queue semantics.               |
| Profile / watchlist        | PASS                                 | Canonical profile and persisted watchlist response are used.                                             |
| Competitions               | PASS                                 | Empty leaderboard is truthful; no hardcoded participants or scores.                                      |
| Notifications / attention  | PASS                                 | Dedicated attention route, load/error states, and live notification envelope.                            |
| Proof / security           | PASS                                 | Product and Stress deployments are clearly separated; stress state is not a trading target.              |
| System status              | PASS with stale dependencies visible | Oracle and realtime freshness are independently surfaced.                                                |
| Settings                   | PASS                                 | Wallet/network preferences and read-only safety copy are present.                                        |

## Defects fixed

1. Market detail tabs were visually present but inert. They now select and render Overview, Risk Passport, Holders, Trades, Deployer, and Proof panels.
2. Activity, watchlist, competition, and related API envelope handling could silently discard live `data` values. The client now unwraps the canonical response shape consistently.
3. The default trade collateral exceeded the Product market's conservative position cap. The default is now bounded and fixed-point validation rejects invalid or over-capitalized input before review.
4. The chart used an arbitrary price modulo scale. It now scales only real returned values and explicitly renders insufficient-history state when no series exists.
5. Mobile market/detail layouts could overflow at narrow widths. The layout was corrected and measured at 390px, 430px, and 375px with no horizontal overflow.
6. A long-running API process could retain an old `FRESH` oracle snapshot. Freshness is now recomputed at read time and the backend health surface reports stale oracle state.
7. The production preview's absolute API origin was blocked by missing CORS headers. Read-only GET/OPTIONS CORS is now explicit.
8. Static `ACTIVE`/`CANONICAL` fallback presentation was removed from live risk surfaces where it could imply unavailable data was verified.
9. `/attention` was previously an alias to the command center. It now has an explicit actionable-state route.
10. The Gate 5 frontend domain client files lived under a repository-wide ignored `lib/` pattern and were therefore not in the commit. They are now explicitly included as required frontend source so a clean checkout contains the application it builds.
11. The pretrade API envelope said `AVAILABLE` while carrying a stale oracle. It now reports `STALE`/`UNAVAILABLE`, matching the canonical oracle state and the disabled review control.

## Remaining release conditions

- The Product oracle observation is currently stale. The UI/API correctly report `STALE`, `Entry reference UNAVAILABLE`, and disable risk-increasing review. A fresh legitimate reporter update is required before declaring live trading readiness.
- The API/indexer/database/realtime stack is local-only at this point. A public HTTPS backend and SSE origin are required for public Vercel hosting.
- ArcScan verification remains an external explorer limitation where previously recorded; runtime parity and local provenance remain authoritative evidence.
