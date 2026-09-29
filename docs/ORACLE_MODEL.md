# Oracle model

The contract router accepts versioned reports containing a market ID, mid/min/max price,
confidence, source counts, timestamps, sequence, evidence root, and reporter-set version.
Execution uses conservative bands:

- long open/increase: max price;
- long close/liquidation: min price;
- short open/increase: min price;
- short close/liquidation: max price.

Offchain aggregation normalizes decimal precision, rejects stale/future/wrong-market/wrong-
chain observations, deduplicates source families, records outliers, computes a median and
dispersion, and blocks if configured independent-source/confidence/dispersion requirements
are not met. Two APIs over the same pool do not count as two independent sources.

The signed composite report uses EIP-712 typed data and binds Arc chain ID, router domain,
market, price band, time window, monotonic sequence, evidence root, and reporter set version.
The verifier rejects duplicate, unauthorized, expired, future, replayed, and threshold-
insufficient signatures. Chainlink feed and Data Streams adapters return `UNAVAILABLE` when
not configured; they never synthesize a price.
