# CLUSTER Vercel read-only fallback

Ephemeral API alternative to the expired Railway deployment. This app is intentionally **not** a production matching engine or continuous market indexer. No SQLite, keys, keeper, signers, blockchain writes, live PnL, or LP deposit functionality. All market price and liquidity data is sourced live from the documented DexScreener API; no qualification is inferred from DEX data.

Routes: GET /health, /api/v1/markets, /api/v1/markets/search, /api/v1/protocol/status, /api/v1/stream. SSE consists of transport heartbeats only, not trade events. Chain status is limited to chain ID and bytecode presence. No real trading claims.

Do not replace the application's API URL until the endpoint and visual tests pass. Never enable trading or LP deposits based on this fallback.

See https://vercel.com/kb/guide/is-sqlite-supported-in-vercel and https://docs.dexscreener.com/api/reference.
