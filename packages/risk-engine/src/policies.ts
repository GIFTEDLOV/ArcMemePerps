import type { HardGateCode, LpLockStatus, MarketObservation } from "@arcmemeperps/domain";

export type RiskPolicyProfileId =
  | "SOLANA_SPL"
  | "SOLANA_TOKEN_2022"
  | "EVM_STANDARD"
  | "EVM_PROXY"
  | "LAUNCHPAD_CONTROLLED"
  | "VENUE_SPECIFIC_LP_CONTROL";

export type PolicyGateDisposition = "MANDATORY" | "OPTIONAL" | "NOT_APPLICABLE";

export interface RiskPolicyProfile {
  readonly id: RiskPolicyProfileId;
  readonly ruleVersion: string;
  readonly authorityEvidence: readonly string[];
  readonly lpStates: readonly LpLockStatus[];
  readonly mandatoryHardGates: readonly HardGateCode[];
  readonly optionalHardGates: readonly HardGateCode[];
  readonly notApplicableGates: readonly HardGateCode[];
  readonly optionalEvidence: readonly string[];
  readonly softWarningSignals: readonly string[];
  readonly evidenceByGate: Partial<Record<HardGateCode, readonly string[]>>;
  readonly notes: string;
}

const SOLANA_MANDATORY: readonly HardGateCode[] = [
  "MINT_AUTHORITY_ACTIVE",
  "FREEZE_AUTHORITY_ACTIVE",
  "HONEYPOT_OR_TRANSFER_RESTRICTION",
  "LIQUIDITY_WITHDRAWABLE",
  "LP_UNLOCK_TOO_SOON",
  "INDIVIDUAL_HOLDER_CONCENTRATION",
  "CONNECTED_CLUSTER_CONCENTRATION",
  "KNOWN_RISK_DEPLOYER",
  "WASH_TRADING",
  "VOLUME_FARMING",
  "SUSPICIOUS_TRANSACTION_REPETITION",
  "INSUFFICIENT_EVIDENCE",
];

const EVM_MANDATORY: readonly HardGateCode[] = [
  "MINT_AUTHORITY_ACTIVE",
  "DANGEROUS_OWNER_ADMIN_PRIVILEGE",
  "UPGRADEABILITY_RISK",
  "HONEYPOT_OR_TRANSFER_RESTRICTION",
  "LIQUIDITY_WITHDRAWABLE",
  "LP_UNLOCK_TOO_SOON",
  "DEPLOYER_CONCENTRATION",
  "INDIVIDUAL_HOLDER_CONCENTRATION",
  "CONNECTED_CLUSTER_CONCENTRATION",
  "KNOWN_RISK_DEPLOYER",
  "WASH_TRADING",
  "VOLUME_FARMING",
  "SUSPICIOUS_TRANSACTION_REPETITION",
  "INSUFFICIENT_EVIDENCE",
];

const MATURE_OPTIONAL: readonly HardGateCode[] = [
  "DEPLOYER_CONCENTRATION",
  "BUNDLED_LAUNCH_CONCENTRATION",
  "RELATED_WALLET_FUNDING",
  "SUSPICIOUS_EARLY_BUYERS",
];

const MATURE_EVM_OPTIONAL: readonly HardGateCode[] = [
  "BUNDLED_LAUNCH_CONCENTRATION",
  "RELATED_WALLET_FUNDING",
  "SUSPICIOUS_EARLY_BUYERS",
];

const LAUNCHPAD_MANDATORY: readonly HardGateCode[] = [
  ...SOLANA_MANDATORY.filter((code) => code !== "INSUFFICIENT_EVIDENCE"),
  "DEPLOYER_CONCENTRATION",
  "BUNDLED_LAUNCH_CONCENTRATION",
  "RELATED_WALLET_FUNDING",
  "SUSPICIOUS_EARLY_BUYERS",
  "INSUFFICIENT_EVIDENCE",
];

const VENUE_MANDATORY: readonly HardGateCode[] = [
  "MINT_AUTHORITY_ACTIVE",
  "FREEZE_AUTHORITY_ACTIVE",
  "DANGEROUS_OWNER_ADMIN_PRIVILEGE",
  "UPGRADEABILITY_RISK",
  "HONEYPOT_OR_TRANSFER_RESTRICTION",
  "LIQUIDITY_WITHDRAWABLE",
  "LP_UNLOCK_TOO_SOON",
  "DEPLOYER_CONCENTRATION",
  "INDIVIDUAL_HOLDER_CONCENTRATION",
  "CONNECTED_CLUSTER_CONCENTRATION",
  "BUNDLED_LAUNCH_CONCENTRATION",
  "KNOWN_RISK_DEPLOYER",
  "RELATED_WALLET_FUNDING",
  "SUSPICIOUS_EARLY_BUYERS",
  "WASH_TRADING",
  "VOLUME_FARMING",
  "SUSPICIOUS_TRANSACTION_REPETITION",
  "INSUFFICIENT_EVIDENCE",
];

const EVIDENCE_BY_GATE: Partial<Record<HardGateCode, readonly string[]>> = {
  MINT_AUTHORITY_ACTIVE: ["canonical token authority or EVM mintability read"],
  FREEZE_AUTHORITY_ACTIVE: ["canonical Solana freeze-authority RPC read"],
  DANGEROUS_OWNER_ADMIN_PRIVILEGE: ["EVM owner/admin/role and bytecode inspection"],
  UPGRADEABILITY_RISK: ["proxy implementation/admin and upgrade-authority inspection"],
  HONEYPOT_OR_TRANSFER_RESTRICTION: ["chain-native transfer simulation or source-backed restriction check"],
  LIQUIDITY_WITHDRAWABLE: ["venue pool/position state and privileged withdrawal authority"],
  LP_UNLOCK_TOO_SOON: ["venue-native lock, burn, or immutable migration state"],
  DEPLOYER_CONCENTRATION: ["creator/deployer identity plus holder ownership resolution"],
  INDIVIDUAL_HOLDER_CONCENTRATION: ["largest accounts plus proven owner resolution"],
  CONNECTED_CLUSTER_CONCENTRATION: ["underlying wallet relationship graph and supply denominator"],
  BUNDLED_LAUNCH_CONCENTRATION: ["bounded launch-window transaction analysis"],
  KNOWN_RISK_DEPLOYER: ["completed documented risk-corpus check for creator/deployer"],
  RELATED_WALLET_FUNDING: ["bounded creator/early-buyer funding history"],
  SUSPICIOUS_EARLY_BUYERS: ["bounded launch-window buyer and same-slot analysis"],
  WASH_TRADING: ["completed observed trade-window activity analysis"],
  VOLUME_FARMING: ["completed observed trade-window activity analysis"],
  SUSPICIOUS_TRANSACTION_REPETITION: ["completed observed transaction repetition analysis"],
  INSUFFICIENT_EVIDENCE: ["all mandatory applicable gate evidence for the selected profile"],
};

const MATURE_OPTIONAL_EVIDENCE = [
  "historical launch-window analysis where recoverable",
  "bounded creator/early-buyer funding history",
] as const;

const MATURE_WARNINGS = [
  "LIQUIDITY_COLLAPSE",
  "NEGATIVE_ORGANIC_HOLDER_GROWTH",
  "OPTIONAL_EVIDENCE_UNKNOWN",
] as const;

const LAUNCHPAD_WARNINGS = ["LIQUIDITY_COLLAPSE", "NEGATIVE_ORGANIC_HOLDER_GROWTH"] as const;

const profile = (
  id: RiskPolicyProfileId,
  mandatoryHardGates: readonly HardGateCode[],
  optionalHardGates: readonly HardGateCode[],
  notApplicableGates: readonly HardGateCode[],
  authorityEvidence: readonly string[],
  lpStates: readonly LpLockStatus[],
  optionalEvidence: readonly string[],
  softWarningSignals: readonly string[],
  notes: string,
): RiskPolicyProfile => ({
  id,
  ruleVersion: "0.2.0",
  authorityEvidence,
  lpStates,
  mandatoryHardGates,
  optionalHardGates,
  notApplicableGates,
  optionalEvidence,
  softWarningSignals,
  evidenceByGate: EVIDENCE_BY_GATE,
  notes,
});

export const RISK_POLICY_PROFILES: Readonly<Record<RiskPolicyProfileId, RiskPolicyProfile>> = {
  SOLANA_SPL: profile(
    "SOLANA_SPL",
    SOLANA_MANDATORY,
    MATURE_OPTIONAL,
    ["DANGEROUS_OWNER_ADMIN_PRIVILEGE", "UPGRADEABILITY_RISK"],
    ["mintAuthority", "freezeAuthority", "tokenProgram", "supply"],
    ["BURNED", "TIME_LOCKED", "PROTOCOL_CONTROLLED", "DISTRIBUTED_NON_PRIVILEGED"],
    MATURE_OPTIONAL_EVIDENCE,
    MATURE_WARNINGS,
    "Solana SPL has mint/freeze authorities but no EVM proxy-admin model. Historical launch evidence is optional for an established pre-existing market; current holder, cluster, creator-risk, and activity gates remain applicable.",
  ),
  SOLANA_TOKEN_2022: profile(
    "SOLANA_TOKEN_2022",
    SOLANA_MANDATORY,
    MATURE_OPTIONAL,
    ["DANGEROUS_OWNER_ADMIN_PRIVILEGE", "UPGRADEABILITY_RISK"],
    ["mintAuthority", "freezeAuthority", "tokenProgram", "tokenExtensions", "supply"],
    ["BURNED", "TIME_LOCKED", "PROTOCOL_CONTROLLED", "DISTRIBUTED_NON_PRIVILEGED"],
    MATURE_OPTIONAL_EVIDENCE,
    MATURE_WARNINGS,
    "Token-2022 authority and extension state is chain-native evidence. EVM owner/proxy gates are not applicable; extension-based transfer restrictions remain applicable through the transfer/honeypot gate.",
  ),
  EVM_STANDARD: profile(
    "EVM_STANDARD",
    EVM_MANDATORY,
    MATURE_EVM_OPTIONAL,
    ["FREEZE_AUTHORITY_ACTIVE"],
    ["bytecode", "owner", "roles", "mint", "transferRestrictions"],
    ["BURNED", "TIME_LOCKED", "PROTOCOL_CONTROLLED", "DISTRIBUTED_NON_PRIVILEGED"],
    MATURE_OPTIONAL_EVIDENCE,
    MATURE_WARNINGS,
    "An ordinary EVM ERC-20 has mintability and owner/admin semantics, but no Solana freeze-authority field. Proxy risk is still mandatory even when the token is not currently known to be proxied.",
  ),
  EVM_PROXY: profile(
    "EVM_PROXY",
    EVM_MANDATORY,
    MATURE_EVM_OPTIONAL,
    ["FREEZE_AUTHORITY_ACTIVE"],
    ["proxyImplementation", "proxyAdmin", "upgradeAuthority", "roles"],
    ["BURNED", "TIME_LOCKED", "PROTOCOL_CONTROLLED", "DISTRIBUTED_NON_PRIVILEGED"],
    MATURE_OPTIONAL_EVIDENCE,
    MATURE_WARNINGS,
    "Proxy implementation, admin, and upgrade authority must be directly inspected. Solana freeze authority is not an EVM gate.",
  ),
  LAUNCHPAD_CONTROLLED: profile(
    "LAUNCHPAD_CONTROLLED",
    LAUNCHPAD_MANDATORY,
    [],
    ["DANGEROUS_OWNER_ADMIN_PRIVILEGE", "UPGRADEABILITY_RISK"],
    ["launchpadMigration", "bondingState", "migrationController", "mintAuthority", "freezeAuthority"],
    ["IMMUTABLE_MIGRATION_CONTROL", "PROTOCOL_CONTROLLED", "BURNED", "TIME_LOCKED"],
    ["launchpad-native migration state", "bounded launch-window transaction history"],
    LAUNCHPAD_WARNINGS,
    "This profile is for a launchpad-controlled token model whose migration control is the applicable administrative boundary. It is selected only when the versioned policy explicitly proves that an EVM proxy-admin model is absent.",
  ),
  VENUE_SPECIFIC_LP_CONTROL: profile(
    "VENUE_SPECIFIC_LP_CONTROL",
    VENUE_MANDATORY,
    [],
    [],
    ["venuePosition", "lockerOrBurnEvidence", "withdrawalAuthority"],
    ["BURNED", "TIME_LOCKED", "PROTOCOL_CONTROLLED", "IMMUTABLE_MIGRATION_CONTROL", "DISTRIBUTED_NON_PRIVILEGED"],
    ["venue-native LP position and custody state"],
    MATURE_WARNINGS,
    "This is a strict venue-control profile. It intentionally declares no gate non-applicable because it is an LP-control overlay and does not itself prove chain authority irrelevance.",
  ),
};

export function policyProfileForObservation(observation: MarketObservation): RiskPolicyProfile {
  if (observation.token.chain === "SOLANA") {
    if (observation.token.originPlatform === "PUMP_STYLE") return RISK_POLICY_PROFILES.LAUNCHPAD_CONTROLLED;
    if (observation.token.tokenProgram === "TOKEN_2022") return RISK_POLICY_PROFILES.SOLANA_TOKEN_2022;
    return RISK_POLICY_PROFILES.SOLANA_SPL;
  }
  if (observation.token.originPlatform === "FOUR_MEME_STYLE") {
    return observation.authorities.upgradeable === true
      ? RISK_POLICY_PROFILES.EVM_PROXY
      : RISK_POLICY_PROFILES.EVM_STANDARD;
  }
  if (observation.authorities.upgradeable === true || observation.authorities.upgradeAuthority !== null) {
    return RISK_POLICY_PROFILES.EVM_PROXY;
  }
  return RISK_POLICY_PROFILES.EVM_STANDARD;
}

export function gateDisposition(profileValue: RiskPolicyProfile, code: HardGateCode): PolicyGateDisposition {
  if (profileValue.notApplicableGates.includes(code)) return "NOT_APPLICABLE";
  if (profileValue.mandatoryHardGates.includes(code)) return "MANDATORY";
  return "OPTIONAL";
}
