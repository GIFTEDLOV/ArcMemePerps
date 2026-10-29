# CLUSTER index status truthfulness follow-up — 2026-10-29

## Finding

`mainnetIndexerStatus()` reported `SYNCED` when Mainnet deployment metadata and a start block existed, even with a null checkpoint. A saved checkpoint also cannot prove contiguous coverage, finality, absence of gaps, or a current head. The local production service independently supplied zero registered/live market counts and `OPERATIONAL` health states without a complete index, reporter evidence, keeper continuity, or an RPC probe.

## Source correction

- Deployment metadata now yields an `INCOMPLETE` index lifecycle. It never establishes `SYNCED` from a checkpoint alone.
- A deployed contract set without an observed live-market count reports `DEPLOYED_MARKETS_UNVERIFIED`. The existing `DEPLOYED_ZERO_MARKETS` state requires an explicit observed zero.
- The versioned API omits registered/live market counts when they are unknown. The local production service no longer inserts zeroes for those fields.
- The local service reports unavailable RPC, indexer, reporter, keeper, and event-source health until those components are actually checked. A retained discovery snapshot is marked stale.

These changes keep GET-only routes and financial writes disabled. They do not attest a canonical market count or provide a persistent index, transaction history, oracle evidence, or event-backed SSE.

## Verification

- Focused indexer and API tests: 2 files, 11 tests passed before the shared lifecycle follow-up.
- Full `pnpm test` after the complete change: 54 files, 280 tests passed.
- `pnpm typecheck`: passed.
- The PR's final commit and GitHub CI are linked from the draft PR and progress report after verification.

## Remaining Group B gate

Group B remains **FAIL**. A non-Railway durable worker and store, authenticated Arc event source, deployment-block backfill, gap/reorg/restart proof, direct contract reconciliation, independent oracle evidence, and SSE events backed by indexed receipts remain necessary. No external service or financial action was started.
