# CLUSTER LP Risk & Economic Model

## Executive Summary
The CLUSTER Public LP Vault allows passive liquidity providers to fund trading capacity for perpetual contracts on the Arc Network. In exchange for capital, LPs earn protocol trading fees. However, LPs act as a capital backstop to protocol solvency and are exposed to specific market and operational risks. 

This document defines the mathematical models, risk boundaries, capacity constraints, and downside absorption mechanisms governing LP capital.

---

## 1. Capital Flow & Revenue Model

### Revenue Sources
LPs earn yield from protocol trading activity:
- **Trading Fees**: A configurable percentage of execution fees from position opening, closing, and liquidation is routed directly to `PublicLPVault.recordFeeRevenue(feeAmount)`.
- **Borrowing / Funding Skew**: Net positive funding rates or borrow fees accrued to the protocol can be recognized as protocol revenue.

### Mathematical Accrual
Revenues transferred to the LP vault expand `managedAssets` without minting additional shares:
$$\text{NAV}_t = \text{NAV}_{t-1} + \Delta\text{FeeRevenue}$$
$$\text{Share Price}_t = \frac{\text{NAV}_t}{\text{Total Shares}}$$
This accrual is passive, continuous, and requires no claiming or compounding transactions from the LP.

---

## 2. Risk Exposure & Loss Absorption Waterfall

When volatile market movements occur or positions are liquidated under distressed conditions, losses follow a strict priority waterfall:

```
Loss Event (Trader Insolvency / Negative Equity)
                       │
                       ▼
       ┌───────────────────────────────┐
       │ 1. Trader Margin Collateral   │  (Loss absorbed up to initial margin)
       └───────────────┬───────────────┘
                       │ If Deficit Exceeds Collateral (Bad Debt)
                       ▼
       ┌───────────────────────────────┐
       │ 2. Dedicated InsuranceFund    │  (Absorbs liquidation shortfall)
       └───────────────┬───────────────┘
                       │ If Insurance Fund Depleted
                       ▼
       ┌───────────────────────────────┐
       │ 3. Public LP Capital Backing  │  (Uncovered bad debt reduces NAV)
       └───────────────┬───────────────┘
                       │ Extreme Cascade / Terminal Solvency Guard
                       ▼
       ┌───────────────────────────────┐
       │ 4. Auto-Deleveraging (ADL)    │  (Closes opposing profitable positions)
       └───────────────────────────────┘
```

1. **Trader Initial Margin**: Traders first lose their deposited collateral in `USDCMarginVault`.
2. **Insurance Fund**: If slippage causes a liquidated position's equity to go negative, `InsuranceFund` covers the deficit up to its liquid capacity.
3. **Public LP Vault NAV**: If the Insurance Fund is exhausted, uncovered bad debt is recorded against protocol backing (`recordBadDebt`), directly reducing the LP Vault's `cumulativeBadDebt` deduction and decreasing share price.
4. **Auto-Deleveraging (ADL)**: To prevent total protocol insolvency, the system implements an ADL mechanism (`PerpEngine.resolveUncoveredLossWithAdl`) that curtails opposing winning positions when uncovered bad debt threatens pool reserves.

---

## 3. Capacity & Exposure Limits

To prevent unchecked risk accumulation, the protocol enforces multi-tiered parameter limits:

### A. Pool Cap (`maxPoolCap`)
- Maximum total USDC that can be deposited in `PublicLPVault`.
- Governed to prevent the LP pool from expanding beyond the operational monitoring and risk capacity of the protocol.

### B. Allocation Ratio (`maxAllocationRatioBps`)
- Controls what percentage of LP assets may be allocated to `USDCMarginVault` as `protocolBacking`.
- **Default**: 80% (8,000 bps).
- **Hard Upper Limit**: 95% (9,500 bps).
- **Mandatory Reserve**: At least 5% (and typically 20%) of LP assets remain as liquid cash inside `PublicLPVault` to facilitate normal withdrawal claims without requiring immediate capital recalls from the trading engine.

### C. Open Interest Capacity Bound
- `PerpEngine` enforces that total open interest across any market cannot exceed `withdrawableLiquidity()` in `USDCMarginVault`:
  $$\text{Total OI} + \Delta\text{Size} \le \text{MarginVault.withdrawableLiquidity}()$$
- This mathematical constraint ensures that traders can never open more exposure than can be fully settled by existing margin and unencumbered protocol backing.

---

## 4. Withdrawal Dynamics & Stress Scenarios

### Cooldown Protection
- LPs must wait through an immutable cooldown (e.g., 24 hours) between `requestWithdraw()` and `claimWithdraw()`.
- Prevents just-in-time deposit/withdrawal front-running of anticipated fee spikes or oracle oracle arbitrage.

### High Utilization / Locked Liquidity
- If allocated LP capital is actively backing open trader positions in `USDCMarginVault`, `withdrawableLiquidity()` may be temporarily depressed.
- `PublicLPVault.claimWithdraw()` guarantees that redemptions can only be paid out of actual unencumbered liquid cash:
  $$\text{managedAssets} - \text{allocatedCapital} \ge \text{payoutAmount}$$
- If available liquid cash is temporarily insufficient, the redemption waits until either:
  1. Open positions naturally close, freeing up `withdrawableLiquidity` in `USDCMarginVault`.
  2. The risk controller or governance executes `returnFromMarginVault(amount)`.
- **Solvency Invariant**: LP redemptions can **never** force an undercollateralization of active trader collateral or pending trader profits.
