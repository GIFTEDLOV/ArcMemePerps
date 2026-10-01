# Testing strategy

TypeScript unit tests use Vitest and cover identity, canonical serialization, lifecycle transitions, adapter completeness, oracle safety, risk gates, capacity qualification, proofs, and the complete fixture corpus.

Solidity tests use Foundry and cover qualification prerequisites, typed EVM/Solana market-ID namespaces, collateral/OI/position limits, market state behavior, oracle staleness, role checks, emergency-only risk reductions, fresh-proof requalification, explicit bad debt, and a leverage/position-limit fuzz test. Foundry 1.8.3 is installed in WSL Ubuntu for this workspace.

Provider tests use injected fake HTTP transports and cover malformed JSON, missing/null fields, duplicate pools, wrong chain/token, bounded retry behavior, Solana mint parsing, unavailable credentials, and material disagreement. Live reads run only through `pnpm test:live`; they are not part of CI and never sign or broadcast transactions.

These are foundational invariants, not a solvency proof. Additional property tests, invariant handlers, differential tests, fork tests, audit review, and economic simulations are required before deployment.

# Gate 3 validation additions

TypeScript tests cover bigint golden vectors, oracle adversarial inputs, directional depth,
funding/borrow/skew/liquidation properties, capacity bounds, and 2,000 seeded simulator
scenarios. Foundry covers the same PnL/funding/borrow vectors, a PnL fuzz property, existing
Gate 1 invariants, and `forge lint` safety checks. Live reads remain separate from deterministic
CI and no test submits a transaction.

Gate 4C adds Zod schema-boundary tests, SQLite persistence tests, checkpoint reorg tests,
exactly-once event tests, provider-pool failover tests, launchpad-unavailable tests, holder/LP
evidence tests, competition anti-gaming tests, and explicit unsupported-depth tests. Test-only
HTTP fakes and local contract mocks are classified as fixtures and are not provider fallbacks.
