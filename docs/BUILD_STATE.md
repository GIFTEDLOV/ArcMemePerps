# Build state — Gate 2

Implemented:

- pnpm workspace with strict TypeScript, Vitest, ESLint, Prettier, and CI workflow;
- normalized domain/lifecycle/adapter/risk/oracle/proof packages;
- provider-free deterministic adapter and 14-case risk corpus;
- minimal Arc contract foundation and Foundry tests/invariant-oriented fuzz coverage;
- architecture, domain, risk, economic, threat, adapter, proof, and testing documentation;
- `.env.example` with separate Arc testnet/mainnet variables and no secrets;
- local Git baseline commit `9a08889a2b3a5c296ca3382276b26bc9a762d505` (`gate1-foundation`);
- Foundry installed through the official installer inside WSL Ubuntu and the Gate 1 suite executed;
- QualificationProof v2 with provenance, evidence root, and typed Arc commitment;
- typed V2 market identities shared by TypeScript and Solidity;
- explicit emergency risk reductions and fresh-proof normal requalification;
- provider interfaces plus read-only EVM/Solana RPC, DexScreener, GoPlus, Helius, and Bubblemaps adapters;
- normalized live inspection CLI and separate live-read smoke command;
- deterministic provider failure/disagreement tests and neutral snapshot corpus structure.

Not implemented by design:

- frontend, deployment, transactions, external paid resources, GitHub push, bridge/token custody, final economic formulas, governance, production thresholds, DEX quote simulation, and provider credentials.

Foundry is available in WSL Ubuntu for this checkout. Network smoke tests remain environment-dependent and are intentionally separate from deterministic CI.
