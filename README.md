# ArcMemePerps

Gate 1 backend/domain/contract foundation for a risk-gated, multichain meme perpetual marketplace.

This repository intentionally contains no frontend, live provider integrations, deployment scripts that send transactions, credentials, or committed environment values. Chain integrations are deterministic fixture adapters until provider contracts and empirical thresholds are finalized.

## Local validation

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
forge test
```

The Foundry toolchain is required for Solidity validation. The repository keeps Solidity sources and tests under `contracts/` and uses `foundry.toml` at the root.
