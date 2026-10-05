# ArcMemePerps public release

## Runtime topology

The public Product Testnet backend runs as one durable Railway service. It uses a mounted `/data` volume for the Product SQLite checkpoint/projection database and runs:

- the Product-scoped indexer and read-only HTTP API;
- the replayable SSE stream;
- the backend-only 2-of-3 oracle publisher;
- the idempotent order keeper.

The process is supervised together so the API, indexer, reporter, and keeper restart together against one durable database boundary. The worker reads the canonical Product OracleRouter report, preserves its observed price/bounds, requires a valid reporter-set version and monotonic sequence, and fails closed if those facts are not available. Reporter and keeper private keys are Railway sealed variables only.

## Product target

- Network: Arc Testnet (`5042002`)
- Deployment: `arc-testnet-product-v2`
- Product contract source SHA: `0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b`
- Product start block: `65487723`
- Collateral: Arc USDC interface `0x3600000000000000000000000000000000000000`

The Gate 4G Stress/Security deployment remains a separate immutable security record and is never the default API or frontend target.

## Required Railway variables

Public configuration:

- `PORT`
- `RPC_URL`
- `PRODUCT_START_BLOCK`
- `PRODUCT_MARKET_ID`
- `ORACLE_ROUTER_ADDRESS`
- `PERP_ENGINE_ADDRESS`
- `REPORTER_SET_VERSION`
- `ORACLE_INTERVAL_MS`
- `KEEPER_INTERVAL_MS`

Sealed secrets:

- `REPORTER_1_PRIVATE_KEY`
- `REPORTER_2_PRIVATE_KEY`
- `KEEPER_PRIVATE_KEY`

No secret belongs in Git, the frontend bundle, `.env.example`, Docker layers, logs, or evidence.

## Frontend

The Vercel frontend receives only the public API origin through `VITE_API_URL`. It does not receive reporter, keeper, deployer, database, or Railway credentials.
