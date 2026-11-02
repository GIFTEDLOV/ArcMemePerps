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
