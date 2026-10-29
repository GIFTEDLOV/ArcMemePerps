# CLUSTER existing PublicLPVault economic integration audit

**Review date:** 2026-10-29
**Scope:** existing `PublicLPVault`, `USDCMarginVault`, `PerpEngine`, `InsuranceFund`, and `ADLController`.
**Result:** Group D **FAIL** for live LP backing. The source-level integration design and invariants below are complete; implementation is deferred because the deployment and shareholder-migration dependencies are not satisfied. No new pool is proposed. No contracts, balances, roles, or activation flags were changed.

## Verified deployment snapshots

All amounts are six-decimal USDC base units. These are pinned storage/custody snapshots, not a complete event history.

| State                                               |              Arc Mainnet, block `28,484,877` |                Arc Product Testnet, block `69,676,416` |
| --------------------------------------------------- | -------------------------------------------: | -----------------------------------------------------: |
| PublicLPVault                                       | `0x9ff8358dc5ee866e0b9707d0139cf47b399f5257` |           `0x826892d52172ddef07f2927ba67493465cf54964` |
| LP active / shares / managed assets / NAV / custody |                      `false / 0 / 0 / 0 / 0` | `true / 1,800,000 / 1,800,000 / 1,800,000 / 1,800,000` |
| LP market risk budget                               |                                          `0` |                                                    `0` |
| USDCMarginVault                                     | `0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf` |           `0xf73b9eb7e1853c9ba8f558542f1276584dd0f6ab` |
| Margin actual custody / `rawCash`                   |                      `1,000,000 / 1,000,000` |                                `5,600,000 / 5,600,000` |
| Protocol backing                                    |                                          `0` |                                            `5,000,000` |
| Trader free / locked collateral                     |                              `1,000,000 / 0` |                                          `599,198 / 0` |
| Fee counter / insurance reserve annotation          |                                      `0 / 0` |                                             `400 / 40` |
| Realized trader PnL gains / losses counters         |                                      `0 / 0` |                                              `0 / 402` |
| Pending positive/negative PnL / protocol bad debt   |                                  `0 / 0 / 0` |                                            `0 / 0 / 0` |
| Margin insurance-covered / ADL-covered bad debt     |                                      `0 / 0` |                                                `0 / 0` |
| Margin withdrawable liquidity                       |                                          `0` |                                            `5,000,802` |
| Insurance actual custody / available capital        |                                      `0 / 0` |                                `2,000,000 / 2,000,000` |
| PerpEngine next position ID / open interest         |                                      `1 / 0` |                                                `3 / 0` |

Mainnet block hash: `0xfd6dc29563cedbd9aa85c181f681b6f5d39b951a7d31a2790f5daae0788b8034`. Product Testnet block hash: `0x2b542655da8f02eae7e3625fe521e193c4483593b5f01036fd291ca224a190e9`.

The verified Mainnet receipt is a 1.000000 USDC deposit to MarginVault at block `27,246,895`, transaction [`0x7dd1dfeddc682e745ed84ba885ad3fd800400952522b03cc1126fd81915c4dc9`](https://explorer.arc.io/tx/0x7dd1dfeddc682e745ed84ba885ad3fd800400952522b03cc1126fd81915c4dc9). That USDC remains trader free collateral in the Mainnet snapshot. It is not LP capital or proof of trade settlement.

On Product Testnet, 5,000,000 protocol backing plus 600,000 net trader cash equals the 5,600,000 MarginVault cash. `599,198 + 400 + 402 = 600,000` is the observed numerical relationship among free collateral, fee counter, and cumulative loss counter; it is not a complete event trail or per-position PnL attribution. The 40-unit insurance reserve is an annotation inside the same MarginVault cash, not additional assets held by InsuranceFund. Product Testnet has two closed position records and no open positions.

## Custody and value-flow trace

### Mainnet

`wallet --1 USDC--> USDCMarginVault.rawCash and trader freeCollateral`. No LP vault received this deposit. No open position, realized trader profit, realized trader loss, fee, insurance recovery, or ADL settlement was observed in the pinned Mainnet snapshot. PublicLPVault, MarginVault, and InsuranceFund custody remain separate; PublicLPVault shares and assets are zero.

### Product Testnet

The existing PublicLPVault holds its own 1.8 USDC and issues 1.8 USDC-denominated shares. The MarginVault separately holds 5.6 USDC, comprising 5 USDC protocol backing and 0.6 USDC trader cash/accounting. InsuranceFund separately holds 2 USDC. No capital was transferred from PublicLPVault to MarginVault, `marketRiskBudget` is zero, and PerpEngine has no PublicLPVault reference. Thus the 1.8 USDC does not support current trader settlement.

## Component findings

### PublicLPVault

- Accepts USDC with an exact incoming custody-delta check; mints shares against its local NAV; maintains local `managedAssets`; and has cooldown withdrawal requests and claims.
- PR #2's aggregate request guard prevents a shareholder from queueing more shares than they own in total.
- `navAssets()` values local managed assets less local recorded trader liabilities, insurance reserve, and cumulative bad debt. Unsolicited tokens are surplus and do not become NAV.
- The vault has no MarginVault destination, no allocation or return call, no engine settlement hook, and no verified path that supplies it with authoritative MarginVault trader liabilities. Its NAV and withdrawals cannot see value sent to MarginVault or trader claims there.
- Product Testnet's `publicLpActive` is true at the contract layer even though the frontend disables deposits. The no-governance/no-transaction restriction prevents changing this state here.

### USDCMarginVault and PerpEngine

- MarginVault is the only PerpEngine custody/settlement vault. It receives trader collateral and governance-funded protocol backing; trader claims and realized PnL live in its own ledger.
- Engine open/increase/close/reduce/liquidate settlement changes MarginVault trader claims and bad-debt ledgers. Neither engine nor margin vault credits/debits PublicLPVault shares or LP NAV.
- `withdrawableLiquidity()` subtracts free and locked trader claims, pending positive PnL, and uncovered bad debt from `rawCash`. It is not an LP redemption calculation and does not prove that protocol backing is an LP claim.
- `totalAccountedAssets()` returns `rawCash + pendingNegativePnl`. Pending negative PnL is not cash; that value is not suitable as NAV.
- Open/increase fee collection calls `_routeFee`, which increments an `insuranceReserve` annotation but does not transfer USDC to InsuranceFund. Reduce/close settlement collects fees without the same split path; liquidation settlement does not call the split helper. No path distributes LP fees.

### InsuranceFund and ADLController

- InsuranceFund receives real USDC through its manager-gated `fund()` exact-delta path. The normal token-collateral engine path uses `coverBadDebt()` to transfer available USDC to MarginVault, after which MarginVault records the cash and covered amount. No current Mainnet insurance capital or recovery exists; Product Testnet has 2 USDC, with no current covered bad debt.
- `ADLController` asks PerpEngine to reduce profitable positions and MarginVault removes the matching profitable trader claim from pending negative PnL. This is non-cash claim reduction, not an insurance recovery or deposit.
- A successful partial ADL reduction consumes the candidate's full registered allowance, and `finalizeUnresolved()` can terminalize any remaining deficit without a bounded exhaustion proof. This can stop risk increases early and strand remaining candidate capacity.

## Minimum safe integration design

Keep the existing PublicLPVault as the sole public-share issuer. Connect it to the settlement custody through a fixed, verified MarginVault relationship rather than creating another pool or allowing arbitrary backing recipients.

1. **Track custody provenance.** MarginVault must distinguish trader collateral, protocol backing, and PublicLPVault backing. A deposit/return transition succeeds only when the actual USDC balance delta matches the ledger delta and the immutable asset addresses match. Only the configured existing LP vault may allocate or recover LP backing.
2. **Value LP shares at recoverable equity.** PublicLPVault NAV should equal locally held managed USDC plus its verified, realizable residual MarginVault equity and realized LP fee share, minus LP-attributable losses and its reserved obligations. Do not count nominal allocations at par or count the same tokens in both vaults.
3. **Set one explicit seniority and loss waterfall.** Trader collateral and positive trader settlement claims remain senior. Collected trader losses and fees change residual equity once. Physical InsuranceFund coverage is recorded once and only to the amount actually transferred. Remaining bad debt impairs recoverable LP equity only to its actual residual amount; ADL may reduce a profitable trader claim only against the remaining recorded deficit. Any uncovered remainder remains visible, blocks risk increases, and cannot be written off by a counter update.
4. **Unify fee collection and distribution.** Open, increase, reduce, close, and liquidation must use one fee accounting path. The configured protocol/insurance/LP shares must sum to the collected amount. Separate-fund allocations require exact token transfers; a same-vault claim is counted once and cannot be treated as external custody.
5. **Enforce allocation and withdrawal limits.** Cap allocation by a governed risk budget, available free cash, utilization, OI, reserve, and market limits. Return LP funds only to the fixed PublicLPVault after trader liabilities, positive PnL, insurance obligations, uncovered bad debt, and an operating buffer are reserved. Preserve queued-share bounds and cooldown; a request must not reserve assets unavailable after losses or other claims.
6. **Repair ADL lifecycle.** Track the remaining executable size of each candidate and bounded candidate exhaustion per episode. A partial reduction must leave unused capacity available. Unresolved finalization requires deterministic exhaustion evidence, retains the residual deficit, and keeps the engine risk halt in force.

## Accounting invariants required before implementation

1. For every custody transition, the token's actual USDC balance equals that vault's accounted cash after the call. Unsolicited transfers remain surplus and never become revenue or NAV.
2. Protocol backing and LP backing are separately attributable. LP capital credited to MarginVault equals USDC actually received from the one authorized PublicLPVault; returned capital equals USDC actually sent back to that same address.
3. Senior trader claims, pending positive PnL, and reserved external claims are counted once. MarginVault free capacity is never positive when actual cash cannot meet those claims and the risk buffer.
4. Public LP NAV uses local assets plus only verified realizable residual MarginVault equity, less the LP's realized losses and obligations. It excludes nominal allocations whose value has already been paid to trader winners or lost.
5. Every settlement affects trader liabilities and LP equity at most once. A winning claim cannot be paid from an LP withdrawal reservation; a trader loss cannot be booked as LP profit before the corresponding cash/claim reduction is confirmed.
6. Insurance available capital equals actual insurance custody. Each cover amount equals the InsuranceFund debit, exact MarginVault receipt, and the matching reduction in uncovered bad debt. An annotation is not cash.
7. ADL reduction is bounded by real position size, remaining episode deficit, and the positive claim actually removed. No deficit is erased without corresponding insurance cash, recognized LP loss absorption, or ADL claim reduction.
8. Fee splits sum to the cash collected; each fee is allocated once across all trade actions. `accruedFees` and `insuranceReserve` are not two assets.
9. Share supply, balances, queued shares, managed assets, recognized MarginVault equity, and withdrawals reconcile before and after every deposit, allocation, settlement, return, and claim.

## Required tests and deployment dependencies

Before a separate contract-implementation PR can start, an independent accounting/security review must sign off the invariants and waterfall above. The deployed Mainnet contracts are direct non-proxy deployments; PerpEngine's MarginVault and InsuranceFund references are immutable. Source-only edits cannot connect the existing deployed LP to the existing engine.

Required deployment work is a reviewed migration/replacement plan for the existing contracts; exact source/runtime verification of the target addresses; Product Testnet LP shareholder and custody reconciliation from a complete event index; same-USDC and reciprocal-role verification; a timelock/multisig role map; paused trading/deposits by default; rollback and deficit treatment; and independent financial review. Mainnet currently has no LP shares/custody, while Product Testnet has 1.8 USDC and active deposits. Share ownership cannot be migrated fairly until its full event/holder history is available. Mainnet bootstrap/governance is incomplete. No deployment, activation, governance write, or fund movement is authorized here.

The future implementation test suite must include deterministic profit/loss/fee/insurance/ADL/NAV/withdrawal scenarios, randomized operation sequences, insufficient-liquidity and transfer failure cases, fee-on-transfer rejection, unsolicited-transfer surplus, repeated/partial queued withdrawals, reentrancy, cross-episode ADL reuse, event replay/reorg handling, and exact custody-to-ledger reconciliation. A real-cash Testnet allocation/trade/settlement/withdrawal demonstration needs separate financial authorization and cannot be replaced by mocks.

## Decision

No LP source implementation is made in this checkpoint because the direct deployed contracts require a reviewed replacement/migration and the Product Testnet share-holder history and governance dependencies are not established. The current safe product state is frontend/API deposits disabled, while the Testnet contract-layer flag remains active and is a blocker. This audit is a separate Group D plan; it does not activate deposits, redeploy contracts, move funds, or create another pool.
