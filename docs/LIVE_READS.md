# Live read-only operations

The developer command is:

```text
pnpm market:inspect --chain base --token 0x... --json
pnpm market:inspect --chain solana --token ... --no-enrichment
```

It emits identity, lifecycle, DEX aggregates, liquidity, authorities, holders/clusters, deployer evidence, provider availability, provenance, freshness/disagreements, Gate 1 integrity and derivatives assessments, qualification hashes, and explicit unknowns. `--output <file>` writes the local report. No wallet or signing key is accepted.

The smoke command is:

```text
pnpm test:live
```

It performs one read-only inspection per supported mainnet configuration and records chain ID or Solana slot, token, evidence classes, unavailable classes, errors, and latency. It is not deterministic CI and does not endorse the sample assets. Optional GoPlus, Helius, and Bubblemaps calls are skipped when credentials are absent.

No live command uses `eth_sendTransaction`, `eth_sendRawTransaction`, Solana transaction submission, swaps, approvals, deployments, or wallet funding.

# Gate 3 read-only smoke (2026-09-29)

`pnpm test:live` was run against one public address/mint per supported mainnet. The command
prints `readOnly: true` and `writesPerformed: false`; no wallet, signer, transaction, or
contract write path is used.

- Arc: canonical RPC and DexScreener available; latest block `23366563`.
- Ethereum: canonical RPC and DexScreener available; latest block `26083033`.
- Base: canonical RPC and DexScreener available; latest block `51947245`.
- BNB: canonical RPC and DexScreener available; latest block `124714293`.
- Robinhood Chain: canonical RPC and DexScreener available; latest block `75645596`.
- Solana: DexScreener available, but the public canonical Solana RPC returned HTTP 429, so
  slot/mint-account evidence was unavailable in this run. Helius was not configured.

GoPlus, Bubblemaps, and Helius were explicitly unavailable because enrichment was disabled and
no API credentials were supplied. These statuses remain unavailable/unknown to the risk engine;
they are never treated as passing evidence.

# Gate 4C read-only smoke (2026-10-01)

The smoke was rerun after provider-pool wiring. Arc, Ethereum, Base, BNB, and Robinhood returned
canonical EVM block plus ERC-20 metadata evidence and DexScreener market evidence. The public
Solana RPC again returned HTTP 429; the normalized result is `UNAVAILABLE` with the provider
error preserved, while DexScreener remained available. No transaction, signing, approval, or
other write method was invoked.

The RPC pool accepts `<CHAIN>_RPC_URL_FALLBACKS`; no fallback endpoint was configured for this
run, so this result is intentionally not presented as Solana health.
