# ArcMemePerps public release

## Runtime topology

The public Product Testnet backend is a read-only Railway service. It uses a mounted `/data` volume for the Product SQLite checkpoint/projection database and runs the Product-scoped indexer, HTTP API, and replayable SSE stream. The API remains available while historical indexing is behind and reports indexer degradation through protocol status.

The public service does not start a signer, oracle publisher, or keeper. `product-release-worker.ts` is intentionally excluded because it can republish the prior on-chain oracle value without fetching independent market data. No signer key is needed for this read-only service.

## Product target

- Network: Arc Testnet (`5042002`)
- Deployment: `arc-testnet-product-v2`
- Product contract source SHA: `0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b`
- Product start block: `65487723`
- Collateral: Arc USDC interface `0x3600000000000000000000000000000000000000`

The Gate 4G Stress/Security deployment remains a separate immutable security record and is never the default API or frontend target.

## Public endpoints

- Frontend: `https://cluster-terminal.vercel.app`
- API and SSE: `https://api-production-0eb6.up.railway.app/api/v1`
- Repository: `https://github.com/GIFTEDLOV/ArcMemePerps`

## Railway variables

Required public-service configuration:

- `PORT`
- `RPC_URL` (optional; defaults to the RPC in the verified deployment manifest)
- `PRODUCT_DATABASE_PATH` (defaults to `/data/product-live.sqlite`; mount a Railway volume at `/data` for durable indexing)

Optional identity overrides (`PRODUCT_START_BLOCK`, `PRODUCT_MARKET_ID`, `ORACLE_ROUTER_ADDRESS`, and `PERP_ENGINE_ADDRESS`) are accepted only when they match the verified deployment manifest. Reporter and keeper interval variables are not used by the public read-only service.

The public Railway process runs the read-only API and SSE service. It does not start an oracle reporter or keeper that signs chain transactions. The separate `product-release-worker.ts` is not part of the public service because it republishes the prior oracle value and does not fetch independent market data.

No signer secret is required by the public API service.

## Frontend

The Vercel frontend receives only the public API origin through `VITE_API_URL`. It does not receive reporter, keeper, deployer, database, or Railway credentials.
