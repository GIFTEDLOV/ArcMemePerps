# ArcMemePerps

ArcMemePerps is a risk-gated, multichain meme perpetual marketplace with a
live Arc Testnet Product deployment and a browser-ready terminal frontend.

The default UI target is the healthy `PRODUCT_TESTNET_DEPLOYMENT`. The separate
`STRESS_SECURITY_DEPLOYMENT` is preserved as adversarial evidence and is never
used as the default trading target. No private keys, mnemonics, or committed
environment secrets belong in this repository.

## Local validation

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
forge test
```

## Live frontend

The frontend consumes the live Product Testnet API through Vite's local `/api`
proxy and runs on port `3001`:

```text
pnpm install
pnpm dev                         # backend/API on its configured port
pnpm frontend:dev                # http://127.0.0.1:3001
pnpm frontend:test
pnpm e2e
```

See [docs/FRONTEND_GATE5.md](docs/FRONTEND_GATE5.md) for routes, wallet
review boundaries, live data policy, schemas, and the Product/Stress split.

The Foundry toolchain is required for Solidity validation. The repository keeps Solidity sources and tests under `contracts/` and uses `foundry.toml` at the root.
