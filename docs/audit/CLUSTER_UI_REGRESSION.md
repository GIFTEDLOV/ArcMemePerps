# CLUSTER UI regression review

**Baseline:** `b5839a5` (pre-hardening checkpoint)
**Hardening target:** PR #2 HEAD `979548593ceaca07e8685f8537f90d3b8cc59c2b`
**Screens:** landing, markets, market detail, portfolio, and earn
**Viewports:** desktop `1440 × 900`; mobile `390 × 844`

## Method and result

Playwright captured each route against the pre-hardening and PR #2 applications at the same viewport sizes, with a fixed visual-only market fixture. The fixture keeps the routes comparable; these screenshots are not evidence of live market data. The live preview was tested separately with no API mocks and is recorded in `evidence/e2e/live-preview/`.

No CSS, stylesheet, design-token, or asset file changed in PR #2. The header, navigation, typography, colors, page structure, card borders, spacing, and responsive stacking are consistent across the matched captures. No visual-layout regression was found.

| Screen        | Comparison                                                                                                                                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing       | Header, hero, patterned background, primary actions, and preview panel retain their prior layout. Availability copy replaces unverified market counts and live-trading claims.                                                                                                     |
| Markets       | Search, filters, tabs, market table/cards, and mobile structure remain. Only provider-returned values are shown; the new unknown and unavailable labels are content changes.                                                                                                       |
| Market detail | The header, chart frame, chart controls, trading rail, risk evidence, and radar panels remain in place. Fabricated qualification, liquidity, holder, quarantine, sentiment, and trade data are removed. Trading is clearly blocked and the empty chart retains its existing frame. |
| Portfolio     | The existing wallet connection and empty-state layout remain. Browser-local simulated positions and activity are no longer represented as authenticated wallet history.                                                                                                            |
| Earn          | The existing desktop columns and mobile stacked cards remain. Unverified APY, balances, fee allocation, and earnings show unavailable states; the deposit control is disabled.                                                                                                     |

The visible differences are truthful data and availability changes. For example, the pre-hardening detail screen shows a fabricated quarantined market and active order values, while the hardened screen shows `UNVERIFIED`, unavailable evidence, zero/unknown activity, and a disabled `Trading unavailable` control. These are intentional content corrections; they do not change the visual design.

## Evidence

The 20 matched screenshots are in `evidence/ui-regression/before/` and `evidence/ui-regression/after/`. The capture spec is `apps/frontend/e2e/ui-regression.spec.ts`; both runs passed: 2 viewport projects and 10 screen captures per run. Live, no-mock preview screenshots are in `evidence/e2e/live-preview/`.

The screenshot-only fixture validates appearance and route stability. Live endpoint values, disabled actions, and mobile overflow are covered separately by `apps/frontend/e2e/live-readonly.spec.ts` against the public Vercel preview.
