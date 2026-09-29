import type {
  AuthorityState,
  DerivativesStatus,
  HolderConcentration,
  IntegrityStatus,
  LifecycleStatus,
  LiquidityState,
  MarketObservation,
  RiskAssessment,
} from "@arcmemeperps/domain";
import { canonicalJson, keccak256Hex, type Hex, type CanonicalValue } from "@arcmemeperps/shared";

export interface QualificationProof {
  readonly schemaVersion: "1";
  readonly chain: MarketObservation["token"]["chain"];
  readonly tokenAddress: string;
  readonly lifecycle: LifecycleStatus;
  readonly evidenceHashes: Readonly<Record<string, Hex>>;
  readonly liquidityMetrics: LiquidityState;
  readonly authorityState: AuthorityState;
  readonly holderConcentration: HolderConcentration;
  readonly connectedClusterConcentration: number;
  readonly bundleConcentration: number;
  readonly deployerRisk: RiskAssessment["riskMetrics"]["deployer"];
  readonly activityQualityMetrics: RiskAssessment["riskMetrics"]["activity"];
  readonly oracleMetrics: RiskAssessment["riskMetrics"]["oracle"];
  readonly manipulationCostEstimate: number;
  readonly finalStatuses: {
    readonly integrity: IntegrityStatus;
    readonly derivatives: DerivativesStatus;
  };
  readonly riskParameters: {
    readonly recommendedMaxLeverage: number;
    readonly recommendedMaxOI: number;
    readonly recommendedMaxPosition: number;
  };
  readonly ruleVersion: string;
  readonly assessedAt: string;
}

export function qualificationProofFromAssessment(
  assessment: RiskAssessment,
  evidenceHashes: Readonly<Record<string, Hex>>,
): QualificationProof {
  return {
    schemaVersion: "1",
    chain: assessment.token.chain,
    tokenAddress: assessment.token.tokenAddress,
    lifecycle: assessment.lifecycle.status,
    evidenceHashes,
    liquidityMetrics: assessment.riskMetrics.liquidity,
    authorityState: assessment.riskMetrics.authorities,
    holderConcentration: assessment.riskMetrics.holders,
    connectedClusterConcentration: assessment.riskMetrics.holders.connectedClusterPct,
    bundleConcentration: assessment.riskMetrics.holders.bundledLaunchPct,
    deployerRisk: assessment.riskMetrics.deployer,
    activityQualityMetrics: assessment.riskMetrics.activity,
    oracleMetrics: assessment.riskMetrics.oracle,
    manipulationCostEstimate: assessment.riskMetrics.oracle.manipulationCostUsd,
    finalStatuses: {
      integrity: assessment.integrityStatus,
      derivatives: assessment.derivativesStatus,
    },
    riskParameters: {
      recommendedMaxLeverage: assessment.recommendedMaxLeverage,
      recommendedMaxOI: assessment.recommendedMaxOI,
      recommendedMaxPosition: assessment.recommendedMaxPosition,
    },
    ruleVersion: assessment.ruleVersion,
    assessedAt: assessment.assessedAt,
  };
}

export function canonicalQualificationProof(proof: QualificationProof): string {
  return canonicalJson(proof as unknown as CanonicalValue);
}

export function qualificationProofHash(proof: QualificationProof): Hex {
  return keccak256Hex(canonicalQualificationProof(proof));
}
