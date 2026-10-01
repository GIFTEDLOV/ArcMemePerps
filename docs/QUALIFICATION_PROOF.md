# Qualification proof

`QualificationProof` v2 is a canonical record of why a market was or was not approved. It includes chain/token identity, lifecycle, an `EvidenceRoot`, full provenance-bearing evidence records, assessment position, liquidity/authority/holder/deployer/activity/oracle data, manipulation-cost estimate, final integrity and derivatives statuses, risk limits, rule version, assessment time, and optional expiry.

`canonicalQualificationProof()` recursively sorts object keys and sorts evidence by `evidenceId`. `qualificationProofHash()` computes Keccak-256 over that canonical UTF-8 JSON for off-chain audit output. Evidence leaves are Keccak hashes of canonical records and the evidence root is a versioned binary Merkle root with duplicate-last-node handling.

The Arc-facing commitment is separate from JSON. `qualification-commitment-v1` is 13 consecutive 32-byte ABI-style words: proof version, market ID, numeric chain code, token identity hash, evidence root, integrity code, derivatives code, scaled leverage, scaled OI, scaled position, Keccak(rule version), assessed Unix seconds, and expiry Unix seconds (zero when absent). USD fields use 1e6 and leverage uses 1e4. `qualificationCommitmentHash()` hashes those bytes with Keccak-256. No contract or anchoring transaction is called in Gate 2.

Canonicalization is deterministic for the same logical record. Production should serialize decimal/fixed-point numeric values according to a finalized schema before anchoring. Evidence retrieval time is never used as a substitute for block time or Solana slot.

Gate 4D consumes the proof through the canonical `MarketPassport` and keeps qualification
separate from the execution gate. A fresh proof can authorize a normal requalification path;
emergency risk reduction can only tighten limits or restrict state. A changed local contract
suite still requires a new testnet deployment before any proof/registry interaction is live
evidence.
