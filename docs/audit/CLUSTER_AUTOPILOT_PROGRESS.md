# CLUSTER autopilot progress

Review date: 2026-10-29 (UTC)
Repository: https://github.com/GIFTEDLOV/ArcMemePerps

## Safety and branch state

- The user's dirty `winner-rebuild` worktree was not modified.
- PR #2, #3, #4, #5, and #6 remain drafts. PR #3 still targets PR #2; PR #4 targets PR #3; PR #5 targets PR #4; PR #6 targets PR #5. No PR was merged.
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

## Remaining groups

- Group D - **FAIL** for live integration; the existing LP audit and migration/invariant plan are complete.
  - Branch/PR: `codex/cluster-group-d-existing-lp-plan`, draft [PR #7](https://github.com/GIFTEDLOV/ArcMemePerps/pull/7), based on PR #6. Plan checkpoint: `699ef8065a6b56589d823c8510906a623d881b30`.
  - Exact-head GitHub CI: [run 40891981392](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40891981392) and [run 40892028759](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40892028759), both PASS. No Solidity changes were made; these runs verify the inherited repository and documentation branch.
  - Audit: [existing LP economic integration plan](CLUSTER_LP_ECONOMIC_INTEGRATION_AUDIT_2026-10-29.md). Mainnet LP is inactive/empty; Product Testnet LP has 1.8 USDC, active contract deposits, zero risk budget, and no MarginVault/Engine path. Direct contract replacements, full Testnet shareholder history, independent review, and migration sign-off remain blockers.
  - No LP implementation was started because the immutable deployment/migration dependencies and signed-off accounting review are not established. No second pool or transaction is proposed.
- Group E - **UNKNOWN / not yet reviewed in this progress checkpoint**: preview/browser checks pass, while durable backend integration, governance verification, and full source-to-production parity remain incomplete.
- Group F - **FAIL** for current submission timing: the reviewed Arc Microgrants and Programmable Money Hackathon windows have closed; no current open Arc program was verified. A truthful submission report is prepared, but no application was submitted.

## Decisions and next steps

- PR #2 merge readiness: **NO-GO** pending backend persistence, market evidence, independent security review, LP settlement integration, keeper continuity, and complete live verification.
- Hackathon submission: **NO-GO today**; the named programs are closed, and the current preview is not a live Mainnet perpetual product.
- Live financial production: **NO-GO**; Mainnet bootstrap/roles, positive market/oracle qualification, keeper/index completeness, live settlement receipts, and integrated LP solvency are not established.
- Next: verify production deployment provenance and governance, fix safe verification tooling defects, then complete Group F release evidence without production financial actions.

