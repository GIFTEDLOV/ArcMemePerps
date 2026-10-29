# CLUSTER Vercel read-only fallback

Ephemeral API alternative to the expired Railway deployment. This app is intentionally **not** a production matching engine or continuous market indexer. No SQLite, keys, keeper, signers, blockchain writes, live PnL, or LP deposit functionality. All market price and liquidity data is sourced live from the documented DexScreener API; no qualification is inferred from DEX data.

Routes: GET /health, /api/v1/markets, /api/v1/markets/search, /api/v1/protocol/status, /api/v1/stream. With no `ARC_INDEX_DATABASE_URL`, SSE consists of transport heartbeats only. When a durable Postgres read replica/connection is configured, `/api/v1/index/status`, `/index/markets`, `/index/positions`, `/index/financial-totals`, and `/index/activity?category=...` expose incomplete event-derived read models and `/stream` replays committed receipt-backed outbox rows. No market is labeled qualified from these rows; source and pinned-state checks remain separate. Chain status is limited to chain ID and bytecode presence. No real trading claims.

Do not replace the application's API URL until the endpoint and visual tests pass. Never enable trading or LP deposits based on this fallback.

See https://vercel.com/kb/guide/is-sqlite-supported-in-vercel and https://docs.dexscreener.com/api/reference.
