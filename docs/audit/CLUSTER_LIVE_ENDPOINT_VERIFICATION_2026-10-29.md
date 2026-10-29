# CLUSTER live endpoint verification

- Observed: 2026-10-29 14:01 UTC
- Frontend checkpoint: `ac2d53207c78ce1f64b642e32fc5ce2c3a16addb`
- Frontend preview: https://cluster-hackathon-preview-4j3j5e2l4.vercel.app
- Versioned API source checkpoint: `90d4f0044e0b4247241e83efdf5959c20bae1161`
- Versioned API preview: https://cluster-readonly-8vqk7zas1-kolofahkelvin16-6437s-projects.vercel.app
- Frontend-configured API origin: https://cluster-readonly-api-kolofahkelvin16-6437s-projects.vercel.app
- Stable API alias: https://cluster-readonly-api.vercel.app

Vercel reports the preview frontend READY at deployment `dpl_F5AXUiYS6e1EjTDHv24VbvQtYjm9`, exact source SHA `ac2d53207c78ce1f64b642e32fc5ce2c3a16addb`. The versioned read-only API is READY at `dpl_DsqmkQvAuNC6mptAp1WpqMTJDE7T`, source SHA `90d4f0044e0b4247241e83efdf5959c20bae1161`. Vercel skipped a redundant API deployment for `ac2d532` because that commit changed no API files (the deployment reports its documented monorepo unaffected-project skip). API runtime code is unchanged between those commits.

## HTTP checks

| Request                                                                                                                | Result                               | Payload evidence                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versioned preview `GET /api/v1/markets?limit=5`                                                                        | HTTP 200, JSON                       | schema `v1`; mode `READ_ONLY_DISCOVERY`; 5 records returned from 29 discovered, 26 currently observed; qualification inventory `UNVERIFIED`.                                                                                                                           |
| Versioned preview `GET /api/v1/protocol/status`                                                                        | HTTP 200, JSON                       | chain ID 5042; read-only true; trading false; LP deposits false; indexer `UNAVAILABLE_NO_PERSISTENT_INDEXER`; SSE `HEARTBEAT_ONLY`.                                                                                                                                    |
| Versioned preview `GET /api/v1/stream`                                                                                 | HTTP 200, `text/event-stream`        | `retry: 15000` and `: read-only heartbeat; no indexed events`; no `data:` protocol event. The bounded `curl --max-time 2` ended after the heartbeat as expected.                                                                                                       |
| Versioned preview `GET /api/v1/verification/markets?chain=ARC&tokenAddress=0x3600000000000000000000000000000000000000` | HTTP 200, JSON                       | Negative canary `BLOCKED`; method `DUAL_RPC_EIP1898_BLOCK_HASH`; block `28,486,255`, hash `0x6c75530a6b336c2be00a6de4dd8506d082cd2f7430ae09818145d4aaad451384`; four configured RPC sources; `marketRegistered=FAIL`. This does not prove a positive/qualified market. |
| Stable API alias `GET /api/v1/markets?limit=1`                                                                         | HTTP 200                             | Returned one market record; route is live but not a complete or persistent index.                                                                                                                                                                                      |
| Frontend-configured API project alias                                                                                  | HTTP 200                             | The browser preview requested `/api/v1/markets` from this project-level origin. It is distinct from the versioned deployment URL used for direct endpoint tests.                                                                                                       |
| Railway `GET /api/v1/markets`                                                                                          | HTTP 404, `x-railway-fallback: true` | Railway platform fallback; no running application handled the route.                                                                                                                                                                                                   |

## Browser evidence

The live Playwright run passed 6/6 desktop/mobile checks with no API route mocks against the exact `ac2d532` frontend preview and the unchanged `90d4f00` API preview. It validates actual market/status payloads, heartbeat-only SSE, the frontend-configured API origin, disabled trading/deposit controls, and mobile horizontal overflow. Screenshots are in `evidence/e2e/live-preview/`.

Visual comparison screenshots are in `evidence/ui-regression/before/` and `evidence/ui-regression/after/`. Those use a fixed visual-only fixture and do not prove market values.

## Release interpretation

Market discovery is live external data for read-only display. It is not a complete canonical inventory, contract qualification, independent execution-oracle evidence, event history, or proof of trade settlement. SSE connects but does not yet carry indexed protocol events. Trading and LP deposits remain disabled. No production alias, Railway deployment, contract, governance state, or wallet was changed.
