# CLUSTER backend restore review

**Review date:** 2026-10-28
**Configured backend:** `https://api-production-0eb6.up.railway.app/api/v1`
**Source target:** Arc Testnet Product deployment, chain ID `5042002`

## Diagnosis

The Railway configuration and `Procfile` started `pnpm keeper:daemon`. That process is the keeper worker, not the API server, so it never registered `/api/v1/markets`, `/api/v1/protocol/status`, or `/api/v1/stream`. During this review the public host returned Railway's edge fallback `Application not found` (`x-railway-fallback: true`), which indicates the request did not reach an application route. The current response is therefore not evidence of an app-level 404.

## Source/configuration changes

- Changed Railway and Procfile startup to `scripts/product-release-service.ts`, which launches only the read-only HTTP API and indexer.
- Added `/health` for Railway's liveness probe, made protocol status read current runtime health, and made SSE send an initial connection comment and periodic keepalives.
- Loaded chain, addresses, start block, and market ID from the checked-in Product deployment manifest. Optional identity overrides must match that manifest. Startup verifies chain ID and contract bytecode; market reads verify the registered MarketRegistry identity and origin.
- Removed fabricated market metadata, liquidity, source identities, user profiles, leaderboards, and notification recipients. Missing enrichment remains unavailable, and stale/missing oracle or qualification evidence blocks tradability.
- Kept signer workers out of the public service. The existing worker can republish the last oracle value without fetching independent market data, so it must not be treated as a current-data feed.

## Local live smoke result

The revised service was run against the configured Arc Testnet RPC and manifest, with a fresh temporary SQLite database. `/health`, `/api/v1/markets`, and `/api/v1/protocol/status` returned HTTP 200; the market response came from the deployed MarketRegistry record, the protocol payload reported chain ID `5042002`, and `/api/v1/stream` returned `text/event-stream` with an initial connection frame and a live market snapshot. The observed market was marked `STALE` and `BLOCKED` because the oracle report was stale. Protocol status reported indexer backfill as degraded/incomplete. RPC rate limiting occurred during repeated state reads, and the service retries those reads; this smoke test does not establish sustained provider capacity.

## Deployment boundary

The Railway connector required reauthentication during this review, so the remote service configuration, variables, logs, deployment state, volume, and custom-domain attachment could not be inspected or changed. No deployment was made. The public Railway host still returns `Application not found`; public endpoint restoration is unverified and incomplete until the existing service is reauthenticated, inspected, and deployed with this source/configuration.

The manifest and smoke test target Arc Testnet. They do not establish Arc Mainnet market data or readiness. Mainnet trading and LP deposits remain blocked by unfinished bootstrap and stale/unverified production API state. See [CLUSTER_FINAL_AUDIT.md](CLUSTER_FINAL_AUDIT.md) and [CLUSTER_RELEASE_READINESS.md](CLUSTER_RELEASE_READINESS.md).
