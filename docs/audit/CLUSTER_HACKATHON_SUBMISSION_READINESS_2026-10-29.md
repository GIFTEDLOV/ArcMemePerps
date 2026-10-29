# CLUSTER submission readiness — corrected 2026-10-29

## Organizer round and correction

The earlier PR #9 report incorrectly said no Arc Microgrants window was open. A distinct [Arc Microgrants: Built with Arc Studio](https://dorahacks.io/hackathon/arc-microgrants-2/detail) round closes **November 1, 2026**. The older October 14 round is closed; its deadline must not be applied to this new round.

The new round's organizer page requires contracts written and tested in **Arc Studio** and deployed to Arc Mainnet, a working app built in Arc Studio that calls them, an Arc Studio project URL, and at least one Arc Mainnet transaction moving USDC through the contract **and app**. Submission materials include a live app, public code repository, explorer transaction, video showing the Arc Studio build and Mainnet transaction, and public builder profile. The round excludes projects built outside Arc Studio.

Repository search on 2026-10-29 found no `studio.arc.io/app/...` project URL or Arc Studio build provenance. The existing Mainnet 1 USDC deposit was made through a deployment/script workflow; available evidence does not show that the live app initiated it. The repository's existing demo video has not been reviewed and its companion scripts make unsupported trade/PnL claims. **Eligibility is unverified and currently fails the documented Arc Studio and app-transaction evidence gates.** Do not fabricate a project URL or submit CLUSTER as eligible without authentic evidence.

## Current decision

**Hackathon submission: NO-GO at this checkpoint.** The round is open, but the required Arc Studio provenance, working Studio-built app, app-mediated USDC transaction, and compliant video have not been established. An authenticated builder may provide genuine pre-existing evidence; this report does not request or authorize a new financial transaction. **Live financial production: NO-GO** independently.

## Accurate technical package

- Repository: [GIFTEDLOV/ArcMemePerps](https://github.com/GIFTEDLOV/ArcMemePerps); [public builder profile](https://github.com/GIFTEDLOV).
- Read-only [frontend preview](https://cluster-hackathon-preview-cltn3n6al.vercel.app) and [API preview](https://cluster-readonly-5vvfsdulj-kolofahkelvin16-6437s-projects.vercel.app) were verified at Group E source `a6328ef59ef0d3d5d7203118bb05f22e6c7d1840`. The frontend calls the stable API origin; exact current source parity needs rechecking before any submission.
- Historical [Arc Mainnet 1 USDC MarginVault deposit](https://explorer.arc.io/tx/0x7dd1dfeddc682e745ed84ba885ad3fd800400952522b03cc1126fd81915c4dc9), block 27,246,895. A fresh public-RPC historical receipt/log sample on 2026-10-29 matched that transaction. It proves trader collateral movement only, not a trade, LP investment, or app-mediated flow.
- Mainnet deployment addresses: [`evidence/mainnet/contracts.json`](../../evidence/mainnet/contracts.json). Existing LP is inactive on Mainnet; qualification, execution oracle, trading, and settlement remain unreleased.
- The current preview is read-only discovery with fail-closed Arc verification. The production `cluster-terminal.vercel.app` alias remains on the older seeded `winner-rebuild` build and is unsuitable as a financial demo.

**Truthful short pitch:** CLUSTER shows live multichain meme discovery with fail-closed Arc verification; the current preview is read-only while trading and public LP settlement remain gated.

## Submission requirements

| Gate                                           | Status        | Evidence needed                                                                     |
| ---------------------------------------------- | ------------- | ----------------------------------------------------------------------------------- |
| November 1 round exists                        | PASS          | Organizer page linked above.                                                        |
| Public repository and builder profile          | PASS          | Links above.                                                                        |
| Genuine Arc Studio project/build provenance    | UNKNOWN       | Authentic Studio project URL and build history absent from repository.              |
| Studio-built app calling Mainnet contracts     | UNKNOWN       | No reproducible Studio project/app evidence.                                        |
| Mainnet USDC movement through contract and app | FAIL          | Historical MarginVault deposit exists, app initiation unproven.                     |
| Live app and compliant demonstration video     | FAIL          | Read-only preview exists; legacy MP4 content unreviewed and companion claims stale. |
| Working perpetuals and LP integration          | FAIL          | Separate financial release gates remain unmet.                                      |
| Portal application                             | NOT SUBMITTED | No authenticated submission was made.                                               |

The read-only preview is suitable for a technical demonstration only where rules allow it; this specific Arc Studio round has stronger provenance and app-transaction requirements. Do not infer eligibility from a contract address or a script-driven USDC receipt.
