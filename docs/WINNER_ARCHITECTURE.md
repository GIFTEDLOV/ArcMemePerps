# ArcMemePerps winner rebuild architecture

## Identity boundary

Every discovered market is keyed by `chain + canonical token address/mint`.
Symbols and names are display metadata only. A discovery record is not a perp
record: the universe reports `ORIGIN ONLY` until the canonical Arc registry
contains a matching market.

## Evidence boundary

The market universe stores provider observations with provider, observed time,
fetched time, availability, and optional block/slot/evidence hash. Origin spot
liquidity, directional depth, Arc perp capacity, and PublicLPVault NAV are
separate fields. Missing evidence is `null` plus an explicit availability or
reason state.

## Current local flow

`pnpm winner:discover` reads the public DexScreener token-profile and token-pair
endpoints, deduplicates by chain/token identity, and writes a sanitized
snapshot to `evidence/winner-rebuild/discovery-snapshot.json`.

`pnpm winner:service --port=8788` loads that snapshot into a durable SQLite
projection, exposes the versioned API and SSE endpoint, and reports provider
gaps honestly. The local database is ignored; the snapshot is evidence.

The React/Vite terminal consumes this API. User writes, when a registered live
perp is available, use the browser wallet for ERC-20 approval, vault deposit,
and `PerpEngine.submitOrder`. The backend never signs for a user wallet. The
chain receipt, keeper execution, and indexer projection are distinct states.

## Deployment boundary

The frozen Arc contract suite and historical Product/Stress deployments are
not changed by the rebuild. The Product deployment is the only normal product
target. Stress evidence is reachable from Docs / Proof only and never from
default market discovery.

## Operational gaps

Provider-specific integrity, holder, cluster, deployer, depth, and origin
history readers still require configured production credentials/readers. Until
then, the UI exposes `PENDING` or `UNAVAILABLE`; it does not manufacture a
qualification, score, candle, or perp registration.
