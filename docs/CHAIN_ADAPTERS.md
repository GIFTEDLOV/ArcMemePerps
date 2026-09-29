# Chain adapters

Every chain implements the same `ChainAdapter` interface:

`discoverTokens`, `getTokenMetadata`, `getLifecycle`, `getHolders`, `getLiquidity`, `getLiquidityLocks`, `getPools`, `getTrades`, `getPrice`, `getPriceSources`, `getDeployer`, `getDeployerHistory`, `getAuthorities`, `getTokenPermissions`, `getLaunchData`, and `getTransactionHistory`.

The supported normalized chain IDs are `ARC`, `SOLANA`, `ETHEREUM`, `BASE`, `BNB`, and `ROBINHOOD`. Chain-specific provider response mapping belongs inside each adapter. The risk engine and future frontend consume only normalized domain types.

Gate 1 includes `DeterministicFixtureAdapter`, which has no network dependency and returns complete replayable fixture data. Live RPC/indexer/API providers are intentionally not integrated.
