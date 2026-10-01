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
any release deployment. This changed source is locally validated but is not yet the deployed
Arc Testnet suite; no public LP deployment is authorized from this gate.
