# CLUSTER Liquidity Architecture & Vault Integration Audit

## 1. Executive Summary & Phase 1 Audit

### 1.1 Technical Stack & Framework Versions
- **Solidity Compiler**: `0.8.24` (`via_ir = true`, `optimizer = true`, `runs = 200`).
- **Development & Testing Framework**: Foundry (`forge-rs`) for Solidity unit/fuzz/invariant tests; TypeScript `vitest` (v4.1.11) with `viem` (v2.56.9) for runtime testing.
- **Settlement Network**: Arc Mainnet (`Chain ID: 5042`, RPC: `https://rpc.mainnet.arc.io`).
- **Canonical Collateral Asset**: Native ERC-20 USDC precompile at `0x3600000000000000000000000000000000000000` (`decimals() == 6`).

### 1.2 Existing Core Contracts & Roles
1. **`USDCMarginVault.sol`**:
   - Manages physical ERC-20 USDC custody (`rawCash`) and trader balances (`freeCollateral`, `lockedCollateral`).
   - Slices liabilities into `totalFreeCollateral`, `totalLockedCollateral`, `pendingPositivePnl`, and `uncoveredBadDebt`.
   - Reconciles expected custody with actual ERC-20 balance (`actualCustodyUsdc()`), exposing `SURPLUS` or `DEFICIT`.
   - Contains `fundProtocolBacking(uint256 amount)` which allows governance to inject unencumbered protocol backing into `rawCash` to provide capacity for open interest.
2. **`PublicLPVault.sol`**:
   - Accepts public deposits in USDC, issues non-transferable LP accounting shares, and processes withdrawals via a two-step cooldown queue (`requestWithdraw` -> `claimWithdraw`).
   - Computes NAV: `navAssets() = managedAssets - (pendingTraderLiability + insuranceReserve + cumulativeBadDebt)`.
   - Release-guarded by `publicLpActive`, requiring zero bad debt, custody match, and controller assignment.
3. **`PerpEngine.sol`**:
   - Execution engine that verifies order parameters, risk policies, and oracle reports.
   - Enforces `_requireVaultCapacity`: `totalOpenInterest[marketId] + sizeAdded <= marginVault.withdrawableLiquidity()`.
   - Calls `USDCMarginVault` for collateral locking, fee collection, funding accrual, and position settlement (`settlePositionWad`, `settlePartialWad`, `settleLiquidationWad`).
4. **`InsuranceFund.sol`**:
   - First line of defense for bad debt before ADL. Holds isolated reserve capital and settles deficits via `coverBadDebt`.

---

## 2. Fund Lifecycle & Accounting Trace

```
[Public LPs]                     [Traders]
     | USDC Deposit                   | USDC Deposit
     v                                v
+------------------+             +----------------------+
|  PublicLPVault   |             |   USDCMarginVault    |
| (Shares issued)  |             | (freeCollateral incr)|
+------------------+             +----------------------+
     |                                    |
     | Bounded Capital Allocation         | Trader opens position:
     | (allocateCapital)                  | - freeCollateral locked
     +----------------------------------->| - trading fees collected
                                          v
                                 +----------------------+
                                 |      PerpEngine      |
                                 | (Capacity check via  |
                                 | withdrawableLiquidity|
                                 +----------------------+
                                          |
                        +-----------------+-----------------+
                        | Position Close                    | Liquidation
                        v                                   v
             Trader realizes PnL:                 Residual collateral returned;
             - Win: draws from unencumbered cash  Bad debt (if loss > collateral)
             - Loss: increases unencumbered cash  sent to InsuranceFund, then ADL.
```

---

## 3. Findings: What Works vs. What is Missing

### What Already Works:
- **Strict Custody Invariants**: Both `USDCMarginVault` and `PublicLPVault` verify token balances before and after every transfer to eliminate fee-on-transfer / reentrancy discrepancies.
- **Capacity Binding**: `PerpEngine` strictly checks `marginVault.withdrawableLiquidity()` before allowing any position to open.
- **Queue-Based LP Withdrawals**: `PublicLPVault` already implements an epoch/cooldown withdrawal mechanism (`withdrawalCooldown`) to mitigate just-in-time liquidity extraction attacks.
- **Separation of Concerns**: Trader collateral is strictly segregated from insurance fund reserves and protocol backing.

### Critical Deficiencies Identified:
1. **Zero Capital Allocation Mechanism**:
   - `PublicLPVault` has no function to deploy its pooled USDC into `USDCMarginVault` to provide protocol backing.
   - `USDCMarginVault` has `fundProtocolBacking`, but it has no function to release or return protocol backing to `PublicLPVault` when unencumbered liquidity is available.
2. **First-Depositor Share Inflation Vulnerability**:
   - In `PublicLPVault`, initial shares equal `assets`. If an attacker deposits 1 unit and donates unsolicited tokens, they could distort share pricing. A permanent `MINIMUM_LIQUIDITY` (virtual burn or offset) is necessary.
3. **Uncapped Deposits**:
   - `PublicLPVault` lacks a `maxPoolCap` setting to restrict total assets under management during initial bootstrap phases.
4. **Allocation Risk Limits Missing**:
   - No limits on the maximum percentage of pool capital that can be deployed to margin vault backing (e.g., maximum 80% allocation, preserving a minimum 20% liquid reserve for pending LP withdrawals).

---

## 4. The Liquidity Model & Counterparty Architecture

### Is the Pool a Direct Counterparty or a Liquidity Provider?
- **Model**: `PublicLPVault` serves as a **Protocol Backing Provider & Settlement Counterparty Reserve**.
- It does **not** take bilateral directional exposure on every tick. Instead, it provides physical USDC to `USDCMarginVault` as `protocolBacking`.
- **Trader Wins**: Net trader gains are paid out of `withdrawableLiquidity` in `USDCMarginVault` (funded by LP capital), reducing the unencumbered capital available to be returned to the pool.
- **Trader Losses**: Trader collateral losses remain in `USDCMarginVault` as unencumbered cash, increasing the capital that can be returned to the LP vault.
- **Fee Accrual**: Protocol trading fees collected by `USDCMarginVault` can be shared with `PublicLPVault` to compensate LPs for underwriting trading capacity.
- **Bad Debt Protection**: Trader losses exceeding collateral trigger `InsuranceFund.coverBadDebt` first, followed by `ADLController` deleveraging, shielding LPs from unconstrained deficit risk.
