# Remaining backend gaps after Gate 4C

Only incomplete work is listed here. This is not a roadmap for frontend work.

## MAINNET_BLOCKER

- No mainnet launch is authorized by this audit.
- Live discovery and lifecycle evidence are not complete for all supported chains and launch venues.
- Live holder, funding-graph, deployer-history, and LP-control ingestion is incomplete.
- Direct quote/depth adapters for concentrated-liquidity EVM venues and Solana venues are incomplete.
- Legacy provider money fields still use JavaScript numbers and need a fixed-point/raw-decimal migration before they can be an authoritative derivatives input.
- Durable event consumers, replay-from-checkpoint workers, and cross-component reconciliation jobs are not wired.
- Qualification publication from canonical snapshots is not automated.
- Keeper/reporter processes are architecture boundaries, not production-operated services.
- No production governance, reporter operations, or ADL is present.

## POST_HACKATHON

- PostgreSQL repository adapter and production migration runner.
- Queue-backed persistent jobs, notification delivery, and operational alerting.
- Full launchpad plugins for Pump.fun/PumpSwap, Four.meme, Flaunch, Arc-native venues, and Robinhood documented venues.
- Complete V2/V3/CLMM LP security and quote readers.
- Wallet, deployer, and competition projections over long-lived indexed history.
- Signed profile mutation authorization and review tooling.

## OPTIONAL_ENHANCEMENT

- Additional DEX/source families and CEX references.
- More sophisticated graph clustering and explainable anomaly features.
- Cache performance benchmark suite and materialized trending projections.
- Broker-backed realtime fanout.

## EXTERNAL_DEPENDENCY

- Provider credentials/access for GoPlus, Helius, and Bubblemaps.
- Current documented launchpad APIs or verified onchain event addresses for each venue.
- Reliable RPC/indexer capacity for historical token transfers, holders, and funding edges.
- ArcScan/Blockscout source verification service availability; current read-only response exposes address records without verified source metadata.
