# Arc Mainnet durable indexer — implementation and deployment boundary

The read-only Vercel API remains stateless. The new `apps/indexer` worker reads Arc Mainnet and commits raw contract logs, decoded projections, contiguous ranges, an event outbox, and a checkpoint to **PostgreSQL**. A separate always-on container/VM runs `pnpm --filter @arcmemeperps/indexer arc:backfill --loop`. This architecture needs no Railway service. The container recipe is `apps/indexer/Dockerfile`; it is not deployed by this PR.

## Configuration

- `DATABASE_URL`: durable Postgres connection for the worker, with TLS and migration rights. Required.
- `ARC_INDEX_RPC_PRIMARY`: Arc Mainnet historical RPC; defaults to `https://rpc.mainnet.arc.io`.
- `ARC_INDEX_RPC_SECONDARY`: independently operated historical Arc RPC. Without it, ranges are persisted as single-source and **cannot satisfy full coverage acceptance**.
- `ARC_INDEX_DATABASE_URL`: read-only Postgres connection for the Vercel API. Grant `SELECT` on index tables only, use provider TLS, and keep the value secret. The API continues truthful unavailable status when absent.
- `ARC_INDEX_TEST_DATABASE_URL`: isolated disposable Postgres database for integration tests. CI uses a local Postgres 16 service; never point this at a production database because the test truncates tables.

The operator must verify provider archive retention, quotas, cost, independent ownership, database backup/restore, and container uptime before provisioning a paid service. No credential, database, worker, preview, or production deployment was created by the implementation. [Provider evaluation](audit/CLUSTER_INDEXING_PROVIDER_EVALUATION_2026-10-29.md) records the current candidate and unknowns.

## Reproducible read-only commands

```text
pnpm exec tsx scripts/arc-index-source-probe.ts
pnpm --filter @arcmemeperps/indexer arc:backfill
pnpm --filter @arcmemeperps/indexer arc:backfill --loop
```

`arc:backfill` applies idempotent SQL migrations and processes at most 100 bounded windows per invocation. Each window begins at the earliest exact deployment receipt block (27,246,890), filters the ten deployed protocol addresses at their respective receipt blocks, and ends below a 64-block finality buffer. It compares two RPCs when configured and requires every observed transaction's successful receipt to match its logs and block hash. RPC range failures halve the window down to one block. A range's events, decoded events, outbox, and checkpoint commit in one Postgres transaction under an advisory lock. Restart resumes at the next block; a changed canonical checkpoint hash rewinds committed ranges and their cascaded events before replay. `arc_index_ranges` exposes gaps, single-source ranges, and count coverage.

## Limits and release gates

- A provider returning identical but incomplete empty ranges can evade a single-source check. Full coverage requires an independent historical source and parity checks; no `SYNCED` claim is emitted by this code.
- Contract events alone cannot prove USDC cash movement or independent execution-oracle observations. The raw journal is a foundation for pinned-block custody reconciliation and authenticated source-evidence ingestion; those acceptance gates remain open.
- The Vercel API exposes `GET /api/v1/index/status`, `GET /api/v1/index/markets`, and receipt-backed outbox SSE only after a database connection is configured. Current public deployment still has heartbeat-only SSE. Outbox event IDs support replay; frontend reconnects with `?after=<id>`. All trading and LP write paths remain disabled.
- A reorg may invalidate events already delivered to clients. Consumers must refresh state after a reconnect; an explicit reorg notification and finality proof are still required for a production event feed.
- Treat historical `eth_getLogs` and receipt responses as read-only source evidence, not proof that the entire deployment-to-head range was ingested. No production aliases or contracts change with this implementation.

## Stacked read-model and oracle-evidence implementation

Migration `003_arc_read_models.sql` derives registered markets, latest market/qualification/risk/oracle events, position size changes, and per-contract financial event totals from committed decoded receipts. `GET /api/v1/index/markets`, `/index/positions`, `/index/financial-totals`, and `/index/activity?category=...` return those event-derived records with explicit incomplete verification state. Amounts are separated by contract and event; they are **not** summed into a claimed USDC cash balance. The index intentionally does not ingest Arc native transfer and ERC-20 transfer as two credits for the same USDC movement.

`apps/indexer/src/oracle-evidence.ts` independently decodes `setSignedReport` calldata and checks the existing EIP-712 digest/signatures, reporter threshold and version, event sequence, expiry, source counts, confidence, price band, source-family independence, and a deterministic observation-root proposal. It never returns qualification-ready: authenticated source responses, pinned historical reporter roles and risk state, and the deployed producer's actual evidence-root convention are still missing. The current Testnet product worker derives its root from an onchain-baseline string, not independently observed prices; that is not qualifying oracle evidence.
