# Solvency limitations and terminal policy

This document describes the exact boundary of the Gate 4F.1 economic model.
The contracts enforce accounting conservation and explicit loss recognition;
they do not make market-gap insolvency mathematically impossible.

## Waterfall

For a losing isolated position, the settlement order is:

1. position collateral is consumed;
2. liquidation recovery and the bounded liquidator reward are applied;
3. the insurance fund covers at most its available capital;
4. the remaining deficit is recorded in `USDCMarginVault.protocolBadDebt` and
   `pendingNegativePnl`, and is reserved out of `withdrawableLiquidity()`;
5. `ADLController` may remove only positive profitable-position claims. The
   engine reports the actual conservative economic reduction and the vault
   decreases recorded uncovered bad debt by exactly that amount; and
6. if profitable candidates cannot cover the remaining deficit, the keeper may
   call `finalizeUnresolved`. This permanently enters the engine's
   `solvencyBlocked` state while the residual amount remains recorded.

No branch deletes an uncovered deficit. No unsigned negative balance is
clamped into a successful payout. ADL is a deterministic claimant haircut,
not a cash transfer or protocol profit.

## What can still happen

An oracle-valid gap can exceed trader collateral, insurance capital, and all
available profitable claims. In that state the residual deficit is explicit
and the engine blocks new or increased exposure. Existing positions can still
follow their configured risk-decreasing paths (close, reduce, or liquidate)
subject to their own oracle/freshness policy. The system can therefore become
economically insolvent in the ordinary market-risk sense; the code does not
claim otherwise.

The residual is bounded by the recorded deficit at the point of the episode.
ADL cannot reduce more than the episode budget, cannot reduce a losing slice,
and cannot reduce more than the positive claim returned by the engine. If the
candidate set is insufficient, the unresolved amount is `remainingDeficit` on
the episode and the vault's bad-debt ledger remains the bearer of that amount.
There is no discretionary admin write-off.

## Trader claim boundary

Positive trader claims are included in `pendingPositivePnl` and reserved by
`withdrawableLiquidity()`. A trader may not withdraw more than available
physical custody after free collateral, locked collateral, pending positive
claims, and uncovered bad debt are reserved. If physical custody is
insufficient after a catastrophic gap, the claim remains an explicit ledger
liability; redemption is not guaranteed beyond protocol assets. ADL may reduce
only the positive claim slice used to cover a recorded uncovered deficit.

## LP loss boundary

`PublicLPVault` prices shares from managed custody less pending trader
liability, insurance reserve, and recorded bad debt. Share claims are limited
to the resulting NAV and actual available custody. The withdrawal queue cannot
claim reserved liabilities or more than current free liquidity. Trader
collateral is not LP equity, and an unsolicited token transfer is not managed
assets. An LP can lose contributed NAV when protocol liabilities are realized,
but cannot acquire a debt balance beyond the vault assets represented by its
shares. A queued withdrawal does not escape liabilities incurred before its
claim; the claim is repriced at claim time.

First-depositor and zero-NAV cases are guarded: an active vault with existing
accounting liabilities that consume all managed assets cannot be activated,
and a non-empty share supply cannot mint against zero NAV. Deposit share math
uses pre-transfer NAV, while claims use claim-time NAV and reserve checks.

## Quantified test boundary

The deterministic Gate 4F.1 pathological test uses a deficit larger than the
sum of collateral, insurance, vault backstop, and profitable ADL claims. It
terminates with a positive explicit residual and `solvencyBlocked == true`;
the residual is not erased and no loop is required. The 100-candidate test
executes one bounded candidate per transaction and proves episode progress,
deterministic ordering, and replay rejection. These are conservation and
termination tests, not proof that real-market losses stay within the test
amounts.

## Submission and mainnet acceptance

The explicit terminal policy is acceptable for submission because it defines
who bears an uncovered loss, prevents new exposure, preserves the ledger, and
does not promise redemption beyond assets. It is not a guarantee of mainnet
solvency. Mainnet use additionally requires the reviewed LP-to-margin backing
route, independent economic review, production oracle/reporters, and a
release-specific risk budget. Those are release controls, not hidden code
paths.
