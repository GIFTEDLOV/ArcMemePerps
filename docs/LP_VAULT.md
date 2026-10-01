# Public LP vault boundary

`PublicLPVault` is a queued-share accounting boundary, not a claim of complete production vault economics. Shares use USDC base units, NAV subtracts pending trader liability and insurance reserve, and withdrawals must wait through a cooldown. Deposits are rejected when existing shares have zero NAV, preventing free shares against an insolvent liability state.

The current source does not yet wire the vault into PerpEngine's full pending PnL, utilization, market-risk-budget, and insurance settlement path. That is a mainnet blocker and is visible in the feature ledger. No public LP deployment is authorized from this gate.
