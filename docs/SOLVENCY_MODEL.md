# Solvency boundary

Mathematically enforced in this gate:

- checked fixed-point arithmetic and explicit signed conversion limits;
- isolated collateral ledger with separate free/locked balances;
- OI, position, leverage, market-state, stale-oracle, and order-finalization guards;
- cumulative funding/borrow formulas with explicit routing and dust;
- explicit bad-debt and insurance accounting;
- withdrawal reservation against free, locked, and pending-positive liabilities;
- release-guarded public-LP share and withdrawal-queue accounting with explicit activation,
  emergency deactivation, NAV liability reservation, and custody checks.

Empirically simulated: price gaps, crashes/pumps, source loss/disagreement, liquidity
collapse, one-sided OI, funding accumulation, utilization, keeper delay, mass liquidation,
insurance depletion, dust, and decimal edges. The deterministic simulator is not a formal
solvency proof.

Remaining assumptions include oracle correctness within its conservative band, accurate pool
reserves, timely keepers, non-malicious configured governance, and adequate protocol backing.
Extreme gaps can still create bad debt. The Gate 4F.1 waterfall now keeps that deficit explicit:
collateral and liquidation recovery are consumed first, then insurance, then the vault/backstop,
then a bounded ADL claimant haircut. If profitable claims are insufficient, `finalizeUnresolved`
sets the engine's terminal `solvencyBlocked` state and preserves the residual. No claim of
insolvency impossibility is made. See `docs/SOLVENCY_LIMITATIONS.md` for exact trader and LP
claim boundaries and the conditions under which redemption is limited by available assets.
