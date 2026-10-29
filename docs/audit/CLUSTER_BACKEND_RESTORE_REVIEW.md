# CLUSTER backend restore review

- Review date: 2026-10-29
- Railway host: `https://api-production-0eb6.up.railway.app`
- Read-only Vercel API: `https://cluster-readonly-api.vercel.app`
- Exact-head API preview: `https://cluster-readonly-8vqk7zas1-kolofahkelvin16-6437s-projects.vercel.app`

## Root cause of the Railway 404

At approximately 2026-10-29 13:36 UTC, `GET /api/v1/markets` on Railway returned HTTP 404 with `x-railway-fallback: true`. This is Railway's platform fallback response, not an application route returning 404; no healthy application deployment was serving the request.

The latest inspected Railway deployment (`9dcfac24-4182-4310-9e8b-bd9331183f0d`, created 2026-10-05) failed during image build. Its build logs show `node:20-bookworm-slim` running the repository's pinned `pnpm@11.0.9`; pnpm 11 requires Node `>=22.13.0` and attempted to load the unavailable `node:sqlite` built-in under Node 20. The install terminated before the app command ran. The failed build therefore explains why the routes were unreachable. A previous keeper-oriented start command was also corrected in source; it was not the immediate cause of this deployment's platform fallback because the build did not reach startup.

## Source and configuration state

- The current Railway source configuration in PR #2 uses `Dockerfile` and `scripts/product-release-service.ts`, serves `/health`, and keeps the signer worker out of the public API process.
- The Dockerfile now starts from `node:22-bookworm-slim`; `railway.toml` starts the read-only Product API and checks `/health`.
- PR #4 raises the root Node engine floor from `>=22.5.0` to `>=22.13.0`, matching the pinned package manager's runtime requirement. This is a source/runtime compatibility correction; it does not redeploy Railway.
- Railway environment configuration and the `/data` volume were inspected read-only. No secrets or values are included here. No build, deploy, restart, billing change, or volume operation was performed.

## Exact-head route and verification checks

At 2026-10-29 14:01 UTC, the Vercel frontend preview was READY at `ac2d53207c78ce1f64b642e32fc5ce2c3a16addb`; the last successful versioned API preview was READY at `90d4f0044e0b4247241e83efdf5959c20bae1161`. Vercel skipped a redundant API deployment for `ac2d532` because that commit changed no API files; API runtime source is unchanged between the two commits.

| Route                                           | Result                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/markets?limit=5`                   | HTTP 200 JSON, schema `v1`, `READ_ONLY_DISCOVERY`, 5 returned of 29 discovered and 26 currently observed; qualification inventory `UNVERIFIED`.                                                                                                                                               |
| `GET /api/v1/protocol/status`                   | HTTP 200 JSON; chain ID 5042, read-only true, trading false, LP deposits false, indexer `UNAVAILABLE_NO_PERSISTENT_INDEXER`, SSE `HEARTBEAT_ONLY`.                                                                                                                                            |
| `GET /api/v1/stream`                            | HTTP 200 `text/event-stream`; it emitted `retry: 15000` and `: read-only heartbeat; no indexed events`; no protocol event was emitted.                                                                                                                                                        |
| `GET /api/v1/verification/markets` for Arc USDC | HTTP 200, `BLOCKED` negative canary, pinned to block `28,486,255` / hash `0x6c75530a6b336c2be00a6de4dd8506d082cd2f7430ae09818145d4aaad451384`, method `DUAL_RPC_EIP1898_BLOCK_HASH`, four configured RPC sources, `marketRegistered=FAIL`. No positive qualified market was found or claimed. |
| Railway `GET /api/v1/markets`                   | HTTP 404 with `x-railway-fallback: true`; no running application handled the route.                                                                                                                                                                                                           |

The Vercel API returns external discovery records. It does not establish a complete canonical market inventory, qualification, oracle independence, event history, or production backend restoration. The heartbeat is an open SSE connection, not a real-time protocol event feed.

## Persistent-indexer alternatives

The provider evaluation is in [CLUSTER_INDEXING_PROVIDER_EVALUATION_2026-10-29.md](CLUSTER_INDEXING_PROVIDER_EVALUATION_2026-10-29.md). Arc is available to The Graph Subgraph Studio, but decentralized Arc subgraph indexing is not guaranteed and the development endpoint is limited to 3,000 queries/day. The Graph Market lists Arc full-archive Substreams providers, but no CLUSTER API key, price/credit allowance, database, or deployed worker was available to verify sustainable operation. Vercel Hobby cron and Render's free instances do not provide a continuous indexer with durable storage.

No no-billing persistent indexer has been proven and provisioned for this project. The read-only API works as a fallback. Group B remains **FAIL** until an Arc-compatible event source and persistent store/worker are configured, backfill and reorg behavior are tested, real event queries are verified, and SSE delivers events backed by indexed receipts.

## Scope limits and next steps

No Railway or production deploy was made. Railway billing is not a release prerequisite. Remaining external requirements are an approved non-Railway persistent worker/database plan, provider credentials and verified service terms, and an authorized non-production provisioning path if a paid resource is selected. Until then, the service must continue to say that history and indexed events are unavailable. Trade execution and LP deposits remain disabled.
