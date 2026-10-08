# ArcMemePerps Mainnet role plan

This is a least-privilege plan, not a live role assignment. Every address is
`TBD_HUMAN_PROVISIONED` until the fresh Mainnet deployment ceremony. No private
key or mnemonic belongs in this repository.

## Role separation

| Role | Intended authority | Boundary |
|---|---|---|
| Deployer | Deploy the frozen bytecode and perform one-time bootstrap | Ephemeral; removed from runtime roles before bootstrap finalization. |
| Governance admin | Control the timelock administration | Multisig or equivalent governed signer; never the day-to-day deployer. |
| Timelock / governance executor | Normal configuration, role rotation, risk changes, oracle-set changes, and market activation | All normal changes pass through the configured timelock delay. |
| Qualification writer | Submit evidence-backed qualification and revocation transactions | No governance, risk, custody, oracle, or withdrawal authority. |
| Risk admin | Configure bounded risk settings through governance | Cannot increase risk through emergency paths; normal changes are timelocked. |
| Oracle admin | Configure reporter membership and reporter-set version through governance | Cannot publish an unsigned or stale report. |
| Oracle reporters | Sign composite origin-price reports | Three distinct keys; 2-of-3 threshold; no contract administration. |
| Order keeper | Execute signed user orders after contract validation | No authority to mutate the user plan or bypass oracle/qualification checks. |
| Liquidation keeper | Invoke bounded liquidation operations | No arbitrary custody withdrawal or risk increase. |
| Emergency admin | Reduce limits, pause, or move to close-only | Cannot increase leverage, OI, fees, or insurance withdrawals. |
| Insurance manager | Fund or administer insurance paths exposed by the contract | No arbitrary user-collateral withdrawal; actions are role-gated and observable. |
| LP risk controller | Govern public-LP activation/risk state | Timelocked normal path; emergency path only disables public LP. |
| Treasury / fee recipient | Receive protocol fee flows defined by immutable/configured policy | No deployment key reuse; no direct user-collateral authority. |
| API/indexer/operator | Read, index, serve, and monitor | No signing key; reporter/keeper secrets remain sealed outside the frontend and repo. |

## Ceremony requirements

1. Provision distinct signer identities and record only public addresses.
2. Verify every signer address on the intended chain before deployment.
3. Configure the timelock executor before `finalizeBootstrap`.
4. Assign operational roles to distinct addresses; do not reuse the deployer.
5. Confirm the deployer has no built-in runtime role after finalization.
6. Record role events, timelock operation IDs, and receipts in sanitized
   provenance evidence.
7. STOP if any private key appears in source, environment templates, logs,
   screenshots, evidence, or build output.

## Genesis role constraint

The first Mainnet state must have no registered market, no qualification
proof, no oracle publication for a market, no OI, no position, zero bad debt,
and `solvencyBlocked = false`. Role readiness does not authorize a market.
