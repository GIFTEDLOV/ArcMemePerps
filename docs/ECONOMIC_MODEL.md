# Gate 3 economic model

V1 is isolated USDC margin with one net position per account and market. There is one global
5x leverage ceiling, lower per-market limits, per-position and per-side OI caps, full
liquidation, explicit bad debt, and an insurance reserve. The vault is the economic
counterparty. Cross-margin, arbitrary collateral, and user-created markets are out of scope.

`USDCMarginVault` separates raw cash, trader free/locked collateral, protocol backing,
accrued fees, insurance reserve, pending positive/negative PnL, and protocol bad debt. Trader
collateral is not protocol equity. Gate 4D adds a local public-LP accounting foundation with
queued withdrawals and pending-liability inputs; it is not yet wired into a live deployed
PerpEngine/vault configuration and therefore is not production LP evidence.

Fee destinations must be explicit: protocol, insurance, or vault. The current minimal
engine exposes the accounting hooks and pure formulas; final production fee routing remains a
configuration/governance decision.

Automated ADL is likewise represented by a bounded, replay-protected local controller foundation.
Its economics and full engine integration require a fresh testnet deployment and further
independent audit before release.
