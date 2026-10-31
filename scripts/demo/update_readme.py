import os

new_sections = """## 💡 What Is CLUSTER?

**CLUSTER (ArcMemePerps)** is the first **fail-closed, institutional-grade decentralized perpetual futures exchange and high-density trading terminal** purpose-built for volatile meme token markets, settling natively in **physical USDC on Arc Network** (`Chain ID: 5042`).

Meme coins represent the highest-velocity trading volume in decentralized finance, yet existing perpetual protocols are fundamentally incapable of listing them safely due to three systemic vulnerabilities:
1. **Manipulable & Stale Oracles**: Low-liquidity spot pools expose DEXs to flash-loan price manipulation and toxic oracle arbitrage.
2. **LP Pool Vulnerabilities & Donation Attacks**: Conventional ERC-4626 vaults conflate trading losses with liquidation bad debt, allowing toxic spills to drain LP pools, while unsolicited token donations manipulate share prices.
3. **Custody Deficits & Toxic Cascades**: Synthetic perp protocols frequently trade paper balances without strict senior/junior segregated physical collateral backing.

**CLUSTER eliminates these vulnerabilities through five architectural pillars:**
- **Zero-Custody-Deficit Vaults**: Trader collateral and LP capital are strictly partitioned into Senior liabilities (trader deposits, maintenance margin, positive PnL) and Junior liabilities (counterparty LP backing) inside `USDCMarginVault`, with every dollar provably accounted for on Arc Mainnet.
- **Fail-Closed 5-Gate Anti-Rug Framework**: Thousands of meme tokens can be discovered in real time, but no token can unlock leveraged trading without mathematically passing all 5 gates (liquidity floor, bot filtering, mint authority revoking, and holder dispersion).
- **Multi-Source EIP-712 Oracle Routing**: Pricing aggregates real-time multi-venue DEX liquidity (DexScreener, Raydium, Uniswap v3, Chainlink) through confidence-weighted medianization and monotonic sequence validation.
- **Donation-Immune Public LP Vault (ALP)**: Liquidity providers are protected by exact-once loss recognition and two-phase queued withdrawals. Unsolicited token donations register as protocol surplus rather than diluting or inflating share prices.
- **High-Density Cyberpunk Trading Terminal**: A zero-margin, GMGN-inspired trading experience featuring sub-second order execution, real-time dynamic liquidation metrics, instant take-profit/stop-loss toggles, and shareable high-res cyberpunk PnL brag cards.

---

## ⚙️ How CLUSTER Works: End-to-End Operational Lifecycle

CLUSTER operates as an autonomous, self-balancing financial engine spanning multichain telemetry, Arc smart contract settlement, and automated keeper watchdogs:

```mermaid
flowchart TD
    subgraph Step1["1. Multichain Discovery & Telemetry"]
        D1["Solana / PumpSwap DEX Pools"] -->|"Raw Token Ingestion"| DISC["Dual-RPC Indexer & Pipeline"]
        D2["DexScreener / Base / BNB"] --> DISC
        D3["Arc Native DEX Pools"] --> DISC
    end

    subgraph Step2["2. 5-Gate Anti-Rug Screening"]
        DISC --> G1["Gate 1: $1,000+ Liquidity Floor"]
        G1 --> G2["Gate 2: Anti-Wash Trading & Bot Volume Filter"]
        G2 --> G3["Gate 3: Mint & Freeze Authority Revocation"]
        G3 --> G4["Gate 4: Holder Concentration Analysis (<20%)"]
        G4 --> G5["Gate 5: QualificationRegistry.sol (On-Chain)"]
    end

    subgraph Step3["3. Multi-Source Oracle Pricing"]
        G5 --> OR["OracleRouter.sol (EIP-712 Multi-Source Medianizer)"]
        OR -->|"Validated Confidence Digest"| PE["PerpEngine Execution Core"]
    end

    subgraph Step4["4. Non-Custodial Collateral & Settlement"]
        TRADER["Trader (Arc USDC)"] -->|"Deposit Collateral"| MV["USDCMarginVault (Senior Liabilities)"]
        LP["Liquidity Provider (USDC)"] -->|"Counterparty Capital"| ALP["PublicLPVault (Junior Liabilities)"]
        PE <--> MV
        ALP <--> MV
        PE <--> IF["InsuranceFund (Bad Debt Absorption)"]
        PE <--> ADL["ADLController (Auto-Deleveraging)"]
    end

    subgraph Step5["5. Autonomous Watchdogs & Keepers"]
        PE -.-> KD["Autonomous Keeper Watchdog"]
        KD -->|"Liquidate Breached Positions"| PE
        KD -->|"Quarantine Rugged Markets"| G5
    end
```

### Detailed Operational Lifecycle

1. **Continuous Market Discovery**:
   - The CLUSTER ingestion engine monitors token launches and liquidity pools across Arc, Solana, Base, and BNB.
   - Newly deployed tokens immediately appear on the **Markets Terminal** and **Live Trenches** stream for discovery and community tracking.

2. **The 5-Gate Anti-Rug Qualification Engine**:
   - Before leverage is unlocked, a market must pass 5 automated verification gates:
     - **Gate 1 (Liquidity Floor)**: Minimum $1,000 in provable, locked DEX liquidity.
     - **Gate 2 (Volume Authenticity)**: Wash-trading detection filters out cyclical volume bots.
     - **Gate 3 (Contract Safety)**: Verifies mint and freeze authorities are irrevocably renounced.
     - **Gate 4 (Dispersion)**: Top non-pool holders must not exceed 20% total token supply.
     - **Gate 5 (On-Chain Qualification)**: The market is registered in `QualificationRegistry.sol`.
   - **Fail-Closed Safeguard**: If liquidity falls below the threshold at any point, the market is instantly quarantined into **Reduce-Only** mode.

3. **Multi-Source EIP-712 Oracle Consensus**:
   - Price feeds are sourced across multiple independent venues and combined via medianization.
   - Node operators submit EIP-712 threshold-signed reports containing timestamps, prices, and confidence scores.
   - Monotonic sequence verification prevents front-running and stale-data replay attacks.

4. **Non-Custodial Leveraged Trading**:
   - Traders deposit native Arc USDC directly into `USDCMarginVault`.
   - Positions can be opened Long or Short with leverage up to 5x.
   - Dynamic liquidation prices, maintenance margins, and borrowing fees are calculated deterministically on-chain.
   - Built-in Take-Profit (+50%, +100%) and Stop-Loss (-20%, -50%) limits protect positions automatically.

5. **Donation-Immune Counterparty ALP Accounting**:
   - Liquidity providers deposit USDC into `PublicLPVault` to receive ALP shares, earning a share of protocol trading fees.
   - **Exact-Once Loss Recognition**: Trading losses and bad debt are accounted for independently without double-counting:
     $$\\text{marginNetEquity} = \\max(0, \\text{marginCash} - \\text{traderLiabilities})$$
     $$\\text{economicAllocated} = \\min(\\text{allocatedCapital}, \\text{marginNetEquity})$$
     $$\\text{NAV} = \\max(0, (\\text{liquidCustody} + \\text{economicAllocated}) - (\\text{insuranceReserve} + \\text{uncoveredBadDebt}))$$
   - **Surplus Isolation**: Unsolicited direct token transfers register as protocol surplus rather than inflating NAV or diluting share values.

6. **24/7 Autonomous Keeper Execution**:
   - Keepers continuously scan position health on Arc Mainnet.
   - When a trader's margin ratio breaches the maintenance threshold, keepers trigger atomic liquidation.
   - Bad debt is absorbed first by protocol liquidator fees, second by `InsuranceFund`, and finally by ALP net assets, backed by `ADLController` as an emergency backstop.

7. **High-Density Cyberpunk Terminal & Shareable PnL Cards**:
   - The GMGN-style trading terminal integrates real-time DexScreener charts, order depth, active position trackers, and customizable cyberpunk avatars.
   - Traders can generate high-resolution PnL brag cards complete with their chosen trader persona, entry price, ROI percentage, and scan-able QR verification links.

---
"""

paths = [
    r"C:\Users\DELL\ArcMemePerps\README.md",
    r"C:\Users\DELL\ArcMemePerps-infra\README.md"
]

target_marker = "## 🌐 Arc Mainnet Live Deployment"

for p in paths:
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            content = f.read()
        if "## 💡 What Is CLUSTER?" in content:
            print(f"Already updated in {p}")
            continue
        if target_marker in content:
            idx = content.find(target_marker)
            updated = content[:idx] + new_sections + "\n\n" + content[idx:]
            with open(p, "w", encoding="utf-8") as f:
                f.write(updated)
            print(f"Successfully updated {p}")
        else:
            print(f"Marker not found in {p}")
