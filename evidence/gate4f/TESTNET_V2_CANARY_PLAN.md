# Arc Testnet V2 canary plan — prepared, not executed

This is a read/write test plan for a future, explicitly authorized Gate 4
deployment. Gate 4F performs no transactions. The suite must be rebuilt from
the Gate 4F hashes and deployed once only after the release role ceremony.

## Preconditions

1. Query `eth_chainId`; require `5042002`.
2. Verify the canonical ERC-20 USDC interface and six-decimal behavior.
3. Verify bytecode and constructor configuration for every deployment.
4. Assign roles and governance executor, configure a 2-of-3 reporter set, then
   finalize bootstrap on every AccessControlled contract.
5. Verify the timelock ETA, reporter-set version, risk rule version, and zero
   initial OI.
6. Fund protocol backing and insurance through exact ERC-20 custody paths.
7. Deploy the public LP vault in its safe initial inactive state. Confirm that
   unauthorized emergency, keeper, oracle, and qualification accounts cannot
   activate it. Queue and execute the documented governance activation through
   the configured timelock only after custody reconciliation, NAV, bad-debt,
   and risk-budget checks pass.

## Ordered canaries

- Deploy and verify runtime bytecode; verify source metadata if ArcScan is
  available.
- Configure roles, timelock, oracle reporters, qualification writer, keeper,
  insurance manager, risk controller, and emergency controls.
- Register a testnet-only market; submit and verify a Qualification Proof V2;
  activate only after current approval.
- Verify the Execution Gate with a valid pre-trade plan, fresh 2-of-3 report,
  capacity, margin, OI, side caps, and expiry.
- Deposit trader USDC; open long; accrue funding/borrow; close at a higher
  conservative price; reconcile PnL, fees, OI, and custody.
- Repeat for short at a lower conservative price.
- Exercise partial close and full close.
- With public LP active, deposit real testnet USDC from two dedicated LP
  accounts; verify share minting, active state, and actual custody. Execute
  trader activity and controller settlement hooks that change pending trader
  liability/NAV, request a withdrawal, pause new LP deposits through emergency
  control, and claim after cooldown. Verify queue ordering, liabilities, and
  actual custody. The canary must separately prove that the margin vault does
  not count LP assets as backing unless the explicitly configured reviewed
  backing route is enabled.
- Open an intentionally liquidatable position; verify maintenance threshold,
  bounded reward, residual, insurance, bad debt, and OI removal.
- Exercise insurance coverage and a bounded uncovered bad-debt case.
- Open a controlled ADL episode only after ordinary settlement and insurance
  are insufficient; verify profitable deterministic candidate ordering,
  partial reduction, replay rejection, and reconciliation.
- Set PAUSED and CLOSE_ONLY; verify new/increase refusal and safe decrease/
  close/liquidation behavior.
- Queue a risk increase through timelock; verify pre-ETA refusal, duplicate
  queue rejection, cancel behavior, and one-shot execution.
- Attempt oracle attacks: 1-of-3, duplicate signer, old set, wrong market,
  wrong chain, stale/future report, tampered price/root, and sequence replay.
- Kill/restart keeper at pre-broadcast, post-broadcast, post-receipt, and
  pre-database-commit points; verify one logical execution.
- Rebuild the indexer from checkpoints and verify one protocol event produces
  one state mutation and one notification.
- Reconcile vault custody, LP ledger (if enabled), insurance, bad debt, OI,
  positions, qualifications, risk state, profiles, and competition source PnL.

## Required final state

`MATCH` for ERC-20 custody, `PASS` for OI/position/insurance/bad debt
reconciliation, no pending duplicate orders, no unresolved critical health
record, and source hash parity with the deployment manifest. Testnet results
must not be presented as mainnet economic safety or formal audit evidence.
