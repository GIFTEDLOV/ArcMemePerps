# CLUSTER autopilot progress

Review date: 2026-10-29 (UTC)
Repository: https://github.com/GIFTEDLOV/ArcMemePerps

## Safety and branch state

- The user's dirty `winner-rebuild` worktree was not modified.
- PR #2 and PR #3 remain draft and preserve their dependency (`#3` targets the PR #2 branch). No PR was merged.
- No production deployment, alias change, contract deployment, wallet funding, governance write, or financial transaction was performed.
- Trading and LP deposits remain disabled in the frontend/API preview. Testnet's existing PublicLPVault contract flag is active; the read-only audit did not change it.

## Group A - canonical Arc market verification

**Status: UNKNOWN** - exact-head code checks pass, but no positive registered/qualified Mainnet market canary or complete independently reconciled universe was established.

- Branch/PR: `codex/cluster-group-a-verification`, draft [PR #4](https://github.com/GIFTEDLOV/ArcMemePerps/pull/4), base `deploy/vercel-readonly-api-2026-10-29` (PR #3).
- Exact head: `ac2d53207c78ce1f64b642e32fc5ce2c3a16addb`.
- Exact-head GitHub CI: [run 40886934646](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40886934646), PASS (lint, typecheck, unit tests, frontend build, Foundry build/test/format).
- Local results: `pnpm typecheck` PASS; `pnpm test` PASS (53 files, 268 tests); `pnpm lint` PASS with the existing unused-disable warning in `packages/providers/src/alerts.ts:201`; `pnpm frontend:build` PASS with the existing bundle-size advisory; serial Playwright PASS (17 passed, 1 expected project-specific skip); live no-mock preview Playwright PASS (6/6, desktop/mobile).
- Visual comparison: landing, markets, market detail, portfolio, and earn at 1440x900 and 390x844 against the pre-hardening build showed no layout/design regression. CSS, tokens, assets, and component design were not changed. The intentional removal of unsupported financial claims is covered by UI regression captures.
- Negative Mainnet canary: Arc USDC ID is `BLOCKED` at block `28,486,255` / hash `0x6c75530a6b336c2be00a6de4dd8506d082cd2f7430ae09818145d4aaad451384`; `marketRegistered=FAIL`. This is not a positive canary.
- Frontend preview: `https://cluster-hackathon-preview-4j3j5e2l4.vercel.app`, READY at exact head `ac2d53207c78ce1f64b642e32fc5ce2c3a16addb` (`dpl_F5AXUiYS6e1EjTDHv24VbvQtYjm9`).
- API preview used for the original no-mock run: `https://cluster-readonly-8vqk7zas1-kolofahkelvin16-6437s-projects.vercel.app`, READY at API source `90d4f0044e0b4247241e83efdf5959c20bae1161` (`dpl_DsqmkQvAuNC6mptAp1WpqMTJDE7T`). Vercel skipped a duplicate API deployment at `ac2d532` because no API project source changed.
- PR #2 merge-readiness remains **NO-GO** until stack-level reviews and the backend, persistence, economic integration, security, and live verification blockers are resolved.

## Group B - persistent indexing, history, oracle provenance, and event stream

**Status: FAIL** - the public read-only API is reachable, but persistent event indexing, reconstructable history, independent oracle evidence, and event-backed SSE are not deployed or verified.

- Branch/PR: `codex/cluster-group-b-readiness`, draft [PR #5](https://github.com/GIFTEDLOV/ArcMemePerps/pull/5), based on PR #4. Exact source head: `328c70d7c642be33f46d2428e11e4cb1a1987b3b`.
- Exact-head GitHub CI: [run 40888259409](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40888259409) and [run 40888269073](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40888269073), both PASS through lint, typecheck, unit/frontend tests/build, `forge build`, `forge test`, and `forge fmt --check`.
- Railway endpoint `https://api-production-0eb6.up.railway.app/api/v1/markets` returns platform HTTP 404 with `x-railway-fallback: true`. The latest deployment failed before application startup: the image used Node 20 with pnpm 11, which requires Node >=22.13 and uses `node:sqlite`. PR #2's Dockerfile now uses Node 22; no Railway deploy or billing operation was run.
- Exact-branch frontend preview: `https://cluster-hackathon-pre-git-11a671-kolofahkelvin16-6437s-projects.vercel.app`, READY. Exact-branch API preview: `https://cluster-readonly-api-git-70bed4-kolofahkelvin16-6437s-projects.vercel.app`, READY. The PR #5 Vercel preview projects are non-production previews.
- Live API at 2026-10-29 14:08:58 UTC: `GET /api/v1/markets?limit=5` HTTP 200 JSON, five items returned, 30 discovered and 28 currently observed; qualification inventory `UNVERIFIED`. `GET /api/v1/protocol/status` HTTP 200, chain 5042, read-only true, trading false, LP deposits false, indexer `UNAVAILABLE_NO_PERSISTENT_INDEXER`, SSE `HEARTBEAT_ONLY`. `GET /api/v1/stream` HTTP 200 `text/event-stream`; it emits a retry line and a heartbeat comment, with no `data:` event.
- Live no-mock Playwright against the exact PR #5 frontend and API previews: **6/6 PASS**, desktop and mobile. It confirms the truthful unavailable states; it does not prove persistence or trading.
- Existing SQLite-backed indexer and read-only Product service sources are present, but the deployed Vercel fallback has no durable DB/worker. No non-Railway provider, persistent database, worker credential, or sustainable no-billing event source was provisioned or verified.
- Reports: [backend restore review](CLUSTER_BACKEND_RESTORE_REVIEW.md), [live endpoint verification](CLUSTER_LIVE_ENDPOINT_VERIFICATION_2026-10-29.md), and [provider evaluation](CLUSTER_INDEXING_PROVIDER_EVALUATION_2026-10-29.md).

## Remaining groups

- Group C - **UNKNOWN / not yet reviewed in this progress checkpoint**: live settlement and keeper behavior still require source-level audit, full index readiness, and permitted Testnet receipt evidence. No financial transaction is authorized or performed.
- Group D - **UNKNOWN / not yet reviewed in this progress checkpoint**: the existing PublicLPVault is not connected to PerpEngine settlement. A separate audit/implementation plan will preserve the current contracts and require explicit invariants and migration review.
- Group E - **UNKNOWN / not yet reviewed in this progress checkpoint**: preview UI/browser checks pass, while durable backend integration, governance verification, and full source-to-production parity remain incomplete.
- Group F - **FAIL** for present submission timing: the reviewed Arc Microgrants and Programmable Money Hackathon windows have closed; the truthful submission report is prepared, but no current open program is verified. Independent security audit and live financial gates also remain incomplete.

## Decisions and next steps

- Hackathon submission: **NO-GO today**; the named programs are closed and the preview is not a live Mainnet perpetual product.
- Live financial production: **NO-GO**; governance bootstrap, positive market/oracle qualification, keeper/index completeness, trade receipt evidence, and integrated LP solvency are not established.
- Next: review Group C trading and keeper sources/tests, record the actual Mainnet and Product Testnet ledger state, and continue Groups D-F without production financial actions.
