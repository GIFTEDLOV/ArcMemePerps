# Public LP vault boundary

`PublicLPVault` is the V1 public-liquidity accounting boundary. Shares use
USDC base units, NAV subtracts pending trader liability, insurance reserve, and
recorded bad debt, and withdrawals wait through a cooldown. Deposits are
rejected when existing shares have zero NAV, preventing free shares against an
insolvent liability state.

`managedAssets` is the accounting source of truth. `actualCustodyUsdc()` and
`custodyStatus()` expose unsolicited ERC-20 transfers as `SURPLUS` and a
shortfall as `DEFICIT`; neither is silently converted into revenue or erased.
The risk controller records settlement changes and the market risk budget is
bounded by current NAV. The TypeScript `PublicLPShareLedger` mirrors deposit,
withdraw-request, and claim semantics for rebuildable off-chain projections.

The controller hooks are intentionally explicit: PerpEngine or a reconciliation worker must
record managed assets, pending liability, insurance, bad debt, and the market risk budget before
any release deployment. `PublicLPVault` is not silently treated as
`USDCMarginVault` custody; the LP-to-margin backing route must be explicitly
configured and reconciled before LP capital is used as economic backing. The
release guard makes that boundary auditable.

Public deposits are release-guarded by `publicLpActive`. The governance
executor can activate only after bootstrap, controller assignment, exact
custody reconciliation, zero cumulative bad debt, non-zero NAV for any
non-empty accounting state, and a risk budget no greater than NAV. Emergency
authority can deactivate deposits but cannot activate them; queued withdrawals
and claims remain subject to cooldown, NAV, reserved liabilities, and custody
checks. In a release deployment the governance executor is the timelock, so
activation is a documented governance action rather than an operational-role
bypass.
