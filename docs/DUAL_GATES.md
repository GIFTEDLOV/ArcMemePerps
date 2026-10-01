# Dual deterministic gates

The qualification gate answers whether an origin-chain token may become a derivatives market. It consumes the canonical MarketPassport and fails closed on hard-gate failures, stale evidence, missing critical evidence, or material provider disagreement. Its outputs are `QUALIFIED`, `WATCH`, `REJECTED`, or `BLOCKED` with machine-readable reason codes.

The execution gate answers whether one risk-increasing action is permitted now. It separately checks qualification freshness, Arc market state, oracle freshness/confidence, caps, OI/skew, vault/insurance capacity, margin, order expiry, and an immutable PreTradePlan hash. It returns `ALLOW` or `REFUSE`.

Neither gate reads frontend state, accepts user-supplied risk facts, or uses an LLM. A trending result is not qualification and qualification is not execution permission.
