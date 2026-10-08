# Phase 12 final release audit

Audit date: 2026-10-08. This is a local release-candidate record. No Mainnet
deployment, Testnet write, contract redeployment, Git push, Vercel deployment,
or public release was performed.

## Freeze and product state

```text
STARTING_HEAD=6a632561260a2b72a2b285e4bfc00257602c6f59
FINAL_POLICY_VERSION=risk-rules/0.4.0
FINAL_POLICY_FROZEN=YES
CONTRACT_SOURCE_SHA=0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b
CONTRACT_SOURCE_CHANGED=NO
DISCOVERED_MARKETS=262
CORE_QUALIFIED_MARKETS=0
DERIVATIVES_ELIGIBLE_MARKETS=0
REGISTERED_REAL_PERPS=0
LIVE_REAL_PERPS=0
```

The contract SHA was recomputed with the repository's canonical sorted
`contracts/src/**/*.sol` path-and-bytes tree hash. It matches the frozen value.
No Solidity source change was made.

## Claim and UX audit

- README, frontend metadata, Phase 12 submission material, and GitHub metadata
  state the zero-live-market truth and distinguish discovery from activation.
- The Perps category now says: **No market currently meets the complete
  activation policy.** It does not present the intentional state as an outage
  or as an empty discovery universe.
- The protocol proof surface keeps the zero state primary and places the
  activation explanation and deployment details behind expandable sections.
- Historical Product Testnet and Stress/Security evidence are labeled as
  evidence only. The stress deployment cannot become a frontend or Mainnet
  target.
- No fake positions, balances, trades, users, or Mainnet addresses were
  added.

The complete feature matrix, including `LIVE_E2E`, `LIVE_PARTIAL`,
`PRIMITIVE_ONLY`, `TEST_ONLY`, `EXTERNAL_BLOCKED`, `NOT_IMPLEMENTED`, and
`DEAD_OR_UNNECESSARY`, is in
[FINAL_FEATURE_REALITY.md](FINAL_FEATURE_REALITY.md).

## Mainnet readiness model

[MAINNET_CONFIGURATION.md](MAINNET_CONFIGURATION.md) records the current
official Arc values: chain ID `5042`, primary RPC
`https://rpc.mainnet.arc.io`, explorer `https://explorer.arc.io`, native USDC
gas, the official USDC ERC-20 interface address, 18-decimal native gas versus
6-decimal ERC-20 representation, and runtime fee discovery. It intentionally
contains no ArcMemePerps contract addresses.

[MAINNET_ROLE_PLAN.md](MAINNET_ROLE_PLAN.md) defines least-privilege deployer,
governance/timelock, qualification, risk, oracle, keeper, emergency,
insurance/LP, treasury, and read-only operator boundaries. It contains no
private keys.

[MAINNET_RUNBOOK.md](MAINNET_RUNBOOK.md) requires a fresh frozen-source
deployment and asserts this genesis state before any frontend targeting:

```text
REGISTERED_REAL_PERPS=0
LIVE_REAL_PERPS=0
OI=0
POSITIONS=0
BAD_DEBT=0
SOLVENCY_BLOCKED=false
```

Unregistered, unqualified, missing-oracle, stale-oracle, invalid-sequence,
and wrong-market orders must fail before custody or exposure mutation.

## Hostile audit result

- Contract hostile audit: PASS. Existing access-control, reentrancy,
  accounting, oracle binding/replay, qualification expiry, OI/position limits,
  liquidation, insurance, bad-debt, ADL, LP withdrawal, timelock, emergency,
  and solvency tests pass. No contract source modification was required.
- Economic hostile audit: PASS. Existing capacity, oracle manipulation/dust/
  staleness/disagreement, liquidation stress, bank-run, insurance exhaustion,
  ADL, residual insolvency, and vault accounting regressions pass.
- API/backend hostile audit: PASS for the repository's existing invalid-input,
  outage, pagination, persistence, replay/dedupe, and restart boundaries. No
  fabricated fallback was introduced.
- Frontend hostile audit: PASS for malicious text metadata, broken images,
  unavailable price/liquidity/history, unknown evidence, mobile overflow, and
  zero-live-perp rendering. Text remains escaped and image failures fail soft.

## Secrets and dependencies

```text
SECRETS_COMMITTED=NO
```

Tracked-file, environment-template, build-output, evidence, documentation,
and practical Git-history scans found no committed private key, mnemonic,
API key, RPC credential, or deployment secret. Public addresses and external
keystore path labels in historical Testnet evidence are not secret material;
secret values were not printed.

The package audit initially identified high advisory GHSA-68fv-2mgg-jv7q in
transitive `source-map-js` `1.2.1`. The release candidate pins the patched
`1.2.2` resolution through the workspace override and lockfile. The final
production audit reports zero advisories.

## Validation

```text
TS_TESTS=PASS
LINT=PASS
TYPECHECK=PASS
FRONTEND_TESTS=PASS
PRODUCTION_BUILD=PASS
BACKEND_READINESS=PASS (84 rows; 82 implemented, 2 release-only)
FORGE_FMT=PASS
FORGE_BUILD=PASS
FORGE_TEST=PASS (53 tests)
PLAYWRIGHT=PASS (22 tests; desktop and mobile)
CONTRACT_SHA=PASS
```

The retained Phase 10 Playwright report and final Phase 12 release-candidate
screenshots are both preserved as evidence.

The repository-wide Prettier command still reports the pre-existing formatting
backlog across 90 files, including historical evidence and untouched source.
The requested Solidity formatter gate (`forge fmt --check`) passes; no broad
mechanical formatting rewrite was included in the frozen candidate.

## Release decision

This is a Mainnet-deployment-ready candidate subject to the external ceremony
in the runbook. It is not a Mainnet deployment and is not a public release.
The zero-market state is accepted and must remain unchanged until a real
market naturally satisfies policy `0.4.0`.
