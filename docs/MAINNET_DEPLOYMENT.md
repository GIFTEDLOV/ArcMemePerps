# Arc Mainnet deployment status

Status: `EXTERNAL_BLOCKED_MAINNET_FUNDING`

Phase 13C completed the deployment-independent production wiring. No Mainnet
transaction was broadcast, no contract address was invented, and no market,
position, or oracle market sequence exists on Mainnet for this product.

## Frozen inputs

- Release candidate: `009437861a45042b66641481f3671e2897777222`
- Contract source SHA: `0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b`
- Policy: `risk-rules/0.4.0`
- Chain: Arc Mainnet `5042`
- RPC: `https://rpc.mainnet.arc.io`
- Explorer: `https://explorer.arc.io`
- USDC: `0x3600000000000000000000000000000000000000`

## Current runtime truth

The production model reports `DEPLOYMENT_PENDING`, serves the multichain
discovery universe, and reports zero registered and live perps. Wallet writes
are disabled while deployment is pending. Reporter and keeper processes are
healthy and idle with zero registered markets and zero orders. The Mainnet
indexer reports `WAITING_FOR_DEPLOYMENT`, never `SYNCED`, until fresh addresses
and a real start block are supplied.

## Artifacts

- [deployment manifest](../evidence/mainnet/deployment-manifest.json) — dry-run
  inputs, exact frozen artifact hashes, constructor schema, and unresolved
  ceremony values.
- [provenance template](../evidence/mainnet/mainnet-provenance.template.json) —
  null until receipts, addresses, runtime hashes, and Safe creation exist.
- `pnpm mainnet:manifest` — regenerate the sanitized manifest locally.
- `pnpm mainnet:deploy` — later one-shot ceremony; it requires funding,
  signer/role inputs, and refuses partial progress. It was not run in Phase 13C.
- `pnpm mainnet:verify` — later read-only parity, role, timelock, and genesis
  verification.

The existing Testnet/canary scripts remain historical evidence and are not the
Mainnet deployment path.
