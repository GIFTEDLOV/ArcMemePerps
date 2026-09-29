# Derivatives risk capacity

The capacity function exposes each bound and its formula. V1 max OI is the minimum of:

- liquidity capacity;
- quote-depth capacity;
- manipulation-cost capacity;
- vault backing capacity;
- organic-volume capacity;
- second-depth capacity.

Integrity, oracle independence, confidence, dispersion, and liquidity stability are separate
gates. A missing critical bound blocks the result. Leverage is capped globally at 5x, with
development tiers of 1.5x for probationary markets, 3x before maturity, and at most 5x only
for stable mature markets. These are development defaults, not production-calibrated limits.

Risk reductions apply to new/increasing exposure. Existing positions remain closable and
liquidatable when a market changes to paused or close-only.
