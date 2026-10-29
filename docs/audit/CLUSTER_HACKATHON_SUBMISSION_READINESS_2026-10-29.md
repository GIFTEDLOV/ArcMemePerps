# CLUSTER hackathon submission readiness — 2026-10-29

## Decision

**Current hackathon submission: NO-GO.** The reviewed Arc Microgrants and Arc Programmable Money Hackathon windows are closed, and no upcoming Arc hackathon appears in the organizer's Hackathons listing as of this review. No Arc Microgrants window was verified as open; this review does not assess unrelated grant programs. No application has been submitted. This is separate from the **live financial production: NO-GO** decision.

The Arc Microgrants page requires an already deployed, working Arc Mainnet application and a public repository/profile. Its October 14, 2026 submission deadline and October 21 decision date have passed. The Programmable Money Hackathon ended August 22. The official [Arc Hackathons event filter](https://community.arc.io/public/events?tag=Hackathons-69127f4299b5dd25a92bf366) lists no upcoming event; the latest displayed hackathon ended September 16. Arc Acceleration Season ended October 24 with applications due September 22. Check the organizer again before applying to a later program.

## Accurate project package

- **Project:** CLUSTER — ArcMemePerps
- **Repository:** [github.com/GIFTEDLOV/ArcMemePerps](https://github.com/GIFTEDLOV/ArcMemePerps)
- **Public builder profile:** [github.com/GIFTEDLOV](https://github.com/GIFTEDLOV)
- **Exact Group E demo preview:** [cluster-hackathon-preview-cltn3n6al.vercel.app](https://cluster-hackathon-preview-cltn3n6al.vercel.app), Vercel deployment `dpl_6FAVe59dDaNUjuotrdMoFDQoahpN`, source `a6328ef59ef0d3d5d7203118bb05f22e6c7d1840`.
- **Exact Group E API preview:** [cluster-readonly-5vvfsdulj-kolofahkelvin16-6437s-projects.vercel.app](https://cluster-readonly-5vvfsdulj-kolofahkelvin16-6437s-projects.vercel.app), deployment `dpl_4yAGsrLHTHrEdurhACNECRJY92bZ`, same source. The frontend itself calls the stable API origin; both paths were checked.
- **Read-only API:** [cluster-readonly-api.vercel.app](https://cluster-readonly-api.vercel.app)
- **Historical Arc Mainnet transaction:** [1.000000 USDC deposit into USDCMarginVault](https://explorer.arc.io/tx/0x7dd1dfeddc682e745ed84ba885ad3fd800400952522b03cc1126fd81915c4dc9), block 27,246,895. This is trader collateral, not an LP deposit or trade.

**100–200 character pitch:**

> CLUSTER shows live multichain meme discovery with fail-closed Arc verification; today’s preview is read-only, and qualification, trading, history, and public LP backing remain unavailable.

The preview shows external discovery data and truthful availability states. It does not show a complete market inventory, qualified execution oracle, persistent history, real event stream, successful trade, or public LP backing. The production `cluster-terminal.vercel.app` alias still serves the older `winner-rebuild` deployment and its seeded LP/trading claims; use the hardened read-only preview for a demo.

## Demo materials

The three-minute walkthrough and screenshot set are maintained in [`docs/ARC_MICROGRANT_SUBMISSION.md`](../ARC_MICROGRANT_SUBMISSION.md) and [`evidence/e2e/live-preview/`](../../evidence/e2e/live-preview/). Current live read-only Playwright coverage passed 6/6 on desktop/mobile using the exact Group E frontend and API preview, plus the actual API origin configured in the frontend. The walkthrough covers:

1. Market discovery with provider and observation provenance.
2. `UNVERIFIED` market status and unavailable order execution.
3. API status: Arc chain ID 5042, read-only mode, and disabled financial writes.
4. The heartbeat-only SSE connection, explicitly without protocol event payloads.
5. Mainnet bootstrap, keeper continuity, trade settlement, and existing-LP integration blockers.

The preview is available for a technical demonstration only. Do not describe its read-only market display as a working perpetual exchange or claim profits, APY, trading volume, LP returns, or qualified markets.

The repository contains `arcmemeperps_3min_demo.mp4`, but its encoded content was not reviewed in this checkpoint. Its companion narration/recording scripts advertise zero-slippage/10x execution, completed trades, open positions and PnL on the old production terminal; those scripts are stale against verified availability. Exclude the MP4 until its content is reviewed. No replacement video was recorded.

## Readiness matrix

| Requirement                             | Status             | Evidence / blocker                                                                                                                           |
| --------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Public source repository                | PASS               | Repository link above; PRs #2–#9 remain drafts.                                                                                              |
| Public working demo link                | PASS, limited      | Hardened read-only Vercel preview; no financial interaction.                                                                                 |
| Public builder profile                  | PASS               | Public GitHub profile linked above; the owner should confirm profile choice at application time.                                             |
| Organizer submission window open        | FAIL               | The named programs are closed; no upcoming Arc hackathon or Arc Microgrants window was verified. Other grant programs were not assessed.     |
| Working Arc Mainnet product             | FAIL               | Mainnet contracts are unbootstrapped; no verified market qualification, live trade receipt, persistent index, or LP settlement exists.       |
| Verified transaction evidence           | LIMITED            | One historical 1 USDC trader-margin deposit; not a trade or LP proof.                                                                        |
| Three-minute demo outline               | PASS, outline only | Included in the submission preparation document; the existing MP4 is stale and excluded, and no replacement video/application was submitted. |
| Submission portal payload / application | NOT SUBMITTED      | Correctly left for a future open organizer window and the authenticated project owner.                                                       |

## Separate release decisions

- **Hackathon submission now:** **NO-GO** — no reviewed window is open, and the named Microgrants program requires a working Mainnet application.
- **Read-only technical demo:** **GO with the limitation statement above**, only where the organizer's rules permit a read-only proof of concept.
- **Live financial production:** **NO-GO** — Mainnet governance bootstrap, persistent index, complete qualification/oracle evidence, independent financial review, testnet wallet trade evidence, keeper continuity, and existing-LP economic integration remain blocking.

No portal submission, production deployment, governance action, wallet funding, contract deployment, or financial transaction was performed.

