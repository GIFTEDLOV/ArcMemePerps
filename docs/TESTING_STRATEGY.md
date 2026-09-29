# Testing strategy

TypeScript unit tests use Vitest and cover identity, canonical serialization, lifecycle transitions, adapter completeness, oracle safety, risk gates, capacity qualification, proofs, and the complete fixture corpus.

Solidity tests use Foundry and cover qualification prerequisites, market-ID namespaces, collateral/OI/position limits, market state behavior, oracle staleness, role checks, one-way risk reductions, explicit bad debt, and a leverage/position-limit fuzz test.

These are foundational invariants, not a solvency proof. Additional property tests, invariant handlers, differential tests, fork tests, audit review, and economic simulations are required before deployment.
