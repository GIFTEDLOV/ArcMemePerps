# Risk Policy 0.4.0 — dynamic derivatives capacity

Policy `0.4.0` inherits the 0.3.0 core-safety model and all numeric integrity
thresholds. It does not make unknown current control evidence safe, does not
remove the 5% connected-cluster rule, and does not create a SHIB-specific
exception.

## What changes

The following values were development defaults in 0.3.0 and are now inputs to a
conservative capacity function:

- spot liquidity `$500k`;
- executable depth at ±1% `$50k` and ±2% `$100k`;
- organic volume `$100k/day`;
- manipulation cost `$100k`;
- liquidation capacity `$100k`; and
- safe OI `$25k`.

They are not discarded. A market must still provide the measurements, and the
derived safe OI must be at least the retained `$25k` economically meaningful
minimum. A missing measurement remains `UNASSESSED`/`BLOCKED`.

## Hard integrity kernel

The following remain hard and unchanged:

- active mint/freeze authority where applicable;
- dangerous current owner/admin privilege;
- dangerous proxy/upgrade authority;
- honeypot or material transfer restriction;
- privileged material LP withdrawal or unsafe venue-specific unlock;
- proven creator/insider/unknown non-system holder concentration above 5%;
- connected non-system cluster above 5%; and
- applicable bundled-launch concentration above 10%.

Burn, pool, protocol, and bridge exclusions require evidence. A large unknown
address remains included. Historical creator/funding/activity uncertainty is
not silently converted to `CLEAR`.

## Dynamic capacity formula

For known, fresh inputs, the provisional safe OI is:

```text
min(
  spot liquidity × 0.10,
  directional ±1% depth × 0.50,
  directional ±2% depth × 0.50,
  quality-adjusted 24h volume × 0.10,
  manipulation cost × 0.05,
  liquidation capacity × 0.50,
  adapter/protocol OI bound × 0.10
) × oracle confidence factor
```

The oracle confidence factor is `confidenceBps / 10000`, bounded to `[0, 1]`.
The minimum of the two directions is used when directional inputs are
available. Maximum position is bounded by the adapter position limit, 25% of
safe OI, 25% of directional ±1% depth, and 25% of liquidation capacity.

The global 5x leverage ceiling remains a ceiling. Per-market leverage is the
minimum of the adapter limit, global limit, volatility leverage (`100 /
realizedVolatilityPct`), and a capacity tier: `1.25x` below 2× the minimum
safe OI, `2x` below 5× it, and the global limit above that. Maintenance and
liquidation parameters increase conservatively at lower leverage.

When wash/farm/repetition fields are unknown, surveillance is `LIMITED` and
the volume bound receives a 50% haircut. An explicit severe activity finding
still blocks derivatives. This does not turn incomplete activity telemetry
into a token-safety pass.

## Why the retained minimum matters

Dynamic capacity is not a zero-capacity listing loophole. `$25k` remains the
minimum safe OI in 0.4.0 because it is the existing protocol development
minimum and supports a non-trivial bounded market while keeping the exact
depth/manipulation/liquidation haircuts observable. A derived result below it
is `BLOCKED`, even when the token's core integrity passes.

## Non-goals

0.4.0 does not change Solidity, contracts, oracle reporter quorum, source
independence, the 3% disagreement limit, the 8500 bps confidence floor, or
the 150% volatility capacity ceiling. It is not permission to register a
market with unknown core safety evidence.
