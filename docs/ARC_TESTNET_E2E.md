# Arc Testnet E2E Plan

The intended canaries are:

- long open, oracle execution, price increase, close, and withdrawal;
- short open, oracle execution, price decrease, close, and withdrawal;
- intentionally small liquidation with conservative oracle pricing;
- LIVE to PAUSED/CLOSE_ONLY emergency state transitions;
- rejected one-signer, duplicate-signer, stale, future, wrong-market, wrong-chain, old-sequence, tampered-evidence, and replayed reports;
- cancelled and already-consumed order rejection; and
- final ERC-20 USDC custody, OI, insurance, and bad-debt reconciliation.

Every write must have a receipt, chain ID, nonce, fee configuration, and protocol event record. No logical action may be retried blindly. A canary is successful only when internal state, position/OI sums, and the canonical ERC-20 balance reconcile.

No canary has been executed on Arc Testnet in Gate 4 because the dedicated testnet identities and funding prerequisites are not configured. The local Arc runtime suite is separate evidence and must not be described as testnet evidence.

## Reproducible local Arc multi-account E2E

The complete local flow is implemented as one Foundry test:

```text
arc-anvil --network arc --port 8546
arc-forge test --fork-url http://127.0.0.1:8546 --match-contract LocalGate4E2ETest --optimizer-runs 1 -vv
```

`LocalGate4E2ETest.testFullLocalMultiAccountE2E` uses the Arc Anvil ERC-20 USDC predeploy and distinct local admin, reporter, keeper, trader, and liquidator identities. It covers deployment/configuration, signed 2-of-3 reports, long/short settlement, equal-time-safe funding and borrow accrual, liquidation reward, bad debt and insurance, emergency state transitions, fresh-proof requalification, order cancellation/replay, oracle signature attacks, withdrawals, and final custody/OI/insurance/bad-debt reconciliation. The test passed on the Arc local runtime.
