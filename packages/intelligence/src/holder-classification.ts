export type SystemHolderClassification =
  "BURN" | "CANONICAL_POOL" | "PROTOCOL_VAULT" | "BRIDGE_ESCROW" | "CEX" | "UNKNOWN";

export interface BurnAddressEvidence {
  readonly address: string;
  readonly classification: "BURN" | "NOT_BURN" | "UNKNOWN";
  readonly rule: string;
  readonly reason: string;
  readonly evidenceIds: readonly string[];
}

export interface HolderClassificationEvidence {
  readonly address: string;
  readonly classification: SystemHolderClassification;
  readonly excludedFromConcentration: boolean;
  readonly reason: string;
  readonly evidenceIds: readonly string[];
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const PRECOMPILE_ECRECOVER = "0x0000000000000000000000000000000000000001";

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Classifies only deterministic, conventionally irreversible burn sinks.
 * Vanity dead-address forms are accepted only when they match the complete
 * address pattern; arbitrary large wallets and contracts remain unknown.
 */
export function classifyBurnAddress(address: string): BurnAddressEvidence {
  const normalized = normalizeAddress(address);
  if (normalized === ZERO_ADDRESS)
    return {
      address,
      classification: "BURN",
      rule: "TOKEN_ZERO_ADDRESS",
      reason: "ERC-20 transfers to the zero address are irrecoverable token burns",
      evidenceIds: ["holder-classifier:zero-address", "erc20:transfer-to-zero-burn"],
    };
  if (normalized === PRECOMPILE_ECRECOVER)
    return {
      address,
      classification: "BURN",
      rule: "PRECOMPILE_NON_SPENDABLE",
      reason: "the address is the canonical ecrecover precompile and has no spendable account key",
      evidenceIds: ["holder-classifier:precompile-0x01", "ethereum:precompile-ecrecover"],
    };
  if (/^0xdead[0-9a-f]{36}$/.test(normalized) || /^0x[0-9a-f]{36}dead$/.test(normalized))
    return {
      address,
      classification: "BURN",
      rule: normalized.startsWith("0xdead") ? "DEAD_PREFIX_SINK" : "DEAD_SUFFIX_SINK",
      reason: "the address matches the complete conventional dead-address sink form",
      evidenceIds: [
        "holder-classifier:dead-address-pattern",
        "holder-classifier:conventional-irrecoverable-sink",
      ],
    };
  if (!/^0x[0-9a-f]{40}$/.test(normalized))
    return {
      address,
      classification: "UNKNOWN",
      rule: "INVALID_ADDRESS",
      reason: "address format is not a canonical EVM address",
      evidenceIds: [],
    };
  return {
    address,
    classification: "NOT_BURN",
    rule: "NO_BURN_RULE_MATCH",
    reason: "no deterministic burn-address rule matched",
    evidenceIds: ["holder-classifier:no-burn-rule-match"],
  };
}

export function classifySystemHolder(input: {
  readonly address: string;
  readonly canonicalPoolAddresses?: readonly string[];
  readonly protocolVaultAddresses?: readonly string[];
  readonly bridgeEscrowAddresses?: readonly string[];
  readonly knownCex?: boolean;
}): HolderClassificationEvidence {
  const address = normalizeAddress(input.address);
  const burn = classifyBurnAddress(address);
  if (burn.classification === "BURN")
    return {
      address: input.address,
      classification: "BURN",
      excludedFromConcentration: true,
      reason: burn.reason,
      evidenceIds: burn.evidenceIds,
    };
  const exact = (values: readonly string[] | undefined): boolean =>
    values?.some((value) => normalizeAddress(value) === address) ?? false;
  if (exact(input.canonicalPoolAddresses))
    return {
      address: input.address,
      classification: "CANONICAL_POOL",
      excludedFromConcentration: true,
      reason: "pool identity was verified by canonical token/factory/state evidence",
      evidenceIds: ["holder-classifier:canonical-pool-identity"],
    };
  if (exact(input.protocolVaultAddresses))
    return {
      address: input.address,
      classification: "PROTOCOL_VAULT",
      excludedFromConcentration: true,
      reason: "protocol-vault identity was supplied with explicit evidence",
      evidenceIds: ["holder-classifier:protocol-vault-identity"],
    };
  if (exact(input.bridgeEscrowAddresses))
    return {
      address: input.address,
      classification: "BRIDGE_ESCROW",
      excludedFromConcentration: true,
      reason: "bridge-escrow identity was supplied with explicit evidence",
      evidenceIds: ["holder-classifier:bridge-escrow-identity"],
    };
  if (input.knownCex === true)
    return {
      address: input.address,
      classification: "CEX",
      excludedFromConcentration: false,
      reason: "custody classification does not remove the address from token concentration",
      evidenceIds: ["holder-classifier:cex-identity"],
    };
  return {
    address: input.address,
    classification: "UNKNOWN",
    excludedFromConcentration: false,
    reason: "no exclusion-class evidence was provided; address remains in concentration",
    evidenceIds: [],
  };
}
