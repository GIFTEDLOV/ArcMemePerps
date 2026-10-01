# Domain model

`TokenIdentity` uses chain plus normalized token address as identity. EVM addresses are lowercased and validated; Solana addresses retain base58 case. Symbol and name are metadata only.

Lifecycle states are `DISCOVERED`, `PRIMARY_MARKET`, `BONDING`, `GRADUATED`, `DEX_LIVE`, and `ESTABLISHED`. The lifecycle engine supports pump-style and direct-DEX paths without forcing every chain through every state.

Integrity states are `PENDING`, `WATCH`, `QUALIFIED`, and `REJECTED`. Derivatives states are `UNASSESSED`, `WATCH`, `ELIGIBLE`, `LIVE`, `PAUSED`, `CLOSE_ONLY`, and `BLOCKED`. A `DEX_LIVE` / `QUALIFIED` / `WATCH` token is valid.

`MarketPassport` is the single versioned market truth consumed by risk, API, notifications,
trending, competitions, and future agents/frontend. It composes identity, lifecycle, evidence,
liquidity, holders, deployer, activity, oracle, derivatives capacity, qualification, Arc market
state, freshness, and provider health without collapsing unknown into pass.

Amounts in TypeScript use bigint/fixed-point values at economic boundaries and decimal strings in
transport schemas; JavaScript `Number` is not authoritative for monetary or risk arithmetic.
Solidity risk limits use checked integer units and leverage uses 1e18 fixed-point scale.
