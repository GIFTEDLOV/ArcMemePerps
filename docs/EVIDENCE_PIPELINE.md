# Evidence pipeline

ArcMemePerps keeps discovery, evidence, qualification, and Arc perp state as
separate projections. A market can be visible in discovery without being
qualified or tradable.

## Availability semantics

Numeric zero means a measured or deterministic zero. Missing, unsupported,
stale, or conflicting observations are represented as `null` plus provider
status/reason metadata. The qualification engine treats missing hard-gate
evidence as a failure; it never converts an unavailable measurement to a
passing zero.

## Provider provenance

DexScreener and GeckoTerminal are provider observations. The underlying pool
address is the economic source identity. Two providers reading the same pool
are correlated corroboration, not two independent oracle sources. Distinct
meaningful pools or venues can contribute independent observations when their
pool identity, liquidity, and freshness are known.

A pool must contribute at least USD 10,000 of observed liquidity to count as a
meaningful oracle source. Dust pools remain evidence, but cannot manufacture
source independence or move the consensus price.

GeckoTerminal is used credentiallessly through its public v2 API for bounded
pool discovery, token-pool corroboration, and pool OHLCV. Public API calls are
globally throttled to a conservative cadence and malformed/429 responses stay
explicitly unavailable. See <https://api.geckoterminal.com/docs/v2/swagger.json>.

## Oracle confidence

The live adapter derives confidence from observed evidence rather than using a
fixed constant:

```text
confidenceBps = clamp(
  2500
  + min(2500, pricedPoolCount * 1250)
  + min(1500, distinctVenueCount * 750)
  + min(2000, log10(max(totalMeaningfulLiquidityUsd, 1)) * 350)
  + max(0, 1500 - disagreementPct * 300),
  0,
  10000
)
```

The formula is only a confidence signal. It does not override minimum source,
dispersion, freshness, depth, manipulation-resistance, or liquidation-capacity
requirements.

## Solana holder scope

Canonical Solana RPC reads mint authority, freeze authority, supply, decimals,
and `getTokenLargestAccounts`. Where supported, `getMultipleAccounts` resolves
owners for those token accounts. The result is labelled
`TOP_TOKEN_ACCOUNT_CONCENTRATION` or `RESOLVED_TOP_OWNER_CONCENTRATION`; it is
not presented as a complete holder census. RPC failover uses the configured
pool and a documented public fallback with bounded retries/backoff/circuit
health.

## Depth and history

Headline liquidity is not directional depth. Depth is only populated from
quote/reserve or venue-specific state that can support a deterministic price
impact calculation. Unsupported venue layouts remain unavailable. History is
made from persisted observations or real OHLCV; no interpolation or synthetic
candles are inserted.

## Qualification output

Every evaluated candidate records integrity status, derivatives status, hard
failures, missing evidence, warnings, capacity reasons, evidence records, and
the canonical evidence root. A rejected market is distinguished from a market
that is merely not yet evaluated, and neither is silently promoted to an Arc
perp.
