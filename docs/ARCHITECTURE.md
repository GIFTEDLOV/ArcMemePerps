# Architecture

ArcMemePerps Gate 1 separates discovery, normalized domain data, lifecycle, token integrity, derivatives capacity, proof generation, and Arc execution.

```text
origin chains -> chain adapters -> normalized observation
                                      |-> lifecycle engine
                                      |-> integrity gates
                                      |-> derivatives capacity
                                      |-> qualification proof/hash
                                      |-> Arc registries and execution foundation
```

Origin-chain tokens remain on their source chain. Arc is the settlement and margin domain; no bridge or token custody flow is implemented in Gate 1.

`apps/api` is an application boundary around domain assessment. `apps/indexer` is a provider-neutral discovery coordinator. Neither starts a server or makes network calls in tests.

Statuses are intentionally independent:

| Dimension   | Meaning                                                      |
| ----------- | ------------------------------------------------------------ |
| Lifecycle   | Where the token is in its origin-chain launch/market journey |
| Integrity   | Whether token structure and activity pass hard gates         |
| Derivatives | Whether Arc perpetual risk capacity is currently acceptable  |

The frontend, when added, must consume normalized read models and must not branch on chain-specific behavior.
