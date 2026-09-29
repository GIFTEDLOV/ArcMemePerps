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
