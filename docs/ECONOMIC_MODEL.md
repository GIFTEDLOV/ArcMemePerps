# Gate 3 economic model

V1 is isolated USDC margin with one net position per account and market. There is one global
5x leverage ceiling, lower per-market limits, per-position and per-side OI caps, full
liquidation, explicit bad debt, and an insurance reserve. The vault is the economic
counterparty. Cross-margin, arbitrary collateral, and user-created markets are out of scope.

`USDCMarginVault` separates raw cash, trader free/locked collateral, protocol backing,
accrued fees, insurance reserve, pending positive/negative PnL, and protocol bad debt. Trader
collateral is not protocol equity. Gate 4E adds the public-LP share ledger, queued withdrawals,
conservative pending-liability NAV, risk-budget hooks, and explicit custody reconciliation. The
changed contract suite is a release candidate only; it requires the authorized Arc Testnet
redeployment before it can provide new live deployment evidence.

Fee destinations must be explicit: protocol, insurance, or vault. The current minimal
engine exposes the accounting hooks and pure formulas; final production fee routing remains a
configuration/governance decision.

Automated ADL is represented by a bounded, replay-protected deterministic controller with
candidate ordering and deficit limits. It is a last-resort release control and requires the
changed suite's authorized deployment and independent audit before production use.
