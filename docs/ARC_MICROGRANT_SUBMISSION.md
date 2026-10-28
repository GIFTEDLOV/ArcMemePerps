# CLUSTER Arc microgrant submission status

**Status: NOT READY TO SUBMIT — release decision NO-GO (2026-10-28).** This document describes verified current evidence and known gaps. It does not claim the current deployment is production-ready.

## Project

- **Name:** CLUSTER (repository: ArcMemePerps)
- **Purpose:** Multichain market discovery with evidence-gated Arc USDC perpetuals.
- **Arc role:** USDC settlement, governed risk and market configuration, oracle reports, liquidation, insurance, ADL, and timelocked operations.
- **Gas denomination:** Arc native USDC is 18-decimal for gas; ERC-20 USDC balance/allowance uses 6 decimals. See the [Arc compatibility guide](https://www.arc.io/blog/arc-compatibility-guide-for-existing-evm-apps).

## Verified state

- The frontend at `https://cluster-terminal.vercel.app` responds with HTML.
- The production JavaScript bundle points to `https://api-production-0eb6.up.railway.app/api/v1`; its markets, protocol-status, and stream endpoints returned HTTP 404 on 2026-10-28.
- The Vercel `/api/v1/markets`, `/api/v1/protocol/status`, and `/api/v1/stream` paths returned the SPA HTML document, not JSON or SSE.
- Arc mainnet reports chain ID `5042`. The ten contract addresses in [`evidence/mainnet/contracts.json`](../evidence/mainnet/contracts.json) have bytecode, and each manifest creation receipt succeeded at the same address.
- The deployed `PerpEngine` and `PublicLPVault` both report `bootstrapFinalized=false`; the LP vault also reports `publicLpActive=false`.
- `PerpEngine.nextPositionId()` reports `1` at block `28,285,202`. The market registry does not expose an enumeration getter, so a complete on-chain registered/qualified market count is **unverified**.
- The application disables trade submission and LP deposits while required live data and execution paths are unverified.

## Engineering evidence

The local hardening and verification results are in [`docs/audit/CLUSTER_FINAL_AUDIT.md`](audit/CLUSTER_FINAL_AUDIT.md), [`docs/audit/CLUSTER_SECURITY_MATRIX.md`](audit/CLUSTER_SECURITY_MATRIX.md), [`docs/audit/CLUSTER_RELEASE_READINESS.md`](audit/CLUSTER_RELEASE_READINESS.md), and [`docs/audit/CLUSTER_E2E_REPORT.md`](audit/CLUSTER_E2E_REPORT.md).

TypeScript/frontend lint, typecheck, tests, build, and deterministic browser checks pass. Foundry is unavailable in the workspace, so Solidity build/tests/formatting have not passed. The source review is not an independent smart-contract audit. No contract, frontend, API, or governance write was performed in this hardening pass.

## Submission gate

Do not submit this release as live or production-ready. Reopen after the API and SSE service return verified data, the bootstrap ceremony is completed and role state is checked, the full market inventory is independently established, Foundry checks pass, and deployment-specific source/bytecode and security verification are complete.
