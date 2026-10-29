# CLUSTER hackathon and Arc submission readiness

- Review date: 2026-10-29
- Submission decision: **NO-GO today**
- Live financial production: **NO-GO**

## Program and deadline check

The repository's named Arc opportunity is the [Arc Microgrants program](https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq). Its published deadline was **October 14, 2026 at 23:59 ET**, with all decisions by October 21. Both dates have passed. The [Programmable Money Hackathon](https://community.arc.io/public/events/hackathon-programmable-money-74llz8htis) closed August 22, 2026. No current open Arc hackathon or submission portal has been verified in this review. No application was submitted.

The Microgrants page requires a live, working Arc Mainnet deployment and a public repository/profile; testnet-only projects and mockups are ineligible. CLUSTER has a public preview and a verified historical 1 USDC Mainnet deposit to `USDCMarginVault`, but the deposit is not evidence of a functioning perpetual trade, active public LP, or fully operating product. This read-only preview should not be represented as a live derivatives protocol.

## Accurate project description

**Pitch (100–200 characters):** CLUSTER shows live multichain meme discovery with fail-closed Arc verification; today’s preview is read-only, and qualification, trading, history, and public LP backing remain unavailable.

**Project:** CLUSTER (`ArcMemePerps`)

**Repository:** https://github.com/GIFTEDLOV/ArcMemePerps

**Public demonstration:** https://cluster-hackathon-preview-4j3j5e2l4.vercel.app

**Read-only API:** https://cluster-readonly-api.vercel.app

The preview displays external market discovery data and truthful availability states. It does not verify a complete market inventory or enable transaction signing, perpetual trading, LP deposits, or live protocol activity.

## Proposed three-minute demo for a future open program

1. **0:00–0:40 — Discovery:** open the preview's Markets page; show that discovered records carry provider/freshness information and that missing values remain unavailable.
2. **0:40–1:20 — Safety boundary:** open a market detail page and show the `UNVERIFIED` / `Trading unavailable` state. Explain that discovery does not qualify an Arc market or certify an execution oracle.
3. **1:20–2:05 — API transparency:** request `/api/v1/markets` and `/api/v1/protocol/status`; show chain ID 5042, read-only mode, disabled writes, and the unavailable persistent indexer.
4. **2:05–2:30 — Event transport:** open `/api/v1/stream`; show the explicit heartbeat-only message and no fabricated event payload.
5. **2:30–3:00 — Release gates:** explain that the existing Arc Mainnet contracts have unfinished governance bootstrap, the existing LP is not wired to settlement, and no live trade or LP withdrawal is demonstrated.

Screenshots from the live preview are in `evidence/e2e/live-preview/`. These materials are a preview demonstration, not an application or claim that the published program is currently open.

## Verified transaction and contract evidence

`evidence/mainnet-live-deployment.json` records a 1.000000 USDC deposit into the Arc Mainnet `USDCMarginVault` at block 27,246,895, transaction `0x7dd1dfeddc682e745ed84ba885ad3fd800400952522b03cc1126fd81915c4dc9`. At the fresh read-only snapshot in [the LP economic audit](audit/CLUSTER_LP_ECONOMIC_INTEGRATION_AUDIT_2026-10-29.md), the same 1 USDC remains margin-vault cash and trader free collateral; it is not LP capital.

Mainnet contract addresses and observed state are listed in `evidence/mainnet/contracts.json` and the economic audit. At pinned block 28,484,877, the Mainnet PublicLPVault had zero shares/assets and was inactive; both it and PerpEngine had `bootstrapFinalized=false` and a zero `governanceExecutor`. PerpEngine `nextPositionId()` was `1`.

## Remaining submission blockers

- No currently open hackathon or grant window was found; the named published programs have closed.
- No positive live market-verification canary or complete indexed market/qualification inventory exists.
- No persistent event history or real indexed SSE feed is available.
- No verified wallet-to-engine trade receipt, trader settlement, or LP-backed settlement is demonstrated.
- Mainnet governance/bootstrap and role configuration remain unfinished; no independent security audit or deployed-bytecode/source parity attestation is available.

**Read-only demo:** suitable as a truthful technical preview for a future program only if its live rules accept it. **Current submission:** NO-GO because the checked programs are closed and the microgrant requires a working Arc Mainnet deployment. **Financial production:** NO-GO until the independent release gates pass.
