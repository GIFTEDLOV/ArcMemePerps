# Gate 3 economic attack checklist

Attempted deterministically in tests/simulation:

- fixed-point rounding and tiny-price PnL;
- funding/skew farming and self-hedging;
- open/close fee loops and bounded liquidation rewards;
- oracle replay, stale/future reports, correlated sources, wrong market/chain, outliers,
  tampered bands/evidence, duplicate/unauthorized signers;
- gap liquidation, dust bad debt, repeated cap increases, multiple-account OI pressure;
- stale qualification and risk-reduction races;
- vault free/locked reconciliation, insurance cover limits, and reentrancy around transfers;
- unavailable depth/manipulation evidence and shallow dominant pools.

Remaining audit work includes malicious ERC-20 behavior, full keeper failure economics, formal
EIP-712 Solidity threshold verification, and production governance/timelock design.
