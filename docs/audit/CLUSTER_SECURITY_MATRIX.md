# CLUSTER contract security matrix

**Review date:** 2026-10-28
**Method:** Manual source-level review of the named contracts and key control paths. No independent auditor, formal verification, Foundry execution, or bytecode/source parity check was available in this pass. Results below are not an audit certificate.

| Contract | Reviewed controls | Status and remaining boundary |
|---|---|---|
| `PerpEngine` | Position ownership, OI/position/leverage limits, freshness/sequence-bound order execution, keeper-only liquidation, canonical-oracle ADL, state-before-external-call patterns, reentrancy guards | Source controls are present. **High release blocker:** live `bootstrapFinalized()` is false, so owner bootstrap authority and legacy pre-finalization paths remain available. Live `nextPositionId()` is `1`. Forge tests not run. |
| `USDCMarginVault` | 6-decimal collateral validation, exact custody deltas, free/locked collateral accounting, bounded withdrawals, engine-only settlement, uncovered bad-debt reservation, reentrancy protection | Source-level controls present. Requires deployed role, backing, custody, and bytecode/source verification. Forge tests not run. |
| `PublicLPVault` | Exact deposit/claim custody deltas, managed NAV, liability and debt reserves, cooldown, inactive-by-default activation checks, cumulative queued-share bound | Aggregate request overrun fixed and regression tests added. Live `publicLpActive()` and `bootstrapFinalized()` are both false. Forge tests not run. |
| `OracleRouter` | Report band, chain binding, source counts, freshness/expiry, monotonic sequence, EIP-712 domain, low-`s` signature check, reporter threshold and retired versions | Signed-report controls exist. **High release blocker:** `setReport` and the legacy `setPrice` path are disabled only after bootstrap finalization; live finalization is false. Updater configuration and reporter threshold were not read from chain in this pass. |
| `QualificationRegistry` | Role-gated qualification writes, nonzero proof/rule hashes, bounded risk limits, expiry and revocation | Source-level checks present. Current full on-chain qualification set is not enumerable with the contract's public getters, and the production API is unavailable. Forge tests not run. |
| `RiskConfig` | Governance-gated initialization/requalification, global 5x leverage ceiling, qualification bounds, emergency-only risk reduction and status controls | Source-level checks present. Live config and exposure-provider state were not exhaustively enumerated. Forge tests not run. |
| `InsuranceFund` | 6-decimal collateral validation, exact transfer deltas, engine-only coverage, capped coverage against available capital, reentrancy protection | Source-level checks present. Live balances, engine wiring, and role separation were not verified beyond address code/receipt. Forge tests not run. |
| `ADLController` | Governance episode/candidate creation, keeper-only execution, single-use candidates, ordered ranking, deficit cap, engine-reported reduction and canonical price boundary | Source-level checks present. Live keeper wiring, episodes, and role separation were not enumerated. Forge tests not run. |

## Shared control and deployment evidence

`AccessControlled` gives the owner bootstrap powers until `finalizeBootstrap()` and then removes the former owner's built-in roles. On the live Arc deployment, `PerpEngine` and `PublicLPVault` still report `bootstrapFinalized=false`; this is the primary on-chain release blocker.

The RPC reported chain ID `5042`. All ten deployed addresses in `evidence/mainnet/contracts.json` had non-empty bytecode at the observed head. All ten creation receipts succeeded and matched the manifest addresses. This is existence/receipt evidence only; there was no runtime bytecode comparison, deployed storage audit across every contract, or source verification by the explorer.

## Regression coverage added or run

- Added `PublicLPVault` tests that reject cumulative requests above owned shares and allow valid split requests. **Not executed:** Foundry unavailable.
- Added keeper safety tests for exact opt-in execution, error classification, and reconciled event-index pages. Included in the passing root Vitest run.
- Added market normalization tests for unknown provider claims, missing values, stale timestamps, and malformed numbers. Included in the passing frontend Vitest run.
- Playwright proves the client-only disabled paths do not issue wallet signing methods; it uses fixtures and does not verify production API or live transaction behavior.
