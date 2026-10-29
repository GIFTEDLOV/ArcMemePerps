# CLUSTER — CODEX AUTONOMOUS COMPLETION PLAYBOOK
Date: 2026-10-29
Scope: full original CLUSTER multichain memecoin discovery + independently verified Arc USDC perpetuals + existing real LP economics. Not a discovery-only pivot.

## Read this first / verified starting checkpoint

Repository: https://github.com/GIFTEDLOV/ArcMemePerps
Baseline hardening draft PR #2: https://github.com/GIFTEDLOV/ArcMemePerps/pull/2
- branch `remediation/hackathon-hardening-2026-10-28`, HEAD `979548593ceaca07e8685f8537f90d3b8cc59c2b`, exact-head CI PASS (run 62)
Vercel fallback + verification draft PR #3: https://github.com/GIFTEDLOV/ArcMemePerps/pull/3
- branch `deploy/vercel-readonly-api-2026-10-29`, verified pre-playbook HEAD `8c4b4a053376e4e7513254a2852af2a60c5da967`, exact-head CI PASS (run 80, https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/40868318324).
- PR #3 **targets the PR #2 branch**, not `main`; maintain this stacked dependency or rebase deliberately.
- Separate preview frontend https://cluster-hackathon-preview.vercel.app — Vercel READY; HTTP and JS configuration checked, full new live-browser E2E not yet verified.
- Separate read-only API https://cluster-readonly-api.vercel.app — Vercel READY; markets/status/heartbeat SSE tested. A later verification endpoint is tested at a separate Vercel preview (not automatically promoted). Check which commit the stable alias actually serves.
- Verification sample for `0x00...00` rejects market and reports incomplete bootstrap; it is **not** a real qualified-market canary.
- Railway `api` unavailable due to expired trial. Do not require Railway billing; old service and mounted volume are preserved. Vercel Functions cannot replace a persistent indexer or SQLite with ephemeral local storage.
- Existing Arc Mainnet contracts: `evidence/mainnet/contracts.json`, Arc chain 5042. Source/bytecode parity not yet independently certified. PerpEngine / PublicLPVault mainnet bootstrap previously read false; public LP inactive. Existing LP vault and margin vault are **not** economically connected.
- Read `docs/audit/CLUSTER_FINAL_AUDIT.md`, `CLUSTER_SECURITY_MATRIX.md`, `CLUSTER_RELEASE_READINESS.md`, `docs/audit/CLUSTER_VERCEL_FALLBACK_2026-10-29.md`, `docs/audit/CLUSTER_VERIFICATION_ACCEPTANCE_GATES_2026-10-29.md`, `docs/LP_VAULT.md`, `docs/LP_RELEASE_GUARD.md`, `docs/ARC_MICROGRANT_SUBMISSION.md`, `evidence/mainnet-live-deployment.json`, and the full current mainnet deployment manifest.
- User's local uncommitted `winner-rebuild` WIP and any separate LP WIP must not be overwritten. Preserve verified original production URL. No Lovable. No CSS/design-token changes or UI redesign.

## Global Codex execution contract

Work sequentially by group, while parallelizing tests and read-only discovery within each group where safe. Operate autonomously for code reads, local edits, tests, reports and draft PRs. At each completed group: (a) one atomic commit/PR or documented checkpoint; (b) exact-HEAD CI with logs; (c) relevant negative/failure tests; (d) deploy *preview only* as needed; (e) update PASS/FAIL/UNKNOWN gates and a blocker list; (f) proceed to next group without pausing for routine permission. No invented data, fake wallets/trades, simulated LP deposits or unsupported returns. Never label a partial test or mock as a live verification.

**Hard gates:** Do not broadcast transactions; change financial positions, funds, LP activation, registry approvals, reporter keys, owners, governance/timelock, or Mainnet contracts; deploy new financial contracts; merge PRs; switch production aliases; expose signer secrets; or enable public trading/LP deposits without explicitly authorized change scope and required independent verification. Produce exact prepared artifacts and instructions for user-dependent actions; continue every other independent engineering task. Never bypass a missing verification check just to show green. Failed/unknown gates remain blocked with explicit reasons. Security-critical changes to deployed immutable code need a distinct reviewed migration/redeployment plan, not source-only claims.

Preserve independent oracle sourcing and real on-chain evidence. When a required source or RPC is down, status is degraded or blocked, not a fabricated success. Distinguish functional read-only submission readiness from safe financial-production readiness.

## GROUP A — Finish canonical verification (P0)

Goal: one authoritative, fail-closed verification result per *canonical* market ID, grounded in direct Arc Mainnet calls at a consistent block.

Tasks:
1. Compare deployed ABI/build artifact, Solidity signatures and selectors (keccak-256) for every getter used by `apps/cluster-api-vercel/api/verification.ts`. Replace guessed hard-coded selectors with reviewed ABI-encoded calls where possible. Unit-test selectors, return tuple decoding, revert handling and actual value types. In particular inspect `OracleRouter.getUsablePrice` (returns a price tuple, **not a boolean**) vs `isReportUsable`; `getReport` tuple fields; `USDCMarginVault` custody, expected custody, protocol bad debt and insurance covered counters. Check no accidental `bool(price)` interpretation.
2. Replace the fallback's string token ID (`solana:...` etc.) with the existing canonical bytes32 ID logic in `packages/shared/src/index.ts` based on `MarketRegistry.computeEvmMarketId/computeSolanaMarketId`. Preserve case-sensitive Solana base58 input; do not lowercase token addresses. Ensure normalizer never treats discovery market as qualified on account of provider text or hash alone. Test EVM, Solana, invalid addresses, collision resistance, and a direct contract/SDK parity case.
3. Verify MarketRegistry existence/state; QualificationRegistry approval/proof/rule/expiry/revocation; RiskConfig policy, applied proof, bounds/market LIVE; OracleRouter signed report sequence/confidence/independent-source count/validity/usable price; engine contracts and configured margin+insurance wiring, current exposure and solvency; collateral/expected custody and debt, bootstrap/roles. Fail closed on null, revert, RPC timeout or inconsistency. No `status=LIVE` based on partial checks.
4. On-chain `eth_call` reads must refer to one pinned block/hash; explicitly report block and data freshness, return a per-check evidence object with failing reasons and source. Bound concurrency, implement short timeouts/retries, use at least two independently configured RPC endpoints when available, and document limitations of a single-RPC result.
5. Verify a legitimate historical/known registered market canary **only if one is discovered by actual logs**, and a negative test for an unregistered ID. Do not invent a canary or claim a count of 0 from incomplete indexing. Bind proof to correct token identity and qualification events.
6. Keep GET-only API and all trading/LP writes disabled. Expose verification through versioned API, with the read-only frontend showing meaningful pass/fail/unknown states without CSS redesign.

Acceptance: canonical IDs match the Solidity contract; every ABI call has passing tests; verified negative canary is BLOCKED; legitimate market checked only if supported by indexed evidence; API outputs truthful PENDING/BLOCKED/VERIFIED at single-block consistency; exact-head CI and preview smoke passed. This does **not** by itself authorize trading.

## GROUP B — Complete event indexing + oracle/qualification evidence (P0)

Goal: restore durable indexed history and independent oracle/market-qualification provenance without paid Railway dependency.

Tasks:
1. Pick an Arc Mainnet-compatible indexed event infrastructure with documented deployment path and sustainable storage/queries. Prefer already available Vercel + external indexed data infrastructure; evaluate free quotas and retention before implementation. The Graph/subgraph or equivalent is acceptable only after confirming supported Arc mainnet network, historic range coverage, and actual queries. If no suitable free indexed provider works, deliver tested deployment artifacts and a clear external blocker; do not fake persistence.
2. Backfill `MarketRegistered`, `MarketStateUpdated`, `QualificationApproved/Revoked`, risk/oracle events, order/position/settlement, deposit/withdraw/insurance/ADL and governance events from canonical deployment blocks. Index chain/block/tx/logId identity, finality, reorg handling, paginated RPC errors, bounded backfill, checkpoints, restart and replay, deduplication. A missing RPC window is an INCOMPLETE INDEX, not an empty result. Test continuity and state parity at latest final block.
3. Verify independent source observations and oracle signer domains, report sequence, anti-replay, current reporter-set threshold, source independence, validity windows and confidence/price bands. Don't equate DEX Screener discovery with an independent execution oracle. Authenticate signed reports using the deployed oracle's actual digest and roles; do not collect or print private keys.
4. Reconcile indexed qualification lifecycle and canonical market universe against direct contract reads. Track evidence hash and validity; expose market-source provenance and a read-only SSE feed of **real verified events** (or explicit unavailable status rather than heartbeat masquerading as events).
5. Produce index completeness report: deployment block to finalized head, last contiguous block, gaps, exact market counts with coverage qualifier, reorg scenarios and RPC/source failure tests.

Acceptance: persistent history survives restarts, runs outside Railway, tests complete log range and replay, reconstructs canonical markets/qualifications accurately, and real SSE events are backed by indexed receipts. If durability cannot be established, gate stays FAIL, don't silently narrow requirements.

## GROUP C — Validate actual trade engine + margin + keepers (P0)

Goal: a real E2E trader accounting and settlement path; never pretend a local simulation proves Mainnet readiness.

Tasks:
1. Audit `PerpEngine`, `USDCMarginVault`, `MarketRegistry`, `RiskConfig`, `OracleRouter`, `InsuranceFund`, `ADLController`, order signatures, nonces, expiries, slippage/price bounds, leverage/OI/position/skew/side caps, maintenance margin/liquidations, funding/borrow costs and partial closes.
2. Confirm signed-order browser->engine route, pre-trade checks, wallet network, balances/allowance, 6-decimal ERC-20 USDC and 18-decimal native gas. Implement true transaction receipt/position reconciliation, never local-only positions or fabricated success.
3. Restore keeper daemon in a **separate approved runtime**, disabled/read-only by default; no signers in read-only Vercel API. Verify event cursor, roles, finality/reorg safety, idempotency and failure handling.
4. Foundry unit/fuzz/invariants (conservation of value, no inflated balances, maximum liabilities, position ownership, liquidation/insurance/ADL), contract source/runtime parity and full Testnet canary. A real wallet/transaction Testnet E2E must include verified receipts.
5. Identify any immutable deployed-code fault; propose exact contract migration with review. Do not run Mainnet transactions or switch frontend trade control without approval and audit.

Acceptance: exact-source code plus full Foundry/tests demonstrate true financial settlement and keeper behavior on Testnet; remaining Mainnet roles/bootstrap/deployment gates are separately explicit. No fake profit, APY, rewards or positions.

## GROUP D — Existing Public LP economic integration (P0, separate financial release gate)

Goal: connect **existing** PublicLPVault capital to actual PerpEngine trader settlement; do not deploy a duplicate LP or present source-only changes as active.

Tasks:
1. Review `PublicLPVault`, `USDCMarginVault`, `PerpEngine`, insurance, ADL and current LP design/WIP; preserve user WIP. Define verified custody route from LP USDC to margin backing and back with rights, timelock, ledger entries and causal events.
2. Implement separate custody liabilities/accounting: trader collateral senior to LP withdrawals, LP NAV and shares reflect actual realized/unrealized settlement cashflows as allowed, fee split consistent across OPEN/INCREASE/REDUCE/CLOSE/LIQUIDATE, independent insurance reserve cash, bad debt and ADL not double-counted, accounting for shortfall vs temporary illiquidity. Example: $20k sent, $17k recoverable already means $3k impairment; don't subtract another $3k simply because bad-debt counter names the same event.
3. Restrict allocations by risk budget, withdrawable cash, reserve, OI and utilization caps. Prove queued-withdrawal share cap, cooldown, freeze/insolvency behavior, no front-running drain or reentrancy.
4. Foundry invariant/fuzz plus deterministic numerical scenarios and Testnet USDC end-to-end deposit->allocation->trade profit/loss->insurance/ADL->NAV->withdrawal with exact bank/custody parity.
5. Since deployed contracts are direct non-proxy deployments and existing LP not wired to engine, prepare an explicit **governed migration plan** and ledger/custody migration reconciliation. Do not alter existing deployed contracts or move real funds without explicit authorization, audit and financial-safety review.

Acceptance: Testnet real-cash accounting matches every onchain ledger and corresponding withdrawal claims with no double-counted losses; migration plan is complete and independent financial security review passes. Mainnet LP stays inactive pending signed approval.

## GROUP E — Deployment, client wiring and operational security (P1)

Goal: replace fallback in a reversible, truthfully operational release path without changing visual design.

Tasks:
1. Integrate actual persistent index + verified JSON/SSE/status on production infrastructure that does not require Railway. If using Vercel, keep ephemeral API separate from durable storage and external workers; verify provider quotas and event retention. Don't call heartbeat-only transport a live event feed.
2. Keep PR #2 and PR #3 stacked and draft until tests pass; create small follow-up PRs or one clearly scoped draft per group. Don't merge without approval. Exact SHA-to-deployment parity; preserve old live frontend/domain and Vercel project, avoid accidental production alias/policy changes.
3. Wire market verification and full indexed views to existing screens: discover, search, market detail, wallet, position, fees, portfolio, LP, trade history, status; no generated dummy data. Show what is verified and which condition blocks an action. Preserve layouts, typography, assets, animations, CSS and design tokens.
4. Review Mainnet control plane with read-only `owner`, `governanceExecutor`, roles, oracle reporters, bootstrap finalized, market activation, emergency admin and keeper permissions. Draft a complete multisig/timelock governance execution package separately for approval. Do not execute it.
5. Browser E2E against actual public preview on desktop and mobile with no mocks; multi-source outage tests, page-routing, SSE reconnect, wallet disconnect/rejection and zero signing on blocked paths. CI must pass on exact commit. Output live verification screenshots and endpoint/latency/error logs with timestamps and commit.

Acceptance: all major screens show real data or honest blocked states; confirmed frontend/network/API data provenance; live external sources verified; no UI redesign; original production remains safe.

## GROUP F — Audit, submission and final release controls (P1)

Goal: submission package demonstrating what is truly built, plus precise release readiness status.

Tasks:
1. Run exact-head typecheck, lint, unit tests, Foundry build/fmt/fuzz/invariant, full browser E2E, security matrix, race/replay/finality tests, financial reconciliation, code review, and deployed-bytecode vs exact-source parity. Record results and exceptions. Commission/refer independent review where required; internal tests do not count as independent audit.
2. Cross-check *the actual chosen Arc hackathon/track* rules and submission deadline/eligibility from organizers, including any Arc Studio usage and mainnet transaction evidence requirements. Already recorded Mainnet proof of a 1 USDC deposit to MarginVault: `evidence/mainnet-live-deployment.json`; don't exaggerate it as successful perpetual trade or LP integration.
3. Prepare accurate GitHub repo/branch or release, frontend/API URLs, verified chain IDs/contracts/tx links, source/economic model, walkthrough/demo, screenshots, risk disclosures and 100–200 character concise pitch; no claims of live trading until it is provably enabled.
4. Verify submission page payloads, exact links, public access and privacy; keep the final portal submission for authenticated user if connector/browser access unavailable. Preserve traceable PASS/FAIL/UNKNOWN matrix, blockers, sign-offs and rollback plan.
5. If financial release gates do not pass before deadline, submit **only if organizer rules permit a read-only technical proof-of-concept**, with accurate limitation statement; never mislabel read-only discovery as fully operating derivatives or conceal missing insurance/LP backing.

Acceptance: verifiable evidence package, CI all green, public URLs tested, written release decision (submission GO/NO-GO, financial release GO/NO-GO separately), and clear list of user-only approvals.

## Automatic group handoff

Execute Group A, then B, C, D, E and F, autonomously within available permissions. Do not stop between groups for routine consent; if an external/human/financial safety dependency blocks one group, document it and continue all independent work in later groups. You are not allowed to skip mandatory verification or call an unfinished group PASS.

Maintain `docs/audit/CLUSTER_AUTOPILOT_PROGRESS.md` after each group:
- group, exact branch/commit, PR, CI URL and pass/fail,
- source changes and actual test commands/results,
- preview/prod URLs with exact deployment SHA, live endpoint responses and RPC block,
- resolved gaps and remaining blockers (technical vs user approval),
- overall submission and financial-production decisions,
- next group owner/tasks.
