# Market depth

Market depth is quote-simulated, not inferred from total liquidity. The EVM boundary supports
constant-product Uniswap/Pancake-style pool observations and returns directional buy/sell
depth at 1% and 2% price moves with venue breakdown. Every quote is a read-only calculation;
no swap or transaction is performed.

Solana has an explicit adapter boundary and returns `UNAVAILABLE` until a reliable read-only
quote source is configured. Missing depth is a critical capacity-bound failure, not a pass.

Gate 4D adds concentrated-liquidity math and LP-security boundaries, but only a supported pool
state with sufficient tick/range data can produce a quote. TVL, aggregate liquidity, or a
DexScreener display value never substitutes for 1%, 2%, or 5% directional depth. Unsupported
Solana and venue-specific layouts remain unavailable and are surfaced to capacity/risk logic.
