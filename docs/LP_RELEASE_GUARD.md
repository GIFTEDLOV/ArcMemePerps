# Public LP release guard

## Source of truth

The release guard is implemented in `contracts/src/PublicLPVault.sol` by the
`publicLpActive` flag, `setPublicLpActive(bool)`, and
`emergencyPausePublicLp()`. `deposit()` checks `publicLpActive` before any
share calculation or token transfer. Withdrawal requests and claims do not
depend on the flag, so an emergency deactivation does not strand already
issued shares; the existing cooldown, NAV, reserved-liability, and liquidity
checks still apply.

## Initial and activated state

`publicLpActive` is false at construction. A release deployment therefore
starts with public deposits and share minting disabled. The contract has no
constructor switch and no owner-only runtime bypass.

The governance executor may activate deposits only when all of the following
are true:

1. bootstrap has been finalized;
2. a nonzero `riskController` is configured;
3. actual ERC-20 custody equals `managedAssets` (`CustodyStatus.MATCH`);
4. no cumulative bad debt is recorded;
5. a non-empty accounting state is not already at zero NAV; and
6. `marketRiskBudget` is no greater than current NAV.

Initial activation with zero assets and zero liabilities is allowed so LPs can
bootstrap the vault. Activation with existing liabilities that consume all
managed assets is rejected. NAV is computed from managed assets less pending
trader liability, insurance reserve, and cumulative bad debt. An unsolicited
ERC-20 transfer remains a custody surplus and does not mint NAV.

## Authority and reversibility

`setPublicLpActive` is restricted to `onlyGovernanceExecutor`. In a release
deployment the governance executor must be the configured `ProtocolTimelock`
or an equivalently controlled governance authority; a hot operational role is
not an acceptable production executor. The activation call is therefore
timelock-controlled when the release ceremony wires the contracts that way.

The transition is reversible by governance. `emergencyPausePublicLp` is
restricted to `EMERGENCY_ADMIN` and can only turn the flag off. Emergency
authority cannot activate or reactivate deposits, change NAV, change shares,
or withdraw assets. Governance may reactivate only after the same activation
checks pass again. There is no one-way activation assumption and no hidden
deactivation bypass.

## What the guard does and does not claim

The guard makes public LP participation an explicit release ceremony rather
than a silently live feature. It does not itself transfer LP capital into
`USDCMarginVault`. `PublicLPVault` exposes controller hooks for managed assets,
trader liability, insurance, bad debt, and market risk budget; those hooks are
the boundary that must be wired to the reviewed backing/reconciliation route
before LP assets are treated as margin backing. A testnet canary must activate
the standalone public-LP ledger, exercise real USDC deposits, NAV changes,
queued withdrawals, and claims, while separately proving that the margin vault
does not count LP assets unless that route is explicitly configured.

This is a safety boundary, not simulated activation: after governance calls
`setPublicLpActive(true)`, deposits transfer the real configured ERC-20 and
mint shares using the onchain NAV formula. No redeployment is required to
activate the feature. Bootstrap finalization and role assignment are required;
activation cannot bypass custody, NAV, bad-debt, or risk-budget checks.

## Tests

- `contracts/test/Gate4F1Closure.t.sol:testPublicLpActivationIsFailClosedAndEmergencyReversible`
- `contracts/test/Gate4F1Closure.t.sol:testPublicLpActiveLifecycleReconcilesNAVSharesAndWithdrawals`
- `contracts/test/Gate4DCompletion.t.sol:testPublicLpQueueAndLiabilitySafeNav`
- `contracts/test/Gate4DCompletion.t.sol:testPublicLpCannotMintAgainstZeroNav`
- `contracts/test/Gate4DCompletion.t.sol:testPublicLpUnexpectedTransferIsSurplusNotNav`
