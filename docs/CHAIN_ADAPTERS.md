# Chain adapters

Every chain implements the same `ChainAdapter` interface:

`discoverTokens`, `getTokenMetadata`, `getLifecycle`, `getHolders`, `getLiquidity`, `getLiquidityLocks`, `getPools`, `getTrades`, `getPrice`, `getPriceSources`, `getDeployer`, `getDeployerHistory`, `getAuthorities`, `getTokenPermissions`, `getLaunchData`, and `getTransactionHistory`.

The supported normalized chain IDs are `ARC`, `SOLANA`, `ETHEREUM`, `BASE`, `BNB`, and `ROBINHOOD`. Chain-specific provider response mapping belongs inside each adapter. The risk engine and future frontend consume only normalized domain types.

Gate 1 includes `DeterministicFixtureAdapter`, which has no network dependency and returns complete replayable fixture data. Gate 2 adds `GenericEvmChainAdapter` and `SolanaChainAdapter` for read-only inspection.

## Network configuration

Network configuration is explicit and RPC URLs are environment-overridable:

| Chain           | Mainnet chain ID / slot domain | Default RPC policy                                           |
| --------------- | -----------------------------: | ------------------------------------------------------------ |
| Arc             |                           5042 | `ARC_MAINNET_RPC_URL`, default isolated in `NETWORK_CONFIGS` |
| Ethereum        |                              1 | `ETHEREUM_RPC_URL`                                           |
| Base            |                           8453 | `BASE_RPC_URL`                                               |
| BNB             |                             56 | `BNB_RPC_URL`                                                |
| Robinhood Chain |                           4663 | `ROBINHOOD_RPC_URL`                                          |
| Solana          |                          slots | `SOLANA_RPC_URL`                                             |

Robinhood’s chain ID and RPC are checked against the [Robinhood Chain connection documentation](https://docs.robinhood.com/chain/connecting/). The GoPlus chain mapping also includes Arc, Base, BNB, Ethereum, and Robinhood in its [official chain mapping](https://docs.gopluslabs.io/reference/response-details-9). Arc and Robinhood public RPC availability can change; live smoke output records failures rather than hiding them.

The EVM adapter reads chain ID, latest block/timestamp, bytecode existence, and ERC-20 metadata through viem. Deployer history, ownership semantics, LP security, and proxy implementation are not inferred from bytecode alone. Solana reads account ownership, SPL/Token-2022 mint layout, supply, authorities, largest accounts, and slot provenance. Helius enrichment is optional.

Lifecycle classification only marks `DEX_LIVE` when a normalized DEX pair is observed. Bonding, graduation, and launchpad-specific stages require a future platform plugin; generic token records do not guess them.

Gate 4C adds `DiscoveryCoordinator` and platform-plugin boundaries for Pump.fun/PumpSwap,
Raydium, Meteora, Four.meme, Flaunch, Aerodrome, Arc-native venues, and documented Robinhood
DEXs. The catalog is not a claim that those plugins are live. A missing plugin is `UNAVAILABLE`,
and unsupported methods on a live adapter raise `CapabilityUnavailableError`.

Gate 4D keeps these boundaries explicit in the feature ledger. Generic EVM and Solana token reads
and DexScreener normalization are live-read capabilities; continuous launchpad discovery and
venue-specific PumpSwap/Raydium/Meteora/Pancake/Uniswap/Aerodrome depth or LP-control readers
remain partial or externally blocked where no verified implementation is present. The adapter
must return provenance-bearing `UNAVAILABLE`, never synthetic lifecycle or depth evidence.
