# CLUSTER

Discover meme markets. Inspect the evidence. Enable leverage only after a
market earns it.

CLUSTER is a fail-closed, risk-gated perpetual protocol for multichain
meme markets with Arc USDC settlement. Discovery is public; qualification and
Arc activation are separate decisions.

## Current release-candidate truth

| Product fact | Current state |
| --- | ---: |
| Canonical retained discovered real markets | **262** |
| Latest provider refresh window | **161** |
| Core-qualified real markets | **0** |
| Derivatives-eligible real markets | **0** |
| Registered real Arc perp markets | **0** |
| **Currently activated real perps** | **0** |
| Live real Arc perps | **0** |

**No market currently meets the complete activation policy.** This is an
intentional safety state: discovery and market intelligence remain available,
while trading stays disabled until a real market satisfies the complete
policy. No canary, synthetic market, or famous token is presented as a live
production market.

The 262 figure is the durable canonical discovery universe. The latest
provider refresh window currently contains 161 of those records; the remaining
101 are retained discovery records outside that refresh window and are never
counted as newly observed activity.

## Arc Mainnet Live Deployment (Chain ID: 5042)

The complete protocol suite is **fully deployed and verified on Arc Mainnet** (`https://rpc.mainnet.arc.io`, Chain ID `5042`).

| Contract | Arc Mainnet Address | ArcScan Explorer Link |
| :--- | :--- | :--- |
| **USDCMarginVault** | `0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf` | [View on Explorer](https://explorer.arc.io/address/0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf) |
| **PerpEngine** | `0xd9c3cbf1841103749f379cc1aae1a9284d8dc3e1` | [View on Explorer](https://explorer.arc.io/address/0xd9c3cbf1841103749f379cc1aae1a9284d8dc3e1) |
| **QualificationRegistry** | `0x67b175dd57d17d8ef4bd307d1a20a8d5438180e7` | [View on Explorer](https://explorer.arc.io/address/0x67b175dd57d17d8ef4bd307d1a20a8d5438180e7) |
| **MarketRegistry** | `0x7ebddb2c1f1ae68a2e5b984fe9e75115cdb8ef1b` | [View on Explorer](https://explorer.arc.io/address/0x7ebddb2c1f1ae68a2e5b984fe9e75115cdb8ef1b) |
| **OracleRouter** | `0x1531c83ac90e5ec5998eaf42a4464757dcd2c3ff` | [View on Explorer](https://explorer.arc.io/address/0x1531c83ac90e5ec5998eaf42a4464757dcd2c3ff) |
| **RiskConfig** | `0x89ea15e527f7d06503ed2e7c958c2ac0e5799f85` | [View on Explorer](https://explorer.arc.io/address/0x89ea15e527f7d06503ed2e7c958c2ac0e5799f85) |
| **InsuranceFund** | `0x8b0550babc3b802d89c17dfbee85828e14e6a22b` | [View on Explorer](https://explorer.arc.io/address/0x8b0550babc3b802d89c17dfbee85828e14e6a22b) |
| **PublicLPVault** | `0x9ff8358dc5ee866e0b9707d0139cf47b399f5257` | [View on Explorer](https://explorer.arc.io/address/0x9ff8358dc5ee866e0b9707d0139cf47b399f5257) |
| **ADLController** | `0x3c53f9f8d0c651c8a7e061872367274d8a8bf257` | [View on Explorer](https://explorer.arc.io/address/0x3c53f9f8d0c651c8a7e061872367274d8a8bf257) |
| **ProtocolTimelock** | `0xab0177c7fdad783faf27f145ecb95e92863fd4c2` | [View on Explorer](https://explorer.arc.io/address/0xab0177c7fdad783faf27f145ecb95e92863fd4c2) |
| **USDC Collateral** | `0x3600000000000000000000000000000000000000` | [View on Explorer](https://explorer.arc.io/address/0x3600000000000000000000000000000000000000) |

---

> [!WARNING]
> ### 🚨 Counterparty Vault Liquidity Notice: UNFUNDED / AWAITING SEED CAPITAL
> **The Arc Counterparty Liquidity Vault / ALP (`PublicLPVault` at `0x9ff8358dc5ee866e0b9707d0139cf47b399f5257` and `USDCMarginVault` at `0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf`) has been deployed but has NOT yet been seeded with counterparty liquidity.**
>
> - **Current Vault State:** While real USDC margin custody is active and verified on Arc Mainnet (with initial 1.000000 USDC collateral deposit verified at Tx `0x7dd1dfeddc682e745ed84ba885ad3fd800400952522b03cc1126fd81915c4dc9`), protocol counterparty backing is intentionally unseeded pending community/institutional liquidity provider deposit.
> - **Why this is transparent:** In accordance with CLUSTER's fail-closed safety ethos, the protocol does not simulate synthetic liquidity.
> - **How to seed counterparty liquidity:**
>   1. Counterparty LP providers deposit native Arc USDC (`0x3600000000000000000000000000000000000000`) into `PublicLPVault` (`0x9ff8358dc5ee866e0b9707d0139cf47b399f5257`) to mint ALP shares.
>   2. Alternatively, institutional protocol backing can be funded directly into `USDCMarginVault.deposit(...)`.
>   3. Once seeded, the risk engine automatically activates max open interest limits proportional to the available vault depth.

---

## Screenshots

![CLUSTER landing page](docs/assets/phase12/landing-desktop.png)

| Discovery | Risk Passport | Zero-live-perp proof |
| --- | --- | --- |
| ![Markets](docs/assets/phase12/markets-desktop.png) | ![Risk Passport](docs/assets/phase12/risk-passport-desktop.png) | ![Protocol proof](docs/assets/phase12/protocol-proof-desktop.png) |

| Token terminal | Portfolio empty state | Activity empty state |
| --- | --- | --- |
| ![Token terminal](docs/assets/phase12/token-terminal-desktop.png) | ![Portfolio](docs/assets/phase12/portfolio-desktop.png) | ![Activity](docs/assets/phase12/activity-desktop.png) |

Mobile evidence is in [docs/assets/phase12](docs/assets/phase12/), including
markets, Risk Passport, landing, portfolio, and token-terminal views.

## What CLUSTER does

- Discovers origin-chain meme markets and preserves canonical chain + token
  identity.
- Shows lifecycle, liquidity, holders, history, oracle, provenance, and
  evidence coverage without turning unknown data into a pass.
- Separates discovery, core safety, derivatives capacity, qualification, and
  Arc activation.
- Preserves a bounded execution path, keeper flow, liquidation, insurance,
  ADL, LP, timelock, and reconciliation primitives for audited future use.

## How activation works

```text
DISCOVERED
    ↓
CORE SAFETY
    ↓
DERIVATIVES CAPACITY
    ↓
QUALIFIED
    ↓
ARC ACTIVATION
    ↓
LIVE PERP
```

The frozen offchain policy is `risk-rules/0.4.0`. A discovery row is not a
tradable perp, and qualification alone does not activate a market.

## Risk Passport

The Risk Passport keeps authority, transfer safety, liquidity control, holder
and cluster concentration, activity, history, depth, oracle quality, and
derivatives capacity separate. Evidence is labeled with its boundary;
`UNKNOWN`, `PENDING`, and provider outage states are not silently converted to
zero or clear.

## Why Arc

Arc provides USDC-native gas and settlement with deterministic finality. The
Mainnet configuration model is documented in
[docs/MAINNET_CONFIGURATION.md](docs/MAINNET_CONFIGURATION.md) using current
official Arc references. The current product evidence environment remains Arc
Testnet and must not be confused with Mainnet.

## Architecture

```text
origin RPCs / provider readers
          ↓
durable market universe: chain + canonical token identity
          ↓
observations → lifecycle → core safety → derivatives capacity
          ↓
qualification proof → Arc registry projection → bounded execution
          ↓
API / SSE → browser terminal → wallet
                              ↓
                     keeper → Arc → indexer → reconciliation
```

The browser does not calculate qualification, liquidation eligibility,
oracle validity, canonical PnL, or system health. Contract/indexer state is the
authority after restart.

## Contract and economic model

The frozen Solidity source covers market identity, qualification binding,
oracle quorum and replay protection, risk limits, USDC custody, positions,
funding, liquidation, insurance, bad-debt accounting, ADL, public LP
withdrawal controls, emergency reductions, and governance timelock.

- Frozen contract source SHA:
  `0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b`
- Final policy: `risk-rules/0.4.0`
- Mainnet genesis expectation: zero registered markets, zero live markets,
  zero OI, zero positions, zero bad debt, and `solvencyBlocked = false`.

## Testnet proof and security evidence

Historical Product Testnet activity proves that signed order submission,
keeper progression, positions, settlement, and reconciliation were exercised.
The separate Stress/Security deployment proves insurance, liquidation, ADL,
and terminal insolvency containment. It is intentionally insolvent in its test
scenario and is never a frontend default, production target, or Mainnet
target. Neither deployment is a real-token Mainnet trade.

See [docs/FINAL_FEATURE_REALITY.md](docs/FINAL_FEATURE_REALITY.md) for the
feature-by-feature reality labels and evidence boundaries.

## Security and release safety

- [Mainnet configuration model](docs/MAINNET_CONFIGURATION.md)
- [Mainnet role plan](docs/MAINNET_ROLE_PLAN.md)
- [Mainnet deployment runbook](docs/MAINNET_RUNBOOK.md)
- [Final feature reality audit](docs/FINAL_FEATURE_REALITY.md)
- [Security policy](SECURITY.md)

Mainnet is not deployed by this release candidate. A future deployment must
use a fresh deployment of the exact frozen source, a least-privilege role
ceremony, explicit USDC/RPC checks, and the zero-market assertions in the
runbook. There is no admin shortcut around qualification or oracle checks.

## Tests and local development

```text
pnpm install
pnpm winner:discover --limit=60
pnpm winner:service --port=8788
$env:VITE_API_URL="http://127.0.0.1:8788/api/v1"
pnpm frontend:dev
```

Validation commands:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm frontend:test
pnpm frontend:build
pnpm e2e
forge fmt --check
forge build
forge test
```

The current local release candidate passes the TypeScript, frontend, provider,
risk, capacity, API, indexer, frontend build, and Solidity checks available in
the workspace. See the final audit for any environment limitations on tool
invocation.

## Repository structure

```text
apps/frontend/       React/Vite discovery terminal and browser tests
apps/api/             versioned read API and realtime boundary
apps/indexer/         ordered event identity and projections
apps/keeper/          bounded execution worker
apps/reporter/        oracle report worker boundary
packages/             domain, risk, lifecycle, providers, persistence, oracle
contracts/            frozen Arc Solidity suite
scripts/              discovery, services, deployment preflight, operations
docs/                 product, security, operations, and release evidence
evidence/             sanitized deployment and visual evidence
```

## Known limitations

No real market currently satisfies the complete `0.4.0` activation policy.
Provider enrichment, holder/cluster coverage, direct depth, and deployer
history remain explicitly unavailable or partial where a verifiable reader is
not configured. Portfolio, activity, notifications, competitions, and LP
surfaces remain truthful empty or primitive states until canonical records
exist.

## Live Production URLs

- **CLUSTER Trading Terminal:** [cluster-terminal.vercel.app](https://cluster-terminal.vercel.app)
- **Alternative Mirror:** [cluster-trade.vercel.app](https://cluster-trade.vercel.app)
- **Legacy Mirror:** [arcmemeperps.vercel.app](https://arcmemeperps.vercel.app)

MIT. See [LICENSE](LICENSE).
