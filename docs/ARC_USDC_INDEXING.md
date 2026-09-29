# Arc USDC Indexing and Double-Count Protection

Arc can expose unified USDC Transfer information for native and ERC-20 movement. A downstream indexer may therefore observe both a system-level representation and an ERC-20-shaped representation of one economic movement.

The indexer must not credit a deposit, withdrawal, fee, or liquidation from a raw Transfer-log total. The source of truth is:

1. the protocol contract state transition;
2. the explicit ArcMemePerps protocol event; and
3. the canonical USDC ERC-20 balance reconciliation.

Raw logs are evidence used to diagnose and reconcile the state transition. They are not authorization to mutate the internal ledger.

The shared helper `deduplicateArcUsdcTransfers` creates an evidence key from block number, transaction hash, log index, endpoints, and the 6-decimal amount. It intentionally excludes emitter and observation source so system/ERC-20 duplicate views collapse to one observation. Distinct log positions remain distinct. The deterministic fixture in `packages/shared/src/arc-usdc.test.ts` covers both cases.

For production indexing, a protocol event should additionally be deduplicated by `(chainId, transactionHash, logIndex, emitter, topic0)` and by its protocol event identity. Reorg handling must retain the block hash until the event is final. Arc’s deterministic finality does not permit double-processing an event that has already been applied.

An unexpected external transfer to the vault is reported as `SURPLUS`; it is not protocol revenue and cannot be assigned to a trader. A custody deficit is `DEFICIT` and is critical. Only a state transition that the vault itself initiated may alter the expected-custody ledger.
