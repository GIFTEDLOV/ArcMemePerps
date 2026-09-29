# Risk engine

The engine is two-stage:

1. Token integrity evaluates hard structural/activity gates. Any failed gate produces an explicit machine-readable reason and forces `REJECTED`; a weighted score cannot override it.
2. Derivatives capacity evaluates liquidity, depth, organic volume, volatility, oracle coverage/disagreement/confidence, manipulation cost, and liquidation capacity. A token can be structurally qualified and still be `WATCH` or `BLOCKED`.

`RISK_RULE_VERSION` is `0.1.0`. Thresholds live in `DEVELOPMENT_RISK_RULES`; they are development defaults, not final production policy. Historical assessments retain their rule version.

Safe OI is conservatively bounded by depth, organic volume, manipulation cost, liquidation capacity, and the adapter-provided maximum. Position and leverage are reduced from that capacity. Liquidity-collapse warnings and oracle deterioration reduce availability before a later policy change can make a market more permissive.

No external API vendor is called by the engine. Adapter outputs are the only input boundary.
