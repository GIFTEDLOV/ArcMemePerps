# Build state — Gate 2

Implemented:

- pnpm workspace with strict TypeScript, Vitest, ESLint, Prettier, and CI workflow;
- normalized domain/lifecycle/adapter/risk/oracle/proof packages;
- provider-free deterministic adapter and 14-case risk corpus;
- minimal Arc contract foundation and Foundry tests/invariant-oriented fuzz coverage;
- architecture, domain, risk, economic, threat, adapter, proof, and testing documentation;
- `.env.example` with separate Arc testnet/mainnet variables and no secrets;
- local Git baseline commit `9a08889a2b3a5c296ca3382276b26bc9a762d505` (`gate1-foundation`);
- Foundry installed through the official installer inside WSL Ubuntu and the Gate 1 suite executed;
- QualificationProof v2 with provenance, evidence root, and typed Arc commitment;
- typed V2 market identities shared by TypeScript and Solidity;
- explicit emergency risk reductions and fresh-proof normal requalification;
- provider interfaces plus read-only EVM/Solana RPC, DexScreener, GoPlus, Helius, and Bubblemaps adapters;
- normalized live inspection CLI and separate live-read smoke command;
- deterministic provider failure/disagreement tests and neutral snapshot corpus structure.

Historical Gate 2 scope boundaries were frontend, deployment, transactions, external paid
resources, GitHub push, bridge/token custody, final economic formulas, governance, production
thresholds, DEX quote simulation, and provider credentials. The current Gate 4E backend includes
the deterministic and read-only implementations that can be built without deployment or paid
credentials; unavailable evidence remains explicit and fail-closed.

Foundry is available in WSL Ubuntu for this checkout. Network smoke tests remain environment-
dependent and are intentionally separate from deterministic CI.

# Gate 3 status

Gate 3 is implemented on local branch `gate3-economics` and has not been deployed. Foundry
is available through the official WSL installation. The branch includes the first executable
economic core, but remains pre-audit and pre-deployment. Automatic ADL, public LP shares,
production reporter governance, and full engine-level fee/funding settlement remain explicit
follow-up boundaries.

# Gate 4 status

Gate 4B is on the local branch `gate4-arc-testnet`. The pretestnet checkpoint is
`ac9571d972e1011b546decc8283f8cd13f35ad68`; the predeployment configuration checkpoint is
`2b2b89936ea756f4dddc72d3515a5bca83409717`. The official Arc toolchain ran the local multi-account
E2E and the complete deterministic regression suite. A coherent suite was deployed once to Arc
Testnet chain `5042002` with dedicated testnet identities and Circle-faucet USDC.

Live long, short, liquidation, state-transition, fresh-requalification, oracle-rejection,
order-replay, event/indexer, and custody/OI/insurance/bad-debt reconciliation evidence is in
`evidence/gate4/`. Final testnet custody is an exact ERC-20 balance match. The deployed contracts
are not yet source-verified by ArcScan; the verifier response is recorded honestly. This testnet
is a mechanics canary and is not a production safety claim.

Gate 5 has not started. No Arc Mainnet write, GitHub remote, GitHub push, frontend, or production
deployment exists.

# Gate 4C backend audit status (historical)

The Gate 4C audit branch adds the binding feature ledger at `docs/BACKEND_FEATURE_MATRIX.md`
and the remaining-gap list at `docs/BACKEND_GAPS.md`. Canonical versioned Zod schemas, local
SQLite persistence, reorg/idempotency primitives, bounded provider pools, lifecycle evidence
classification, explicit launchpad boundaries, LP/holder/funding/first-buyer/wash/wallet/
trending/competition primitives, a read-only API/SSE boundary, keeper/reporter boundaries, and
unified health records are present and tested.

This historical audit did not claim full product completion. The current Gate 4E completion
ledger supersedes its partial findings. No blockchain write was performed in Gate 4C.

# Gate 4D full-backend audit status (historical)

Gate 4D added and tested the canonical MarketPassport, separate qualification/execution gates,
portable persistence interfaces, bounded worker/read-model/realtime foundations, source-family
independence, LP-security/depth primitives, and local PublicLPVault, ADLController, and
ProtocolTimelock foundations. Its 21 partial rows were closed in Gate 4E; the current ledger is
the authoritative status.

Contracts changed materially. The previous Arc Testnet contracts remain mechanically valid for
their historical evidence, but they do not validate the current LP/ADL/timelock source. A fresh
testnet redeployment is required after explicit authorization; this gate does not redeploy. No
Arc Testnet or Arc Mainnet write was performed in Gate 4E, and no Git remote exists.

# Gate 4E zero-partial backend completion

Gate 4E closes the planned backend rows with durable discovery, normalized venue/depth/LP
readers, canonical profile and competition projections, worker/recovery boundaries, LP share
accounting, ADL selection, governance authorization semantics, reconciliation, and the frontend
backend contract. Four.meme-specific lifecycle data remains externally blocked only where the
official/onchain evidence path could not be verified; see `docs/EXTERNAL_BLOCKER_REVIEW.md`.

The changed contract suite is frozen as a candidate only. `TESTNET_REDEPLOY_REQUIRED=YES` and
`ARC_MAINNET_READY=NO`; no deployment or blockchain write is performed by Gate 4E.
