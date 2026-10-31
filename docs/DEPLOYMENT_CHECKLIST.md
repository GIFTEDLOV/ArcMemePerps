# CLUSTER Public LP Vault Deployment & Activation Checklist

This checklist details the exact step-by-step operational procedure for deploying and activating the production `PublicLPVault` and integrating it with `USDCMarginVault` and `PerpEngine` on Arc Mainnet (`Chain ID: 5042`) or Arc Testnet (`Chain ID: 5042002`).

---

## 1. Pre-Deployment Verification

- [ ] **Canonical USDC Address Verified**:
  - Arc Mainnet / Testnet Canonical USDC: `0x3600000000000000000000000000000000000000` (6 decimals).
- [ ] **Access Credentials & Environment**:
  - Deployer address funded with native gas token.
  - Dedicated multi-sig addresses established for:
    - `TIMELOCK_GOVERNANCE_EXECUTOR` (governance control).
    - `EMERGENCY_MULTISIG` (`EMERGENCY_ADMIN_ROLE`).
    - `RISK_CONTROLLER_WORKER` (`RISK_ADMIN_ROLE`).
- [ ] **Audit & Code Verification**:
  - Commit hash verified: all Foundry tests (`forge test`) and TypeScript tests (`pnpm test`) passing 100%.

---

## 2. Deployment Sequence

### Step 1: Deploy `PublicLPVault`
```solidity
// Cooldown: 86,400 seconds (24 hours)
PublicLPVault lpVault = new PublicLPVault(
    0x3600000000000000000000000000000000000000, 
    86400
);
```

### Step 2: Configure Initial Vault Parameters (Deployer Phase)
Before bootstrap finalization, the deployer configures initial routes and limits:
```solidity
// 1. Authorize Margin Vault
lpVault.setAuthorizedMarginVault(address(marginVault));

// 2. Authorize Liquidity Pool on Margin Vault
marginVault.setLiquidityPool(address(lpVault));

// 3. Set Risk Controller Worker
lpVault.setRiskController(RISK_CONTROLLER_WORKER);

// 4. Set Initial Pool Cap (e.g. 500,000 USDC)
lpVault.setMaxPoolCap(500_000_000_000);

// 5. Set Maximum Allocation Ratio (e.g. 80%)
lpVault.setMaxAllocationRatioBps(8000);

// 6. Assign Emergency Role
lpVault.setRole(lpVault.EMERGENCY_ADMIN_ROLE(), EMERGENCY_MULTISIG, true);
```

### Step 3: Seed Initial Liquidity (Anti-Frontrunning)
```solidity
// Deployer seeds initial pool deposit (e.g. 1,000 USDC)
// to establish initial 1:1 NAV ratio and prevent first-depositor griefing.
usdc.approve(address(lpVault), 1_000_000_000);
lpVault.deposit(1_000_000_000);
```

### Step 4: Finalize Bootstrap (Relinquish Deployer Bypass)
```solidity
// 1. Transfer governance authority to protocol timelock
lpVault.setGovernanceExecutor(TIMELOCK_GOVERNANCE_EXECUTOR);
marginVault.setGovernanceExecutor(TIMELOCK_GOVERNANCE_EXECUTOR);

// 2. Permanently renounce deployer ownership
lpVault.finalizeBootstrap();
marginVault.finalizeBootstrap();
```

---

## 3. Post-Deployment Activation Ceremony

The pool remains deactivated (`publicLpActive == false`) until the Governance Executor executes the activation proposal.

### Step 5: Governance Activation Call
Via Timelock / Multi-Sig execution:
```solidity
// Checks required by setPublicLpActive:
// - bootstrapFinalized == true
// - riskController != address(0)
// - custodyStatus == MATCH (no unaccounted deficits)
// - cumulativeBadDebt == 0
// - navAssets() > 0
// - marketRiskBudget <= navAssets()
lpVault.setPublicLpActive(true);
```

---

## 4. Verification & Health Monitoring

- [ ] Verify `publicLpActive == true` on-chain.
- [ ] Confirm `sharePriceWad() == 1e18` (1 USDC per share).
- [ ] Confirm `custodyStatus()` returns `MATCH`.
- [ ] Verify frontend and indexer listen to `Deposited`, `WithdrawalRequested`, `WithdrawalClaimed`, and `CapitalAllocated` events.
- [ ] Monitor keeper daemon to verify that periodic reconciliation runs without errors.
