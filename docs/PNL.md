# V1 PnL and precision

The V1 contract and simulator use:

- USDC collateral: integer base units, `1 USDC = 1_000_000` units.
- USD notionals, prices, and rates: WAD, `1e18`.
- Ratios and rates: WAD unless explicitly labelled basis points.
- Signed PnL: `sizeUsdWad * (exitPriceWad - entryPriceWad) / entryPriceWad` for longs;
  the price delta is reversed for shorts.

Multiplication is performed before division. Down-rounding is used for trader payouts;
fees, required collateral, and protocol liabilities round up. A zero denominator, zero
price, signed overflow, or impossible decimal conversion fails closed.

The contract library and TypeScript library share golden vectors for 2x, 0.5x, and a
`1e-12`-scale price. These are fixed-point values, never JavaScript `number` arithmetic.
Partial-size PnL is proportional to the reduced notional even though the current minimal
engine keeps the full-close path as the primary settlement boundary.
