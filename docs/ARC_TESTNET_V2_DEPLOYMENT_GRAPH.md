# Arc Testnet V2 Deployment Graph

This document describes the frozen-suite deployment path prepared in Gate 4G.0. It is tooling
and configuration only; Gate 4G.0 performs no Arc Testnet broadcast.

## Deployment order

1. `QualificationRegistry`
2. `MarketRegistry(QualificationRegistry)`
3. `OracleRouter(120 seconds, 8,500 confidence bps)`
4. `RiskConfig(QualificationRegistry)`
5. `USDCMarginVault`
6. `InsuranceFund`
7. `PerpEngine(MarketRegistry, RiskConfig, OracleRouter, USDCMarginVault, InsuranceFund)`
8. `PublicLPVault(Arc USDC, 60-second withdrawal cooldown)`
9. `ADLController(PerpEngine)`
10. `ProtocolTimelock(60-second testnet-safe delay)`

The deployment script is `contracts/script/DeployGate4GV2.s.sol`. It rejects any chain other than
Arc Testnet `5042002`, verifies bytecode and `decimals() == 6` at the canonical ERC-20 USDC
interface, validates actors, and uses deterministic constructor wiring.

## Bootstrap and governance graph

During bootstrap, the V2 deployer assigns the role addresses and configures the dependency links.
Every `AccessControlled` contract receives `ProtocolTimelock` as `governanceExecutor`. The deployer
then calls `finalizeBootstrap()` on every contract. This removes bootstrap owner authority from the
built-in runtime roles; the deployer is not the post-bootstrap governance bypass.

`GOVERNANCE_ADMIN` queues and executes normal governance operations through `ProtocolTimelock`.
`RISK_ADMIN`, `EMERGENCY_ADMIN`, `ORACLE_ADMIN`, `QUALIFICATION_WRITER`, `KEEPER`, and
`INSURANCE_MANAGER` are separate actors in the candidate actor manifest.

## Linkage

- `USDCMarginVault.engine -> PerpEngine`
- `InsuranceFund.engine -> PerpEngine`
- `RiskConfig.exposureProvider -> PerpEngine`
- `PerpEngine.adlController -> ADLController`
- `ADLController.engine -> PerpEngine`
- `ADLController.keeper -> KEEPER`
- `PerpEngine.orderKeeper/liquidationKeeper -> KEEPER`
- `PublicLPVault.riskController -> RISK_ADMIN` by the frozen candidate plan
- `OracleRouter` reporter set -> `REPORTER_1`, `REPORTER_2`, `REPORTER_3`, threshold `2-of-3`

The LP vault is initially inactive. Its activation must be performed later through the timelock
after custody, NAV, bad-debt, and risk-budget checks. No direct storage or test-only activation path
exists in the deployment tooling.

## Resume safety

`DeployGate4GV2.s.sol` accepts `V2_*_ADDRESS` variables for a previously interrupted deployment.
An address is reused only when it has runtime bytecode and that bytecode matches the current compiled
`type(Contract).runtimeCode`; otherwise the script reverts with `RuntimeBytecodeMismatch`. Empty-code
addresses are never treated as deployed. The TypeScript preflight validates the complete order,
artifact availability, actor distinctness, source hash, chain identity, USDC identity, and public
balance requirements before any future broadcast command is authorized. Its pure
`remainingDeployments` calculation is covered by deterministic tests.

The future broadcast operator must persist each included transaction and address in
`deployments/arc-testnet-v2/progress.json` and inspect nonce/receipt/code before resuming. A timeout
is never a reason to blindly redeploy; receipt and runtime-code inspection must first establish
whether that logical deployment already completed.

## Public accounting boundary

Protocol collateral uses the ERC-20 USDC interface at 6 decimals. Arc native balance is reserved
for gas accounting at its native precision and is never added to ERC-20 custody or Transfer-log
accounting.
