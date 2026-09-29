# Solvency boundary

Mathematically enforced in this gate:

- checked fixed-point arithmetic and explicit signed conversion limits;
- isolated collateral ledger with separate free/locked balances;
- OI, position, leverage, market-state, stale-oracle, and order-finalization guards;
- cumulative funding/borrow formulas with explicit routing and dust;
- explicit bad-debt and insurance accounting;
- withdrawal reservation against free, locked, and pending-positive liabilities;
- no public LP share token.

Empirically simulated: price gaps, crashes/pumps, source loss/disagreement, liquidity
collapse, one-sided OI, funding accumulation, utilization, keeper delay, mass liquidation,
insurance depletion, dust, and decimal edges. The deterministic simulator is not a formal
solvency proof.

Remaining assumptions include oracle correctness within its conservative band, accurate pool
reserves, timely keepers, non-malicious configured governance, and adequate protocol backing.
Extreme gaps can still create bad debt. V1 mitigation is conservative OI/leverage, bounded
liquidation rewards, explicit insurance/backstop accounting, and emergency pause/close-only/
block transitions. No claim of insolvency impossibility is made.
