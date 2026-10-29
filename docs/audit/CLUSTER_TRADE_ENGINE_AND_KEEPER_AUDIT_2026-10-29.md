# CLUSTER trade engine and keeper audit

**Review date:** 2026-10-29
**Status:** read-only source and deployment audit. No wallet transactions, contract writes, funding, governance changes, or deployments were made.

The checked-in deployment manifests record prior source/runtime parity checks, but this review did not independently rebuild the deployed source and compare runtime bytecode. The Mainnet source/bytecode claim therefore remains an external verification dependency.

## Decision

**Group C: FAIL.** The repository contains a substantial margin settlement engine and passing local-chain security/accounting tests, but no permitted Testnet wallet trade receipt or current complete keeper index was established. Mainnet is not bootstrapped and has no registered/qualified trading market, no open positions, and no InsuranceFund capital. This review does not treat Foundry mocks or dry runs as evidence of live trading.

## Deployment snapshots and custody trace

All token amounts below use the Arc USDC ERC-20's six decimals. These are pinned read-only observations, not a complete event history.

### Arc Mainnet

Snapshot: chain `5042`, block `28,484,877`, hash `0xfd6dc29563cedbd9aa85c181f681b6f5d39b951a7d31a2790f5daae0788b8034`.

| Contract / field                                               |                                                                                                                                                Observed value |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| `PublicLPVault` `0x9ff8358dc5ee866e0b9707d0139cf47b399f5257`   |                                                                `publicLpActive=false`; shares, managed assets, NAV, USDC custody, and risk budget are all `0` |
| `USDCMarginVault` `0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf` | actual custody = `rawCash` = `1,000,000` (1 USDC); `protocolBacking=0`; trader free collateral `1,000,000`; locked collateral `0`; withdrawable liquidity `0` |
| Margin fee / PnL / debt ledgers                                |              accrued fees `0`; insurance reserve annotation `0`; pending positive/negative PnL `0`; protocol bad debt, insurance covered, and ADL covered `0` |
| `InsuranceFund` `0x8b0550babc3b802d89c17dfbee85828e14e6a22b`   |                                                                                                                      actual custody = available capital = `0` |
| `PerpEngine` `0xd9c3cbf1841103749f379cc1aae1a9284d8dc3e1`      | `nextPositionId=1`; open interest `0`; `solvencyBlocked=false`; `bootstrapFinalized=false`; wired MarginVault and InsuranceFund match the deployment manifest |
| Governance                                                     |      `PerpEngine.governanceExecutor=0x0000000000000000000000000000000000000000`; PublicLPVault governance executor is also zero; bootstrap remains incomplete |

The only verified Mainnet financial receipt in the deployment evidence is a **1.000000 USDC deposit to MarginVault**, block `27,246,895`, transaction [`0x7dd1dfeddc682e745ed84ba885ad3fd800400952522b03cc1126fd81915c4dc9`](https://explorer.arc.io/tx/0x7dd1dfeddc682e745ed84ba885ad3fd800400952522b03cc1126fd81915c4dc9). It is still trader free collateral in the snapshot. It is not an LP deposit, trade, profit, or withdrawal.

### Arc Product Testnet

Snapshot: chain `5042002`, block `69,676,416`, hash `0x2b542655da8f02eae7e3625fe521e193c4483593b5f01036fd291ca224a190e9`.

| Contract / field                                               |                                                                                                                                                                                         Observed value |
| -------------------------------------------------------------- | -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| `PublicLPVault` `0x826892d52172ddef07f2927ba67493465cf54964`   |                                                                  actual custody, managed assets, NAV, and shares = `1,800,000` (1.8 USDC); `publicLpActive=true`; risk budget `0`; cooldown 60 seconds |
| `USDCMarginVault` `0xf73b9eb7e1853c9ba8f558542f1276584dd0f6ab` |                                actual custody = `rawCash` = `5,600,000` (5.6 USDC); protocol backing `5,000,000`; free collateral `599,198`; locked collateral `0`; withdrawable liquidity `5,000,802` |
| Margin counters                                                | accrued fee counter `400`; insurance reserve annotation `40`; cumulative realized trader gains `0`, losses `402`; pending PnL, protocol bad debt, insurance-covered debt, and ADL-covered debt are `0` |
| `InsuranceFund` `0x131ce3346eb5e15a3ae3c1cba2cd93d54dc6877b`   |                                                                                                               actual custody = available capital = `2,000,000` (2 USDC); no recorded bad-debt coverage |
| `PerpEngine` `0xbd2c3ad91799110adf647493acbaa1f63a40514c`      |                                                                                            `nextPositionId=3`; OI `0`; `solvencyBlocked=false`; positions 1 and 2 are closed with zero size/collateral |

Product Testnet's MarginVault custody reconciles as 5,000,000 protocol backing plus 600,000 net trader cash. The observed trader-side counters reconcile numerically as 599,198 free collateral + 400 fee counter + 402 realized-loss counter = 600,000. This arithmetic is not a complete transaction history or a per-position PnL statement. The 40-unit reserve is an annotation within MarginVault cash, not separate InsuranceFund assets. The 402 loss counter is cumulative and cannot be attributed to LPs from this snapshot.

Product Testnet's LP activation flag is **active at the contract layer** even though the UI blocks deposits. No transaction was made to change it. The LP vault still has no path to MarginVault or PerpEngine, so those 1.8 USDC do not back traders.

## What the code currently does

### USDC custody and trader claims

- `USDCMarginVault.deposit` transfers USDC into the vault and requires the exact balance delta; `rawCash` and free trader collateral increase together. Withdrawals check `withdrawableLiquidity`, update accounting before transfer, and revert atomically on a failed transfer.
- `PerpEngine` holds immutable MarginVault and InsuranceFund references. It does not reference PublicLPVault.
- Increases check market/risk eligibility, leverage, per-position and OI limits, side caps/skew, and MarginVault free capacity. Prices are read from OracleRouter. The order intent path binds an account, market, action, nonce, expiry, acceptable price, and oracle sequence and requires an authorized order keeper for execution.
- Closing/partial settlement moves realized profits into trader free-collateral claims inside MarginVault and consumes trader collateral for losses/fees. These are internal claim changes against vault cash; no LP share ledger is updated.
- `withdrawableLiquidity` subtracts free and locked trader claims, pending positive PnL, and uncovered bad debt from `rawCash`. It is a capacity diagnostic for the MarginVault, not an LP redemption amount. `totalAccountedAssets()` returns `rawCash + pendingNegativePnl`; pending bad debt is not cash, so this method must not be treated as NAV.

### Fees, insurance, bad debt, and ADL

- Open/increase fees are collected into MarginVault. `_routeFee` only increments MarginVault's `insuranceReserve` counter for the configured insurance share; it does not send USDC to InsuranceFund. Reduce/close fees are collected in settlement but do not use the same split helper. Liquidation settlement has no fee-split call. No fee share reaches PublicLPVault.
- `InsuranceFund.fund` receives real USDC through an exact-delta transfer. The normal engine bad-debt path calls `coverBadDebt`, which transfers available USDC to MarginVault, then `receiveInsuranceCoverage` reconciles the new cash and reduces pending negative PnL. Product Testnet has 2 USDC funded; no current bad debt was observed. Mainnet insurance custody is zero.
- Mainnet token-collateral execution uses physical `coverBadDebt`. `recordBadDebt` changes InsuranceFund counters without a token transfer; it is the legacy no-token liquidation path, which the token-configured `liquidatePosition` explicitly disables.
- ADL removes an equivalent profitable trader claim and reduces recorded uncovered bad debt; it is an accounting resolution, not a USDC transfer. No ADL or insurance recovery is observed in either deployment snapshot.
- `ADLController.execute` marks a candidate used before calling the engine. Reverts roll the write back, but a successful partial reduction consumes the candidate's entire registered allowance, so the remaining position slice cannot be used again in that episode. `finalizeUnresolved` terminalizes any nonzero episode remainder and halts risk increases without proving all registered candidates were exhausted. This preserves the deficit but can halt early and strand usable reduction capacity.

### Existing PublicLPVault

The LP vault maintains its own USDC custody, shares, managed assets, local NAV, withdrawal queue, cooldown, and local liabilities. PR #2's aggregate queued-share guard prevents one account requesting more shares than it owns. It does not transfer capital to MarginVault, expose an LP claim to PerpEngine settlement, or receive settlement PnL. Its `marketRiskBudget` is zero in both snapshots. Its NAV covers only its own managed assets less liabilities it was told to record; it cannot value an allocation to MarginVault.

## Keeper and live settlement evidence

A read-only `pnpm keeper:once` dry run at Mainnet head block `28,488,762` reported:

```text
mode=READ_ONLY
eventCheckpoint=27,437,060
indexReady=false
eventPositionsReconciled=0
openPositions=0
simulatedLiquidations=null
```

The dry run is not a liquidation simulation result because the index is not ready. Its checkpoint trails the reported head by 1,051,702 blocks. The daemon intentionally advances a maximum of 10,000 event blocks per cycle, refuses to simulate from an incomplete index, and has no signer unless both explicit execution flags and a valid keeper setup are present. No signer, transaction, or keeper write was used here. This keeper cannot be described as production-ready.

The checked-in tests cover positive settlement paths, partial reductions, liquidation with insurance, custody parity, order replay/cancel, equal timestamps, transfer failure, unsolicited transfers, oracle replay/signature rejection, unauthorized configuration, stale oracle, position/OI limits, and basic ADL replay/budget accounting. The PR #5 exact-head GitHub CI passes `forge build`, `forge test`, and `forge fmt --check`; these are local-chain tests, not live trade receipts.

No current open Mainnet position was found in the deployment snapshot. A bounded `eth_getLogs` sample of only the latest 1,000 blocks returned no position events; that sample is not a complete deployment-history claim. The Mainnet keeper dry run also cannot prove a complete position history because its index is behind.

## Smallest safe changes and release dependencies

1. Keep the deployed Mainnet financial path disabled. Bootstrap and governance roles are incomplete, no market is verified live, no positive oracle/qualification canary is established, and the keeper index is incomplete.
2. For a future reviewed contract version, make ADL candidate consumption resumable after a partial reduction and track per-episode remaining candidates. Permit unresolved finalization only after bounded, deterministic candidate exhaustion is proved; keep any remaining deficit visible and retain the risk halt.
3. Route fees through one shared accounting function for open, increase, reduce, close, and liquidation. Make the split sum explicit and either transfer insurance/LP shares into separate custody or record a single enforceable claim against the same MarginVault cash. Do not double-count `accruedFees` and `insuranceReserve`.
4. Add end-to-end value-conservation tests covering physical custody, trader claims, fee splitting, insurance transfers, bad debt, ADL claim reductions, and withdrawals. Existing tests are valuable but do not validate PublicLPVault integration.
5. Obtain a complete, durable event index and reconcile all positions from deployment block before keeper simulation. Add restart, replay, gap, reorg, RPC failure, and role-denial tests for the standalone keeper worker.
6. Deployed contracts are direct non-proxy contracts. PerpEngine's MarginVault and InsuranceFund references are immutable, and the current PublicLPVault cannot be connected by a source-only patch. Any change to deployed economics requires an independently reviewed migration/replacement plan for existing shares, custody, roles, timelock, bytecode, and rollback; this audit does not authorize deployment or movement of funds.
7. A wallet-to-receipt Testnet trade and reconciliation remains required before any live-trading readiness claim. It was not performed because this mission prohibits financial transactions and funding.

The separate existing-LP accounting audit and minimal integration proposal is tracked in the dependent Group D draft PR. This review does not create or propose a second pool.
