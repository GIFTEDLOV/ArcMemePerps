# CLUSTER LP Security — Arc mainnet migration gate

**Status:** PREPARATION ONLY / NO DEPLOYMENT / NO MAINNET WALLET ACTIONS  
**Patch:** `security/lp-withdrawal-accounting-20261102`  
**Review:** [Draft security PR #28](https://github.com/GIFTEDLOV/ArcMemePerps/pull/28)

## Current evidence and limitations

A read-only Arc mainnet RPC check at block **29,158,309** ([CI evidence](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/41445468886)) verified:
- Chain ID 5042 and deployed bytecode at the publicly documented vaults.
- **PublicLPVault** `0x9ff8358dc5ee866e0b9707d0139cf47b399f5257`: deposits disabled, totalShares 0, managedAssets 0, underlying USDC balance 0, marketRiskBudget 0, pendingTraderLiability 0, cumulativeBadDebt 0, bootstrapFinalized false and no controller/executor wired.
- **USDCMarginVault** `0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf`: physical USDC 1,000,000 base units = **1 USDC** (6 decimals), matching rawCash and totalFreeCollateral. Total locked collateral, pending positive PnL and protocol bad debt were 0.
- Several newer margin-LP getters (`allocatedBacking`, `marginVault`, `lpBacking`, `lpRecoverable`, `lpVault`) returned **NO DATA** rather than the value zero. The live bytecode may predate the current margin-backed source.
- These are a single-block snapshot, **not** a live solvency audit or assurance of future contract state. Recheck immediately before any release.

## Existing scripts cannot be run blindly

- `scripts/deploy-mainnet-suite.ts` hardcodes the previously deployed USDCMarginVault as `EXISTING_VAULT` and deploys other contracts against it. It is **not suitable** for silently linking a new PublicLPVault to an old margin vault that does not expose the current LP-backing interface.
- `scripts/arc-mainnet-deployment.ts` and `scripts/verify-mainnet-deployment.ts` contain historical frozen source/release hashes. They must be updated, re-audited and compared to freshly built artifacts before any security release; an old hash is not evidence for the revised source.
- Do not overwrite deployment manifests or reuse unconfirmed role addresses. The protocol contracts shown here are ordinary deployments; source edits do **not** upgrade an existing deployment.

## Fork deployment rehearsal

A keyless, read-only-on-mainnet / locally executed fork rehearsal is now implemented:
- `contracts/fork-test/ArcLpDeploymentFork.t.sol` — isolated Foundry tests
  running on an Arc mainnet fork. The first test deploys a fresh replacement
  `PublicLPVault`, `USDCMarginVault` and `ProtocolTimelock` against the
  **real Arc USDC contract address**, confirms the 6-decimal token,
  one-time vault links, bootstrap finalization, default-inactive status,
  and that only timelocked governance activates LP deposits. It checks
  the original deployed vaults' USDC balances and shares remain unchanged.
- The second test uses **newly deployed MockUSDC**, not user collateral, to
  simulate LP deposits, governed backing allocation and recovery, a rejected
  early withdrawal, de-risking, certification, and an allowed fair claim.
  Mock-funded simulation is not a proof that all real-USDC token transfers
  and accounting edge cases have been exercised.
- `.github/workflows/arc-lp-fork-rehearsal.yml` runs a read-only Arc RPC
  snapshot check, compiles the new source and executes the fork test at a
  single selected Arc block. It does not use deployer private keys, a
  broadcast action, or any account capable of moving production funds.

To reproduce:

```bash
FOUNDRY_PROFILE=arc-lp-fork forge test --fork-url https://rpc.mainnet.arc.io --match-contract ArcLpDeploymentForkTest -vv
```

The GitHub Actions workflow pins an observed block number for its own run.
Passing a fork rehearsal **does not** authorize deploying a new vault or
migrating real funds. An independently approved production graph and
controller/engine reconciliation workflow remain necessary.

## November 2 implementation review — predeployment gate

The candidate deployment configuration is deliberately **not an executable
production release**:

- [Release plan template](../deployments/arc-lp-security-release-plan.template.json)
  declares Arc chain 5042, six-decimal USDC, a **fresh margin vault and LP
  vault**, reciprocal links, inactive new LP defaults, and nullable role
  addresses. Signers and approvals remain intentionally unspecified rather
  than fabricated.
- [Release preflight](../scripts/arc-lp-release-preflight.mjs) evaluates this
  plan and inspected source. The expected result is `NO_GO` until an approved
  exact release commit, genuine multi-owner governance Safe, emergency admin,
  risk controller, engine-to-NAV settlement proof, external economic review,
  live state reconciliation and authorized deployment are established.
  `--require-go` exits nonzero if unresolved; neither mode can sign or deploy.
- [CI preflight](../.github/workflows/arc-lp-release-preflight.yml)
  runs deterministic tests and confirms the preflight is **still blocked**.
  Its green status means the *blocking guard works*, not that production may
  deploy.
- `scripts/arc-mainnet-deployment.ts` now performs reciprocal
  `setLpVault` / `setMarginVault` calls, binds `setSettlementEngine` to
  the freshly deployed PerpEngine, checks inactive zero-share genesis
  and requires the actual local Git checkout to equal its frozen
  release commit. That historical commit constant is intentionally stale on
  this branch, so `--deploy` must fail until a separately approved freeze.
- `scripts/deploy-mainnet-suite.ts` has been **disabled** because it reused
  an older margin vault without the candidate LP-backing interface. Do not
  remove that guard to reuse the older deployment.
- `scripts/verify-mainnet-deployment.ts` still contains an old frozen
  source hash. It must be reworked for the new release before its output can
  be trusted.

### New margin solvency and settlement-state commitment

The interim mitigation also checks the margin vault's **senior recorded claims
against physically accounted USDC**. A zero open-position count alone is
insufficient: a trader may have realized profit into free collateral without
the custody vault possessing enough USDC to pay the resulting claim.
`USDCMarginVault.seniorLiabilitiesCovered()` requires physical ledger cash
to cover free/locked collateral, pending profit, uncovered bad debt, and the
larger of accrued fees or insurance reserve. Governance-funded protocol
backing is risk capital, not counted again as a trader claim.

Once a vault has taken LP market risk, the controller captures
`USDCMarginVault.settlementStateDigest()` during certification. The LP
requires that digest to remain unchanged when governance opens settlement
and each LP withdrawal claim executes. Any intervening trader collateral
deposit, PnL settlement, insurance accounting, loss write-down or other
included ledger mutation blocks the claim until new certification. An
unsolicited ERC-20 donation is intentionally excluded from the digest
because it is not recorded margin equity and cannot mint LP NAV.
Physical custody deficits still block claims separately.

Regression tests cover an **unfunded realized trader profit despite
zero engine exposure**, a margin ledger change after certification,
fresh recertification and surplus-donation tolerance. This is still an
interim fail-closed mechanism. It does not prove that *unrecorded*
external liabilities or historical oracle valuations are complete, and
cannot substitute for an independently reviewed economic settlement epoch.

### Residual findings that block mainnet LP activation

1. **Controller trust / NAV integrity (partially hardened):**
   A pool that has ever taken a nonzero market-risk budget now requires a
   governance-bound `settlementEngine` with a matching linked margin vault.
   `PerpEngine` tracks global `activePositionCount` and
   `totalOpenNotionalUsdc` across opening, increasing, reducing, closing,
   liquidation and ADL paths. Before certifying, opening settlement or
   paying a claim, the LP checks those totals are zero **and** checks margin
   locked collateral, pending positive/negative PnL, protocol bad debt and
   actual-vs-accounted token custody. LP deposits/reactivation are also
   blocked while this onchain exposure remains open. See
   `StaleNavWithdrawalTest.testFalseControllerCertificationFailsWithoutVerifiedEngine`
   and `Gate4SettlementTest.testRealEngineOpenPositionBlocksLpCertificationDespiteFalseZeroRiskBudget`.
   This prevents an operator merely resetting `marketRiskBudget=0` from
   authorizing a withdrawal while the verified engine is still open.
   **Remaining gap:** the flatness proof does not itself prove that *all*
   historical PnL and external obligations have been correctly accounted
   and reconciled into LP NAV. It cannot replace a formally designed
   valuation/epoch settlement mechanism or external security review.
   A continuously active LP product needs a separately designed and
   independently reviewed onchain settlement/epoch mechanism.
2. **Historical deployed bytecode:** Old vaults on Arc mainnet have missing
   newer LP-backing getters. Their current and historical collateral is not
   replacement LP capital, and cannot be reclassified by a source change.
3. **Governance and migration:** Role address placeholders, a timelock/Safe
   deployment plan, economic sign-off and existing trader-collateral
   migration authorization are missing. No live funds should move.

This is an **internal code/configuration review**, not an independent
third-party audit or authorization for public liquidity.

## Mandatory deployment gates

1. **Review/CI:** Require final CI green at the exact PR head, complete Foundry tests, strong independent review of NAV, pricing and governance, plus fork tests under the intended constructor and role graph.
2. **Current funds and users:** Repeat live chain 5042 bytecode and asset-balance checks. Confirm every user share and withdrawal request, collateral beneficiary, pending position, realized/unrealized PnL, insurance and bad debt. Zero LP shares at the earlier block cannot substitute for a new read.
3. **Target architecture:** Decide whether to deploy a compatible **new margin vault + new LP vault and any dependent engine/role contracts** as a reviewed suite. Do not attach the new LP to the existing margin vault unless current onchain bytecode implements all required interfaces and the one-time links can be configured correctly.
4. **Protect existing collateral:** The 1 USDC recorded as trader free collateral is **not automatically transferable LP capital**. No sweep/migration of user collateral without an authorized and reconciled user-level migration path.
5. **Build reproducibly:** Pin exact source commit, Foundry version/solc, deployed runtime bytecode hash, constructor arguments, implementation addresses, role admin addresses, governance timelock delay and event signatures. Keep all keys out of logs, PRs, files and chat.
6. **Dry-run on a mainnet fork:** Confirm fresh vault starts inactive, custody parity, no unreported trader risk, restricted deposit/settlement windows, guardian stop, claim expiration, controller updates, surplus donation tolerance, deficit block, asset ownership and share conservation.
7. **Approval and controlled deployment:** Authorized owner/multisig independently reviews, signs and executes deployment/configuration. Validate every receipt and onchain storage value. Do **not** activate public LP just because the contracts deployed.
8. **Post-deploy:** Update only the approved backend address manifest and event indexer start block. Confirm frontend continues showing the existing design and truthful inactive LP state until separate activation.
9. **Activate only when ready:** Zero-risk deposit phase may be enabled after contract and economic accounting sign-off. Trading-backed LP claims stay **disabled** under this temporary safety model; continuously available LP exits need a separately audited mark-to-market settlement design.

## Important security qualification

The patch does **not** cryptographically prove external controller-pushed trader liability, insurance or bad debt is current; certification remains an operator trust boundary. A missing write or incorrect risk-budget closure could still produce false NAV. No code, tests or documentation in this PR should be interpreted as a green light for permissionless, continuously trading public LP activity.

**Current release recommendation:** Leave the original mainnet PublicLPVault disabled and treat security PR #28 as an interim candidate. No mainnet deployment or fund transfer is authorized by this checklist.
