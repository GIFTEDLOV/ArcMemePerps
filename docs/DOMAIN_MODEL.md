# Domain model

`TokenIdentity` uses chain plus normalized token address as identity. EVM addresses are lowercased and validated; Solana addresses retain base58 case. Symbol and name are metadata only.

Lifecycle states are `DISCOVERED`, `PRIMARY_MARKET`, `BONDING`, `GRADUATED`, `DEX_LIVE`, and `ESTABLISHED`. The lifecycle engine supports pump-style and direct-DEX paths without forcing every chain through every state.

Integrity states are `PENDING`, `WATCH`, `QUALIFIED`, and `REJECTED`. Derivatives states are `UNASSESSED`, `WATCH`, `ELIGIBLE`, `LIVE`, `PAUSED`, `CLOSE_ONLY`, and `BLOCKED`. A `DEX_LIVE` / `QUALIFIED` / `WATCH` token is valid.

Amounts in TypeScript are normalized USD numbers for Gate 1 fixtures. Production persistence should use a decimal or fixed-point representation with explicit scale and no binary floating-point loss. Solidity risk limits use integer units and leverage uses 1e18 fixed-point scale.
