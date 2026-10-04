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
  readonly dangerousOwnerAdminPrivileges: boolean | null;
  readonly upgradeable: boolean | null;
  readonly upgradeAuthority: string | null;
  readonly transferRestricted: boolean | null;
  readonly honeypotDetected: boolean | null;
}

export type LpLockStatus = "LOCKED" | "BURNED" | "PROTOCOL_CONTROLLED" | "WITHDRAWABLE" | "UNKNOWN";

export interface LiquidityState {
  readonly totalLiquidityUsd: number;
  readonly depth1PctUsd: number | null;
  readonly depth2PctUsd: number | null;
  readonly venueCount: number;
  readonly lpOwnershipConcentrationPct: number;
  readonly lpLockStatus: LpLockStatus;
  readonly earliestLpUnlockAt: string | null;
  readonly liquidityVenues: readonly string[];
  readonly suddenCollapsePct24h: number;
}

export interface HolderConcentration {
  readonly topHolderPct: number;
  readonly topFivePct: number;
  readonly connectedClusterPct: number;
  readonly bundledLaunchPct: number;
  readonly individualWalletsUnderFivePct: boolean;
  readonly holderCount: number;
  readonly organicHolderGrowthPct24h: number;
}

export interface DeployerRisk {
  readonly deployerAddress: string | null;
  readonly deployerHoldingsPct: number;
  readonly knownRisk: boolean | null;
  readonly priorRugCount: number;
  readonly relatedWalletFundingDetected: boolean | null;
  readonly walletRotationDetected: boolean | null;
}

export interface ActivityQualityMetrics {
  readonly organicVolume24hUsd: number;
  readonly realizedVolatility30dPct: number;
  readonly washTradingDetected: boolean | null;
  readonly volumeFarmingDetected: boolean | null;
  readonly suspiciousEarlyBuyers: boolean | null;
  readonly suspiciousTransactionRepetition: boolean | null;
  readonly bundledLaunchDetected: boolean | null;
  readonly fundingSourceDiversity: number;
}

export interface OracleMetrics {
  readonly sourceCount: number;
  readonly disagreementPct: number;
  readonly confidenceBps: number;
  readonly stale: boolean | null;
  readonly priceUsd: number;
  readonly observedAt: string;
  readonly manipulationCostUsd: number;
}

export interface DerivativesCapacityMetrics {
  readonly spotLiquidityUsd: number;
  readonly liquidityVenueCount: number;
  readonly depth1PctUsd: number | null;
  readonly depth2PctUsd: number | null;
  readonly organicVolume24hUsd: number;
  readonly realizedVolatilityPct: number;
  readonly oracleSourceCount: number;
  readonly oracleDisagreementPct: number;
  readonly oracleConfidenceBps: number;
  readonly manipulationCostUsd: number;
  readonly maximumSafeOpenInterestUsd: number;
  readonly maximumPositionSizeUsd: number;
  readonly maximumLeverage: number;
  readonly fundingImbalancePct: number;
  readonly liquidationCapacityUsd: number;
}

export interface RiskParameters {
  readonly recommendedMaxLeverage: number;
  readonly recommendedMaxOI: number;
  readonly recommendedMaxPosition: number;
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
  readonly warnings: readonly RiskReason[];
  readonly recommendedMaxLeverage: number;
  readonly recommendedMaxOI: number;
  readonly recommendedMaxPosition: number;
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

export interface MarketIntelligenceRecord extends MarketObservation {
  readonly marketId: Hex;
  readonly evidenceRoot: EvidenceRoot;
  readonly evidenceSchemaVersion: string;
  readonly evidence: readonly EvidenceRecord[];
  readonly assessmentPosition: AssessmentPosition;
  readonly providerAvailability: readonly ProviderAvailability[];
  readonly dataQuality: {
    readonly status: "SUFFICIENT" | "PARTIAL" | "INSUFFICIENT";
    readonly reconciliationStatus:
      "CONSISTENT" | "MINOR_DIVERGENCE" | "MATERIAL_DIVERGENCE" | "STALE" | "UNAVAILABLE";
    readonly disagreements: readonly DataDisagreement[];
  };
}
