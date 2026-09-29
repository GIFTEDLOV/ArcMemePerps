# Arc Runtime Findings

## Local Arc runtime

The official Arc Foundry toolchain was installed from the Circle Arc Foundry release. The local runtime was started with `arc-anvil --network arc`. Its node information reported network `arc`, hard fork `Zero6`, and local chain ID `31337`.

The local USDC interface at `0x3600000000000000000000000000000000000000` responded to `decimals()` with `6`, and the local pre-funded account had an ERC-20 USDC balance. This confirms that local Arc runtime tests can exercise the application-level ERC-20 path without treating native gas balance as collateral.

The Gate 4 Solidity settlement suite runs against the Arc-compatible compiler/runtime and covers deposit, open/close, funding, borrow accrual, liquidation, insurance, failed transfers, order replay/cancellation, and external-transfer surplus reconciliation. Equal timestamps are accepted as a zero-elapsed-time case.

The full multi-account flow is reproducible with `LocalGate4E2ETest` against the Arc Anvil fork and passed. It uses local-only identities and no testnet or mainnet provider. The test includes final custody, OI, insurance, and bad-debt assertions; these are local-runtime results, not a production solvency claim.

## Testnet status

No Arc Testnet transaction has been sent. A dedicated testnet-only deployer, reporter, keeper, trader, and liquidator configuration is not present in the environment, and no testnet faucet action was attempted. Consequently there is no testnet runtime evidence package yet.

## Interpretation

Local Arc runtime validation demonstrates compatibility of the tested paths. It does not prove Arc Testnet RPC availability, fee configuration, USDC custody, deployed bytecode verification, oracle key management, or production economic safety.
