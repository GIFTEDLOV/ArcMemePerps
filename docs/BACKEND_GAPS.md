# Gate 4E backend gaps

This list contains only unresolved work visible in the current source audit.

The planned submission ledger contains no `PARTIAL` or `NOT_IMPLEMENTED`
rows. This file contains only work outside the deterministic backend release
candidate.

## EXTERNAL_BLOCKED

There are no planned submission features currently classified as
`EXTERNAL_BLOCKED`. Optional Helius, GoPlus, and Bubblemaps enrichment remains
credential-dependent, but the core adapters fail closed and do not require
those vendors for ordinary reads or safe qualification decisions.

Credentialed Helius, GoPlus, and Bubblemaps enrichment is optional external
input. When absent, the backend explicitly reports unavailable evidence and
keeps any risk tier that requires that evidence fail-closed.

## RELEASE_ONLY

- Redeploy the changed contract suite to Arc Testnet and rerun canaries after
  explicit authorization. The prior deployment is not evidence for the changed
  LP/ADL/governance source.
- Arc Mainnet deployment, production role ceremony, production reporter keys,
  and release configuration.
