# Qualification proof

`QualificationProof` is a canonical record of why a market was or was not approved. It includes chain/token identity, lifecycle, evidence hashes, liquidity/authority/holder/deployer/activity/oracle data, manipulation-cost estimate, final integrity and derivatives statuses, risk limits, rule version, and assessment time.

`canonicalQualificationProof()` recursively sorts object keys while preserving array order. `qualificationProofHash()` computes Keccak-256 over that canonical UTF-8 JSON. The proof contains no symbol-based identity. It is designed to be stored in a registry and anchored on Arc later; no anchor transaction is performed in Gate 1.

Canonicalization is deterministic for the same logical record. Production should serialize decimal/fixed-point numeric values according to a finalized schema before anchoring.
