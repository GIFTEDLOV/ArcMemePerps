# Qualification model audit

This audit separates protocol safety invariants from development defaults and records the semantic correction implemented in `risk-rules/0.2.0`. Frozen calibration inputs are recorded in `evidence/winner-rebuild/calibration-input-v1.json`.

## Decision semantics

Every hard gate now returns `PASS`, `FAIL`, or `UNKNOWN`.

- `PASS` means supplied evidence positively establishes the safe condition.
- `FAIL` means supplied evidence positively establishes the unsafe condition.
- `UNKNOWN` means missing, stale, conflicted, unsupported, or insufficient evidence.

For audited rules, `REJECTED` requires an explicit hard `FAIL`; `PENDING` means no hard `FAIL` exists but mandatory evidence is `UNKNOWN`; `WATCH` means all mandatory gates pass with a non-fatal warning; and `QUALIFIED` requires every mandatory gate to pass. `PENDING` is non-tradable. The legacy `0.1.0` evaluator remains available for unchanged baseline comparison and maps `UNKNOWN` to its historical fail-closed result.

Derivatives use the same distinction: missing mandatory inputs produce `UNASSESSED`, explicit unsafe/oracle failure produces `BLOCKED`, marginal measured capacity produces `WATCH`, and only complete passing inputs produce `ELIGIBLE`.

## Gate-by-gate audit

| Gate | Intended threat | PASS evidence | FAIL evidence | UNKNOWN behavior | Threshold/origin | Disposition |
|---|---|---|---|---|---|---|
| MINT_AUTHORITY_ACTIVE | supply inflation | chain-native authority explicitly absent | active authority | unknown | 0 active; protocol invariant | INVARIANT_HARD_FAIL / CHAIN_SPECIFIC |
| FREEZE_AUTHORITY_ACTIVE | selective freezing | chain-native authority explicitly absent | active authority | unknown | 0 active; protocol invariant | INVARIANT_HARD_FAIL / CHAIN_SPECIFIC |
| DANGEROUS_OWNER_ADMIN_PRIVILEGE | privileged transfer/owner control | completed authority check is clear | dangerous role | unknown | no numeric threshold | INVARIANT_HARD_FAIL / CHAIN_SPECIFIC |
| UPGRADEABILITY_RISK | implementation replacement | proxy/admin check is clear | unsafe upgrade authority | unknown | no numeric threshold | INVARIANT_HARD_FAIL / CHAIN_SPECIFIC |
| HONEYPOT_OR_TRANSFER_RESTRICTION | cannot buy/sell or restricted transfer | completed check is clear | positive honeypot/restriction signal | unknown | no numeric threshold | INVARIANT_HARD_FAIL |
| LIQUIDITY_WITHDRAWABLE | privileged LP rug | safe venue-native control | privileged actor can withdraw | unknown | old boolean/locker assumption | INVARIANT_HARD_FAIL / VENUE_SPECIFIC |
| LP_UNLOCK_TOO_SOON | near-term liquidity removal | safe control or unlock beyond window | unlock before minimum | unknown | 7 days was a development default | VENUE_SPECIFIC / MANDATORY_EVIDENCE_GATE |
| DEPLOYER_CONCENTRATION | deployer dump | measured holding at or below 10% | measured holding above 10% | unknown | 10%; unvalidated default | MANDATORY_EVIDENCE_GATE |
| INDIVIDUAL_HOLDER_CONCENTRATION | single-wallet dominance | measured top holder at or below 5% | above 5% | unknown | 5%; hard safety concept | INVARIANT_HARD_FAIL |
| CONNECTED_CLUSTER_CONCENTRATION | coordinated control | measured non-system cluster at or below 5% | above 5% with links | unknown | 5%; explicitly preserved | INVARIANT_HARD_FAIL |
| BUNDLED_LAUNCH_CONCENTRATION | launch-time sybil concentration | measured bundle at or below 10% | above 10% | unknown | 10%; pending calibration | MANDATORY_EVIDENCE_GATE |
| KNOWN_RISK_DEPLOYER | repeat adverse deployer | completed history check is clear | verified adverse history | unknown | boolean was not evidence-bearing | MANDATORY_EVIDENCE_GATE |
| RELATED_WALLET_FUNDING | linked funding/control | bounded graph completed and clear | evidenced related funding | unknown | boolean was not evidence-bearing | MANDATORY_EVIDENCE_GATE |
| SUSPICIOUS_EARLY_BUYERS | coordinated early buyers | completed launch analysis is clear | positive pattern | unknown | boolean was not evidence-bearing | MANDATORY_EVIDENCE_GATE |
| WASH_TRADING | artificial activity | longitudinal analysis is clear | positive wash signal | unknown | boolean was not evidence-bearing | MANDATORY_EVIDENCE_GATE |
| VOLUME_FARMING | artificial volume | volume-quality analysis is clear | positive farming signal | unknown | boolean was not evidence-bearing | MANDATORY_EVIDENCE_GATE |
| SUSPICIOUS_TRANSACTION_REPETITION | repeated self-like flow | transaction analysis is clear | positive repetition signal | unknown | boolean was not evidence-bearing | MANDATORY_EVIDENCE_GATE |
| INSUFFICIENT_EVIDENCE | incomplete safety proof | mandatory evidence observed | never an unsafe finding | unknown | completeness gate | MANDATORY_EVIDENCE_GATE |

## Derivatives gates

The development values are retained for baseline calibration, not treated as validated production constants: spot liquidity `$500k`, depth 1% `$50k`, depth 2% `$100k`, organic volume `$100k`, realized volatility `150%`, minimum oracle sources `2`, disagreement `3%`, confidence `8500 bps`, manipulation cost `$100k`, liquidation capacity `$100k`, safe OI `$25k`, and maximum leverage `5x`.

| Gate | Threat | UNKNOWN behavior | Classification |
|---|---|---|---|
| Spot liquidity | thin market | `UNASSESSED` | CALIBRATED_CAPACITY_THRESHOLD |
| Depth ±1% / ±2% | executable slippage | `UNASSESSED` | CALIBRATED_CAPACITY_THRESHOLD |
| Organic volume | farmed headline volume | `UNASSESSED` | MANDATORY_EVIDENCE_GATE |
| Realized volatility | unstable liquidation regime | `UNASSESSED` when history is insufficient | CALIBRATED_CAPACITY_THRESHOLD |
| Oracle sources | single-source manipulation | `UNASSESSED` | MANDATORY_EVIDENCE_GATE |
| Oracle disagreement | conflicting prices | unknown when absent; measured unsafe remains non-eligible | MANDATORY_EVIDENCE_GATE |
| Oracle confidence | weak source/freshness/liquidity evidence | `UNASSESSED` | MANDATORY_EVIDENCE_GATE |
| Manipulation cost | cheap price attack | `UNASSESSED` | CALIBRATED_CAPACITY_THRESHOLD |
| Liquidation capacity | bad-debt risk | `UNASSESSED` | CALIBRATED_CAPACITY_THRESHOLD |
| Safe OI | excess exposure | `UNASSESSED` | CALIBRATED_CAPACITY_THRESHOLD |

## Source-family and policy rules

Provider count and underlying economic-source count are separate. Two aggregators reporting the same pool are corroborating provider observations, not two independent oracle families. Independent count requires meaningful distinct pools or venues, subject to the existing `$10k` meaningful-pool floor; dust pools cannot manufacture confidence.

`packages/risk-engine/src/policies.ts` defines versioned profiles for `SOLANA_SPL`, `SOLANA_TOKEN_2022`, `EVM_STANDARD`, `EVM_PROXY`, `LAUNCHPAD_CONTROLLED`, and `VENUE_SPECIFIC_LP_CONTROL`. These map equivalent threats to evidence the chain or venue can actually expose and do not weaken hard safety concepts.

## Provider closure

- RugCheck public GET report and insider graph are enrichment only. Canonical Solana RPC remains authoritative; conflicts stay conflicted.
- GeckoTerminal public OHLCV is now called from the live adapter for the selected pool and persisted as provider/pool/timeframe evidence. History is empty when the provider does not return actual observations.
- GoPlus and Bubblemaps remain explicit unavailable/auth-required when no local credential is present.

## Calibration rule

No numeric rule is changed solely to increase the number of qualified markets. Sensitivity results and control-case regression must show that an adjustment does not admit an explicit unsafe control before a new rule version is used.
