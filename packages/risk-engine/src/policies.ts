import type { LpLockStatus, MarketObservation } from "@arcmemeperps/domain";

export type RiskPolicyProfileId =
  | "SOLANA_SPL"
  | "SOLANA_TOKEN_2022"
  | "EVM_STANDARD"
  | "EVM_PROXY"
  | "LAUNCHPAD_CONTROLLED"
  | "VENUE_SPECIFIC_LP_CONTROL";

export interface RiskPolicyProfile {
  readonly id: RiskPolicyProfileId;
  readonly ruleVersion: string;
  readonly authorityEvidence: readonly string[];
  readonly lpStates: readonly LpLockStatus[];
  readonly notes: string;
}

export const RISK_POLICY_PROFILES: Readonly<Record<RiskPolicyProfileId, RiskPolicyProfile>> = {
  SOLANA_SPL: {
    id: "SOLANA_SPL",
    ruleVersion: "0.2.0",
    authorityEvidence: ["mintAuthority", "freezeAuthority", "tokenProgram", "supply"],
    lpStates: ["BURNED", "TIME_LOCKED", "PROTOCOL_CONTROLLED", "DISTRIBUTED_NON_PRIVILEGED"],
    notes: "SPL mint/freeze authority is chain-native evidence; token-account scope is not a full wallet census.",
  },
  SOLANA_TOKEN_2022: {
    id: "SOLANA_TOKEN_2022",
    ruleVersion: "0.2.0",
    authorityEvidence: ["mintAuthority", "freezeAuthority", "tokenExtensions", "supply"],
    lpStates: ["BURNED", "TIME_LOCKED", "PROTOCOL_CONTROLLED", "DISTRIBUTED_NON_PRIVILEGED"],
    notes: "Token-2022 extensions are assessed separately from SPL mint authorities.",
  },
  EVM_STANDARD: {
    id: "EVM_STANDARD",
    ruleVersion: "0.2.0",
    authorityEvidence: ["bytecode", "owner", "roles", "mint", "transferRestrictions"],
    lpStates: ["BURNED", "TIME_LOCKED", "PROTOCOL_CONTROLLED", "DISTRIBUTED_NON_PRIVILEGED"],
    notes: "ERC-20 owner/role/transfer semantics require direct or provider-backed evidence.",
  },
  EVM_PROXY: {
    id: "EVM_PROXY",
    ruleVersion: "0.2.0",
    authorityEvidence: ["proxyImplementation", "proxyAdmin", "upgradeAuthority", "roles"],
    lpStates: ["BURNED", "TIME_LOCKED", "PROTOCOL_CONTROLLED", "DISTRIBUTED_NON_PRIVILEGED"],
    notes: "Proxy administration is a separate hard gate and cannot be inferred from token metadata alone.",
  },
  LAUNCHPAD_CONTROLLED: {
    id: "LAUNCHPAD_CONTROLLED",
    ruleVersion: "0.2.0",
    authorityEvidence: ["launchpadMigration", "bondingState", "migrationController"],
    lpStates: ["IMMUTABLE_MIGRATION_CONTROL", "PROTOCOL_CONTROLLED", "BURNED", "TIME_LOCKED"],
    notes: "Launchpad migration control is assessed using platform-native evidence, not a generic V2 locker timestamp.",
  },
  VENUE_SPECIFIC_LP_CONTROL: {
    id: "VENUE_SPECIFIC_LP_CONTROL",
    ruleVersion: "0.2.0",
    authorityEvidence: ["venuePosition", "lockerOrBurnEvidence", "withdrawalAuthority"],
    lpStates: ["BURNED", "TIME_LOCKED", "PROTOCOL_CONTROLLED", "IMMUTABLE_MIGRATION_CONTROL", "DISTRIBUTED_NON_PRIVILEGED"],
    notes: "LP control is normalized per venue; a V2 lock timestamp is not required when a stronger venue-native control is proven.",
  },
};

export function policyProfileForObservation(observation: MarketObservation): RiskPolicyProfile {
  if (observation.token.chain === "SOLANA") {
    return observation.authorities.upgradeable === null
      ? RISK_POLICY_PROFILES.SOLANA_SPL
      : RISK_POLICY_PROFILES.SOLANA_TOKEN_2022;
  }
  if (observation.authorities.upgradeable === true) return RISK_POLICY_PROFILES.EVM_PROXY;
  if (observation.token.originPlatform === "PUMP_STYLE" || observation.token.originPlatform === "FOUR_MEME_STYLE") {
    return RISK_POLICY_PROFILES.LAUNCHPAD_CONTROLLED;
  }
  return RISK_POLICY_PROFILES.EVM_STANDARD;
}
