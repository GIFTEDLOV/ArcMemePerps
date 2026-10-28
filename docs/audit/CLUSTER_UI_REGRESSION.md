# CLUSTER UI regression review

**Baseline:** `b5839a5` (pre-hardening checkpoint)
**Review target:** `ed8c09e` plus the verified chart-frame correction in this review
**Viewports:** desktop and 390px mobile

The same routes were captured at both viewports before and after the hardening changes: landing, markets, market detail, portfolio, and earn. No CSS, stylesheet, or design-token files changed in the hardening diff. Navigation, typography, color palette, card treatment, and primary page structures remain consistent.

| Screen | Desktop and mobile comparison |
| --- | --- |
| Landing | Header, patterned background, hero, buttons, and preview panel retain their existing structure. Unverified market counts and trading claims are replaced with availability copy; text wraps naturally around the updated content. |
| Markets | Search, filters, table/cards, and mobile stacking remain in place. Market rows now show only returned data and preserve unknown values. |
| Market detail | Header, chart controls, trading rail, risk evidence, and radar panels remain. Fabricated qualification, holder, liquidity, and quarantine details are replaced by unavailable or unknown states. The empty chart keeps the original 460px chart frame so the detail layout does not collapse when no chart provider is configured. |
| Portfolio | The existing connection and empty-state layout remains; browser-local session data no longer appears as an authenticated wallet. |
| Earn | The existing two-column desktop and stacked mobile panels remain. APY, pool balances, fee allocation, and earnings show unavailable or unverified states, and the deposit control is disabled. |

The comparison found content changes tied to the hardening work and one verified chart-frame collapse. The chart frame was restored using the existing chart wrapper treatment without changing CSS or design tokens. Current desktop and mobile availability screenshots are in `evidence/e2e/screenshots/`.
