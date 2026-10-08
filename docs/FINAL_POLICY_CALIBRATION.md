# Final policy calibration audit

This document is the required pre-change audit for Winner Phase 11. It
distinguishes original safety requirements from implementation defaults before
any 0.4.0 code or rule file is introduced. Policy `0.3.0` remains unchanged
until this audit is reviewed against the security and economic corpus.

## Decision frame

The final model keeps two separate questions:

1. **Core integrity:** can the asset be rugged, seized, made unsellable, or
   controlled by a material connected group under the applicable policy?
2. **Derivatives capacity:** how much Arc exposure can be supported while
   bounding manipulation, liquidation, oracle, and vault risk?

Evidence coverage and surveillance remain visible third dimensions. Unknown
core-control evidence remains `PENDING`; unknown optional history does not
become `CLEAR` and is reported through coverage/surveillance. No threshold is
changed merely to increase the qualification count.

## Rule-origin table

| Rule | Origin | Threat | Current classification | Current threshold | User requirement or development default | Empirical support in repository | Proposed final classification |
|---|---|---|---|---:|---|---|---|
| Active mint authority | Original safety thesis and policy audit | Supply inflation and dilution | Core hard gate | Authority must be absent | User-defined safety requirement | Explicitly retained in 0.2.0/0.3.0 and security fixtures | Core hard `FAIL`; unknown applicable state is `PENDING` |
| Active freeze authority | Original safety thesis, chain-specific | Selective seizure/freezing | Core hard gate where applicable | Authority must be absent | User-defined safety requirement | Solana policy profile and regression coverage | Core hard `FAIL`; `NOT_APPLICABLE` only under proven profile |
| Dangerous owner/admin privilege | Original safety thesis | Transfer, tax, blacklist, pause, or seizure control | Core hard gate | No dangerous privilege | User-defined safety requirement | 0.3.0 audit and explicit admin fixtures | Core hard `FAIL`; unknown applicable state is `PENDING` |
| Dangerous upgradeability | Original safety thesis | Proxy implementation replacement | Core hard gate | No dangerous upgrade authority | User-defined safety requirement | 0.3.0 audit; BSW/GALABET reject controls | Core hard `FAIL`; unknown proxy state is `PENDING` |
| Honeypot/material transfer restriction | Original safety thesis | Inability to exit or restricted transfer | Core hard gate | Sellability must be established | User-defined safety requirement | Direct-simulation and transfer-restriction fixtures | Core hard `FAIL`; unknown applicable behavior is `PENDING` |
| Privileged material LP withdrawal | Original liquidity-safety requirement | Liquidity rug and forced bad debt | Core hard gate | No privileged material withdrawal | User-defined safety requirement | LP release guard, venue profiles, and fixtures | Core hard `FAIL`; unknown applicable control is `PENDING` |
| LP unlock window | Implementation of liquidity safety | Near-term liquidity removal | Core venue-specific gate | 7 days | Development default unless venue semantics make a timed lock the actual control | 0.2.0 audit calls 7 days a development default; venue-correct policies exist | Core only when timed unlock is the applicable threat; otherwise use venue-native safe state |
| Individual non-system holder concentration | Original product safety requirement | Insider/whale price control and coordinated exit risk | Core hard gate for the non-system set | `<=5%` | User-defined safety requirement; classification of the holder is the calibration question | 0.3.0 audit; SHIB burn correction; PEPE/EPOCH remain explicit controls | Proven creator/insider/unknown `>5%` remains core `FAIL`/`PENDING`; only evidenced system accounts are excluded; any independent-whale capacity treatment requires a separate documented proof and conservative limits |
| Connected non-system cluster concentration | Original product safety requirement | Coordinated control hidden across wallets | Core hard gate | `<=5%` | User-defined safety requirement | Explicit cluster fixtures, including individually-small connected wallets | Core hard gate; unknown relationship coverage remains `PENDING` |
| Bundled launch concentration | Launchpad/distribution safety requirement | Sybil allocation and immediate coordinated exit | Profile-specific core or surveillance | `<=10%` when applicable | User-defined threat requirement; applicability is profile-dependent | 0.3.0 profile model and bundle regression | Core for launchpad profiles; surveillance/capacity signal for mature profiles; explicit breach remains hard for the applicable profile |
| Deployer/creator concentration | Launchpad or known-creator safety | Insider dump/control | Profile-specific core or surveillance | `<=10%` when identity is proven | Development threshold pending production calibration; insider threat is a safety requirement | 0.3.0 reclassification and creator evidence gaps | Core when the profile requires it; otherwise explicit proven excess is high-risk/rejecting and unknown identity is coverage-limited, never `CLEAR` |
| Known risky deployer history | Historical intelligence | Repeat adverse deployment | Surveillance | Boolean in legacy model | Development implementation was not evidence-bearing | 0.3.0 audit explicitly separated history from current control | Surveillance; explicit verified risk can reject or block derivatives; unknown is `LIMITED` |
| Related-wallet funding | Distribution intelligence | Hidden common control and cluster formation | Surveillance feeding cluster proof | No numeric threshold | Development evidence requirement, not a direct current control | Phase 7/8 unknown graph findings | Surveillance; evidence can hard-fail cluster when it proves ownership; incomplete history is not `CLEAR` |
| Early buyers/snipers | Launch/distribution intelligence | Coordinated launch allocation | Surveillance or profile-specific core | Bundle `<=10%` where applicable | Threat requirement; mature-market recoverability is a policy applicability issue | 0.3.0 policy audit | Surveillance for mature markets; explicit applicable bundle breach remains hard |
| Wash trading/farming/repetition | Market-quality intelligence | False liquidity/volume and manipulation | Surveillance/capacity | No binary threshold | Development default as a mandatory evidence field; threat is economic rather than necessarily token control | Phase 3–8 universal unknowns; threat model treats activity as economic risk | Surveillance and capacity input; explicit severe risk blocks derivatives, unknown reduces coverage/capacity, not core integrity by itself |
| Spot liquidity | Economic capacity | Thin market and liquidation slippage | Binary capacity threshold in 0.3.0 | `$500,000` | Explicitly documented development default | Phase 9 SHIB aggregate `$4.449M`; prior candidate failures often reflected threshold rather than current control | Capacity input, not a listing gate; derived OI/position must remain materially positive and bounded |
| Executable depth ±1% | Economic capacity | Slippage and liquidation gap | Binary capacity threshold in 0.3.0 | `$50,000` | Explicitly documented development default | SHIB V2 direct depth around `$7.3k`; depth is real and quote-derived | Capacity input with conservative directional haircuts; no TVL substitution |
| Executable depth ±2% | Economic capacity | Larger liquidation impact | Binary capacity threshold in 0.3.0 | `$100,000` | Explicitly documented development default | Existing direct-depth and shallow-liquidity fixtures | Capacity input; derived safe OI must remain positive and stress-tested |
| Organic volume | Economic capacity | Farmed volume and insufficient exit flow | Binary capacity threshold in 0.3.0 | `$100,000/day` | Explicitly documented development default | Existing activity engine and Phase 9 real history | Quality-adjusted capacity input; completed activity evidence is required for usable capacity |
| Realized volatility | Economic capacity | Liquidation/oracle instability | Binary capacity threshold in 0.3.0 | `150%` | Explicitly documented development default | SHIB persisted 100 real OHLCV points at `77.3163%`; volatility already feeds leverage | Capacity/leverage input with an extreme-volatility block; no zero fallback |
| Independent economic price sources | Original oracle safety requirement | Single-pool manipulation and correlated provider failure | Hard derivatives gate | `>=2` meaningful sources | User-defined safety requirement | Phase 5–9 source-family evidence and dust-source tests | Hard derivatives gate; provider duplication and dust never count |
| Oracle disagreement | Oracle safety requirement implemented as a development bound | Bad price consensus | Hard derivatives gate in 0.3.0 | `<=3%` | Exact bound is a development default; agreement itself is a safety requirement | Oracle model, regression tests, and persisted source observations | Keep as hard measured disagreement bound pending stronger sensitivity evidence |
| Oracle confidence | Oracle quality bound | Weak/freshness-correlated price evidence | Hard derivatives gate in 0.3.0 | `>=8500 bps` | Explicitly documented development default | Evidence pipeline confidence formula; SHIB Phase 9 measured `8040` | Keep an auditable minimum for now; use source count, freshness, liquidity and agreement in capacity scaling; do not lower without sensitivity proof |
| Manipulation cost | Economic capacity | Oracle/origin price attack extracting Arc value | Binary capacity threshold in 0.3.0 | `$100,000` | Explicitly documented development default | SHIB Phase 9 measured about `$9.6k`; attack fixtures cover cost/extractable value | Capacity input; Arc exposure must be a conservative fraction of evidenced cost |
| Liquidation capacity | Economic safety | Bad debt under forced close | Binary capacity threshold in 0.3.0 | `$100,000` | Explicitly documented development default | Current capacity architecture and liquidation tests | Capacity input with directional/depth haircut and concurrent-liquidation stress |
| Safe OI | Economic safety | Excess protocol exposure | Binary capacity threshold in 0.3.0 | `$25,000` | Explicitly documented development default | Existing `minKnown` capacity model and vault tests | Derived capacity output; a positive minimum economically meaningful OI remains mandatory |
| Global leverage ceiling | Economic model and user-facing contract design | Leveraged loss and bad debt | Hard upper bound | `5x` | Product/economic requirement as a ceiling, not an entitlement | `docs/ECONOMIC_MODEL.md`, execution controls, fixtures | Keep hard global maximum; per-market leverage scales down deterministically |
| Maintenance/liquidation controls | Economic model | Insolvency and delayed close | Execution hard controls | Existing contract parameters | User-defined safety architecture; exact values are deployment/configuration, not discovery thresholds | Forge/local E2E and reconciliation tests | Keep execution hard controls; capacity must prove the selected limits fit them |
| Vault/insurance backing | Economic model | Arc counterparty insolvency | Capacity bound | Actual available backing | User-defined safety architecture | `docs/ECONOMIC_MODEL.md`, vault/insurance tests | Capacity bound; no origin-market evidence may exceed available Arc backing |

## Quantitative calibration proposal

The evidence supports changing the *role* of the absolute market-size numbers,
not deleting safety controls. A $20k-depth market cannot safely support the
same exposure as a $500k-depth market, but forbidding every such market is a
development default rather than the only safe economic model. The proposed
0.4.0 model therefore:

- keeps core integrity, connected-cluster concentration, applicable LP control,
  current authority, transfer safety, and meaningful source independence as
  hard requirements;
- treats spot liquidity, depth, volume, volatility, manipulation cost,
  liquidation capacity, and safe OI as inputs to a conservative capacity
  function;
- requires every critical capacity input to be known and fresh;
- computes safe OI as the minimum of conservative, independently named bounds
  for directional depth, second-depth, quality-adjusted volume, manipulation
  cost, liquidation capacity, vault backing, and oracle quality;
- applies haircuts for concurrent liquidation, price gaps, oracle lag, and
  execution slippage before setting max OI and max position;
- scales leverage down from the global 5x ceiling using volatility, oracle
  confidence, age/maturity, and capacity utilization; and
- blocks any result whose derived safe OI or max position is below the
  documented minimum economically meaningful Arc market size.

The minimum size and haircut constants must be justified by economic attack
tests and sensitivity output. They must not be selected to make SHIB pass.

## Corpus observations driving the audit

- Phase 8/9 persisted 104 real-market evaluations and 20 enriched candidates;
  the previous policy produced no eligible market.
- SHIB’s 41.0444% raw holder is the deterministic `0xdead...` sink and is
  correctly classified as `BURN`. After that evidence-backed exclusion, the
  largest remaining holder is still `6.3655%` and remains `UNKNOWN`, so the
  connected/holder safety question is not resolved by the burn correction.
- Phase 9 verified seven meaningful SHIB pools and an aggregate liquidity of
  `$4,449,311.7455`; it also recorded about `77.3163%` realized volatility and
  only about `$9.6k` direct 1% depth for the principal V2 pool. This is a
  concrete example of why liquidity, depth, and volatility cannot be collapsed
  into one headline liquidity threshold.
- Existing fixtures explicitly reject authority, proxy, honeypot, transfer,
  LP-withdrawal, connected-cluster, single-source, dust-source, stale-oracle,
  manipulation, liquidation, vault, and capacity-exhaustion attacks. Those
  outcomes are preserved by the proposed model.

## Pre-change decision

`0.3.0` remains the frozen baseline for the persisted comparison. The proposed
`0.4.0` change is justified only if implementation and corpus results show that
the dynamic-capacity model preserves every explicit unsafe rejection and never
turns missing core evidence into a pass. If those conditions fail, retain
`0.3.0` and stop without registration.

## Persisted Phase 11 run

The implementation comparison was run against the 20 persisted records in
`evidence/winner-rebuild/real-market-intelligence.json`; it made no provider
calls and introduced no observations.

| Policy | Core qualified | Core pending | Core rejected | Derivatives eligible | Derivatives blocked | Derivatives unassessed |
|---|---:|---:|---:|---:|---:|---:|
| 0.3.0 baseline | 0 | 13 | 7 | 0 | 20 | 0 |
| 0.4.0 final | 0 | 13 | 7 | 0 | 14 | 6 |

All 20 markets remained `SURVEILLANCE_LIMITED`; none became `CLEAR`, `WATCH`,
or `HIGH_RISK`. Core classification did not change. The six derivative
transitions are from fixed-threshold failure to honest `UNASSESSED` where the
persisted capacity input was missing; they are not qualifications.

The 0.4.0 minimum-safe-OI sweep at `$10k`, `$25k`, and `$50k`, and the
conservative/final/less-conservative capacity-coefficient sweep, all produced
the same real-corpus core counts: `0 / 13 / 7`. The security regression corpus
kept every explicit unsafe fixture rejected, including the wash-activity
derivatives block. The complete machine-readable result is
`evidence/winner-rebuild/phase11-policy-calibration.json`.
