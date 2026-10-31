# CLUSTER Liquidity Pool Security Boundaries & Limitations

## Security Guarantees & Built-In Protections

The `PublicLPVault` and its integration with `USDCMarginVault` and `PerpEngine` enforce several critical smart contract protections:

### 1. Immunity to Donation / Inflation Attacks
- **Vulnerability Addressed**: In typical ERC-4626 implementations, an attacker can donate tokens directly to an empty vault to artificially inflate the share price and front-run victim deposits.
- **Protocol Defense**: `PublicLPVault` uses `managedAssets` as its accounting balance instead of `balanceOf(address(this))`. Direct ERC-20 transfers show up as `SURPLUS` in `custodyStatus()` and do not inflate the NAV or the share price.

### 2. Trader Margin Segregation
- **Vulnerability Addressed**: LP withdrawals depleting funds needed to pay winning traders, or trader losses directly defaulting without a designated buffer.
- **Protocol Defense**: Trader collateral is held in `USDCMarginVault` with individual balance ledgers. LP capital allocated to `USDCMarginVault` is tracked separately as `protocolBacking`. Recalls from the margin vault via `returnProtocolBacking` strictly require:
  $$\text{amount} \le \text{withdrawableLiquidity}() \quad \text{and} \quad \text{amount} \le \text{protocolBacking}$$
  An LP can never withdraw collateral that is currently backing active trader obligations.

### 3. Cooldown & Anti-MEV Queue
- **Vulnerability Addressed**: Sandwich attacks where an LP deposits before a large profitable fee liquidation and immediately withdraws, extracting value from long-term LPs.
- **Protocol Defense**: Two-phase withdrawals enforce an immutable cooldown period (e.g. 24 hours). Shares remain exposed to pool performance until final redemption, eliminating risk-free fee skimming.

### 4. Zero-NAV Deposit Guard
- **Vulnerability Addressed**: If a catastrophic loss reduces pool NAV to zero while shares still exist, a new depositor could acquire a dominant share percentage at an unfair price.
- **Protocol Defense**: `deposit()` strictly checks that NAV is non-zero if existing shares exist (`ActivationUnsafe()`), preventing predatory minting against an insolvent state.

---

## Known Limitations & Protocol Risks

While the smart contracts eliminate custodial discretion and direct manipulation vectors, liquidity providers remain exposed to fundamental economic and operational limits:

### 1. Oracle Reliance & Latency
- The settlement of perpetual contracts depends on accurate and timely oracle price feeds from `OracleRouter`.
- If external oracle feeds experience prolonged latency, downtime, or manipulation, positions may be liquidated at stale or incorrect prices, leading to excess bad debt that diminishes LP NAV.

### 2. Rapid Market Gaps & Cascading Liquidations
- In the event of extreme market volatility or sudden illiquidity on underlying meme tokens, liquidations may execute with severe slippage.
- If the deficit exceeds the trader's margin and the liquid resources of the `InsuranceFund`, uncovered bad debt will be absorbed by LP capital, lowering share NAV. Auto-Deleveraging (ADL) bounds this exposure but may not eliminate slippage under extreme network congestion.

### 3. Liquidity Lockup During High Protocol Utilization
- When open interest is high relative to vault capacity, capital transferred into `USDCMarginVault` is locked backing active trades.
- In this state, `PublicLPVault.claimWithdraw()` will pause execution if unallocated liquid reserves are exhausted, until open positions are closed or capital is returned from the margin vault. LP withdrawals are solvent and queued, but not instantaneously liquid during peak utilization.

### 4. Governance & Role Execution
- Parameters such as `maxPoolCap`, `maxAllocationRatioBps`, and activation status are governed by `governanceExecutor`.
- While bootstrap finalization removes deployer backdoor authority, malicious governance or compromised timelock execution could modify parameter limits up to hardcoded caps (e.g., maximum 95% allocation).
