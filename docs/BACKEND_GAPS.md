# Gate 4E backend gaps

This list contains only unresolved work visible in the current source audit.

The planned submission ledger contains no `PARTIAL` or `NOT_IMPLEMENTED`
rows. This file contains only work outside the deterministic backend release
candidate.

## EXTERNAL_BLOCKED

- Four.meme-specific bonding/graduation lifecycle evidence: no stable,
  versioned official API, SDK, or sufficiently verified public contract path was
  available for a reproducible adapter. BNB discovery remains available through
  generic factory and PancakeSwap readers. See
  [EXTERNAL_BLOCKER_REVIEW.md](./EXTERNAL_BLOCKER_REVIEW.md).

Credentialed Helius, GoPlus, and Bubblemaps enrichment is optional external
input. When absent, the backend explicitly reports unavailable evidence and
keeps any risk tier that requires that evidence fail-closed.

## RELEASE_ONLY

- Redeploy the changed contract suite to Arc Testnet and rerun canaries after
  explicit authorization. The prior deployment is not evidence for the changed
  LP/ADL/governance source.
- Arc Mainnet deployment, production role ceremony, production reporter keys,
  and release configuration.
