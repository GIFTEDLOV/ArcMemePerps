# V1 liquidation

Position equity is:

`collateral + signedPnL - fundingOwed + fundingReceivable - borrowFees - otherFees`.

The conservative execution band is used: longs liquidate at the minimum report price and
shorts at the maximum. A position is liquidatable when equity is below its market-specific
maintenance requirement plus configured liquidation constraints. Full liquidation is the
V1 path.

Settlement order is: close OI and position state; settle funding/fees; consume collateral;
pay a bounded liquidator incentive; return residual equity; record any deficit as explicit
bad debt. Bad debt is never represented as a negative unsigned balance.
