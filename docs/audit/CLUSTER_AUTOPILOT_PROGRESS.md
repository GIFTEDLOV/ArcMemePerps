# CLUSTER autonomous completion progress

Updated: 2026-10-29 UTC

Execution follows `CLUSTER_CODEX_AUTOPILOT_PLAYBOOK_2026-10-29.md`. PR #2 and PR #3 remain open and stacked. The local `winner-rebuild` worktree is preserved. Group A changes are isolated on `codex/cluster-group-a-verification`, based on PR #3 head `500c0ca96dff175b049ff9f2d2ddf4ce8bd6ac33`.

## Group status

| Group                                            | Status  | Evidence summary                                                                                                                                                                                                           |
| ------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A - Canonical on-chain verification              | UNKNOWN | ABI decoding, canonical IDs, fail-closed multi-source pinned reads and negative canary implemented. Positive registered-market evidence, deployed-source parity and runtime governance gates remain unavailable.           |
| B - Persistent history and oracle evidence       | UNKNOWN | Existing persistent store/indexer building blocks exist, but no supported running persistent deployment or complete Arc log backfill is verified. Railway is expired and public RPC log ranges/retention are insufficient. |
| C - Trading engine, margin and keepers           | UNKNOWN | Audit underway; financial writes remain disabled.                                                                                                                                                                          |
| D - Existing public LP economics                 | UNKNOWN | Audit underway; deployed LP is inactive and not connected to margin settlement. No second pool created.                                                                                                                    |
| E - Production, frontend, governance and browser | UNKNOWN | Stable read-only endpoints respond. Preview browser verification and durable production service are pending. Production alias unchanged.                                                                                   |
| F - Audit and submission package                 | UNKNOWN | Final package pending.                                                                                                                                                                                                     |

## Group A - Canonical on-chain verification

**Branch/base:** `codex/cluster-group-a-verification` / PR #3 branch `deploy/vercel-readonly-api-2026-10-29` at `500c0ca96dff175b049ff9f2d2ddf4ce8bd6ac33`.

**Changes:** Replaced guessed selectors/manual word decoding with a viem ABI; decoded `getUsablePrice` and Oracle report tuples; computed EVM/Solana canonical IDs using the shared Solidity-parity functions; bound verification to chain plus origin token and registry origin tuple; checked bootstrap, governance executor, contract wiring, USDC decimals/custody, bad debt, insurance custody, LP state, risk and OI; pinned reads to EIP-1898 block hashes and compared four configured RPC sources; added bounded paired reads/retries and per-check source evidence. Added verification endpoint `GET /api/v1/verification/markets?chain=...&tokenAddress=...`. No UI/CSS/design assets changed. Trade and LP writes remain disabled.

**Checks:**

- `pnpm typecheck` - PASS.
- `pnpm test` - PASS, 53 files / 268 tests.
- `pnpm exec vitest run apps/cluster-api-vercel/api/verification.test.ts packages/shared/src/index.test.ts` - PASS, 15 tests.
- Focused ESLint on changed TS files - PASS after safe evidence serialization fix. Full repo lint is being rerun.
- `pnpm format:check` - FAIL on 429 repository files, including untouched baseline files. No repository-wide formatting was applied; no CSS was edited.
- `git diff --check` - PASS.
- Foundry runtime unavailable (`forge` not on PATH); Foundry status UNKNOWN.

**Live read evidence:** Local route against actual Arc Mainnet RPC returned HTTP 200 / `BLOCKED` for Arc USDC at block `28477846`, hash `0x0fc84556e02187be61a9b045467aadb21cdf87af3994fdbc640eaa421a8df95e`; canonical market ID `0xfcf295389536fee7b263df68db00968ce8c0a4925b24e99a58859169bc37ee4b`; `marketExists=false`. Four RPCs (`rpc.mainnet.arc.io`, `arc.nodely.dev`, `arc.drpc.org`, `rpc.quicknode.mainnet.arc.io`) returned chain ID 5042 and matching pinned block evidence. This is a negative canary only. The live reads observed deployed code at manifest addresses, engine references to registry/risk/oracle/margin/insurance/ADL, margin actual/expected custody of 1,000,000 USDC base units, zero uncovered margin debt, insurance custody/capital zero, inactive LP with zero custody, USDC decimals 6, timelock delay 86,400 seconds, bootstrap unfinalized and zero governance executors. These facts do not establish source parity, roles, complete market inventory or trade readiness.

**Unresolved Group A gates:** No positive registered market was discovered from complete logs; direct log history calls fail on public RPC range/history limits, so no zero-market inventory is claimed. Role membership is not enumerable and the manifest lacks role identities. Deployed bytecode/source parity and Oracle source provenance are unverified. The first preview at `e3204e2` built READY but API routes returned `FUNCTION_INVOCATION_FAILED`; Vercel build logs exposed `api/verification.test.ts` being compiled as an API route with an implicit-any error. Moved that test to `apps/cluster-api-vercel/tests/verification.test.ts`; the follow-up commit and exact-SHA preview smoke are pending. `pnpm format:check` has broad baseline violations. The group remains UNKNOWN.

## Group B - Initial diagnosis

Railway is unavailable due to an expired trial; no Railway billing is requested. The Vercel API is stateless and reports `UNAVAILABLE_NO_PERSISTENT_INDEXER` and `HEARTBEAT_ONLY`; its SSE endpoint is not a real event feed. Existing `apps/indexer` and `packages/persistence` provide local abstractions, not evidence of a durable deployed Arc index. Arc RPC `eth_getLogs` backfill is incomplete because provider range caps, pruning and throttling prevent a complete deployment-block-to-finalized-head scan. A complete market count or event history must not be claimed. Need a verified persistent provider/runtime connection before this acceptance gate can pass.

## Decisions

- Hackathon submission: NO-GO until organizer rules, public exact-commit preview, browser evidence and accurate submission materials are verified.
- Live financial production: NO-GO. Mainnet bootstrap/governance, qualified market, oracle provenance, trade/testnet settlement, LP backing/accounting, bytecode parity and independent review are not verified.
- Existing stable production alias remains unchanged. No transaction, fund movement, governance action, contract deployment, merge or financial activation was performed.
