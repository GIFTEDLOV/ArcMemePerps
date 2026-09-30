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

## Reproducible local Arc multi-account E2E

The complete local flow is implemented as one Foundry test:

```text
arc-anvil --network arc --port 8546
arc-forge test --fork-url http://127.0.0.1:8546 --match-contract LocalGate4E2ETest --optimizer-runs 1 -vv
```

`LocalGate4E2ETest.testFullLocalMultiAccountE2E` uses the Arc Anvil ERC-20 USDC predeploy and distinct local admin, reporter, keeper, trader, and liquidator identities. It covers deployment/configuration, signed 2-of-3 reports, long/short settlement, equal-time-safe funding and borrow accrual, liquidation reward, bad debt and insurance, emergency state transitions, fresh-proof requalification, order cancellation/replay, oracle signature attacks, withdrawals, and final custody/OI/insurance/bad-debt reconciliation. The test passed on the Arc local runtime.

## Gate 4B testnet result

The dedicated funded testnet identities completed the long, short, liquidation, market-state,
fresh-requalification, oracle rejection, order replay, event/indexer, and final reconciliation
canaries. The final ERC-20 custody reconciliation was `MATCH`: vault actual and expected custody
were both `5,244,914` base units; OI was zero; insurance actual and expected capital were both
`1,919,780` base units; and uncovered bad debt was zero. Testnet artifacts are in
`evidence/gate4/`.

The Arc Testnet deployment validates execution mechanics only. It does not prove production
economic safety, production oracle decentralization, governance safety, liquidity, solvency, or
formal audit completion.
