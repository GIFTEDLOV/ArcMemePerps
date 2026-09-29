# Deterministic fixture corpus

`corpus.ts` contains the Gate 1 replay corpus. Each case has a normalized observation and a complete provider-free adapter payload covering markets, holders, trades, oracles, permissions, liquidity locks, deployer history, and transaction history.

The cases are intentionally development fixtures, not production thresholds or claims about live assets. They exercise hard-gate rejection, lifecycle/risk status independence, capacity gating, liquidity deterioration, and oracle safety behavior.
