# Arc Runtime Findings

## Local Arc runtime

The official Arc Foundry toolchain was installed from the Circle Arc Foundry release. The local runtime was started with `arc-anvil --network arc`. Its node information reported network `arc`, hard fork `Zero6`, and local chain ID `31337`.

The local USDC interface at `0x3600000000000000000000000000000000000000` responded to `decimals()` with `6`, and the local pre-funded account had an ERC-20 USDC balance. This confirms that local Arc runtime tests can exercise the application-level ERC-20 path without treating native gas balance as collateral.

The Gate 4 Solidity settlement suite runs against the Arc-compatible compiler/runtime and covers deposit, open/close, funding, borrow accrual, liquidation, insurance, failed transfers, order replay/cancellation, and external-transfer surplus reconciliation. Equal timestamps are accepted as a zero-elapsed-time case.

The full multi-account flow is reproducible with `LocalGate4E2ETest` against the Arc Anvil fork and passed. It uses local-only identities and no testnet or mainnet provider. The test includes final custody, OI, insurance, and bad-debt assertions; these are local-runtime results, not a production solvency claim.

## Testnet status

Arc Testnet chain ID `5042002` and the canonical ERC-20 USDC interface at
`0x3600000000000000000000000000000000000000` were verified read-only before broadcast. The
coherent suite was deployed once with dedicated testnet identities. The long, short, liquidation,
market-state, oracle rejection, order replay, event/indexer, and final reconciliation canaries
passed. Arc USDC deposits and withdrawals emitted both a system-level and ERC-20-shaped Transfer
view; protocol accounting used explicit protocol events and canonical balance reconciliation, and
no double credit was observed.

Interactive report signing exposed an operational timing issue: the initial 120-second report
window could elapse while waiting for inclusion. The testnet-only policy was temporarily widened
to 600 seconds, then restored to 120 seconds. This was configuration handling, not a code bypass.

The ArcScan verifier query returned address-only records for all seven contracts. Verification is
therefore recorded as pending/not verified rather than claimed.

## Interpretation

Local and testnet Arc runtime validation demonstrates compatibility of the tested paths. It does
not prove production economic safety, production oracle decentralization, production governance,
production liquidity, solvency, formal audit completion, or deployed-source verification.
