# ArcMemePerps frontend winner audit

Phase 10 starts from the existing local winner frontend at `e3065bd`.
The product has a useful evidence-aware foundation, but its primary composition
still reads like an operations console. The rebuild keeps the truthful API and
wallet boundaries, then moves trader discovery and token intelligence to the
center of the experience.

## Current route and component disposition

| Surface | Current issue | Decision | Phase 10 direction |
| --- | --- | --- | --- |
| Landing | Strong thesis, but the preview is hardcoded and the copy leads with protocol language | REDESIGN | Use a real discovered market preview and a sharper discovery → evidence → perp story |
| Markets | Dense foundation, but filters are visually heavy and categories are missing | REDESIGN | Make Markets the product home with category bar, chain tabs, compact terminal rows, and truthful perp zero state |
| New | Shares the generic Markets implementation | MERGE | Reuse the explorer with a New sort/filter mode |
| Watchlist | Shares the generic Markets implementation and has no persistence | REDESIGN | Local watchlist state, star controls, and a purposeful empty state |
| Market detail | Good two-column skeleton, but chart is a line and tabs are mostly placeholders | REDESIGN | Trading-terminal hierarchy, real-history chart, compact passport, provenance drawer, venue/holder views |
| Trading rail | Correctly disables unregistered markets, but reads like an unavailable form | REDESIGN | Make the rail a clear stateful trading surface; keep all non-live actions fail-closed |
| Portfolio | Generic placeholder | REDESIGN | Wallet-aware empty state and future-ready equity/positions structure |
| Activity | Generic placeholder | REDESIGN | User-readable event feed with explicit wallet/disconnected states |
| Proof | Valuable evidence, but visually dominant and protocol-first | DEMOTE + REDESIGN | Keep as Protocol / Proof, move operational details behind advanced disclosure |
| System | Operator-facing health grid | DEMOTE | Keep route for advanced diagnostics; remove from primary navigation |
| Earn / LP | Useful secondary concept, but not a discovery destination | KEEP + DEMOTE | Secondary menu only |
| Profile / Competitions / Settings | Valid future surfaces with sparse content | KEEP + DEMOTE | Secondary menu; polished truthful empty states |
| Notifications / Attention | Wallet-specific records are correctly API-backed | KEEP | Secondary access, concise empty/error states |
| Shell | Header and rail are structurally sound, but use operator/network-console language | REDESIGN | Product-first top bar, primary trader navigation, compact more menu |
| Status pills | Useful primitive, but exposes internal enum styling | REDESIGN | Consumer-facing labels with advanced detail available on demand |
| Metric cards | Repeated large cards consume space | MERGE | Use compact stat strips and table cells |
| Empty / error states | Honest, but inconsistent and visually sparse | REDESIGN | Shared state system for unavailable, unsupported, stale, conflicted, and no-results cases |

## Clutter and hierarchy findings

- `Arc Testnet`, component health, deployment identity, and proof terminology
  currently compete with market discovery in the shell.
- The landing preview uses placeholder `AM` content instead of a live market.
- The market table has useful density but omits the category system, evidence
  coverage, holders, depth, and max-leverage columns requested by the product.
- Detail tabs do not yet render distinct evidence views.
- The current chart is a single SVG polyline. It is truthful, but the detail
  page needs a more deliberate history surface and explicit unavailable state.
- The unavailable perp rail is correct but does not make the zero-live-perp
  condition feel intentional.
- Mobile currently hides too many table fields without replacing them with a
  compact market card composition.
- The proof page surfaces stress/deployment language too early for a trader.
- Runtime copy contains engineering terms such as `ORIGIN ONLY`, `UNAVAILABLE`,
  and stream state without a consumer-facing explanation.

## Truth constraints carried into the rebuild

- The local discovery universe remains real API data; no runtime fixture rows,
  fake prices, fake holders, fake PnL, or fake perps are introduced.
- `0` registered/live Arc perp markets remains visible and truthful.
- Unknown, stale, unsupported, and conflicted observations remain distinct from
  zero values.
- Contract, policy, qualification, and wallet write boundaries are unchanged.
