# Testing strategy

TypeScript unit tests use Vitest and cover identity, canonical serialization, lifecycle transitions, adapter completeness, oracle safety, risk gates, capacity qualification, proofs, and the complete fixture corpus.

Solidity tests use Foundry and cover qualification prerequisites, typed EVM/Solana market-ID namespaces, collateral/OI/position limits, market state behavior, oracle staleness, role checks, emergency-only risk reductions, fresh-proof requalification, explicit bad debt, and a leverage/position-limit fuzz test. Foundry 1.8.3 is installed in WSL Ubuntu for this workspace.

Provider tests use injected fake HTTP transports and cover malformed JSON, missing/null fields, duplicate pools, wrong chain/token, bounded retry behavior, Solana mint parsing, unavailable credentials, and material disagreement. Live reads run only through `pnpm test:live`; they are not part of CI and never sign or broadcast transactions.

These are foundational invariants, not a solvency proof. Additional property tests, invariant handlers, differential tests, fork tests, audit review, and economic simulations are required before deployment.
