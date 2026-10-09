# Phase 14 full release-candidate audit

Audit status: **CLOSED** for the deployment-independent product candidate.

This audit started at commit `3c3b1b4179c729952411b48d0781c0f8582ba759`.
It did not broadcast a Mainnet or Testnet transaction, modify Solidity, change
policy `risk-rules/0.4.0`, push GitHub, deploy Vercel, or polish the UI.

## Frozen boundaries

```text
CONTRACT_SOURCE_SHA=0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b
CONTRACT_SOURCE_CHANGED=NO
POLICY_VERSION=risk-rules/0.4.0
POLICY_CHANGED=NO
MAINNET=DEPLOYMENT_PENDING
MAINNET_BLOCKER=EXTERNAL_BLOCKED_MAINNET_FUNDING
```

The canonical Solidity tree hash was recomputed by `pnpm backend:freeze` and
matched the frozen SHA. `git diff -- contracts/src risk-rules` remained empty.

## Findings register

Every finding found during this phase is listed below. A closed finding has a
regression test or direct verification recorded in the final validation table.

| ID | AREA | SEVERITY | DESCRIPTION | REPRODUCTION | ROOT CAUSE | FIX | REGRESSION TEST | STATUS |
|---|---|---|---|---|---|---|---|---|
| P14-001 | Playwright | MEDIUM | Four browser cases depended on the obsolete synthetic Alice fixture. | Baseline product Playwright: 7/11 passed; four Alice locators timed out. | Tests encoded a historical fixture instead of a stable real market identity. | Tests now select the first canonical market row and assert truthful pending/evidence states. No Alice, synthetic market, or fake data was restored. | Desktop and mobile product suites: 11/11 each. | CLOSED |
| P14-002 | Discovery semantics | HIGH | Production advertised the 161-row refresh snapshot as the complete discovery count, while the canonical retained universe contains 262 markets. | `winner.sqlite` had 262 unique `market_universe` rows; the latest refresh snapshot had 161, all included in the canonical set. | `scripts/production-service.ts` hydrated Mainnet pending mode from the refresh snapshot instead of the durable canonical source. | Added read-only canonical SQLite loading, explicit `currentlyObservedCount=161`, `staleRetainedCount=101`, and fail-closed source validation. | `scripts/production-discovery.test.ts`; production smoke reports 262/161/101. | CLOSED |
| P14-003 | API hostile inputs | MEDIUM | Invalid pagination, unsupported chain filters, and malformed wallet addresses returned generic 503 data failures. | Requests such as `limit=101`, an unsupported chain, and `/wallet/not-an-address`. | Request validation errors were thrown into the internal data-error handler. | Added explicit 400 client errors and removed internal error detail from generic 503 responses. | `apps/api/src/server.test.ts` verifies 400 status and error codes. | CLOSED |
| P14-004 | SSE/realtime | MEDIUM | An idle zero-event SSE connection did not flush headers until an event existed. | Curl against `/api/v1/stream` with no events received no headers before timeout. | The stream wrote headers but did not flush them. | Flush headers immediately; no event is fabricated. | `apps/api/src/server.test.ts` idle-stream test and curl header smoke. | CLOSED |
| P14-005 | Supply chain | CRITICAL | Full package audit reported critical `tinypool` advisories through the dev-only Vitest 3 chain. | `pnpm audit --json` before remediation reported two critical and two moderate advisories. | Test tooling was pinned below the patched Vitest/tinypool versions. | Upgraded workspace and frontend Vitest to `4.1.11`; lockfile was regenerated and compatibility checks passed. | `pnpm audit --prod --json` and `pnpm audit --json`: zero advisories. Full tests pass. | CLOSED |
| P14-006 | Runtime infrastructure | MEDIUM | The package declared Node `>=20` while durable persistence uses built-in `node:sqlite`. | The runtime imports `node:sqlite`; Node 20 deployments cannot satisfy that boundary. | Engine metadata predated the SQLite runtime requirement. | Raised the engine floor to Node `>=22.5.0` and documented the requirement. | `pnpm install --frozen-lockfile --offline --ignore-scripts`, typecheck, tests, and build pass on Node 24. | CLOSED |

## Discovery count contract

The counts are intentionally different and are never synthetically merged:

| Field | Meaning | Current evidence |
|---|---|---:|
| `discoveryCount` / `DISCOVERED_TOTAL` | Durable canonical retained discovery universe, keyed by canonical market identity. | 262 |
| `currentlyObservedCount` / `CURRENTLY_OBSERVED` | Unique markets in the latest provider refresh window. | 161 |
| `staleRetainedCount` / `STALE_RETAINED` | Canonical records absent from that refresh window. | 101 |
| `UNAVAILABLE_SOURCE` | A provider/source whose response is unavailable; it is not converted to zero. | explicit status |
| `CURRENT_QUERY_RESULT` | The filtered result returned from the durable canonical API read model. | query-dependent |

The latest 161 records are a subset of the 262 canonical records. The 101
retained records are historical/current discovery records outside the latest
refresh window; they do not imply fresh evidence, qualification, or Arc
activation. Discovery remains origin-chain data, never an Arc perp registry.

## Area audit results

| Area | Result | Evidence |
|---|---|---|
| Market identity | PASS | Shared identity tests cover chain namespace, address normalization, symbol non-identity, malformed IDs, and duplicate suppression. |
| Provider hostility | PASS | Provider corpus covers timeout/error/rate-limit/malformed/partial/duplicate/stale/wrong-chain and hostile numeric/metadata responses; unavailable states remain explicit. |
| Normalization | PASS | Lifecycle and origin venue provenance tests preserve New/Bonding/Bonded/Migrated/DEX Live distinctions. |
| Metadata security | PASS | Browser hostile metadata test renders script text, rejects executable markup, and fails soft on invalid images. |
| Evidence semantics | PASS | Domain/provider/risk tests preserve UNKNOWN, UNAVAILABLE, STALE, CONFLICTED, PASS, FAIL, and NOT_APPLICABLE without converting unknown to numeric zero. |
| Holder classification | PASS | Burn/system/precompile/pool/creator/insider/cluster/unknown control cases and concentration boundaries pass. |
| Liquidity/depth | PASS | Provider pool deduplication and executable quote depth tests pass; TVL is not used as depth and unsupported depth is unavailable. |
| OHLCV/volatility | PASS | History and deterministic volatility tests cover missing, duplicate, out-of-order, stale, zero-volume, and malformed observations. |
| Oracle independence/security | PASS | Correlated source-family deduplication, stale/future/rollback/replay/wrong-domain/disagreement/quorum/confidence tests pass. |
| Policy 0.4.0 | PASS | Full policy corpus still rejects authority, honeypot, LP, holder, bundle, stale oracle, single-source, dust, confidence, volatility, capacity, manipulation, liquidation, and vault insufficiency fixtures. |
| Dynamic capacity | PASS | Boundary and conservative-minimum capacity tests cover depth, volume, manipulation, liquidation, vault, confidence, and volatility units/rounding. |
| Economic attacks | PASS | Economic simulator, contract invariants, liquidation/insurance/ADL/bad-debt/LP/NAV tests pass with no silent debt deletion. |
| Fixed point/decimals | PASS | Shared math, Arc USDC, funding, fees, PnL, custody, and Forge economic vectors cover 18-decimal native gas versus 6-decimal ERC-20 units and 1e18 internal values. |
| Pretrade immutability | PASS | Immutable plan hashing and restricted execution tests reject reviewed-field mutations. |
| Operation recovery/idempotency | PASS | Persistence leases, event dedupe, reporter sequence, keeper idempotency, and replay tests pass; ambiguous state is not blindly retried. |
| Contract clients | PASS | Frozen ABIs/artifacts, Mainnet config binding, and pending-address behavior were checked; no Mainnet mode falls back to Testnet addresses. |
| Database | PASS | SQLite persistence, namespace isolation, restart/lease/transaction and unique identity tests pass. |
| Indexer | PASS | Checkpoint persistence, duplicate event identity, EVM reorg, Solana rollback, and `WAITING_FOR_DEPLOYMENT` tests pass. |
| SSE | PASS | Monotonic sequence/replay/dedupe tests pass; idle headers now flush without fabricated events. |
| Reporter | PASS | Zero-market idle and sequence/failure behavior are covered; production pending mode reports healthy idle and publishes no synthetic price. |
| Keeper | PASS | Zero-order idle, expiry, status, oracle, duplicate execution, nonce serialization, and restart boundaries pass. |
| API | PASS | API smoke covers health, discovery, detail, proof, policy, counts, pagination, unsupported chain, malformed address, and generic outage behavior. |
| Search/filter/trending | PASS | Exact market ID/address, symbol/name, mixed case, chain/lifecycle, deterministic ordering, and tie behavior are covered by read-model/frontend tests. |
| Frontend behavior | PASS | Routing, discovery, search, tabs, Risk Passport, holders, provenance, watchlist, wallet state, pending trade rail, outage, hostile metadata, and zero-perp behavior pass. |
| Accessibility behavior | PASS | Keyboard/semantic controls, tabs, dialogs, focus/close behavior, and status text are exercised by browser interaction tests. |
| Responsive behavior | PASS | No horizontal overflow at 375, 390, 430, 768, 1024, 1280, or 1440 viewport widths. No visual redesign was performed. |
| Performance | PASS | Production build completed; the discovery list remains bounded by API pagination and the final browser smoke completed without load regressions. |
| Secrets | PASS | Current tracked files, templates, build/evidence/docs, and practical history checks found no private key, mnemonic, password, API secret, database secret, or wallet seed. Values were not printed. |
| Dependency/build supply chain | PASS | Frozen lockfile install passes; production and full package audits report zero advisories; production/frontend/contract builds pass. |
| Mainnet tooling | PASS | Dry-run manifest generation passes with exact frozen artifacts, chain 5042, pending Safe/address fields, constructor schemas, zero-genesis assertions, and no broadcast. The deploy/verify ceremony remains intentionally unexecuted. |
| Governance/roles | PASS | Role plan and tooling retain Safe/timelock/least-privilege requirements; no Mainnet Safe or role assignment is invented while funding is blocked. |
| Product claims | PASS | README, Mainnet docs, API status, and frontend pending rail state Mainnet deployment pending, 262 canonical discovery, 0 qualified/registered/live perps, and no user trading/positions claim. |

## Feature reality re-audit

The existing reality labels remain conservative and were not upgraded merely
because tests pass:

| Reality label | Count |
|---|---:|
| `LIVE_E2E` | 7 |
| `LIVE_PARTIAL` | 9 |
| `PRIMITIVE_ONLY` | 8 |
| `TEST_ONLY` | 1 |
| `EXTERNAL_BLOCKED` | 2 |
| `NOT_IMPLEMENTED` | 1 |
| `DEAD_OR_UNNECESSARY` | 0 |

Historical Product Testnet execution and Stress/Security evidence remain
clearly separated from production. No historical canary is presented as a
Mainnet market or user trade.

## Test quality and skipped-test audit

- No `.skip`, `.only`, `xit`, `xdescribe`, or release-critical TODO test was
  found in the tracked test surface.
- Alice-dependent assertions were removed; no synthetic Alice fixture was
  restored to runtime or product data.
- Tests use real retained discovery data where stable and deterministic mocks
  only inside isolated browser/provider test scopes.

## Final validation evidence

```text
TS_TESTS=PASS (47 files, 232 tests)
FRONTEND_TESTS=PASS (4 files, 9 tests)
PLAYWRIGHT=PASS (22 tests: 11 desktop, 11 mobile)
PRODUCTION_BUILD=PASS
LINT=PASS
TYPECHECK=PASS
FORGE_FMT=PASS
FORGE_BUILD=PASS
SOLIDITY_TESTS=PASS (53 passed, 0 failed, 0 skipped)
FORGE_LINT=PASS
BACKEND_READINESS=PASS (84 rows; 82 implemented, 2 release-only)
PACKAGE_AUDIT=PASS (production and full tree: 0 advisories)
RESPONSIVE_SMOKE=PASS (375/390/430/768/1024/1280/1440)
MAINNET_API_SMOKE=PASS (Arc Mainnet, chain 5042, pending, 262/161/101, 0 perps)
MAINNET_WRITE_PERFORMED=NO
TESTNET_WRITE_PERFORMED=NO
```

## Release decision

`CRITICAL_OPEN=0`, `HIGH_OPEN=0`, and `MEDIUM_OPEN=0`. The candidate is ready
for the later UI-polish phase and for the already-prepared Mainnet ceremony
once external funding is restored. It is not a public release, not a GitHub
release, and not a Mainnet deployment.
