# Final feature reality audit

Phase 12 release-candidate audit. This document uses the required reality
labels; `IMPLEMENTED` alone is intentionally not used.

## Current product truth

- 262 observed/discovered real origin markets.
- 0 core-qualified real markets.
- 0 derivatives-eligible real markets.
- 0 registered real Arc perp markets.
- 0 live real Arc perp markets.
- Final offchain policy: `risk-rules/0.4.0`.
- `FINAL_POLICY_FROZEN=YES` — no rule changes are permitted before release
  unless a Critical security defect is found.
- Frozen contract source SHA:
  `0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b`.
- `CONTRACT_SOURCE_CHANGED=NO` — canonical `contracts/src/**/*.sol` tree hash
  recomputed during this audit.

## Reality matrix

| Feature | Reality | Evidence and boundary |
|---|---|---|
| Origin market discovery | `LIVE_PARTIAL` | Real DexScreener-backed discovery snapshot and 262-market local read model. Provider enrichment is not universal. |
| Chain/token normalization | `LIVE_PARTIAL` | Canonical chain plus token identity is persisted; symbol is not identity. |
| Risk/evidence enrichment | `PRIMITIVE_ONLY` | Provider adapters and evidence schemas exist. Candidate-specific authority, holder, cluster, LP, history, and activity gaps remain explicit. |
| Qualification policy 0.4.0 | `LIVE_PARTIAL` | Risk engine, dynamic capacity model, persisted corpus calibration, and security regression are exercised. No real market passed. |
| Market activation | `TEST_ONLY` | Frozen contracts and activation guards were exercised in local/Testnet evidence. No production market is activated. |
| Real perp registration | `NOT_IMPLEMENTED` | Deliberately absent because no real market satisfied core integrity plus capacity. |
| Order submission | `LIVE_E2E` | Historical Product Testnet/local execution evidence covers signed order submission. It is not a current real-market production claim. |
| Order keeper | `LIVE_E2E` | Historical Testnet/local keeper execution and replay protections are evidenced. No current real-market order exists. |
| Positions and settlement | `LIVE_E2E` | Historical Testnet/local position, partial-close, close, and reconciliation evidence exists. No current production positions exist. |
| Liquidation | `LIVE_E2E` | Historical security/Testnet evidence covers liquidation and fail-closed accounting. |
| Insurance and bad debt | `LIVE_E2E` | Historical stress evidence covers insurance, bad debt, and terminal solvency containment. |
| ADL | `LIVE_E2E` | Historical local/Testnet security evidence covers ADL bounds and replay protection. |
| Oracle reporter quorum | `LIVE_E2E` | Contract and historical Testnet evidence cover 2-of-3 signatures, sequence, freshness, and source binding. No production reporter set exists. |
| Origin oracle source qualification | `PRIMITIVE_ONLY` | Source-family accounting and independence rules exist; no real market currently satisfies the full activation set. |
| Frontend market discovery | `LIVE_PARTIAL` | Winner frontend renders the real local discovery universe and explicit evidence states. Public deployment is not a mainnet product. |
| Risk Passport | `LIVE_PARTIAL` | Compact risk/evidence UI and provenance drawer exist; unavailable data remains unavailable. |
| Wallet connection | `PRIMITIVE_ONLY` | Browser wallet connect, chain detection, wrong-network handling, and testnet write path exist. |
| Portfolio | `PRIMITIVE_ONLY` | Canonical read boundary and truthful empty state exist; no production positions or balances are claimed. |
| Activity | `PRIMITIVE_ONLY` | Canonical event projection boundary and truthful empty state exist. |
| Notifications | `PRIMITIVE_ONLY` | Read endpoint and empty surface exist; no production notification stream is claimed. |
| Watchlist | `LIVE_PARTIAL` | Local browser watchlist is functional; it is not a server-synchronized account feature. |
| Competitions | `PRIMITIVE_ONLY` | Route and read-model primitives exist; no active competition is claimed. |
| LP product surface | `PRIMITIVE_ONLY` | Contract/public-LP primitives and historical security evidence exist; no public production LP is active. |
| SSE/realtime | `LIVE_PARTIAL` | Ordered replay/dedupe semantics and local API stream are tested; no mainnet stream is running. |
| API/read model | `LIVE_PARTIAL` | Versioned read-only API, pagination, outage handling, and local persistence are exercised. |
| Indexer | `LIVE_PARTIAL` | Ordered projection primitives and historical Product/Testnet evidence exist; no mainnet indexer is deployed. |
| Mainnet deployment | `EXTERNAL_BLOCKED` | Requires a fresh authorized deployment, role ceremony, funding, and receipt/runtime verification. Not performed here. |
| Mainnet activation | `EXTERNAL_BLOCKED` | Requires a naturally eligible market and fresh qualification proof. Current eligible count is zero. |

## Historical evidence positioning

The Product Testnet deployment and the Stress/Security deployment are evidence
only. The Stress/Security deployment is intentionally insolvent in its test
scenario and must never be selected as a frontend or production target. The
Product Testnet canary is a mechanics fixture with a dummy origin identity; it
is not one of the 262 discovered origin markets and is not a production market
claim.

## Public wording requirement

The public product must say:

> 262 markets are observed. No market currently meets the complete activation
> policy. Discovery remains available; leverage remains disabled until a real
> market earns qualification and capacity.

It must not say or imply that users are currently trading real origin-token
perps, that a mainnet position exists, or that discovery makes a market
tradable.

## Counts

| Reality label | Count |
|---|---:|
| `LIVE_E2E` | 7 |
| `LIVE_PARTIAL` | 9 |
| `PRIMITIVE_ONLY` | 8 |
| `TEST_ONLY` | 1 |
| `EXTERNAL_BLOCKED` | 2 |
| `NOT_IMPLEMENTED` | 1 |
| `DEAD_OR_UNNECESSARY` | 0 |
