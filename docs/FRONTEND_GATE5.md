# Gate 5 frontend

ArcMemePerps presents a compact professional trading terminal over the live
Arc Testnet Product deployment. The frontend is intentionally read-first:
canonical market, risk, qualification, LP, profile, competition,
notification, and realtime state comes from the Gate 4I backend/API.

## Local run

```text
pnpm install
pnpm frontend:dev
```

Open `http://127.0.0.1:3001`. The Vite development server proxies `/api` to
`http://127.0.0.1:8787`, so browser requests remain same-origin during local
verification. Set `VITE_API_URL` when the API is hosted elsewhere. No API
secret is required by the browser.

The default network is Arc Testnet (`5042002`). Product deployment addresses
and the frozen contract source hash are imported from
`evidence/gate4i/product-deployment.json`; they are not duplicated in route
components. The stress deployment is only displayed on Proof & Security.

## Product surface

Routes include landing, command center, market discovery, market detail and
Risk Passport, portfolio, activity, public LP, wallet-native profiles,
competitions, notifications, Needs Attention, Proof & Security, system status,
and settings.

Trading follows `Review → Sign → Submit`. Gate 5 currently exposes the live
immutable pretrade review surface without impersonating a wallet or submitting
a hidden transaction. A future wallet adapter must re-check chain, account,
market identity, oracle sequence, plan hash, nonce, and expiry at signing time.

## Truth and safety boundaries

- Product UI defaults to `PRODUCT_TESTNET_DEPLOYMENT` only.
- Stress/Security remains immutable evidence: `solvencyBlocked=true` and
  residual bad debt `2,099,781` base units are shown on the proof surface and
  never copied into Product state.
- Missing history, depth, provider enrichment, fees, or wallet-scoped data is
  rendered as `UNAVAILABLE` or an explicit insufficient-data state. The UI does
  not create prices, candles, holders, clusters, PnL, rankings, or notifications.
- Token names, symbols, descriptions, and external links are treated as
  untrusted text. The UI uses text rendering and does not execute arbitrary
  HTML or unsafe URLs.
- Financial values are formatted from bigint/fixed-point strings. React does
  not recompute protocol risk or economic state.

## Frozen frontend artifacts

The backend contract snapshot is in `evidence/gate4i/frontend-contract.json`:

- API: `v1`
- Market Passport: `market-passport/v1`
- Pretrade surface: `pretrade-surface/v1`
- Profile: `user-profile/v1`
- Competition: `competition-score/v1`
- Needs Attention: `needs-attention/v1`
- Realtime events: `realtime-event/v1`

Gate 5 screenshots and browser evidence are stored under
`evidence/gate5/`. Playwright covers desktop and a 390px mobile viewport.
