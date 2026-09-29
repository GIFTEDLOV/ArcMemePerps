# Captured evidence snapshots

This directory is reserved for minimal, public, read-only evidence captures from real chains or provider responses. A snapshot is not a verdict about a project. Use neutral categories such as `KNOWN_MINT_AUTHORITY_ACTIVE`, `KNOWN_THIN_LIQUIDITY`, or `KNOWN_HIGH_LIQUIDITY_ESTABLISHED`.

Each snapshot must include:

- collection timestamp;
- chain and network;
- token identity;
- provider and endpoint provenance;
- block number/hash or Solana slot where available;
- raw-response hash;
- only the minimum public data needed for deterministic replay.

Secrets, API keys, full wallet histories, and unnecessary personal data must not be stored. Tests consume snapshots offline and never call an external provider.
