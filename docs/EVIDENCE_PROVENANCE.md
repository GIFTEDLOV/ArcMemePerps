# Evidence provenance

Every observation is an `EvidenceRecord` with provider, chain, network, endpoint class, provider data/schema versions, block number/hash or Solana slot when available, transaction/signature when available, observed time, source timestamp, fetch time, freshness, confidence, status, value, and raw-value hash.

`observedAt` and `sourceTimestamp` describe the source fact. `fetchedAt` describes retrieval. They must not be substituted for one another. A future source timestamp is invalid; stale and unavailable records cannot satisfy evidence completeness.

Evidence records are sorted by `evidenceId` for the versioned Keccak Merkle root. Security-critical disagreements use explicit tolerances. A material disagreement blocks automatic qualification; a minor divergence retains the conservative value and remains visible. A provider saying “renounced” cannot override a contradictory canonical privileged path without reconciliation.

Address classifications for holder/cluster analysis are explicit: `LP`, `BURN`, `DEX`, `BRIDGE`, `SYSTEM`, `CEX`, `KNOWN_PROTOCOL`, or `UNKNOWN`. Unknown wallets remain in concentration calculations. LP-lock security is independent from market liquidity and remains `UNKNOWN` without lock/burn/ownership evidence.

The Gate 4D `MarketPassport` stores the evidence root and the normalized provider-health/freshness
state alongside the derived result. A missing optional provider is an explicit unavailable record;
it is not a zero value and cannot satisfy a qualification hard gate. Historical snapshots retain
their collection time and source position so later re-evaluation does not confuse retrieval time
with onchain event time.
