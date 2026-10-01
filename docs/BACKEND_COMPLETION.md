# Gate 4E backend completion boundary

Gate 4E closes the backend execution paths behind the canonical passport. The
completion package is deliberately transport-neutral: a production RPC/API
transport supplies observed chain state, while deterministic readers validate,
normalize, quote, persist, and classify that state. No reader fabricates a
zero, a pass, a lifecycle transition, or a price history point when its source
is unavailable.

## Discovery and evidence

`ContinuousDiscoveryService` owns a source-specific durable checkpoint and
deduplicates each observation by canonical market identity plus source event
identity. EVM venue state, Solana pool state, Pump lifecycle, and Flaunch
records are normalized before persistence. Venue addresses, RPCs, and API
credentials remain configuration; they are not embedded in the risk engine.

## Safety boundaries

LP control is separate from AMM liquidity. V2 holder evidence, concentrated
liquidity position evidence, and Solana protocol-control evidence return
`BURNED`, `LOCKED`, `PROTOCOL_CONTROLLED`, `WITHDRAWABLE`, or `UNKNOWN`.
`UNKNOWN` is never treated as locked. Honeypot analysis uses read-only transfer
simulation and reports a signal, not an impossible future-maliciousness proof.

Execution checks are deterministic and fail closed for stale qualification,
paused/close-only risk increase, stale or low-confidence oracle data, expired
orders, and cap violations. ADL candidate ordering is deterministic and only
selects profitable exposure, bounded by the requested deficit.

## Durable operations

SQLite remains the deterministic local store and the existing parameterized
PostgreSQL adapter is schema-compatible. Discovery checkpoints, history,
deployer refreshes, reports, recovery actions, LP withdrawals, ADL episodes,
and reconciliation failures are persisted entities. The frontend readiness
command is a ledger check; it does not replace test evidence.
