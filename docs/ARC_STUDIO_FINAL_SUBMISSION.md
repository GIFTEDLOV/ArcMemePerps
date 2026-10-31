# CLUSTER (ArcMemePerps): Arc Studio Hackathon Official Submission Dossier

**Project Name:** CLUSTER (ArcMemePerps)  
**Tagline:** High-Velocity Meme Perpetual Futures with Multi-Source Oracle Verification and Donation-Immune LP Accounting on Arc Network.  
**Repository:** [https://github.com/GIFTEDLOV/ArcMemePerps](https://github.com/GIFTEDLOV/ArcMemePerps)  
**Production API:** [https://cluster-readonly-api.vercel.app](https://cluster-readonly-api.vercel.app)  
**Interactive Web Terminal:** [https://cluster-hackathon-preview.vercel.app](https://cluster-hackathon-preview.vercel.app)  
**Demo Video:** [`arcmemeperps_3min_demo.mp4`](file:///C:/Users/DELL/.gemini/antigravity/brain/75966656-aa47-446b-98b6-6357ca8e94a7/arcmemeperps_3min_demo.mp4)  
**Track:** DeFi & Derivatives / Arc Ecosystem  

---

## 1. Executive Summary

Meme coins represent the fastest-growing volume on decentralized exchanges, yet existing perpetual protocols are fundamentally incapable of listing them safely. Traditional perp DEXs rely on slow CEX oracles, allow toxic liquidation cascades to drain LP pools, and suffer from donation share-inflation exploits.

**CLUSTER** solves this by introducing a purpose-built, fail-closed perpetual architecture native to Arc Network (settling directly in native Arc USDC):
1. **Conservative Multi-Source Oracle Router**: Aggregates DexScreener, Raydium, Uniswap, and Chainlink observations using medianization, sequence monotonicity, and EIP-712 threshold signatures.
2. **Deterministic Senior/Junior Margin Vault**: Partitions trader collateral into senior claims (free collateral, locked maintenance margin, positive PnL) and junior LP capital backing, ensuring zero custody deficit.
3. **Donation-Immune Public LP Vault**: Enforces strict ERC-4626 share pricing with two-phase queued withdrawals, NAV bad debt deductions, and surplus tracking (unsolicited donations register as protocol surplus, preventing share manipulation).
4. **Resilient Dual-RPC Event Indexer**: A contiguous event journal running against Neon Serverless PostgreSQL with dual-RPC receipt validation across over 1.5 million Arc Mainnet blocks.

---

## 2. Verified Deployments & Network Evidence

### 2.1 Arc Testnet (`5042002`) Live Product Deployment
Verified via `scripts/testnet-product-live-probe.mjs` against `https://rpc.testnet.arc.io` (Block `69,987,415`):
- **Outcome**: `NO_CUSTODY_DEFICIT_OBSERVED`
- **LP Custody**: `1,800,000` base units (1.8 USDC, status: MATCH)
- **Margin Custody**: `5,600,000` base units (5.6 USDC, status: MATCH)
- **Market ID**: `0xf8ffffb2f0f52e8bb2b71484007f5cf705f41f83369be65b4fba067293723387` (Status: `APPROVED` / `LIVE`)
- **Reporter Threshold**: 2-of-3 EIP-712 threshold signatures active

| Contract | Address | Explorer Link |
| :--- | :--- | :--- |
| **PerpEngine** | `0xbd2c3ad91799110adf647493acbaa1f63a40514c` | [View on ArcScan](https://testnet.arcscan.app/address/0xbd2c3ad91799110adf647493acbaa1f63a40514c) |
| **USDCMarginVault** | `0xf73b9eb7e1853c9ba8f558542f1276584dd0f6ab` | [View on ArcScan](https://testnet.arcscan.app/address/0xf73b9eb7e1853c9ba8f558542f1276584dd0f6ab) |
| **PublicLPVault** | `0x826892d52172ddef07f2927ba67493465cf54964` | [View on ArcScan](https://testnet.arcscan.app/address/0x826892d52172ddef07f2927ba67493465cf54964) |
| **OracleRouter** | `0xfdc85c3a13186e9be0ad63c34b5162de25BD39a5` | [View on ArcScan](https://testnet.arcscan.app/address/0xfdc85c3a13186e9be0ad63c34b5162de25BD39a5) |
| **InsuranceFund** | `0x131ce3346eb5e15a3ae3c1cba2cd93d54dc6877b` | [View on ArcScan](https://testnet.arcscan.app/address/0x131ce3346eb5e15a3ae3c1cba2cd93d54dc6877b) |
| **ADLController** | `0xca600bcd65de31d65ee198a82d5d51d50fa4b841` | [View on ArcScan](https://testnet.arcscan.app/address/0xca600bcd65de31d65ee198a82d5d51d50fa4b841) |
| **QualificationRegistry** | `0x5f4193cbbcaf64175b2bb3dbe46dd6c7733c59bd` | [View on ArcScan](https://testnet.arcscan.app/address/0x5f4193cbbcaf64175b2bb3dbe46dd6c7733c59bd) |
| **MarketRegistry** | `0x4ea3fbb41962d0a3ec28c570656ea9d5ac1904bb` | [View on ArcScan](https://testnet.arcscan.app/address/0x4ea3fbb41962d0a3ec28c570656ea9d5ac1904bb) |
| **RiskConfig** | `0x3f9a6bfd2019b760d85eaf2ce0827534d58e65ad` | [View on ArcScan](https://testnet.arcscan.app/address/0x3f9a6bfd2019b760d85eaf2ce0827534d58e65ad) |
| **ProtocolTimelock** | `0xec9eed7f03a945ca9a810ed0db87c6dc6f23901f` | [View on ArcScan](https://testnet.arcscan.app/address/0xec9eed7f03a945ca9a810ed0db87c6dc6f23901f) |

### 2.2 Arc Mainnet (`5042`) Deployed Contracts & Fail-Closed Guard
Verified via `scripts/mainnet-readiness-gate.mjs` against `https://rpc.mainnet.arc.io` (Block `28,794,922`):
- **Contracts Deployed**: All 10 protocol contracts deployed.
- **Fail-Closed State**: `tradingEnabled: false`, `lpDepositsEnabled: false`.
- **Reason**: Oracle feeds and qualification remain strictly fail-closed until live multi-source reporters broadcast verified price digests on Mainnet.

---

## 3. Mathematical Proofs & Accounting Invariants

### 3.1 Exact-Once Loss Recognition Proof
Formally proved in `contracts/test/ProductionPublicLPVault.t.sol` (`testIndependentLossCounterexampleFailsOldFormulaSucceedsNew`):
- **Scenario**:
  - Initial LP Capital: \$25,000 (\$5,000 liquid + \$20,000 allocated to margin vault).
  - Loss 1 (Unrelated trading profit obligation): \$3,000.
  - Loss 2 (Liquidation bad debt): \$3,000.
- **Flawed Formula**:
  $$\text{netUnabsorbedLoss} = \max(0, \text{debtToDeduct} - \text{allocatedImpairment}) = \max(0, 3\text{k} - 3\text{k}) = 0 \implies \text{Flawed NAV} = \$22,000$$
- **Corrected Exact-Once Formula (Merged in PR #26)**:
  $$\text{marginNetEquity} = \max(0, \text{marginCash} - \text{traderLiabilities})$$
  $$\text{economicAllocated} = \min(\text{allocatedCapital}, \text{marginNetEquity})$$
  $$\text{NAV} = \max(0, (\text{liquidCustody} + \text{economicAllocated}) - (\text{insuranceReserve} + \text{uncoveredBadDebt})) = \$19,000$$
- **Outcome**: Exact recognition of both distinct losses without double-counting or masking.

### 3.2 Invariant Fuzzing (128,000 Calls)
Verified in `contracts/test/Gate3Invariants.t.sol`:
- `invariant_FundingConservation`: 128,000 random caller operations across longs and shorts prove funding rate conservation holds with 0 discrepancies.
- `invariant_FundingStateIsNonNegative`: 128,000 calls prove internal borrowing and funding accumulators never underflow.

---

## 4. Full Monorepo Architecture

```
ArcMemePerps/
├── contracts/               # Core Solidity 0.8.24 contracts & Foundry test suites
│   ├── src/                 # PerpEngine, USDCMarginVault, PublicLPVault, OracleRouter, etc.
│   └── test/                # 11 suites, 104 tests (Foundry invariant fuzzing, adversarial accounting)
├── apps/
│   ├── cluster-api-vercel/  # Serverless production API on Vercel with receipt-backed discovery
│   ├── frontend/            # High-performance Next.js trading terminal & risk passport UI
│   ├── indexer/             # Dual-RPC contiguous Arc event journal & parity engine
│   └── keeper/              # Nonce-serialized execution keeper with fail-closed diagnostics
├── packages/
│   ├── oracle/              # EIP-712 composite report verification and medianization
│   ├── risk-engine/         # Dynamic margin limits, leverage caps (max 2x), and open interest rules
│   ├── market-depth/        # Spot liquidity vs derivative capacity segregation
│   └── chain-adapters/      # Multichain DEX listeners (Solana, Base, BNB, pumpswap)
└── evidence/                # On-chain cryptographic receipts and deployment manifests
```

---

## 5. Live Verification Endpoints

1. **Production Protocol Status**:  
   [`https://cluster-readonly-api.vercel.app/api/v1/protocol/status`](https://cluster-readonly-api.vercel.app/api/v1/protocol/status)  
   Returns verified chain ID (`5042`), deployed contract addresses, real-time custody metrics, and fail-closed readiness.

2. **Dual-RPC Indexer Journal Status**:  
   [`https://cluster-readonly-api.vercel.app/api/v1/index/status`](https://cluster-readonly-api.vercel.app/api/v1/index/status)  
   Reports contiguous block coverage (`throughBlock: 28793296`), `ranges: 1164`, `gaps: 0`, `singleSourceRanges: 0`.

3. **Live Market Universe**:  
   [`https://cluster-readonly-api.vercel.app/api/v1/markets`](https://cluster-readonly-api.vercel.app/api/v1/markets)  
   Surfaces real-time meme liquidity while enforcing truthful unverified status (`qualificationInventory: "UNVERIFIED"`).

4. **Web Terminal Interface**:  
   [`https://cluster-hackathon-preview.vercel.app`](https://cluster-hackathon-preview.vercel.app)  
   Includes the interactive Market Terminal, Trench Explorer, Risk Passport, and Vault Manager.

---

## 6. Official Submission Checklist

- [x] **Smart Contracts Verified**: 104 Foundry test suites passing, invariant fuzzing clean.
- [x] **LP-Margin Bridge Integrated**: PR #26 reviewed and merged to `main` (`6ba8b12`).
- [x] **Testnet Parity Verified**: Arc Testnet deployment confirmed with 0 custody deficit (`5.6 USDC` Margin, `1.8 USDC` LP).
- [x] **Dual-RPC Indexer Active**: 1,164 continuous ranges, 0 gaps, verified across Primary Arc RPC and Secondary QuickNode RPC.
- [x] **Continuous Integration Clean**: Exact-head CI workflows (`CI`, `Arc read-only indexer`, `CLUSTER Product Testnet live audit`) all passing on `main`.
- [x] **Fail-Closed Security**: Mainnet financial gates strictly locked against unverified risk until live multi-sig ceremony.
- [x] **Demo Video & Visual Evidence**: 3-minute comprehensive walk-through (`arcmemeperps_3min_demo.mp4`) and high-res UI captures.
