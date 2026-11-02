# LP withdrawal accounting hardening (2026-11-02)

## Status

Security candidate on a separate branch. **Not deployed and not a production sign-off.**
The mainnet deployment addresses are listed in
`evidence/mainnet-suite-deployment.json`. The contracts in this repository
use regular constructors; changing this source **does not upgrade an existing
deployed vault**. Verify mainnet bytecode, administrator permissions, pool balances,
active requests, pending claims, and current margin exposure independently
before any migration or operations.

## Threat boundary

PublicLPVault values deposits and claims using NAV with controller-pushed
trader liabilities, bad debt and insurance reserves. If controller updates lag
market events, users can receive an inaccurate share price. Request cooldowns
alone cannot establish NAV freshness. The old emergency public-LP pause only
blocked deposits, not withdrawal claims.

## Fail-closed containment

Until a complete atomic/on-chain mark-to-market mechanism is implemented,
the vault deliberately **does not support LP deposits while its risk budget
or margin allocation is outstanding**, and **does not support LP withdrawals
during any trading-exposed interval**. This restricts the product; it is not
a transparent upgrade to a fully live LP market.

1. The risk controller and operators stop risk-increasing activity externally;
   withdraw or write down margin backing and settle/reconcile all open PnL,
   insurance and bad-debt obligations.
2. Governance disables deposits using `setPublicLpActive(false)`.
3. The risk controller sets `marketRiskBudget` to zero; `allocatedBacking`
   must be zero and vault custody must match the accounting ledger.
4. After checking the *actual* engine state, oracle data, margin ledger,
   uninsured bad debt and every upstream source, the controller calls
   `certifyWithdrawalAccounting()`. The contract **cannot independently prove**
   that externally computed PnL and debt are complete.
5. Governance calls `setWithdrawalSettlementEnabled(true)` to let matured
   requests claim a reconciled price. The emergency administrator can call
   `emergencyPauseWithdrawalSettlement()` at any time.
6. Any later controller accounting update invalidates the certification and
   closes the settlement interval. Withdrawal requests expire 24 hours after
   their cooldown ends; `renewWithdrawalRequest()` starts a new cooldown.

Governance must close the withdrawal settlement interval before reopening
deposits; new risk activity must only resume after the window is closed.
A controller and governance that certify stale accounting can still cause
financial loss. This is a temporary safety boundary, not proof of economic
solvency or elimination of all timing and keeper liveness risks.

## Tests

`contracts/test/StaleNavWithdrawal.t.sol` covers stale trader liability,
bad-debt timing, prevention of deposits during active exposure, explicit
certification, controller update invalidation, known-debt valuation and queue
expiry/renewal. Older LP integration tests have been updated for the
settlement-only withdrawal pathway.

Run:

```sh
forge fmt --check
forge build
forge test
```

No real funds, mainnet trading or production contract changes should be
performed by these tests. A separate contract deployment/migration, with
user share preservation and live reconciliation, must be prepared before
making any claim that Arc mainnet is protected.
