# Risk engine

The engine is two-stage:

1. Token integrity evaluates hard structural/activity gates. Any failed gate produces an explicit machine-readable reason and forces `REJECTED`; a weighted score cannot override it.
2. Derivatives capacity evaluates liquidity, depth, organic volume, volatility, oracle coverage/disagreement/confidence, manipulation cost, and liquidation capacity. A token can be structurally qualified and still be `WATCH` or `BLOCKED`.

`RISK_RULE_VERSION` is `0.1.0`. Thresholds live in `DEVELOPMENT_RISK_RULES`; they are development defaults, not final production policy. Historical assessments retain their rule version.

The initial connected-cluster development threshold is 5%. It is deliberately a tunable rule, not a universal theorem: four wallets at 2.1%, 1.7%, 1.4%, and 1.1% still fail when cluster evidence proves a 6.3% connection.

Safe OI is conservatively bounded by depth, organic volume, manipulation cost, liquidation capacity, and the adapter-provided maximum. Position and leverage are reduced from that capacity. Liquidity-collapse warnings and oracle deterioration reduce availability before a later policy change can make a market more permissive.

No external API vendor is called by the engine. Adapter outputs are the only input boundary.

Gate 2 adds explicit insufficient-evidence behavior: nullable security/activity/oracle facts and unknown LP lock status fail the evidence-completeness gate. A high market score cannot override an unknown or failed hard gate. Derivatives depth is `UNAVAILABLE` until quote simulation exists; total liquidity is not used as a fabricated depth estimate.

Activity analysis is explainable rather than a black-box score. It reports trader count, gross/net flow, round trips, repeated sizes/timing, wallet reuse, funding relationships, volume/liquidity ratio, holder growth, and trader concentration with `CLEAR`, `SUSPICIOUS`, `HIGH_RISK`, or `INSUFFICIENT_DATA`.

Gate 4C keeps lifecycle, integrity, derivatives, and tradability separate in the versioned
`MarketSnapshot`. Holder exclusions require classification evidence; unknown wallets remain in
concentration totals. LP security has its own `LOCKED`, `BURNED`, `PROTOCOL_CONTROLLED`,
`WITHDRAWABLE`, and `UNKNOWN` states. Missing launchpad, graph, depth, or provider evidence is
preserved as unavailable and cannot become qualification.

# Gate 4D gate separation

The qualification gate answers whether a token may become a derivatives market. The execution
gate answers whether a particular risk-increasing action is allowed now. Both are deterministic,
versioned, and independent of frontend state or user-supplied portfolio facts. Qualification
freshness, market state, oracle validity, OI/side caps, vault capacity, insurance condition,
margin, order expiry, and the immutable pre-trade plan are execution inputs; they are not
substitutes for token qualification.

Public LP, ADL, and governance contracts added in Gate 4D are foundational and locally tested.
They are not yet live on Arc Testnet and do not change the Gate 3/4B production-evidence claims.
