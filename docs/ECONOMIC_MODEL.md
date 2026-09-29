# Gate 3 economic model

V1 is isolated USDC margin with one net position per account and market. There is one global
5x leverage ceiling, lower per-market limits, per-position and per-side OI caps, full
liquidation, explicit bad debt, and an insurance reserve. The vault is the economic
counterparty. Cross-margin, arbitrary collateral, user-created markets, public LP shares,
and automated ADL are out of scope.

`USDCMarginVault` separates raw cash, trader free/locked collateral, protocol backing,
accrued fees, insurance reserve, pending positive/negative PnL, and protocol bad debt. Trader
collateral is not protocol equity. Public ERC-4626 shares are intentionally deferred because
pending trader PnL and withdrawal timing need a separately audited share-pricing model.

Fee destinations must be explicit: protocol, insurance, or vault. The current minimal
engine exposes the accounting hooks and pure formulas; final production fee routing remains a
configuration/governance decision.
