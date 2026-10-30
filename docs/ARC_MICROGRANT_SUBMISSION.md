# CLUSTER — Arc Microgrants submission package

**Updated 2026-10-30:** [Arc Microgrants: Built with Arc Studio](https://dorahacks.io/hackathon/arc-microgrants-2/detail) closes November 1, 2026. This is a new round; the older October 14 round is closed. [Full corrected eligibility assessment](audit/CLUSTER_HACKATHON_SUBMISSION_READINESS_2026-10-29.md).

**Submission: NO-GO at this checkpoint.** There is no verified Arc Studio project URL or build provenance in the repository, no proof that the live app caused the historical Mainnet USDC movement, and no reviewed compliant demo video. The organizer explicitly requires a Studio-built contract and app, a Studio project URL, and an app-mediated Arc Mainnet USDC transaction. Do not present the script-driven 1 USDC margin deposit as app proof or submit invented Studio provenance.

## Verified links

- [Public repository](https://github.com/GIFTEDLOV/ArcMemePerps) and [builder profile](https://github.com/GIFTEDLOV).
- [Read-only frontend preview](https://cluster-hackathon-preview-ks84b51vt.vercel.app) and [PR #14 API preview](https://cluster-readonly-2tc2v8zv5-kolofahkelvin16-6437s-projects.vercel.app), both READY at exact commit `969c10d60efc425242c6e3c3556983dbf334bbf6`.
- The 2026-10-30 Vercel environment read confirmed the frontend calls `https://cluster-readonly-api-kolofahkelvin16-6437s-projects.vercel.app/api/v1`. That alias currently resolves to a ready deployment at commit `434512a2e0f01865172b9c341e5ca82fa36db6ce`; the separate ready PR #14 API preview is commit `969c10d60efc425242c6e3c3556983dbf334bbf6` and is not the origin configured in the frontend. Against the configured origin, the earlier live browser run passed 6/6 desktop/mobile checks. The exact PR #14 API preview returns 30 live discovery items with qualification `UNVERIFIED`, protocol status HTTP 200 with trading and LP deposits disabled, index status HTTP 503, and heartbeat-only SSE. Do not claim the persistent index or real event feed is deployed.
- [Arc Mainnet historical 1 USDC MarginVault deposit](https://explorer.arc.io/tx/0x7dd1dfeddc682e745ed84ba885ad3fd800400952522b03cc1126fd81915c4dc9), block 27,246,895. It is trader collateral, not a trade or LP deposit.
- Refreshed two-RPC receipt and pinned custody evidence is captured in [`evidence/cluster-infrastructure-probe-2026-10-30.json`](../evidence/cluster-infrastructure-probe-2026-10-30.json). The earlier one-provider receipt miss was transient at the observed endpoints; full deployment-to-head indexing remains unproven.
- [Deployed contract manifest](../evidence/mainnet/contracts.json).

## Truthful three-minute technical walkthrough

1. **0:00–0:40:** Show multichain market discovery and provider/freshness information on the read-only preview.
2. **0:40–1:20:** Open a market and explain why discovery alone does not qualify it for Arc perpetual execution.
3. **1:20–2:05:** Show `/api/v1/markets` and `/api/v1/protocol/status`: chain 5042, disabled trading and LP deposits, incomplete persistent index.
4. **2:05–2:30:** Show `/api/v1/stream`; describe heartbeat-only behavior on the current public deployment. Do not call it a live event feed.
5. **2:30–3:00:** Explain the Mainnet bootstrap, oracle, keeper, trade settlement, and existing PublicLPVault integration gates.

The frontend/API origin mismatch and unavailable index endpoint were confirmed in the latest browser run. Resolve and reverify those deployment links before recording a submission video; this note does not change the Arc Studio eligibility NO-GO.

The repository's `arcmemeperps_3min_demo.mp4` has not been content-reviewed. Companion scripts advertise completed trading/PnL on the old production terminal; exclude the video until an accurate recording is reviewed. No portal submission, production deployment, wallet transaction, or governance action was performed here.
