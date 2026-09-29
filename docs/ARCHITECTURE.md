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

Origin-chain tokens remain on their source chain. Arc is the settlement and margin domain; no bridge or token custody flow is implemented in Gate 2.

`apps/api` is an application boundary around domain assessment. `apps/indexer` is a provider-neutral discovery coordinator. Neither starts a server or makes network calls in tests.

Statuses are intentionally independent:

| Dimension   | Meaning                                                      |
| ----------- | ------------------------------------------------------------ |
| Lifecycle   | Where the token is in its origin-chain launch/market journey |
| Integrity   | Whether token structure and activity pass hard gates         |
| Derivatives | Whether Arc perpetual risk capacity is currently acceptable  |

The frontend, when added, must consume normalized read models and must not branch on chain-specific behavior.

## Gate 2 read path

```text
canonical RPC + provider APIs (read only)
       -> provider parsers and provenance records
       -> GenericEvmChainAdapter / SolanaChainAdapter
       -> MarketIntelligenceRecord
       -> Gate 1 lifecycle + integrity + derivatives engines
       -> QualificationProof v2 + typed Arc commitment
```

Providers are replaceable evidence sources, not decision-makers. A missing API key produces `UNAVAILABLE`; it never becomes a passing security fact. The adapters preserve provider observations and disagreement metadata while exposing one normalized domain shape.

The developer CLI is read-only and accepts no wallet, signing key, or transaction method. `pnpm test:live` is intentionally outside deterministic CI.

# Gate 3 economic boundary

Gate 3 adds fixed-point math, an oracle report boundary, two-phase order intent validation,
quote-based depth, conservative manipulation estimates, capacity bounds, and deterministic
economic simulation. Origin-chain assets remain off Arc; only USDC collateral and normalized
oracle/evidence state are consumed by the Arc execution layer.
