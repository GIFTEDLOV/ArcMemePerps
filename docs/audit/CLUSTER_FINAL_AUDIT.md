# CLUSTER final hardening audit

**Audit date:** 2026-10-28
**Release result:** **NO-GO**
**UI preservation:** No stylesheet or design-token file was changed. Product text and unavailable/disabled behavior were corrected while keeping the existing page structure and styling.

## Scope and evidence

This pass reviewed the frontend trade, LP, wallet, discovery, profile, competition, and status paths; the eight contracts listed in the security matrix; keeper and release scripts; current production HTTP responses; and the Arc mainnet deployment manifest. It did not submit transactions, change governance, redeploy contracts, or deploy the frontend.

Live chain checks used `https://rpc.mainnet.arc.io` at block `28,285,202` on chain ID `5042`. All ten addresses in `evidence/mainnet/contracts.json` returned bytecode. All ten manifest deployment receipts returned status `0x1` and a contract address matching the manifest. This verifies deployment existence and receipt/address consistency; it does not verify bytecode against source or attest a third-party audit.

## Release-blocking findings

1. **Production API and SSE are unavailable at the configured origins.** The Vercel API paths return frontend HTML, not JSON or an event stream. The Railway host now returns the Railway edge fallback `Application not found` for `/api/v1/markets`; no app-level routes or SSE handler are reached. The service source and launch configuration were corrected and smoke-tested locally against Arc Testnet, but Railway access was unauthenticated during this review and no remote deployment was made. Production API data, event indexing, and SSE remain unverified.
2. **Mainnet bootstrap remains unfinished.** On Arc mainnet, both `PerpEngine.bootstrapFinalized()` and `PublicLPVault.bootstrapFinalized()` return false. Their owner bootstrap authority remains available. `PublicLPVault.publicLpActive()` is false. Do not enable trading or deposits until the deployment ceremony is safely completed and independently verified.
3. **No issued position IDs were observed.** `PerpEngine.nextPositionId()` returns `1`, which indicates no position has ever been assigned an ID in this deployment. `MarketRegistry` exposes keyed lookups but no enumeration getter; with the production API unavailable, this pass cannot establish the complete registered or qualified market set.

## Changes completed

- Removed local-only trade, LP deposit, balances, positions, activity, notification, leaderboard, and protocol-health claims from user-facing flows. Write controls are disabled behind explicit availability constants; the existing layout is retained.
- Normalized incomplete market provider data to unknown/unavailable values, applied timestamp freshness checks, and prevented provider qualification claims from authorizing a positive perp state.
- Restricted token import to Arc RPC metadata reads with non-empty `eth_getCode`; metadata is not treated as qualification, safety, or trading authorization.
- Made wallet identity depend on the injected wallet, removed email-derived identity and fake transaction results, and tested that the disabled order route sends no signing request.
- Corrected Arc's native USDC gas representation to 18 decimals while retaining 6 decimals for the ERC-20 USDC balance/allowance interface. Arc's [compatibility guide](https://www.arc.io/blog/arc-compatibility-guide-for-existing-evm-apps) documents the two interfaces.
- Capped aggregate LP withdrawal requests at the provider's share balance and added Solidity regression cases.
- Changed the keeper to read-only by default, require `--execute` plus `KEEPER_ENABLE_MAINNET_LIQUIDATIONS=true`, require a verified deployment and on-chain keeper role, scan bounded position-event pages, reconcile touched positions from chain, and require confirmed receipts plus post-write state reads before recording liquidations. The health endpoint remains degraded until the event index catches up.
- Replaced the scheduled keeper workflow with a manual read-only dry run and archived the checked-in market snapshot outside application imports.
- Restored the Railway start command to launch the read-only market API rather than the keeper daemon, added a liveness route, dynamic protocol status, SSE connect/keepalive frames, and deployment-manifest-backed configuration. The read-only public service does not start signer workers.
- Removed fabricated Product market identity, pool/liquidity, source, user, leaderboard, and notification data from the live backend projection. Registered market origin and identity are read from MarketRegistry; missing oracle/qualification evidence leaves the market blocked.
- Locally smoke-tested `/health`, `/api/v1/markets`, `/api/v1/protocol/status`, and `/api/v1/stream` against Arc Testnet. The returned registry market is marked blocked because its oracle is stale; the indexer reports degraded while historical backfill is incomplete. RPC rate limits were observed during repeat state reads.

## Verification results

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Passed |
| `pnpm lint` | Passed; one pre-existing unused `eslint-disable` warning in `packages/providers/src/alerts.ts` |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed: 50 files, 252 tests |
| `pnpm frontend:test` | Passed: 5 files, 14 tests |
| `pnpm frontend:build` | Passed; main JS bundle is 512.44 kB and triggers Vite's 500 kB advisory |
| `pnpm e2e` | Passed: 13 passed, 0 failed, 1 expected project-specific skip; evidence in [CLUSTER_E2E_REPORT.md](CLUSTER_E2E_REPORT.md) |
| `git diff --check` | Passed |
| Foundry build/test/fmt | Passed in PR CI run 56 on the current Solidity tree; local Foundry unavailable. CI for this review commit is pending. |
| Local Testnet API / SSE | Passed route smoke: health, registry-backed market/status, and initial SSE frame. Data is stale/degraded and not production readiness evidence. |
| Public Railway API / SSE | Failed: Railway edge responds `Application not found`; authenticated service inspection/deployment unavailable |
| Mainnet writes | Not run by design |

## Decision

**NO-GO for trading, LP deposits, or a production-readiness claim.** The frontend fails closed, the public Railway deployment is unavailable, the local Testnet oracle is stale and indexer degraded, and the live Mainnet contracts have not finalized bootstrap. The checked-in market mapping cannot be exhaustively enumerated through its current public getters. Reassess after the API is deployed and returns validated data, bootstrap is finalized through an approved ceremony, all market and role state is independently enumerated, and CI passes on the exact proposed commit.
