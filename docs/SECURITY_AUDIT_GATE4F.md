# Gate 4F hostile security audit

This document records the attack-surface map and the results of the internal
break-first review of the Gate 4E frozen candidate. It is not an audit
certificate and does not imply production solvency or external review.

## Scope and method

The review covered Solidity state transitions, fixed-point settlement,
custody, LP accounting, insurance and bad debt, ADL, qualification and
execution gates, oracle reports, governance, keeper/reporter services,
persistence, indexer replay, profile signatures, competition projections,
API boundaries, and provider normalization. Tests use deterministic local
fixtures and Arc-specific contract tests; no blockchain writes were made.

## Attack-surface map

| Surface | Caller / authorization | Important inputs and state | External calls / assets | Replay and time controls | Failure posture |
| --- | --- | --- | --- | --- | --- |
| USDC custody | trader for deposit/withdraw; engine for settlement; governance bootstrap for asset/engine wiring | ERC-20 amount, free/locked balances, rawCash, custody balance | canonical ERC-20 only; CEI plus reentrancy guard | exact balance-delta checks; no native balance accounting | revert on transfer failure or delta mismatch |
| LP deposit/share mint | public LP account; risk role for controller wiring | assets, NAV, total shares, liabilities | ERC-20 transferFrom | reentrancy guard; share math uses pre-transfer NAV | revert on zero/dust/fee-on-transfer |
| LP withdrawal | LP account | queued shares, cooldown, NAV, reserved liabilities | ERC-20 transfer | queued request and claim reset atomically | revert if free liquidity is insufficient |
| Orders | trader submits/cancels; configured order keeper executes | order fields, nonce, expiry, pre-trade hash, oracle sequence | oracle read, vault/engine settlement | consumed/cancelled flags, monotonic oracle sequence | fail closed on stale, replayed, or mismatched data |
| Position changes | trader for direct de-risking; keeper for liquidation; order keeper for two-phase execution | side, size, collateral, price band, OI/skew/capacity | vault settlement and insurance transfer | one account/market position; reentrancy guard | state rolls back on downstream failure |
| Liquidation | configured keeper | maintenance equity, conservative band, reward | vault and insurance | position removed before settlement; closed position cannot repeat | explicit residual and bad debt |
| Insurance | engine covers; insurance manager funds; governance wires asset/engine | available capital, debt amount, coverage | ERC-20 transfer to vault | coverage bounded by available capital | uncovered amount is explicit |
| Bad debt | engine records; insurance covers under engine authorization | protocol debt, covered/uncovered debt | insurance-to-vault transfer | no deletion without coverage | deficit remains recorded |
| ADL | governance opens/registers; configured ADL keeper executes | episode deficit, ordered profitable candidates, size | engine reduction and oracle read | candidate-used bit, deficit budget, finalization | deterministic reduction only; wrong price rejected |
| Qualification | qualification writer role | proof hash, rule version, limits, expiry | registry/market state | expiry and fresh proof checks | LIVE requires current approval |
| Risk updates | risk role for normal configuration; emergency role for monotone reductions | caps, maintenance, market status | exposure provider read | emergency path cannot increase; normal path uses fresh qualification | risk increase is timelock/role controlled |
| Oracle reports | oracle role/updater or threshold reporters | typed report, source counts, validity, sequence | signature recovery only; no arbitrary JSON | EIP-712 domain, chain, contract, version, nonce/sequence | duplicates, stale, future, wrong-domain data rejected |
| Governance/timelock | governance-admin role queues/cancels; anyone may execute after ETA | target, value, calldata, salt, ETA | arbitrary target call with zero/nonzero value as queued | operation ID binds all call data; delete-before-call | one-shot operation; target authorization remains required |
| Bootstrap/roles | owner only before `finalizeBootstrap` | roles, governance executor, ownership | none | finalization removes owner from built-in roles and disables owner setup | post-finalization owner is not a runtime superuser |
| Keeper | persistent order job lease plus on-chain order flags | order status, report, nonce, receipt | Arc RPC/write in future deployment | bounded leases and receipt reconciliation | stale worker cannot complete a lost lease |
| Reporter | one signer per process; sequence store | MarketPassport observation, sequence, expiry | read-only providers and EIP-712 signing | persistent monotonic sequence | missing signer/report fails closed |
| Indexer/reconciliation | indexer worker | chain checkpoints, block hashes/slots, protocol events | read-only RPC/database | idempotent IDs and mismatch detection | mismatch is critical, never silently repaired |
| Profiles | wallet-signed mutation | canonical payload hash, wallet, nonce, expiry | signature recovery only | issued/expiry windows and payload binding | invalid or replayed authorization rejected |
| Competition | indexer-derived event history | verified PnL, drawdown, liquidations, activity | database only | deterministic score snapshot identity | self-submitted scores are not accepted |
| Provider ingestion | configured provider pool | chain/token/pool IDs, decimals, timestamps, payloads | untrusted HTTP/RPC responses | timeout, retry budget, circuit state | wrong chain/token, stale, malformed, unavailable remain non-pass |

## Findings and fixes

### G4F-001 — deployer runtime bypass (HIGH, fixed)

The frozen candidate allowed `owner` to satisfy every role and governance
executor check indefinitely. A deployer could therefore bypass the timelock,
change risk, replace reporters, or alter custody wiring after deployment.

Fix: `AccessControlled.finalizeBootstrap()` is a one-way ceremony step. It
requires a non-owner governance executor, revokes the former owner from all
built-in roles, and disables owner-only setup. Sensitive paths now use their
declared role where applicable. Regression coverage proves the former owner
cannot call a governance-executor path after finalization.

### G4F-002 — unqualified LIVE state (HIGH, fixed)

`MarketRegistry.setState(..., LIVE)` could bypass `QualificationRegistry`.

Fix: both activation paths require current qualification approval.

### G4F-003 — arbitrary ADL price (HIGH, fixed)

ADL accepted a controller-supplied execution price, allowing an authorized
caller to select a favorable price for a forced reduction.

Fix: `PerpEngine.adlReducePosition` recomputes the conservative close price
from `OracleRouter` and requires an exact match.

### G4F-004 — custody credit without exact receipt (HIGH, fixed)

Deposit, backing, insurance funding, LP deposit, and outgoing transfers trusted
the requested amount rather than the actual ERC-20 balance delta. A fee-on-
transfer or non-standard token could create an internal deficit.

Fix: production custody paths require an exact six-decimal ERC-20 delta;
insurance coverage also requires physical custody before rawCash increases.

### G4F-005 — single-source oracle default (HIGH, fixed)

The legacy updater hook was usable with the default independent-source policy
unset.

Fix: the router defaults to two independent sources. A test that exercises the
legacy hook must explicitly opt down to one source, and an unconfigured default
cannot execute.

### G4F-006 — immediate durable-job re-claim (HIGH, fixed)

`RUNNING` jobs were immediately eligible for another claim. Two workers could
therefore execute one logical keeper/job task concurrently.

Fix: SQLite claims are transactional, live leases are not re-claimable, stale
leases recover only after a bounded timeout, and completion/failure requires
the lease token. The stale-worker regression test is in the persistence suite.

### G4F-007 — risk-reduction availability (MEDIUM, fixed)

The off-chain execution gate applied risk-increase checks to close/decrease
actions, which could turn oracle/insurance/capacity degradation into a trapped
position.

Fix: qualification, oracle confidence, insurance, margin, OI, position, vault
capacity, and LIVE-state checks are risk-increase checks. Expiry and pre-trade
integrity remain required for every order action.

### G4F-008 — OI independent of live vault backing (HIGH, fixed)

The engine checked configured market caps but did not reserve new production
OI against current free vault backing.

Fix: the ERC-20 production path rejects an open/increase if post-trade market
OI exceeds `USDCMarginVault.withdrawableLiquidity()`. The no-token path is
explicitly test-only legacy compatibility.

### G4F-009 — inconsistent oracle source counts (MEDIUM, fixed)

Reports could claim more independent sources than total sources, or zero
sources, while passing structural validation.

Fix: report validation requires positive counts and
`independentSourceCount <= sourceCount`.

### G4F-010 — zero market identity (MEDIUM, fixed)

Registration accepted a zero EVM chain/token or zero Solana public key.

Fix: canonical registration rejects zero identities before deriving the market
ID.

### G4F-011 — uncovered bad debt omitted from backing capacity (HIGH, fixed)

The vault's free-liquidity view reserved trader balances and pending positive
PnL but did not reserve the portion of recorded protocol bad debt not covered by
the insurance fund. After an uncovered gap, capacity and withdrawal checks could
overstate backing.

Fix: `withdrawableLiquidity()` now reserves
`max(protocolBadDebt - insuranceCoveredBadDebt, 0)` in addition to trader and
pending-profit liabilities. The reservation is released only by explicit
insurance coverage.

### G4F-012 — normal close emitted liquidation event (MEDIUM, fixed)

The normal user close path emitted `PositionLiquidated`, which could corrupt
downstream liquidation counts and competition/profile projections even though
the position was not liquidated.

Fix: normal close emits `PositionClosed`; liquidation paths retain
`PositionLiquidated`.

### G4F-013 — immediate sensitive configuration by operational roles (HIGH, fixed)

Risk, oracle, keeper, economic, and public-LP controller configuration was
reachable directly by operational roles. A compromised operational role could
therefore increase exposure or weaken oracle policy without the configured
timelock.

Fix: sensitive configuration setters now require the configured governance
executor. With a production `ProtocolTimelock` as executor, risk increases,
oracle/reporter changes, keeper wiring, economic parameters, exposure-provider
wiring, and LP-controller wiring must be queued and executed after the delay.
Role rotation and governance-executor rotation also use that path. Emergency
reductions remain on the separate monotone emergency path.

### G4F-014 — finalized deployment could bypass signed reporter threshold (HIGH, fixed)

The compatibility `setPrice`/`setReport` updater hooks could publish reports
without the configured M-of-N reporter signatures if an updater address were
enabled. That is acceptable only during deterministic bootstrap tests, not on a
finalized deployment.

Fix: both legacy updater paths now revert after `finalizeBootstrap`. Finalized
deployments accept the threshold-checked typed report path only.

Reporter-set versions are also retired on rotation and cannot be rolled back,
so an old signed report domain cannot be reactivated by configuration reuse.

## Residual release risks

The public LP vault remains a separate custody/accounting component in this
candidate. Its own share/NAV/queue invariants are tested, but this audit does
not claim that an eventual production LP funding route is safe merely because
the standalone share contract is safe. A release deployment must either wire
the LP component to the margin vault through a reviewed backing-transfer path
or keep public LP participation disabled. This is a release blocker for
public LP activation, not a reason to treat unsolicited transfers as LP NAV.

Optional Helius, GoPlus, and Bubblemaps enrichment remains unavailable without
credentials. Core reads fail closed when a risk tier requires missing evidence.

## Explicit assumptions

- The configured collateral token is the canonical Arc USDC ERC-20 and has
  six-decimal, exact-transfer behavior. Non-standard token behavior is rejected
  by tests.
- Contracts are not upgradeable; deployment must finalize bootstrap and assign
  roles before any public market becomes live.
- Timestamp checks are bounded freshness/expiry windows. They are not used for
  equality or ordering between consecutive blocks.
- Deterministic local tests are not a formal solvency proof or an external
  security audit.
