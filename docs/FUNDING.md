# V1 funding

Funding is a cumulative index, not a loop over positions. Every update computes:

`imbalance = abs(longOI - shortOI)`

`ratio = imbalance / max(totalOI, minimumDenominator)`

`ratePerSecond = min(fundingFactor * ratio, fundingCap)`

The dominant side pays. The opposing side receives the same per-unit index economics up
to its opposing open interest. If the dominant side is larger than the opposing side, the
unmatched amount is explicitly routed to the vault. Integer rounding dust is exposed as a
separate value; it is not silently minted or burned.

V1 deliberately does not use quadratic funding or rebates. The bounded linear model is
auditable and can be calibrated after real-market observations.
