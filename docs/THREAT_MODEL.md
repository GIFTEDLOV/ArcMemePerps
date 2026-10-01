# Threat model

The first layer considers:

- rug pulls, mint inflation, freeze abuse, owner/admin abuse, proxy upgrades, and LP withdrawal;
- insider/connected clusters, Sybil holder distribution, bundled launches, deployer rotation, funded snipers;
- wash trading, volume farming, suspicious repetition, oracle manipulation, flash manipulation, and thin-liquidity attacks;
- liquidation attacks, keeper failure, bad debt, LP insolvency, asymmetric long/short OI, and stale prices;
- chain reorgs/data inconsistency, provider failure, compromised risk oracles, qualification replay, duplicate identity;
- integer/decimal errors and unauthorized governance/configuration changes.

Mitigations in Gate 1 include hard-gate reasons, chain+address market IDs, provider isolation, deterministic evidence/proof hashing, oracle staleness/confidence checks, conservative caps, dynamic risk-limit reductions, role checks, explicit bad-debt accounting, and independent market/risk status checks.

Residual risks include provider correctness, reorg handling, proof anchoring, contract upgrade/governance design, token custody, economic formulas, oracle quorum design, and complete adversarial simulations. These remain required before any deployment or live market.

Gate 2-specific controls include typed identity preimages, explicit source/position/freshness provenance, wrong-chain and wrong-token validation, provider timeout/rate-limit bounds, conservative disagreement resolution, explicit wallet classifications for cluster calculations, and no implicit LP-lock claim from DEX liquidity. Unknown wallets remain included; an address is excluded only when a classification is evidenced.

# Gate 3 economic threats

The economic layer explicitly treats oracle manipulation, stale reports, correlated sources,
price gaps, thin depth, asymmetric OI, funding farming, liquidation reward farming, keeper
delay, insurance depletion, bad debt, vault withdrawal races, reentrancy, unsafe decimals,
and non-standard collateral behavior as active threats. Mitigations are conservative oracle
bands, source-family independence, bounded limits, isolated margin, checked transfers/casts,
state-before-interaction ordering, explicit bad-debt accounting, and emergency risk reduction.

# Gate 4C backend threats

Gate 4C adds stale canonical snapshots, duplicate/replayed indexer events, checkpoint reorgs,
provider-pool optimistic failover, unjustified LP/system-wallet exclusions, unbounded
funding-graph traversal, competition self-offsetting, and live-adapter methods that previously
returned empty placeholders. Unsupported capabilities now fail explicitly; durable workers and
cross-component reconciliation remain open risks.
