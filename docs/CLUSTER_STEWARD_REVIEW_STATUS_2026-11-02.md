# CLUSTER — Steward Review Status and Evidence

**Recorded:** November 2, 2026  
**Review scope:** source repository, existing Vercel deployment, known Arc mainnet deployment, security candidate, and release safety boundaries  
**Decision:** **FRONTEND REVIEWABLE / PUBLIC-LP MAINNET ACTIVATION NO-GO**  
**No mainnet contract upgrade, signing, token funding, trade, or migration was performed by this review.**

## Reviewer access

- **Frontend / terminal:** [cluster-terminal.vercel.app](https://cluster-terminal.vercel.app) (published application link; HTTP accessibility should be checked directly by the reviewer)
- **Project's configured Vercel domain:** [arcmemeperps.vercel.app](https://arcmemeperps.vercel.app)
- **GitHub source:** [GIFTEDLOV/ArcMemePerps](https://github.com/GIFTEDLOV/ArcMemePerps)
- **Prior production Vercel deployment:** [READY on `main` at commit `8ba414e`](https://vercel.com/kolofahkelvin16-6437s-projects/cluster/AW7DZuN98mehN784qaFNF55ND1z1), according to Vercel deployment records. A READY build is **not** proof of working trading, indexing, liquidity, or contract settlement.
- **Security candidate:** [draft PR #28](https://github.com/GIFTEDLOV/ArcMemePerps/pull/28), branch `security/lp-withdrawal-accounting-20261102`, review head `ced4afaced7d02cf4783261286d8fb81c916d351`. **Unmerged, undeployed to Arc mainnet.**

## Security verification evidence (candidate branch only)

| Check | Evidence | Result |
| --- | --- | --- |
| Full branch CI, exact review head | [Run 41495362004](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/41495362004), commit `ced4afaced7d02cf4783261286d8fb81c916d351` | Passed |
| Parallel exact-head CI | [Run 41495342174](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/41495342174) | Passed |
| Foundry regression suite (same source apart from subsequent fork-only test change) | [Run 41495249262](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/41495249262) | 77 tests passed, 0 failed |
| Arc mainnet fork rehearsal, exact review head | [Run 41495342172](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/41495342172) | 2 simulations passed, no broadcast |
| Release preflight test | [Run 41495163323](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/41495163323) | Passed while correctly enforcing **NO-GO** |
| Read-only Arc mainnet vault check | [Run 41447841130](https://github.com/GIFTEDLOV/ArcMemePerps/actions/runs/41447841130), block `29160391` | Historical PublicLPVault inactive, zero LP shares; 1 USDC free trader collateral in historical margin vault. Snapshot only; recheck before any release. |

Passing CI and simulated EVM tests do **not** prove all economic invariants, market-data freshness, ongoing keeper operations, or independent security approval.

## What the candidate changes

- Fail-closed LP withdrawal certification, a separate emergency claim pause, and a governed withdrawal window.
- Global trading-engine position/notional counters and monotonic settlement sequence checked before and after certification.
- Senior-liability cash coverage, stable margin accounting fingerprint, physical custody checks, reciprocal backing parity, and loss-accounting checks.
- Timelocked LP/margin/engine configuration with keyless Arc fork tests.
- A separate [preflight release-plan template](https://github.com/GIFTEDLOV/ArcMemePerps/blob/security/lp-withdrawal-accounting-20261102/deployments/arc-lp-security-release-plan.template.json) in PR #28; it intentionally has missing authorized role addresses and NO-GO approvals.
- No deliberate visual design changes.

The branch is **not a replacement for a complete operating perpetual exchange**. A fail-closed, zero-risk redemption path must not be advertised as continuous live-LP trading support.

## Open blockers — do not represent these as completed

1. **Economic settlement finality:** [Issue #29](https://github.com/GIFTEDLOV/ArcMemePerps/issues/29) remains **OPEN**. Onchain controls check recorded liabilities and state transitions, but cannot prove unrecorded historical/externally derived obligations or fully fair NAV at each valuation epoch. A complete reproducible trade-to-oracle-to-margin-to-LP settlement design and independent review are still needed.
2. **Production provenance:** The historical deployed margin/LP bytecode does not include the security candidate. Do not attach the candidate LP to the legacy margin vault, repurpose existing trader collateral, or claim mainnet upgrade completion.
3. **Governance and roles:** The new timelock, Safe owners, keeper/guardian/risk-controller identities, migration receipts, reproducible release artifacts, and explicit verified production permissions are not supplied or approved by the template.
4. **Live infra and trading:** This evidence does not establish current end-to-end indexer backfill, durable persistence, market qualification, reliable API/SSE delivery, independent oracle reports, keeper execution, or a real live trade with audited available counterparty liquidity. Unverified functions must remain disabled or explicitly identified as demonstrations.
5. **Vercel deployment capacity:** PR #28 received `api-deployments-free-per-day` quota errors on preview attempts. Avoid new deployment bursts; existing READY deployments can be reviewed. CI alone does not update Vercel production.

## What reviewers may safely evaluate now

Review UI navigation, design, user-experience flow, architectural decomposition, source code, recorded test results, read-only network data, simulated withdrawal protections, and the disclosed fail-closed production gates. Treat unavailable real-time trading or liquidity features as **not production-verified** rather than implying live execution.

**Release decision:** Do not merge PR #28 as an implicit deployment, sign live transactions, reassign collateral, activate public LPs, or enable unrestricted positions until the blockers above have actual verification and authorized governance sign-off. Steward review and hackathon submission can proceed with clear limitations and the current frontend.

**Further technical references:** [Migration checklist on security branch](https://github.com/GIFTEDLOV/ArcMemePerps/blob/security/lp-withdrawal-accounting-20261102/docs/LP_SECURITY_MAINNET_MIGRATION.md) · [PR #28](https://github.com/GIFTEDLOV/ArcMemePerps/pull/28) · [Issue #29](https://github.com/GIFTEDLOV/ArcMemePerps/issues/29).
