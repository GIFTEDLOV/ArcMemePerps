# CLUSTER — Vercel read-only fallback deployment (2026-10-29)

## Scope

Railway API deployment remained unavailable because Railway reported the account's trial had expired; no Railway plan was activated. The approved alternative is **Vercel**. No financial operation, contract write, keeper activation, LP deposit, transaction signing, contract deployment, or production Mainnet claim occurred.

- **Hardened frontend:** https://cluster-hackathon-preview.vercel.app
- **Read-only API:** https://cluster-readonly-api.vercel.app
- **Source:** `deploy/vercel-readonly-api-2026-10-29`, based on reviewed PR #2 commit `979548593ceaca07e8685f8537f90d3b8cc59c2b`
- **API fallback source:** `apps/cluster-api-vercel`
- **API code revision:** `434512a2e0f01865172b9c341e5ca82fa36db6ce`
- **Vercel API release:** `dpl_6iDSMntM37jAaQwgbyHvoVurwxvq` (READY)
- **Vercel frontend release:** `dpl_oHibLWrLd6gWLtbcCufp3VhEUzRR` (READY)

## Verified Vercel HTTP endpoints

| Endpoint | Status | Evidence |
|---|---|---|
| GET `https://cluster-readonly-api.vercel.app/health` | 200 | JSON `readOnly=true`, `storage=STATELESS` |
| GET `https://cluster-readonly-api.vercel.app/api/v1/markets?limit=1` | 200 | Live DEX Screener observation; includes source and freshness |
| GET `https://cluster-readonly-api.vercel.app/api/v1/markets/search?q=nonexistentreally123` | 200 | Empty results; no fabricated token |
| GET `https://cluster-readonly-api.vercel.app/api/v1/protocol/status` | 200 | Arc Mainnet RPC chain ID 5042 and deployed code presence read; `tradingEnabled=false` and `lpDepositsEnabled=false` |
| GET `https://cluster-readonly-api.vercel.app/api/v1/stream` | 200 | `text/event-stream`; heartbeat comments only, no fake protocol events |
| GET `https://cluster-hackathon-preview.vercel.app/` | 200 | Vite app HTML |
| GET `https://cluster-hackathon-preview.vercel.app/markets` | 200 | SPA routing returns app HTML |
| GET `https://cluster-hackathon-preview.vercel.app/earn` | 200 | SPA routing returns app HTML |

The deployed frontend JS contains `VITE_API_URL` pointing at the Vercel API, and does not contain the prior Railway URL. Trading/LP client write gates remain false. Original frontend styling, design tokens, and the preexisting live deployment were left unchanged.

## What the fallback cannot do

- **No continuous indexer or persistent database.** Vercel Functions are stateless; the Railway SQLite data volume was not migrated. Current DEX Screener discovery is **not** a complete indexed market universe.
- **No actual trade/fill SSE.** Stream is transport heartbeats only; no persistent event sequence. It must not be marketed as live trade streaming.
- **No financial read-model completeness.** Positions, wallet balances, qualification, fees, reserves, PnL, historic events, and perpetual market inventory are **not** comprehensively reconciled by this API.
- **No LP economic integration.** Mainnet PublicLPVault and MarginVault are separate; an audited migration and governance approvals are still required. The source-level withdrawal-queue fix in PR #2 has not modified Mainnet bytecode.
- **Mainnet readiness remains NO-GO for trading, liquidity deposits, or release claims.** A read-only market-discovery demo is suitable only when these restrictions are clear.
- **No independent browser verification** of the new Vercel-hosted frontend was performed in this pass: HTTP routes and bundled JS were inspected. Use the existing Codex Playwright baseline for local UI comparisons and run browser tests against the new stable URL before final submission.

## Release decision

**GO for a labeled read-only discovery preview. NO-GO for real-money perpetual trading, LP deposits, claims of on-chain qualification, or a full live-product submission.**

Official Vercel platform limits: https://vercel.com/kb/guide/is-sqlite-supported-in-vercel and https://vercel.com/docs/functions/runtimes. DEX discovery source: https://docs.dexscreener.com/api/reference.
