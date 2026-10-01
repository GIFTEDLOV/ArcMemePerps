# Static analysis review

Gate 4C reran upstream Forge 1.8.3 and Arc Forge 1.7.1-dev linting. The following diagnostics
have explicit, line-scoped suppression comments after source review; they are not ignored
silently:

- `missing-events-access-control`: `OracleRouter.setUpdater` emits both `UpdaterSet` and
  `UpdaterAuthorizationChanged` for the access-control mapping mutation.
- `reentrancy-no-eth`: settlement calls are made only from `PerpEngine` entrypoints protected by
  `ReentrancyGuard`; `USDCMarginVault` and `InsuranceFund` independently guard token transfers.
  Position/OI state is finalized before those calls, and V1 does not transfer native ETH.
- `reentrancy-events`: settlement-result events are emitted after the guarded vault/fund call so
  the event records the actual payout, residual, and bad-debt result. A failed external call
  reverts the complete transaction and emits no partial protocol event.

The `require-revert-in-loop` warning was not excluded. Oracle signature validation now records
invalid, unauthorized, and duplicate signatures in memory and reverts after the loops. Invalid
signature parsing returns the zero address instead of reverting from the helper, preserving the
fail-closed result without a revert inside a loop.

Upstream Forge recognizes these line-scoped suppressions. Arc Forge 1.7.1-dev does not recognize
the same IDs and reports them as `unknown id` notices while still exiting successfully; this is a
toolchain-version compatibility notice, not an unreviewed contract finding. Any future contract
change touching these paths must rerun the review and the full Forge/Arc Forge suites.
