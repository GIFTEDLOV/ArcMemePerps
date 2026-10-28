# CLUSTER final hardening audit

**Audit date:** 2026-10-28
**Release result:** **NO-GO**
**UI preservation:** No stylesheet or design-token file was changed. Product text and unavailable/disabled behavior were corrected while keeping the existing page structure and styling.

## Scope and evidence

This pass reviewed the frontend trade, LP, wallet, discovery, profile, competition, and status paths; the eight contracts listed in the security matrix; keeper and release scripts; current production HTTP responses; and the Arc mainnet deployment manifest. It did not submit transactions, change governance, redeploy contracts, or deploy the frontend.

Live chain checks used `https://rpc.mainnet.arc.io` at block `28,285,202` on chain ID `5042`. All ten addresses in `evidence/mainnet/contracts.json` returned bytecode. All ten manifest deployment receipts returned status `0x1` and a contract address matching the manifest. This verifies deployment existence and receipt/address consistency; it does not verify bytecode against source or attest a third-party audit.

## Release-blocking findings

1. **Production API and SSE are unavailable at the configured origins.** `https://cluster-terminal.vercel.app/api/v1/markets`, `/api/v1/protocol/status`, and `/api/v1/stream` return the 754-byte frontend HTML document (`text/html`), not JSON or an event stream. The deployed JS bundle points to `https://api-production-0eb6.up.railway.app/api/v1`; its markets, protocol-status, and stream routes return HTTP 404. Production API data, event indexing, and SSE are therefore not verified.
2. **Mainnet bootstrap remains unfinished.** On Arc mainnet, both `PerpEngine.bootstrapFinalized()` and `PublicLPVault.bootstrapFinalized()` return false. Their owner bootstrap authority remains available. `PublicLPVault.publicLpActive()` is false. Do not enable trading or deposits until the deployment ceremony is safely completed and independently verified.
3. **No issued position IDs were observed.** `PerpEngine.nextPositionId()` returns `1`, which indicates no position has ever been assigned an ID in this deployment. `MarketRegistry` exposes keyed lookups but no enumeration getter; with the production API unavailable, this pass cannot establish the complete registered or qualified market set.
4. **Solidity build, tests, and formatting could not run.** Foundry (`forge`) is not installed on this workspace. `pnpm exec forge build`, `pnpm exec forge test`, and `pnpm exec forge fmt --check` each returned “Command forge not found.” Solidity changes therefore remain uncompiled and their new regression tests remain unexecuted here.

## Changes completed

- Removed local-only trade, LP deposit, balances, positions, activity, notification, leaderboard, and protocol-health claims from user-facing flows. Write controls are disabled behind explicit availability constants; the existing layout is retained.
- Normalized incomplete market provider data to unknown/unavailable values, applied timestamp freshness checks, and prevented provider qualification claims from authorizing a positive perp state.
- Restricted token import to Arc RPC metadata reads with non-empty `eth_getCode`; metadata is not treated as qualification, safety, or trading authorization.
- Made wallet identity depend on the injected wallet, removed email-derived identity and fake transaction results, and tested that the disabled order route sends no signing request.
- Corrected Arc's native USDC gas representation to 18 decimals while retaining 6 decimals for the ERC-20 USDC balance/allowance interface. Arc's [compatibility guide](https://www.arc.io/blog/arc-compatibility-guide-for-existing-evm-apps) documents the two interfaces.
- Capped aggregate LP withdrawal requests at the provider's share balance and added Solidity regression cases.
- Changed the keeper to read-only by default, require `--execute` plus `KEEPER_ENABLE_MAINNET_LIQUIDATIONS=true`, require a verified deployment and on-chain keeper role, scan bounded position-event pages, reconcile touched positions from chain, and require confirmed receipts plus post-write state reads before recording liquidations. The health endpoint remains degraded until the event index catches up.
- Replaced the scheduled keeper workflow with a manual read-only dry run and archived the checked-in market snapshot outside application imports.

## Verification results

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Passed |
| `pnpm lint` | Passed; one pre-existing unused `eslint-disable` warning in `packages/providers/src/alerts.ts` |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed: 50 files, 250 tests |
| `pnpm frontend:test` | Passed: 5 files, 14 tests |
| `pnpm frontend:build` | Passed; main JS bundle is 512.44 kB and triggers Vite's 500 kB advisory |
| `pnpm e2e` | Passed: 14/14 desktop and mobile checks; evidence in [CLUSTER_E2E_REPORT.md](CLUSTER_E2E_REPORT.md) |
| `git diff --check` | Passed |
| Foundry build/test/fmt | Not run: Foundry unavailable |
| Production API / SSE | Failed: documented routes return HTML or 404 |
| Mainnet writes | Not run by design |

## Decision

**NO-GO for trading, LP deposits, or a production-readiness claim.** The frontend now fails closed, but the deployed API/SSE is not serving its contract and the live contracts have not finalized bootstrap. The checked-in market mapping cannot be exhaustively enumerated through its current public getters, and Solidity checks remain blocked by missing Foundry. Reassess after the API is deployed and returns validated data, bootstrap is finalized through an approved ceremony, all market and role state is independently enumerated, and the full Solidity checks pass.
