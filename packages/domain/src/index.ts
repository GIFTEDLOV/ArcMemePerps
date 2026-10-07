import type { ChainId, Hex, SupportedChain } from "@arcmemeperps/shared";
import type {
  AssessmentPosition,
  DataDisagreement,
  EvidenceRoot,
  EvidenceRecord,
  ProviderAvailability,
} from "./provenance.js";

export * from "./provenance.js";
export * from "./canonical.js";
export * from "./passport.js";
export * from "./metadata.js";

export type { ChainId, Hex, SupportedChain };

export const LIFECYCLE_STATUSES = [
  "DISCOVERED",
  "PRIMARY_MARKET",
  "BONDING",
  "GRADUATED",
  "DEX_LIVE",
  "ESTABLISHED",
] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const INTEGRITY_STATUSES = ["PENDING", "WATCH", "QUALIFIED", "REJECTED"] as const;
export type IntegrityStatus = (typeof INTEGRITY_STATUSES)[number];

/** 0.3.0 separates core token safety from non-core intelligence signals. */
export const CORE_INTEGRITY_STATUSES = ["PENDING", "QUALIFIED", "REJECTED"] as const;
export type CoreIntegrityStatus = (typeof CORE_INTEGRITY_STATUSES)[number];

export const SURVEILLANCE_STATUSES = ["CLEAR", "WATCH", "LIMITED", "HIGH_RISK"] as const;
export type SurveillanceStatus = (typeof SURVEILLANCE_STATUSES)[number];

export const EVIDENCE_COVERAGE_STATUSES = ["COMPLETE", "STRONG", "PARTIAL", "WEAK"] as const;
export type EvidenceCoverageStatus = (typeof EVIDENCE_COVERAGE_STATUSES)[number];

export const EVIDENCE_COVERAGE_DOMAINS = [
  "authority",
  "transferSafety",
  "liquidityControl",
  "holders",
  "clusters",
  "creator",
  "funding",
  "activity",
  "history",
  "depth",
  "oracle",
] as const;
export type EvidenceCoverageDomain = (typeof EVIDENCE_COVERAGE_DOMAINS)[number];

export interface EvidenceCoverageDomainResult {
  readonly status: EvidenceCoverageStatus;
  readonly knownFields: readonly string[];
  readonly unknownFields: readonly string[];
}

export interface EvidenceCoverage {
  readonly overall: EvidenceCoverageStatus;
  readonly domains: Readonly<Record<EvidenceCoverageDomain, EvidenceCoverageDomainResult>>;
  readonly unknownCoreGates: readonly HardGateCode[];
  readonly unknownSurveillanceGates: readonly HardGateCode[];
}

export const GATE_STATES = ["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"] as const;
export type GateState = (typeof GATE_STATES)[number];

export const DERIVATIVES_STATUSES = [
  "UNASSESSED",
  "WATCH",
  "ELIGIBLE",
  "LIVE",
  "PAUSED",
  "CLOSE_ONLY",
  "BLOCKED",
] as const;
export type DerivativesStatus = (typeof DERIVATIVES_STATUSES)[number];

export const ORIGIN_PLATFORMS = [
  "PUMP_STYLE",
  "FOUR_MEME_STYLE",
  "UNISWAP_STYLE",
  "RAYDIUM_STYLE",
  "DIRECT_DEX",
  "UNKNOWN",
] as const;
export type OriginPlatform = (typeof ORIGIN_PLATFORMS)[number];

export interface TokenIdentity {
  readonly chain: SupportedChain;
  readonly tokenAddress: string;
  /** Canonical token-program classification when the chain exposes one. */
  readonly tokenProgram?: "SPL_TOKEN" | "TOKEN_2022" | "UNKNOWN";
  readonly symbol: string | null;
  readonly name: string | null;
  readonly decimals: number | null;
  readonly deployer: string | null;
  readonly createdAt: string | null;
  readonly originPlatform: OriginPlatform;
}

export interface LifecycleSnapshot {
  readonly status: LifecycleStatus;
  readonly observedAt: string;
  readonly confidence: number;
  readonly evidenceHash: Hex;
}

export interface AuthorityState {
  readonly mintAuthorityActive: boolean | null;
  readonly freezeAuthorityActive: boolean | null;
  /** Solana metadata authority is distinct from mint/freeze authority. */
  readonly metadataUpdateAuthority?: string | null;
  readonly dangerousOwnerAdminPrivileges: boolean | null;
  readonly upgradeable: boolean | null;
  readonly upgradeAuthority: string | null;
  readonly transferRestricted: boolean | null;
  readonly honeypotDetected: boolean | null;
}

export type LpLockStatus =
  | "LOCKED"
  | "TIME_LOCKED"
  | "BURNED"
  | "PROTOCOL_CONTROLLED"
  | "IMMUTABLE_MIGRATION_CONTROL"
  | "DISTRIBUTED_NON_PRIVILEGED"
  | "WITHDRAWABLE"
  | "WITHDRAWABLE_BY_PRIVILEGED_ACTOR"
  | "UNKNOWN"
  | "UNAVAILABLE";

export interface LiquidityState {
  readonly totalLiquidityUsd: number | null;
  readonly depth1PctUsd: number | null;
  readonly depth2PctUsd: number | null;
  readonly venueCount: number | null;
  readonly lpOwnershipConcentrationPct: number | null;
  readonly lpLockStatus: LpLockStatus;
  readonly earliestLpUnlockAt: string | null;
  readonly liquidityVenues: readonly string[];
  readonly suddenCollapsePct24h: number | null;
}

export interface HolderConcentration {
  readonly topHolderPct: number | null;
  readonly topFivePct: number | null;
  readonly connectedClusterPct: number | null;
  readonly bundledLaunchPct: number | null;
  readonly individualWalletsUnderFivePct: boolean | null;
  readonly holderCount: number | null;
  readonly organicHolderGrowthPct24h: number | null;
  /** Scope of the observation; top token accounts are not a full holder census. */
  readonly evidenceScope?:
    "TOP_TOKEN_ACCOUNTS" | "RESOLVED_TOP_OWNERS" | "FULL_CENSUS" | "UNAVAILABLE";
  readonly topTokenAccountPct?: number | null;
  readonly resolvedTopOwnerPct?: number | null;
  readonly resolvedTopFiveOwnerPct?: number | null;
}

export interface DeployerRisk {
  readonly deployerAddress: string | null;
  /** Solana launch creator is not an EVM contract deployer. */
  readonly creatorAddress?: string | null;
  /** Funding wallet is only populated when bounded transaction evidence proves it. */
  readonly fundingWallet?: string | null;
  readonly deployerHoldingsPct: number | null;
  readonly knownRisk: boolean | null;
  readonly priorRugCount: number | null;
  readonly relatedWalletFundingDetected: boolean | null;
  readonly walletRotationDetected: boolean | null;
}

export interface ActivityQualityMetrics {
  readonly organicVolume24hUsd: number | null;
  readonly realizedVolatility30dPct: number | null;
  readonly washTradingDetected: boolean | null;
  readonly volumeFarmingDetected: boolean | null;
  readonly suspiciousEarlyBuyers: boolean | null;
  readonly suspiciousTransactionRepetition: boolean | null;
  readonly bundledLaunchDetected: boolean | null;
  readonly fundingSourceDiversity: number | null;
}

export interface OracleMetrics {
  readonly sourceCount: number | null;
  readonly disagreementPct: number | null;
  readonly confidenceBps: number | null;
  readonly stale: boolean | null;
  readonly priceUsd: number | null;
  readonly observedAt: string;
  readonly manipulationCostUsd: number | null;
}

export interface DerivativesCapacityMetrics {
  readonly spotLiquidityUsd: number | null;
  readonly liquidityVenueCount: number | null;
  readonly depth1PctUsd: number | null;
  readonly depth2PctUsd: number | null;
  readonly organicVolume24hUsd: number | null;
  readonly realizedVolatilityPct: number | null;
  readonly oracleSourceCount: number | null;
  readonly oracleDisagreementPct: number | null;
  readonly oracleConfidenceBps: number | null;
  readonly manipulationCostUsd: number | null;
  readonly maximumSafeOpenInterestUsd: number | null;
  readonly maximumPositionSizeUsd: number | null;
  readonly maximumLeverage: number | null;
  readonly fundingImbalancePct: number | null;
  readonly liquidationCapacityUsd: number | null;
}

export interface RiskParameters {
  readonly recommendedMaxLeverage: number | null;
  readonly recommendedMaxOI: number | null;
  readonly recommendedMaxPosition: number | null;
  readonly maintenanceMarginBps: number;
  readonly liquidationPenaltyBps: number;
}

export const HARD_GATE_CODES = [
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
] as const;
export type HardGateCode = (typeof HARD_GATE_CODES)[number];

export interface HardGateResult {
  readonly code: HardGateCode;
  /** Tri-state result. UNKNOWN is neither a pass nor a proven failure. */
  readonly state: GateState;
  /** Compatibility projection; true only when state is PASS. */
  readonly passed: boolean;
  readonly hard: true;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
}

export interface RiskReason {
  readonly code: string;
  readonly message: string;
  readonly hardGate: boolean;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
}

export interface RiskAssessment {
  readonly token: TokenIdentity;
  readonly lifecycle: LifecycleSnapshot;
  readonly integrityStatus: IntegrityStatus;
  /** 0.3.0 core-safety projection. Legacy assessments retain integrityStatus semantics. */
  readonly coreIntegrityStatus: CoreIntegrityStatus;
  readonly surveillanceStatus: SurveillanceStatus;
  readonly evidenceCoverage: EvidenceCoverage;
  readonly derivativesStatus: DerivativesStatus;
  readonly hardGates: readonly HardGateResult[];
  readonly riskMetrics: {
    readonly authorities: AuthorityState;
    readonly liquidity: LiquidityState;
    readonly holders: HolderConcentration;
    readonly deployer: DeployerRisk;
    readonly activity: ActivityQualityMetrics;
    readonly oracle: OracleMetrics;
    readonly derivatives: DerivativesCapacityMetrics;
  };
  readonly rejectionReasons: readonly RiskReason[];
  readonly unknownReasons: readonly RiskReason[];
  readonly warnings: readonly RiskReason[];
  readonly recommendedMaxLeverage: number | null;
  readonly recommendedMaxOI: number | null;
  readonly recommendedMaxPosition: number | null;
  readonly assessedAt: string;
  readonly ruleVersion: string;
}

export interface MarketObservation {
  readonly token: TokenIdentity;
  readonly lifecycle: LifecycleSnapshot;
  readonly authorities: AuthorityState;
  readonly liquidity: LiquidityState;
  readonly holders: HolderConcentration;
  readonly deployer: DeployerRisk;
  readonly activity: ActivityQualityMetrics;
  readonly oracle: OracleMetrics;
  readonly derivatives: DerivativesCapacityMetrics;
}

export interface MarketHistoryPoint {
  readonly observedAt: string;
  readonly openUsd: number;
  readonly highUsd: number;
  readonly lowUsd: number;
  readonly closeUsd: number;
  readonly volumeUsd: number | null;
  readonly reserveUsd: number | null;
  readonly provider: string;
  readonly poolAddress: string;
  readonly timeframe: string;
}

export interface MarketIntelligenceRecord extends MarketObservation {
  readonly marketId: Hex;
  readonly evidenceRoot: EvidenceRoot;
  readonly evidenceSchemaVersion: string;
  readonly evidence: readonly EvidenceRecord[];
  readonly assessmentPosition: AssessmentPosition;
  readonly providerAvailability: readonly ProviderAvailability[];
  readonly history: readonly MarketHistoryPoint[];
  readonly dataQuality: {
    readonly status: "SUFFICIENT" | "PARTIAL" | "INSUFFICIENT";
    readonly reconciliationStatus:
      "CONSISTENT" | "MINOR_DIVERGENCE" | "MATERIAL_DIVERGENCE" | "STALE" | "UNAVAILABLE";
    readonly disagreements: readonly DataDisagreement[];
  };
}
