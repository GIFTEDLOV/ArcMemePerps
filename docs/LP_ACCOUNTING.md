# CLUSTER Public LP Vault: Accounting & Net Asset Value (NAV) Specification

## 1. Principles of Accounting Integrity
1. **Physical Assets vs. Virtual Claims**: No internal balance can be increased without verifiable asset custody.
2. **Segregation of Liabilities**: Trader collateral in `USDCMarginVault` belongs to traders. It is never counted towards LP Net Asset Value (NAV).
3. **No Double-Counting**: When capital is allocated from `PublicLPVault` to `USDCMarginVault`, it is accounted as `allocatedCapital`. It is never counted twice.
4. **Donation Attack Immunity**: `navAssets()` calculates value strictly from protocol-acknowledged deposits (`managedAssets`), subtracting verified liabilities. Unsolicited ERC-20 transfers appear as `SURPLUS` in `custodyStatus()` and cannot artificially inflate the share price to dilute subsequent depositors.

---

## 2. Net Asset Value (NAV) Formula

$$\text{Accounting NAV} = \text{Managed Assets} - (\text{Pending Trader Liabilities} + \text{Insurance Reserves} + \text{Cumulative Bad Debt})$$

Where:
- **`Managed Assets`**: The total capital under LP management.
  $$\text{Managed Assets} = \text{Liquid USDC in LP Vault} + \text{Active Capital Allocated to Margin Vault} + \text{Accrued Fee Revenue}$$
- **`Pending Trader Liabilities`**: Unrealized profits owed to open winning trader positions backed by the pool.
- **`Insurance Reserves`**: Segregated reserves allocated for bad debt backstops.
- **`Cumulative Bad Debt`**: Realized trader insolvency exceeding insurance fund capacity that has been absorbed by the pool.

---

## 3. LP Share Issuance & Redemption

### Initial Deposit:
$$\text{Shares Issued} = \text{Assets Deposited}$$
$$\text{Share Price} = 1.000000 \text{ USDC (1e18 WAD)}$$

### Subsequent Deposits:
$$\text{Shares Issued} = \frac{\text{Assets Deposited} \times \text{Total Shares}}{\text{NAV Before Deposit}}$$

### Share Price:
$$\text{Share Price (WAD)} = \frac{\text{NAV} \times 10^{18}}{\text{Total Shares}}$$

### Redemptions & Withdrawals:
$$\text{USDC Redeemed} = \frac{\text{Shares Burned} \times \text{NAV}}{\text{Total Shares}}$$

*Withdrawal Constraint*: An LP can only withdraw unencumbered liquid USDC held directly by `PublicLPVault`. If assets are actively allocated to `USDCMarginVault` to support open interest capacity, the risk controller must de-allocate that capital (`returnFromMarginVault`) before it can be redeemed for cash.

---

## 4. Controlled Capital Allocation Between Vaults

```
+-------------------------------------------------------------------+
|                         PublicLPVault                             |
|  - liquidCustodyUsdc() (Unallocated Cash in Vault)                |
|  - allocatedCapital()  (Deployed into USDCMarginVault)            |
+-------------------------------------------------------------------+
             |                                    ^
             | allocateToMarginVault(amount)      | returnFromMarginVault(amount)
             v                                    |
+-------------------------------------------------------------------+
|                        USDCMarginVault                            |
|  - rawCash() (Physical USDC in custody)                           |
|  - protocolBacking() (Funds backing PerpEngine capacity)          |
|  - withdrawableLiquidity() = rawCash - traderLiabilities          |
+-------------------------------------------------------------------+
```

### Safety Rules Enforced on Allocation:
1. **Ratio Bound**: `allocatedCapital + amount <= (NAV * maxAllocationRatioBps) / 10000` (Default: 80% maximum allocation).
2. **Liquid Reserve**: The pool retains at least 20% liquid USDC to service ongoing queued LP withdrawal claims.
3. **Return Safeguard**: `USDCMarginVault.returnProtocolBacking` requires:
   $$\text{amount} \le \text{withdrawableLiquidity}() \quad \text{AND} \quad \text{amount} \le \text{protocolBacking}$$
   This guarantees that funds backing open trader margins, locked collateral, or pending profits are **never** expropriated to pay LP withdrawals.
