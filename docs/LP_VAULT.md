# CLUSTER Public USDC Liquidity Pool (PublicLPVault)

## Overview & Purpose
`PublicLPVault` provides a production-grade, non-custodial liquidity pool for CLUSTER / ArcMemePerps on Arc Network (Chain ID: 5042). It enables members of the public to deposit native canonical USDC (`0x3600000000000000000000000000000000000000`, 6 decimals) and earn yield from perpetual trading fees while supplying capital that expands the protocol's trading capacity.

The vault is architected to operate safely without requiring an institutional backer, professional market-maker discretionary authority, or trusting custodial administrators. All accounting, allocation boundaries, withdrawal queuing, and solvency protections are strictly enforced at the smart contract level.

---

## Core Economic Architecture

```
                                  CLUSTER Liquidity Architecture
                                  
     +-------------------+                          +--------------------+
     |    Public LPs     |                          |      Traders       |
     +---------+---------+                          +---------+----------+
               |                                              |
       USDC    | LP Shares (NAV-proportional)        USDC     | Margin Collateral
       Deposit | Redemptions (Queued + Cooldown)    Collateral|
               v                                              v
      +-----------------+      Controlled Backing     +------------------+
      |  PublicLPVault  | ==========================> | USDCMarginVault  |
      | (Vault Reserve) | <========================== | (Trader Custody) |
      +--------+--------+      Withdrawable Only      +--------+---------+
               ^                                               |
               | Accrued Trading Fees (USDC)                   | Execution & PnL
               +---------------------------------------+       v
                                                       | +---------------+
                                                       | |  PerpEngine   |
                                                       | +---------------+
                                                       |       |
                                                       v       v
                                               +-------------------+
                                               |   InsuranceFund   |
                                               +-------------------+
```

### 1. Shares & Net Asset Value (NAV)
Depositors receive ERC-20 style LP shares that represent their proportional claim on the pool's net assets.
- **Initial Valuation**: The first depositor establishes the baseline ratio (1 share = 1 USDC in 6-decimal base units, or 1e18 WAD).
- **Proportional Share Valuation**:
  $$\text{Share Price (WAD)} = \frac{\text{navAssets}() \times 10^{18}}{\text{totalShares}}$$
- **NAV Definition**:
  $$\text{NAV} = \text{managedAssets} + \text{allocatedCapital} - (\text{pendingTraderLiability} + \text{insuranceReserve} + \text{cumulativeBadDebt})$$
- **Fee Accrual**: When trading fees accrue via `recordFeeRevenue(amount)`, the USDC fee is received into `managedAssets`. No new shares are minted, which mathematically increases `sharePriceWad` across all existing shares in real time.

### 2. Capital Allocation to Trading Backend
To support trading open interest without exposing the LP vault to direct liquidation reentrancy or trader custody commingling:
- **Authorized Route**: The governance executor designates `USDCMarginVault` as the sole authorized target (`setAuthorizedMarginVault`).
- **Controlled Allocation**: Capital is transferred from `PublicLPVault` into `USDCMarginVault` via `allocateToMarginVault(amount)`, calling `fundProtocolBacking(amount)`.
- **Trading Capacity Impact**: In `PerpEngine`, open interest capacity is constrained by `withdrawableLiquidity()` in `USDCMarginVault`. LP capital allocated as `protocolBacking` expands this capacity.
- **Allocation Ceiling**: `maxAllocationRatioBps` (governance configured, max 95%, default 80%) prevents over-allocation and guarantees a liquid cash buffer in the LP vault.
- **Strict Return Semantics**: Capital is retrieved from `USDCMarginVault` via `returnFromMarginVault(amount)`. The margin vault strictly requires:
  $$\text{amount} \le \text{withdrawableLiquidity}() \quad \text{and} \quad \text{amount} \le \text{protocolBacking}$$
  This prevents LP recalls from seizing active trader collateral or pending profits.

### 3. Solvency Isolation & Risk Boundaries
- **No Commingling**: Trader margin deposits sit strictly inside `USDCMarginVault` in the trader's individual account ledger. LPs have zero claim on trader collateral.
- **Insurance Fund Priority**: Bad debt from undercollateralized liquidations is first absorbed by the standalone `InsuranceFund`. Only uncovered bad debt exceeding insurance coverage impacts protocol backing.
- **Donation Attack Immunity**: `PublicLPVault` strictly accounts for deposits via `managedAssets` rather than raw `balanceOf(address(this))`. Direct unsolicited token transfers show up as `SURPLUS` in `custodyStatus()` and do not inflate the share price or allow share manipulation.
- **Zero-NAV Deposit Guard**: If catastrophic losses cause NAV to reach zero while shares exist, deposits revert with `ActivationUnsafe()`, preventing predatory minting against an insolvent state.

### 4. Queued Withdrawals & Cooldown
To protect the pool and trading system from front-running, sandwich attacks, and destabilizing bank runs:
1. **Request Phase (`requestWithdraw(shares)`)**:
   - The user locks their shares into the withdrawal queue.
   - An immutable cooldown period begins (e.g., 24 hours / 86,400 seconds).
   - During the cooldown, the shares remain subject to pool performance (NAV fluctuation).
2. **Execution Phase (`claimWithdraw()`)**:
   - Allowed only after `block.timestamp >= request.availableAt`.
   - The payout is calculated at the **current NAV** upon redemption:
     $$\text{USDC Amount} = \frac{\text{shares} \times \text{navAssets}()}{\text{totalShares}}$$
   - Liquid cash check: The redemption strictly checks that the vault has sufficient unallocated liquid USDC (`managedAssets - allocatedCapital >= amount`). If liquidity is currently allocated to open trades, the redemption waits until capital is returned from the margin vault, ensuring existing trader obligations are never defaulted on.

---

## Contract Roles & Governance Integration

| Role | Held By | Permissions |
| :--- | :--- | :--- |
| `owner` | Zero Address (`0x0`) | Permanently disabled via `finalizeBootstrap()`. |
| `governanceExecutor` | Protocol Timelock | Sets `maxPoolCap`, `authorizedMarginVault`, `maxAllocationRatioBps`, updates roles, and controls `setPublicLpActive`. |
| `EMERGENCY_ADMIN_ROLE` | Security Multisig | Can trigger `emergencyPausePublicLp()` to halt new deposits immediately. Cannot block pending withdrawal claims. |
| `RISK_ADMIN_ROLE` | Risk Controller Worker | Updates liability, reserve, and risk budgets based on audited on-chain settlement states. |

---

## Operational Verification & Test Coverage
The public LP pool implementation is verified by 7 dedicated automated integration tests in [ProductionPublicLPVault.t.sol](file:///c:/Users/DELL/ArcMemePerps/contracts/test/ProductionPublicLPVault.t.sol):
- `testCapitalAllocationToMarginVault`: Verifies bounded capital transfer to margin vault, updating `allocatedCapital` and `protocolBacking`.
- `testCapitalReturnFromMarginVault`: Verifies returning unencumbered capital from margin vault to LP vault.
- `testFeeRevenueIncreasesShareValue`: Validates that trading fee accrual increases NAV and share price without minting excess shares.
- `testQueuedWithdrawalWithLiquidityReservation`: Validates two-phase withdrawal request, cooldown enforcement, and payout execution.
- `testDonationInflationImmunity`: Confirms direct ERC-20 transfers are categorized as surplus and do not alter share price.
- `testMaxPoolCapRejection`: Verifies deposits exceeding `maxPoolCap` are rejected.
- `testEmergencyPauseBlocksDepositsOnly`: Verifies emergency pause immediately blocks deposits while preserving withdrawal claims past cooldown.
