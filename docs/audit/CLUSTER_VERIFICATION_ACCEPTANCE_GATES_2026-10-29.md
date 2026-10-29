# CLUSTER verification pipeline — acceptance gates, 29 October 2026

**Scope:** Restore the originally specified multi-layer Arc market qualification and financial-safety verification. The Vercel fallback's DEX Screener market discovery, RPC chain ID and contract bytecode presence **do not** satisfy these acceptance gates. They can inform discovery, but never authorize perpetual trading.

## Required ordered gates (each is mandatory)

1. **Protocol identity and deployment provenance:** mainnet chain ID 5042; canonical address manifest; successful receipts; compiled/deployed bytecode parity; correct immutable contract references; chain-appropriate USDC 18-decimal native gas vs 6-decimal ERC-20 accounting.
2. **Complete, canonical market identity/index:** derive contract-compatible bytes32 market IDs from chain and token address; reconstruct MarketRegistered/MarketStateUpdated/QualificationApproved/Revoked/ReportUpdated/position/settlement logs from verified block ranges; cover every known market, with block-number checkpoints, reorg safeguards, replay and parity checks. Incomplete RPC log pagination must be treated as incomplete, not a count of zero.
3. **Qualification proof:** check deployed QualificationRegistry approval, proof hash, rule version, expiry, revocation and qualification-to-RiskConfig proof match *onchain at one block*, with original proof material and eligibility evidence validated offchain. Token metadata alone is never qualification.
4. **Risk and market state:** onchain MarketRegistry LIVE; RiskConfig LIVE, max leverage/OI/position limits bounded by valid qualification; OI, long/short skew, current collateral, liquidity, user/market capacity and current exposure; emergency flags; bounded pricing/slippage.
5. **Oracle integrity:** onchain OracleRouter usable report, valid signed reporter set, independent sources, thresholds, sequence, observedAt, validFrom, expiry, confidence and price band; corroborate independent source data provenance, signer roles, and replay protection. DEX Screener alone is not independent oracle verification.
6. **Financial custody and LP integration:** reconcile 6-decimal USDC receipts, trader free/locked collateral, vault assets, claims, insurance cash, covered/uncovered bad debt, ADL (claim reductions, not cash), fee routing, financing, LP share NAV, pending withdrawals, backing transfers and impairment; verify no double-counting and claims senior to LP withdrawals. Existing PublicLPVault/USDCMarginVault are not economically connected.
7. **Authorization and execution:** verify governance/timelock/roles and finalized bootstrap; simulation at intended block; real wallet signatures; orders checked for nonce, expiry, price, margin and oracle; usable keepers and confirmed receipt-driven settlement. No fake tx, position, APY, PnL, fill or notification data.
8. **Production parity and security:** verify exact GitHub revision + CI/Foundry unit, fuzz, invariants + frontend browser E2E + malicious and failure-mode tests, third-party security review and release canary; monitoring of RPC/indexer completeness, stale oracle, reserves, position ledger, contract events, SSE and reconciliation.
9. **Actual submission eligibility:** verify the specific hackathon track's requirements, live Arc mainnet proof transaction, public repo, public frontend, functional E2E, accurate demo and submission details. Do not confuse a discovery-only preview with completed perpetual trading.

## Immediate implementation

The new `apps/cluster-api-vercel/api/verification.ts` reads known Arc mainnet registry, qualification, oracle, risk, PerpEngine, margin and insurance contracts at the same block. It exposes a partial **on-chain read gate**, not an authorization decision, and always retains `tradingEnabled=false`. It cannot certify completeness or the independent oracle/source and financial-ledger prerequisites without the remaining systems. Disallow ambiguous provider market IDs.

## Release policy

No trades, LP deposits or live perpetual-trading release until every applicable gate has independent proof. Missing/failed verification => blocked with explicit reason. Avoid deploying financial contract modifications without a completed independent audit, canonical migration and explicit governance approval.

Previous blockers: `docs/audit/CLUSTER_RELEASE_READINESS.md`, `docs/audit/CLUSTER_SECURITY_MATRIX.md`, `docs/LP_VAULT.md`, `docs/LP_RELEASE_GUARD.md`.
