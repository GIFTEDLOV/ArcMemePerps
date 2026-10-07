# Risk Policy 0.3.0 — Core Safety, Surveillance, and Coverage

Policy 0.3.0 is a classification and evidence-model revision. It inherits
every numeric threshold from `risk-rules/0.2.0`; it does not make missing
evidence safe and it does not average unknown evidence into a score.

## Status model

- `CORE_INTEGRITY`: `QUALIFIED` only when every applicable core gate is proven
  safe; `PENDING` when an applicable core gate is `UNKNOWN`; `REJECTED` for an
  explicit unsafe fact.
- `SURVEILLANCE`: `CLEAR`, `WATCH`, `LIMITED`, or `HIGH_RISK` for creator,
  funding, launch-history, and market-behaviour intelligence.
- `EVIDENCE_COVERAGE`: `COMPLETE`, `STRONG`, `PARTIAL`, or `WEAK`, reported per
  authority, transfer safety, liquidity control, holders, clusters, creator,
  funding, activity, history, depth, and oracle domains.
- `DERIVATIVES`: retains the existing strict capacity statuses. Every capital
  path threshold, source-independence requirement, freshness requirement, and
  manipulation/liquidation bound remains required for `ELIGIBLE`.

Coverage is not a safety score. A partial coverage result can coexist with a
core-qualified result only when all applicable core gates themselves have
complete, passing evidence. Optional intelligence remains visibly unknown.

## Core safety kernel

The following remain non-negotiable where applicable:

- active mint or freeze authority;
- dangerous owner/admin privilege;
- dangerous upgradeability;
- honeypot or material transfer restriction;
- privileged liquidity withdrawal or an unsafe LP unlock;
- individual non-system holder concentration above 5%;
- connected non-system cluster concentration above 5%;
- material bundled-launch concentration above 10% when the launch threat model
  applies.

`UNKNOWN` for an applicable core gate is `PENDING`. An explicit `FAIL` remains
`REJECTED`, regardless of other missing evidence. LP control remains core and
must resolve to an evidence-backed safe state such as `BURNED`, `TIME_LOCKED`,
`PROTOCOL_CONTROLLED`, `IMMUTABLE_MIGRATION_CONTROL`, or
`DISTRIBUTED_NON_PRIVILEGED`.

## Reclassified signals

| Gate                                | OLD_CLASSIFICATION                                   | NEW_CLASSIFICATION                                                                           | Why it is not always a pre-trade core blocker                                                                                                                               | Explicit bad behavior                                                                     | Unknown behavior                                            | Derivatives effect                                                                   | Surveillance effect |
| ----------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------- |
| `DEPLOYER_CONCENTRATION`            | Mandatory integrity evidence for mature EVM profiles | Conditional core for launchpad/venue profiles; intelligence for mature markets               | Missing creator identity does not prove a current rug capability when current authorities, distribution, clusters, transfer safety, and LP control are independently proven | Known creator holdings above 10% rejects where the identity is proven                     | Capacity remains independent; no creator assumption is used | `LIMITED` when unresolved; explicit concentration is high risk/rejecting             |
| `KNOWN_RISK_DEPLOYER`               | Mandatory integrity evidence                         | Surveillance signal with explicit hard rejection on `RISK_FOUND`                             | Historical reputation is distinct from current contract control                                                                                                             | Completed risk corpus finding rejects under the documented threat model                   | `LIMITED`, not `CLEAR`                                      | `HIGH_RISK` and derivatives blocked when explicit                                    |
| `RELATED_WALLET_FUNDING`            | Mandatory integrity evidence                         | Distribution intelligence; feeds the cluster gate when it proves ownership linkage           | Incomplete bounded funding history does not itself prove current rug ability                                                                                                | Proven dangerous relationship can produce `HIGH_RISK` and can support a cluster rejection | `LIMITED`                                                   | Derivatives may be restricted when explicit manipulation/cluster risk is established |
| `SUSPICIOUS_EARLY_BUYERS`           | Mandatory in several profiles                        | Surveillance/distribution intelligence; launchpad profiles may keep it core                  | Mature-token launch history may be unrecoverable while current holder and cluster safety are provable                                                                       | Explicit bundle concentration above 10% remains a core failure                            | `LIMITED`                                                   | Warning/coverage reduction                                                           |
| `WASH_TRADING`                      | Mandatory integrity evidence                         | Market-quality surveillance and capacity signal                                              | Wash evidence describes activity manipulation, not necessarily token seizure or rug capability                                                                              | Explicit severe activity risk blocks derivatives                                          | Does not block core by itself                               | `HIGH_RISK`; derivatives `BLOCKED`                                                   |
| `VOLUME_FARMING`                    | Mandatory integrity evidence                         | Market-quality surveillance and capacity signal                                              | Same separation as wash trading                                                                                                                                             | Explicit severe activity risk blocks derivatives                                          | Does not block core by itself                               | `HIGH_RISK`; derivatives `BLOCKED`                                                   |
| `SUSPICIOUS_TRANSACTION_REPETITION` | Mandatory integrity evidence                         | Market-quality surveillance and capacity signal                                              | Repetition is a market-quality threat unless it proves a core distribution/transfer threat                                                                                  | Explicit severe activity risk blocks derivatives                                          | Does not block core by itself                               | `HIGH_RISK`; derivatives `BLOCKED`                                                   |
| `INSUFFICIENT_EVIDENCE`             | Synthetic mandatory hard gate                        | Removed as a giant core gate; replaced by per-domain coverage and per-gate unknown semantics | A catch-all hides which evidence is missing and can conflate optional history with capital safety                                                                           | No direct failure state                                                                   | Missing capital evidence remains `UNASSESSED`/`BLOCKED`     | Exact unknown domains are exposed                                                    |

## Profile applicability

The selected policy profile controls the required core gates. EVM profiles do
not require Solana freeze-authority evidence; Solana profiles do not require
an EVM proxy-admin field. A V3 liquidity position is assessed with venue-correct
position-control semantics rather than a nonexistent V2 LP-token field.

Mature EVM profiles keep creator, funding, launch-window, and activity history
visible through coverage and surveillance. Launchpad-controlled profiles may
make creator/deployer and bundled-launch evidence core because those threats are
part of that profile's actual control model.

## Derivatives boundary

No market is admitted as a live Arc perpetual merely because core integrity is
qualified. The existing thresholds remain frozen: spot liquidity `$500k`, depth
`$50k`/`$100k`, organic volume `$100k`, volatility `150%`, at least two
meaningful independent economic sources, oracle disagreement at most `3%`,
confidence at least `8500` bps, manipulation cost `$100k`, liquidation capacity
`$100k`, safe OI `$25k`, and leverage cap `5x`. Missing or failed capacity
evidence remains `UNASSESSED` or `BLOCKED`.

## Versioning

`0.1.0` and `0.2.0` remain historical rule versions. `0.3.0` is the first
policy projection with separate core, surveillance, and evidence-coverage
statuses. No numeric threshold changed.
