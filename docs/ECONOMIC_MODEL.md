# Economic model

Gate 1 establishes accounting and control boundaries, not a final economic protocol.

Implemented foundations:

- market registration and qualification prerequisites;
- versioned qualification/risk-limit storage;
- stale/confidence-protected oracle reads;
- free and locked collateral accounting with non-negative checks;
- position size, OI, leverage, and market-state checks;
- explicit insurance covered/uncovered bad debt accounting.

Explicit TODO boundaries:

- USDC ERC-20 deposit/withdrawal custody and accounting reconciliation;
- mark/index price construction and PnL precision rules;
- funding-rate formula and funding settlement;
- maintenance-margin/liquidation trigger formula;
- keeper incentives, liquidation auctions, and partial liquidation;
- insurance-fund funding/redemption economics;
- cross-market netting, ADL, and insolvency waterfall;
- governance/timelock authority design.

The liquidation hook accepts a settlement PnL only as a testable boundary. It does not claim that the economic formula is final or that the current contracts prove solvency.
