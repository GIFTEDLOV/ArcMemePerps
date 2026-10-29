# CLUSTER autopilot progress

Review date: 2026-10-29 (UTC)
Repository: https://github.com/GIFTEDLOV/ArcMemePerps

## Safety and branch state

- The user's dirty `winner-rebuild` worktree was not modified.
- PR #2 through #10 remain drafts. The stack is PR #3 -> PR #2, #4 -> #3, #5 -> #4, #6 -> #5, #7 -> #6, #8 -> #7, #9 -> #8, and #10 -> #9. No PR was merged.
- No production deployment, alias change, contract deployment, wallet funding, governance write, or financial transaction was performed.
- Trading and LP deposits remain disabled in the frontend/API preview. Product Testnet's existing PublicLPVault contract flag is active; the read-only audit did not change it.

## Group A - canonical Arc market verification

**Status: UNKNOWN** - exact-head code checks pass, but no positive registered/qualified Mainnet market canary or complete independently reconciled market universe was established.

- Branch/PR: `codex/cluster-group-a-verification`, draft [PR #4](https://github.com/GIFTEDLOV/ArcMemePerps/pull/4), based on PR #3.
- Exact source head: `ac2d53207c78ce1f64b642e32fc5ce2c3a16addb`.
- Exact-head GitHub CI: [run 40886934646](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40886934646), PASS (lint, typecheck, unit tests, frontend build, Foundry build/test/format).
- Local: `pnpm typecheck` PASS; `pnpm test` PASS (53 files, 268 tests); `pnpm lint` PASS with an existing unused-disable warning in `packages/providers/src/alerts.ts:201`; `pnpm frontend:build` PASS with an existing bundle-size advisory; serial Playwright PASS (17 passed, one expected project-specific skip); no-mock live Playwright PASS (6/6).
- Visual comparison of landing, markets, market detail, portfolio, and earn at desktop 1440x900 and mobile 390x844 showed no layout/design regression against the pre-hardening build. CSS, tokens, assets, and component design were not changed.
- Negative Mainnet canary: Arc USDC market ID is `BLOCKED` at block `28,486,255` / hash `0x6c75530a6b336c2be00a6de4dd8506d082cd2f7430ae09818145d4aaad451384`; `marketRegistered=FAIL`. No positive canary is claimed.
- Frontend preview: `https://cluster-hackathon-preview-4j3j5e2l4.vercel.app`, READY at exact source head `ac2d53207c78ce1f64b642e32fc5ce2c3a16addb` (`dpl_F5AXUiYS6e1EjTDHv24VbvQtYjm9`).
- API preview used for the original browser run: `https://cluster-readonly-8vqk7zas1-kolofahkelvin16-6437s-projects.vercel.app`, READY at API source `90d4f0044e0b4247241e83efdf5959c20bae1161` (`dpl_DsqmkQvAuNC6mptAp1WpqMTJDE7T`).

## Group B - persistent indexing, history, oracle provenance, and event stream

**Status: FAIL** - read-only discovery/status routes work, but persistent indexing, event history, independent oracle provenance, and event-backed SSE are unavailable.

- Branch/PR: `codex/cluster-group-b-readiness`, draft [PR #5](https://github.com/GIFTEDLOV/ArcMemePerps/pull/5). Source checkpoint `328c70d7c642be33f46d2428e11e4cb1a1987b3b`; progress-only follow-up checkpoint `2e292a31d014686fd77454540fe5825b77a51896`.
- Exact-head CI for `328c70d`: [run 40888259409](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40888259409) and [run 40888269073](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40888269073), both PASS. Exact-head CI for `2e292a3`: [run 40889936555](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40889936555) and [run 40889946729](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40889946729), both PASS.
- Railway `https://api-production-0eb6.up.railway.app/api/v1/markets` returns platform HTTP 404 with `x-railway-fallback: true`. The latest deployment failed before application startup: Node 20 was incompatible with pnpm 11 and the `node:sqlite` runtime requirement. PR #2 uses Node 22 and the corrected engine floor; no Railway deploy or billing operation was run.
- Tested PR #5 preview frontend: `https://cluster-hackathon-pre-git-11a671-kolofahkelvin16-6437s-projects.vercel.app`; API: `https://cluster-readonly-api-git-70bed4-kolofahkelvin16-6437s-projects.vercel.app`; both READY for tested source head `328c70d`.
- Live API at 2026-10-29 14:08:58 UTC: markets HTTP 200 JSON, 5 returned of 30 discovered and 28 observed; qualification inventory `UNVERIFIED`. Protocol status HTTP 200, chain 5042, read-only true, trading false, LP deposits false, indexer `UNAVAILABLE_NO_PERSISTENT_INDEXER`, stream `HEARTBEAT_ONLY`. SSE HTTP 200 `text/event-stream`, retry + heartbeat only, no `data:` events.
- Live no-mock Playwright against the exact PR #5 preview frontend/API: 6/6 PASS desktop/mobile. It verifies the unavailable boundary, not persistence or trading.
- The SQLite-backed service/indexer source exists, but the Vercel fallback has no durable store or worker. No sustainable no-billing alternative, provider credential, or database was provisioned. Reports are in `CLUSTER_BACKEND_RESTORE_REVIEW.md`, `CLUSTER_LIVE_ENDPOINT_VERIFICATION_2026-10-29.md`, and `CLUSTER_INDEXING_PROVIDER_EVALUATION_2026-10-29.md`.
- Truthful status follow-up: `codex/cluster-group-b-index-status-2026-10-29`, draft [PR #10](https://github.com/GIFTEDLOV/ArcMemePerps/pull/10), based on PR #9. It removes the false `SYNCED` inference from deployment metadata, omits unverified zero market counts, and marks unprobed components unavailable in the local service. Full local root tests pass (54 files, 280 tests) and typecheck passes. [Detailed finding](CLUSTER_INDEX_STATUS_TRUTHFULNESS_2026-10-29.md). Group B remains FAIL; final PR CI is available from its checks.

## Group C - trading engine, settlement, and keepers

**Status: FAIL** - source and local-chain checks are substantial, but no permitted live Testnet wallet trade receipt or complete keeper index is available.

- Branch/PR: `codex/cluster-group-c-trade-audit`, draft [PR #6](https://github.com/GIFTEDLOV/ArcMemePerps/pull/6), based on PR #5. Audit source checkpoint: `c54abc4308040f2c21c8fff62a0856cb532d0146`; progress checkpoint: `53d7c102bcc7389863c61cc5438c0e01eede9709`.
- Exact-head GitHub CI for `53d7c10`: [run 40891277344](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40891277344) and [run 40891287252](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40891287252), both PASS (lint, typecheck, 53-file/268-test suite, frontend checks/build, `forge build`, `forge test`, `forge fmt --check`). Local `pnpm test` also PASS (53 files, 268 tests).
- Mainnet snapshot at block `28,484,877`, hash `0xfd6dc29563cedbd9aa85c181f681b6f5d39b951a7d31a2790f5daae0788b8034`: LP inactive/zero shares/custody; MarginVault has 1 USDC trader free collateral, no protocol backing and zero withdrawable liquidity; InsuranceFund is empty; engine next position ID 1 and unbootstrapped.
- Product Testnet snapshot at block `69,676,416`: PublicLPVault holds 1.8 USDC with `publicLpActive=true` and risk budget zero; MarginVault custody is 5.6 USDC including 5 USDC protocol backing; InsuranceFund holds 2 USDC; there are no open positions. The LP has no call path to MarginVault/PerpEngine. Testnet activation state was not altered.
- Verified Mainnet transaction: historical 1.000000 USDC deposit into MarginVault, block 27,246,895, [`0x7dd1dfeddc682e745ed84ba885ad3fd800400952522b03cc1126fd81915c4dc9`](https://explorer.arc.io/tx/0x7dd1dfeddc682e745ed84ba885ad3fd800400952522b03cc1126fd81915c4dc9). This is trader collateral, not a trade or LP deposit.
- Read-only `pnpm keeper:once` at head block `28,488,762`: event checkpoint `27,437,060`, `indexReady=false`, zero positions reconciled, zero open positions, no liquidation simulation. The checkpoint is 1,051,702 blocks behind; no signer or execution flag was used.
- Audit: [trade engine and keeper report](CLUSTER_TRADE_ENGINE_AND_KEEPER_AUDIT_2026-10-29.md). Verified defects include inconsistent fee routing across trade actions, ADL partial candidate capacity being consumed, early unresolved finalization without exhaustion proof, and NAV ambiguity in `totalAccountedAssets()`. Deployed direct contracts are immutable; source changes require migration and independent review.
- No live trade receipt was attempted because this mission prohibits financial transactions and funding.

## Group D - existing PublicLPVault integration

**Status: FAIL** for live LP integration; the accounting assessment and minimum safe plan are complete.

- Branch/PR: `codex/cluster-group-d-existing-lp-plan`, draft [PR #7](https://github.com/GIFTEDLOV/ArcMemePerps/pull/7), based on PR #6. Audit source checkpoint `699ef8065a6b56589d823c8510906a623d881b30`; progress checkpoint `9958be61efa046bceb35b6eeef1b9261e87b8bcf`.
- Exact-head CI for the progress checkpoint: [run 40896673049](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40896673049), PASS including Foundry build/test/format.
- Audit: [existing LP economic integration plan](CLUSTER_LP_ECONOMIC_INTEGRATION_AUDIT_2026-10-29.md). Mainnet LP is inactive/empty; Product Testnet LP holds 1.8 USDC, has active contract deposits, zero risk budget, and no MarginVault/Engine path. Direct contract replacements, full Testnet shareholder history, independent review, and migration sign-off remain blockers.
- No LP implementation was started because immutable deployment/migration dependencies and signed-off accounting review are not established. No second pool or transaction is proposed.

## Group E - production infrastructure and client integration

**Status: FAIL** for production readiness; truthful read-only preview behavior and the governance verifier correction are checked, but backend durability and safe production state remain blocked.

- Branch/PR: `codex/cluster-group-e-production-readiness`, draft [PR #8](https://github.com/GIFTEDLOV/ArcMemePerps/pull/8), based on PR #7 head `9958be61efa046bceb35b6eeef1b9261e87b8bcf`. Exact source head `a6328ef59ef0d3d5d7203118bb05f22e6c7d1840`.
- Exact-head GitHub CI: [run 40896938605](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40896938605), PASS (install, lint, typecheck, 277 root tests, frontend tests/build, Foundry build/test/format).
- Final PR #8 progress/report head: `e8a9120266678a593bf76501057a799267192039`; exact-head CI [run 40899324226](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40899324226) also PASS, including the complete Foundry suite.
- Exact-source previews: frontend `https://cluster-hackathon-preview-cltn3n6al.vercel.app` (`dpl_6FAVe59dDaNUjuotrdMoFDQoahpN`), API `https://cluster-readonly-5vvfsdulj-kolofahkelvin16-6437s-projects.vercel.app` (`dpl_4yAGsrLHTHrEdurhACNECRJY92bZ`), both READY at `a6328ef`. The preview frontend's network requests use the stable API alias at source `434512a2e0f01865172b9c341e5ca82fa36db6ce`, not its branch API preview.
- Live browser run on the exact Group E frontend and API preview: `pnpm e2e:live` PASS 6/6 desktop/mobile; direct API assertions use the Group E API deployment and browser-origin assertions use the actual configured stable API origin.
- At 2026-10-29 14:44 UTC, Vercel markets/status returned HTTP 200, SSE returned HTTP 200 heartbeat-only with no event payload, stable verification returned 503, and Railway markets/status returned HTTP 404. The Railway build failed pre-start on Node 20 with pnpm 11/`node:sqlite`; PR #2/4 fix the Node runtime source configuration, but no Railway deployment or billing action occurred.
- Fresh endpoint recheck at 2026-10-29 15:25 UTC: Vercel `/api/v1/markets` and `/api/v1/protocol/status` returned HTTP 200. Markets contain provider-discovered data but no verified qualification; status reports `readOnly=true`, trading and LP deposits disabled, qualification `UNVERIFIED`, indexer `UNAVAILABLE_NO_PERSISTENT_INDEXER`, and SSE `HEARTBEAT_ONLY`. SSE returned HTTP 200 `text/event-stream` with retry and heartbeat comments only, no `data:` events. Railway markets/status returned HTTP 404 `Application not found`. No deployment occurred.
- Production frontend `cluster-terminal.vercel.app` remains at `winner-rebuild` SHA `83d14d29d86aae5359c14b70ee7940626ea78ffc` and exposes seeded LP/trading claims. It was not changed.
- Governance verifier now uses the actual deployed manifest's `0xB656...` deployer, parses deployed address/receipt shapes, and fails closed because the deployed manifest has no source SHA. `pnpm mainnet:verify` returns `MAINNET_DEPLOYED_SOURCE_PROVENANCE_UNATTESTED`. No current deployed bytecode/source parity claim is made.
- Local results: typecheck PASS; root tests 54 files/277 tests PASS; lint PASS with one existing warning; frontend tests 6 files/16 tests PASS; build PASS with existing 511.76 kB advisory; Playwright 17 passed/1 expected skip; changed-file formatting PASS. Whole-repository `pnpm format:check` fails on 419 unchanged files. Foundry is unavailable locally; exact CI passes Foundry.
- Full operational evidence: [production readiness report](CLUSTER_PRODUCTION_READINESS_2026-10-29.md). Remaining blockers: no persistent index/history/oracle provenance/event stream, wrong preview API origin for source parity, production still on legacy UI/backend, missing source provenance and governance bootstrap.

## Group F - audit, submission, and release controls

**Status: FAIL** for current submission timing. The reviewed Arc Microgrants deadline was October 14 and the Programmable Money Hackathon ended August 22. The official Arc Hackathons listing had no upcoming entry on October 29, and no Arc Microgrants window was verified as open. Other grant programs were not assessed. The public GitHub builder profile is confirmed. No application was submitted.

- Branch/PR: `codex/cluster-group-f-submission-readiness`, draft [PR #9](https://github.com/GIFTEDLOV/ArcMemePerps/pull/9), based on PR #8. Exact-head CI passed; the [PR checks](https://github.com/GIFTEDLOV/ArcMemePerps/pull/9/checks) show the final tested commit and workflow run.
- Updated package: [hackathon submission readiness](CLUSTER_HACKATHON_SUBMISSION_READINESS_2026-10-29.md) and [submission walkthrough](../ARC_MICROGRANT_SUBMISSION.md).
- The package links the public repository, verified preview/API, one historical 1 USDC Mainnet MarginVault deposit receipt, 100-200 character truthful pitch, screenshots, three-minute demo outline, and all financial limitations.
- The repository contains `arcmemeperps_3min_demo.mp4`, but its encoded content was not reviewed in this checkpoint. Its companion narration/recording scripts claim 10x/zero-slippage execution and completed positions/PnL on the old production terminal; those scripts are stale. Exclude the MP4 until its content is reviewed. No replacement recording was created. Use the read-only walkthrough and current preview screenshots.

## Decisions

- PR #2 merge readiness: **NO-GO**. PR #2 CI passes, but the deployed Railway API is unavailable, production still has seeded claims, persistent history is absent, source/bytecode provenance is unattested, and the Group C/D financial gates fail.
- Hackathon submission: **NO-GO now**. The reviewed windows are closed and the named Microgrants program requires a working Mainnet application.
- Live financial production: **NO-GO**. Mainnet governance bootstrap, positive market/oracle qualification, complete indexing/keeper history, live trader settlement receipts, independent security review, and integrated LP solvency are not established.
- No production deployment, transaction, funding, governance action, contract deployment, activation, PR merge, or branch promotion occurred.

## 2026-10-29 correction and Group B implementation checkpoint

**This section supersedes the earlier Group F statement that no Arc Microgrants round is open.** The organizer's [Arc Microgrants: Built with Arc Studio](https://dorahacks.io/hackathon/arc-microgrants-2/detail) round closes November 1, 2026. CLUSTER has no verified Arc Studio project/build provenance in the repository and no evidence that the existing historical Mainnet USDC deposit was app-mediated. Submission remains **NO-GO on eligibility evidence**, not because the window is closed. See the corrected [submission assessment](CLUSTER_HACKATHON_SUBMISSION_READINESS_2026-10-29.md).

**Group B remains FAIL pending full acceptance.** Draft implementation branch `codex/cluster-group-b-durable-indexer-2026-10-29` is stacked on PR #10 source `843415d66036c252746b5a47ba87a8f413c37585`; exact remote PR and CI will be recorded after upload. B1 adds Postgres migrations, an always-on worker container recipe, and a stateless Vercel read-side connection. B2 adds exact-receipt-block Arc ingestion, finality buffer, bounded windows, RPC split/retry, dual-source log comparison, receipt checks, atomic event/outbox/checkpoint transaction, gap counters, restart and reorg rewind/replay. B3 adds decoded event rows and a registered-market read route, but full financial/accounting reconstruction and pinned-block parity remain open. B4 independent source-observation and signed-report evidence remain open. B5 adds an outbox SSE read path with replay cursor; no public deployment or live SSE event was validated. B6 Postgres integration test is wired into CI, while the local Docker daemon/Postgres service is unavailable.

Fresh read-only Arc Mainnet probe on 2026-10-29: chain 5042, head 28,519,253, MarginVault deployment block 27,246,890 hash `0xf7159779d2425bd57f5d8f179dc530e0cb6008675dc5d9bf088e404764893903`, historical deposit receipt block 27,246,895 hash `0x4af5d6b0b53f9c4147c712b2ce87fc5a1b1084fa30b1f0afdbbc741d53be7207`, successful receipt and one matching vault `CollateralDeposited` log of 1,000,000 USDC base units. One earlier RPC receipt lookup intermittently returned not found; the ingestion worker retries and fails closed if a receipt cannot be corroborated. This sample does **not** establish complete deployment-to-head coverage.

Local checks at this checkpoint: `pnpm typecheck` PASS; `pnpm lint` PASS with one pre-existing unused-disable warning; `pnpm test` PASS 56 files/289 tests, one Postgres integration test skipped locally because no Postgres endpoint was available; frontend tests PASS 6 files/16 tests; frontend build PASS with existing bundle-size advisory. Foundry is unavailable locally; exact-commit GitHub CI with Postgres and Foundry is required. Trading and LP deposits remain disabled. No paid infrastructure, production deployment, alias change, on-chain transaction, governance action, or PR merge occurred.
