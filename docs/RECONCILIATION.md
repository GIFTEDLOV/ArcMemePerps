# Reconciliation

The backend records reconciliation checks as durable snapshots. A critical non-match is `CRITICAL`; there is no silent repair. Required comparisons are vault custody, contract/indexed/summed OI, qualification registry versus canonical qualification, risk state, LP ledger/share supply, insurance assets, competition PnL, and profile PnL.

Gate 4B proved the old contract suite's local/testnet custody mechanics. Gate 4D's added LP/ADL contracts require a fresh local E2E and explicitly authorized testnet redeployment before their reconciliation is evidenced.
