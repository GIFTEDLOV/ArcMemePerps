# Frontend Gate 6 release audit

ArcMemePerps frontend Gate 6 is a hostile audit of the existing live Product Testnet application, not a new protocol phase.

## Canonical target

- Product deployment: `arc-testnet-product-v2`
- Network: Arc Testnet, chain `5042002`
- Contract source SHA: `0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b`
- Frontend: `apps/frontend`
- Local frontend: port `3001`
- Local API: `http://127.0.0.1:8787/api/v1`

The frontend imports Product addresses from `evidence/gate4i/product-deployment.json`. The Gate 4G Stress/Security deployment is referenced only on the Proof page and is never the default trading target.

## Run locally

Start the existing Product-scoped backend/indexer, then run:

```text
pnpm frontend:dev
```

For a separately hosted API, set the public browser-safe origin in `.env`:

```text
VITE_API_URL=https://your-public-api.example/api/v1
```

The frontend is read-model driven. It does not fabricate market prices, charts, positions, PnL, LP state, notifications, competition scores, or risk state. Unavailable or stale dependencies remain explicitly labelled.

## User surfaces

Routes include landing, command center, markets, market detail, portfolio, activity, Earn/LP, profile, competitions, notifications, attention, Proof/Security, system status, and settings. The market detail flow is Review → Sign → Submit; a stale oracle or changed plan prevents risk-increasing review.

## Product and Stress evidence

Product Testnet is the healthy frontend target. The separate Stress/Security deployment preserves the Gate 4G terminal insolvency evidence (`solvencyBlocked=true`, explicit residual bad debt) and is displayed as security proof, never as a normal tradable market.

## Release boundary

The local product passes frontend build and browser smoke. Public release still requires production hosting for the API, Product indexer, canonical database, and SSE/realtime stream. The current Product oracle observation is stale; the app correctly reports this and disables risk-increasing review until legitimate reporter data refreshes.
