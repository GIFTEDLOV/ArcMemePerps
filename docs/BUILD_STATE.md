# Build state — Gate 1

Implemented:

- pnpm workspace with strict TypeScript, Vitest, ESLint, Prettier, and CI workflow;
- normalized domain/lifecycle/adapter/risk/oracle/proof packages;
- provider-free deterministic adapter and 14-case risk corpus;
- minimal Arc contract foundation and Foundry tests/invariant-oriented fuzz coverage;
- architecture, domain, risk, economic, threat, adapter, proof, and testing documentation;
- `.env.example` with separate Arc testnet/mainnet variables and no secrets.

Not implemented by design:

- frontend, live APIs/RPC/indexers, external paid resources, deployment, transactions, GitHub push, bridge/token custody, final economic formulas, governance, and production thresholds.

Foundry availability is host-dependent. This checkout includes `foundry.toml`, contracts, scripts, and tests; `forge test` must be run on a host with Foundry installed.
