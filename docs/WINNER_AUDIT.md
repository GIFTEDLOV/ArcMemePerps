# ArcMemePerps winner rebuild audit

Audit baseline: `3043b9b8d5b8f70858c023cb65805cbd3d5305b2` on `winner-rebuild`.

The v1.0.0 release is a live Arc Testnet protocol-read demo, not the specified
multichain market terminal. The rendered `/markets` route visibly contains one
`ARC-PRODUCT / ArcMemePerps Product Canary` row. The trading rail ends at a
read-only review and the API server explicitly rejects non-GET requests.

## Reality classification

| Feature | Classification | Evidence | Required rebuild |
| --- | --- | --- | --- |
| Frozen Arc contracts, qualification, oracle, LP, liquidation, insurance, ADL | LIVE_E2E | `evidence/gate4*/`, Forge suite, Product Testnet deployment | Preserve; expose as protocol integration and proof |
| Product API health, market snapshot, proof, risk, pretrade read | LIVE_PARTIAL | `apps/api/src/server.ts`, `apps/api/src/read-model.ts`, live Product API | Add universe-aware projections and truthful pagination |
| Single Product canary market | TEST_ONLY | `scripts/gate4i-live-backend.ts`, `PRODUCT_MARKET_ID`, dummy token address | Remove from default discovery; keep only under test/proof |
| Origin-chain market universe | PRIMITIVE_ONLY | `packages/chain-adapters`, `packages/providers`, adapter tests | Continuous durable discovery and persisted observations |
| DexScreener/provider enrichment | LIVE_PARTIAL | `packages/providers/src/dexscreener.ts` and provider types | Materialize real observations; unavailable stays explicit |
| Solana/BNB/Base/Ethereum/Robinhood adapters | PRIMITIVE_ONLY | adapter readers and parser tests | Wire provider cursors into the universe worker |
| Lifecycle normalization | LIVE_PARTIAL | `packages/lifecycle`, adapter snapshots | Persist lifecycle evidence/history; do not infer graduation from price |
| Token integrity and provenance | LIVE_PARTIAL | `packages/intelligence`, risk engine | Expose real observations; eliminate zero defaults |
| Spot liquidity vs perp capacity | PRIMITIVE_ONLY | `packages/market-depth`, risk engine | Separate origin spot, depth, Arc capacity, and LP NAV |
| Real history | LIVE_PARTIAL | `apps/api/src/read-model.ts`, history helpers | Use persisted observations only; no synthetic candles |
| Qualification states/reasons | LIVE_PARTIAL | backend runtime and proof package | Show pending/watch/rejected/qualified markets |
| Arc perp registry merge | LIVE_PARTIAL | Product read model and contract projection | Merge only registered Arc markets; no invented perps |
| User collateral and order writes | NOT_IMPLEMENTED | `apps/api/src/server.ts` allows GET only | Wallet-safe ERC-20 approve/deposit and PerpEngine order path |
| Immutable pretrade plan | PRIMITIVE_ONLY | `PreTradePlan` type and hash helpers | Bind account, chain, action, price bound, oracle sequence, versions, nonce, expiry |
| Keeper/indexer reconciliation | LIVE_E2E | Railway release worker and Product indexer evidence | Reuse for submitted-order recovery |
| Wallet integration | PRIMITIVE_ONLY | handwritten `window.ethereum` in `Shell.tsx` | Replace with typed viem connector layer |
| Portfolio/position projections | LIVE_PARTIAL | profile/read model routes | Connect real position/order projections and state recovery |
| Watchlist/notifications/competitions | TEST_ONLY | persistence helpers, fixture/test projections | Do not advertise until real event-backed state exists |
| Realtime SSE | LIVE_E2E | `apps/api/src/realtime.ts`, public SSE smoke | Add ordered dedupe client and universe events |
| Trader-first IA | NOT_IMPLEMENTED | rendered app has Command Center / Research-first sidebar | Rebuild around Markets, New, Watchlist, Portfolio, Activity |
| Responsive/mobile terminal | LIVE_PARTIAL | Gate 5 browser screenshots | Rebuild mobile market list/detail/trade sheet |
| README/product presentation | LIVE_PARTIAL | `README.md`, release docs | Replace gate history with product story, architecture, screenshots |

## Known P0/P1 failures

### P0

1. The normal market universe is one test canary with a dummy origin token.
2. The API is read-only; review cannot reach ERC-20 approval, vault deposit,
   PerpEngine order submission, keeper execution, or reconciled position state.
3. The pretrade UI does not construct or submit a complete immutable plan.
4. The read model collapses missing origin data into the Product canary and
   uses zero-valued provider primitives in adapter construction.

### P1

1. Spot liquidity is displayed as the same liquidity surface as Arc perp/LP
   state.
2. Search, filters, pagination and lifecycle categories operate over one row.
3. Product internals and stress language leak into primary trader navigation.
4. The handwritten wallet layer has no event subscriptions or transaction
   recovery model.
5. Existing feature-matrix rows call primitive/test paths `IMPLEMENTED`.

## Required truth rules

- `0` is rendered only when observed or deterministically derived.
- Missing provider evidence is `UNAVAILABLE`, `UNKNOWN`, `STALE`, or
  `CONFLICTED`; it is never coerced to zero or a green pass.
- A discovered origin token is not an Arc perp market.
- Product Testnet canary state is not origin-token spot data.
- `SUBMITTED` is never displayed as `EXECUTED`.
- No live user action is claimed until the chain receipt, keeper event, and
  indexer projection agree.

## Rebuild evidence plan

The rebuild will produce a real DexScreener-backed discovery snapshot under
`evidence/winner-rebuild/`, a durable universe reader, wallet/transaction unit
tests, browser screenshots, and a final classification update. External
providers without credentials remain explicitly unavailable.

## Rebuild result (local `winner-rebuild`)

The default application no longer renders the Product canary as the market
universe. A real DexScreener snapshot was captured on 2026-10-05 with 30
deduplicated origin markets across `SOLANA`, `BNB`, and `ROBINHOOD`. The API
reports `DISCOVERY_COUNT=30` and `ARC_PERP_COUNT=0`; every row is `ORIGIN ONLY`
until an actual Arc registration exists. The dummy token is absent from the
snapshot and normal discovery routes.

The rebuilt terminal has a dense trader-first market table, exact identity
search, chain/lifecycle/perp filters, a token detail terminal, compact Risk
Passport, truthful history states, Product/Stress proof separation, mobile
layout, API outage behavior, and a viem-based wallet write path for a real
registered perp. The immutable review guard compares account, market, action,
side, collateral, size, acceptable price, oracle sequence, rule version,
nonce, expiry, and plan hash before signing.

The wallet path is implemented against the frozen `approve → vault.deposit →
PerpEngine.submitOrder` ABI, but it is not claimed as live E2E for the newly
discovered origin universe because no discovered token is currently registered
as an Arc perp. That is an honest `LIVE_PARTIAL` boundary, not a fabricated
demo trade.

Validation evidence:

- `pnpm typecheck`: PASS
- `pnpm test`: 37 files / 159 tests PASS
- frontend unit tests: 4 files / 9 tests PASS
- frontend production build: PASS
- Playwright local Product API/browser suite: 14 tests PASS on desktop/mobile
- screenshots: `evidence/winner-rebuild/screenshots/`
