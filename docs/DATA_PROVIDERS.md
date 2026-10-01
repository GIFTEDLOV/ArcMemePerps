# Data providers

Providers are replaceable adapters. They return normalized values plus raw-response hashes and provenance; they do not decide final qualification.

| Provider                   | Purpose                                                            | Chains                                 | Auth                        | Trust/fallback                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------ | -------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical EVM RPC via viem | chain ID, blocks, bytecode, ERC-20 views                           | Arc, Ethereum, Base, BNB, Robinhood    | RPC URL env/default         | canonical for those reads; no deployer/history inference; wrong chain is an error                                                                 |
| Canonical Solana RPC       | mint account, program, supply, authorities, largest accounts, slot | Solana                                 | RPC URL env/default         | canonical for account facts; enrichment unavailable without other providers                                                                       |
| DexScreener                | pairs, liquidity, price, volume, tx counts, FDV, pool creation     | configured supported networks          | public API                  | market evidence only; [official API](https://docs.dexscreener.com/api/reference); bounded retries and duplicate-pool handling                     |
| GoPlus                     | optional token security signals                                    | EVM and Solana where API supports them | `GO_PLUS_API_KEY`           | enrichment, never authoritative; [EVM API](https://docs.gopluslabs.io/reference/tokensecurityusingget_1); missing fields stay null                |
| Helius                     | optional Solana DAS metadata and future transaction enrichment     | Solana                                 | `HELIUS_API_KEY`            | enrichment; no key means `HELIUS_API_KEY_MISSING`; [docs](https://www.helius.dev/docs)                                                            |
| Bubblemaps                 | holders, transfers, clusters, labels                               | configured supported networks          | `BUBBLEMAPS_API_KEY` header | enrichment; no scraping; [map API](https://docs.bubblemaps.io/data/api/tokens/map) and [auth](https://docs.bubblemaps.io/data/api/authentication) |

DexScreener’s documented limit is treated as a provider constraint, not an authorization to retry indefinitely. HTTP 429, timeout, 5xx, malformed JSON, unsupported chain, and wrong-token responses are explicit failures. `--no-enrichment` disables optional providers while retaining canonical reads.

# Gate 3 trust boundary

Provider data is untrusted input. Canonical RPC facts and provider enrichment remain separate,
source-family labels prevent false oracle independence, and disagreement is retained as a
material data-quality state. Timeouts, rate limits, malformed responses, wrong-chain/token
responses, missing credentials, and unsupported fields degrade explicitly to unavailable or
error. No adapter invents a security or depth result.

# Gate 4C redundancy and canonicality

`ProviderPool` applies bounded priority failover, timeout handling, circuit opening, and
explicit `OPERATIONAL`/`DEGRADED`/`UNAVAILABLE` state. It selects a successful provider; it does
not average contradictory security facts. Security-critical reconciliation remains fail-closed.

RPC pools are configured without credentials in code: the primary endpoint uses the existing
`<CHAIN>_RPC_URL` variable and optional comma-separated fallbacks use
`<CHAIN>_RPC_URL_FALLBACKS`. The pool retains health/circuit state across reads for one adapter
instance and never treats an exhausted pool as a zero-valued observation.

Provider state is part of the canonical snapshot boundary. HTTP 200 from one endpoint cannot
erase a failed or stale result from another source, and an unavailable optional provider is not
represented as zero evidence.
