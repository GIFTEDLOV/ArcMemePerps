# Gate 4D backend gaps

This list contains only unresolved work visible in the current source audit.

The readiness parser reports these 21 partial rows:

- continuous market discovery
- Solana discovery coordinator
- Pump.fun/PumpSwap lifecycle
- Raydium discovery/depth
- Meteora discovery/depth
- Pancake V2/V3 discovery/depth
- Base Uniswap/Aerodrome discovery
- bounded Ethereum DEX discovery
- honeypot/transfer-restriction analysis
- connected cluster graph ingestion
- persistent deployer profile refresh
- volatility/history refresh integration
- PublicLPVault integration with live PerpEngine/NAV settlement
- complete ADL economics and cross-component reconciliation
- governance/timelock wiring across all configuration paths
- long-lived keeper process/checkpoints/metrics
- long-lived reporter process/persistent operator deployment
- complete durable API read projections
- historical market-window ingestion
- exact-match search wired to the API read path
- profile trading-statistics projection from indexed events

## Mainnet blocker

- The changed LP vault, ADL controller, timelock, and role model are not in the existing Arc Testnet deployment. A clean local E2E and explicitly authorized testnet redeployment are required before those changes can be called runtime-validated.
- LP vault accounting is not yet wired into PerpEngine pending-liability/NAV settlement.
- ADL has a bounded controller and engine hook, but complete bad-debt episode economics, ranking validation, and cross-component invariants are pending.
- Continuous venue discovery and direct pool/tick/account readers are not yet connected for all six chains.
- API routes exist as a versioned read-only boundary, but every read model projection is not yet backed by the durable repository.
- Keeper and reporter services remain process boundaries rather than fully operational long-lived deployments with persisted checkpoints and metrics.

## External blocked

- Helius, GoPlus, and Bubblemaps enrichment requires credentials. The system returns explicit unavailable evidence and applies insufficient-evidence logic; no credential is committed.
- Four.meme, Flaunch, Arc-native, Robinhood venue, and some Solana venue lifecycle/depth paths require documented/current venue access or program layouts that are not present in this repository. The adapters do not scrape websites or invent lifecycle states.
- Public RPC rate limits can make live smoke evidence unavailable; deterministic snapshots remain offline-only test inputs.

## Release-only

- Re-run ArcScan source verification when its API returns source metadata.
- Redeploy the materially changed contract suite to Arc Testnet after explicit authorization, then execute canaries and produce the updated evidence pack.
- Arc mainnet deployment, role ceremony, production reporter keys, and final release configuration are not performed in Gate 4D.
