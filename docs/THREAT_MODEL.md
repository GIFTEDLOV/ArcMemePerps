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
