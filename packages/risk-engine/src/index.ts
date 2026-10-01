import type {
  ActivityQualityMetrics,
  DerivativesCapacityMetrics,
  DerivativesStatus,
  HardGateCode,
  HardGateResult,
  IntegrityStatus,
  MarketObservation,
  RiskAssessment,
  RiskParameters,
  RiskReason,
} from "@arcmemeperps/domain";

export const RISK_RULE_VERSION = "0.1.0";

export * from "./activity.js";
export * from "./economics.js";
export * from "./capacity.js";
export * from "./manipulation.js";
export * from "./calibration.js";

/**
 * Development defaults only. Thresholds are intentionally explicit and versioned so that
 * empirical calibration can change a ruleset without changing historical assessments.
 */
export interface RiskRuleConfig {
  readonly version: string;
  readonly maxIndividualHolderPct: number;
  readonly maxConnectedClusterPct: number;
  readonly maxBundledLaunchPct: number;
  readonly maxDeployerHoldingsPct: number;
  readonly minimumLpLockDays: number;
  readonly warningLiquidityCollapsePct24h: number;
  readonly minimumSpotLiquidityUsd: number;
  readonly minimumDepth1PctUsd: number;
  readonly minimumDepth2PctUsd: number;
  readonly minimumOrganicVolume24hUsd: number;
  readonly maximumRealizedVolatilityPct: number;
  readonly minimumOracleSources: number;
  readonly maximumOracleDisagreementPct: number;
  readonly minimumOracleConfidenceBps: number;
  readonly minimumManipulationCostUsd: number;
  readonly minimumLiquidationCapacityUsd: number;
  readonly maximumLeverage: number;
  readonly minimumSafeOpenInterestUsd: number;
}

export const DEVELOPMENT_RISK_RULES: RiskRuleConfig = {
  version: RISK_RULE_VERSION,
  maxIndividualHolderPct: 5,
  maxConnectedClusterPct: 5,
  maxBundledLaunchPct: 10,
  maxDeployerHoldingsPct: 10,
  minimumLpLockDays: 7,
  warningLiquidityCollapsePct24h: 25,
  minimumSpotLiquidityUsd: 500_000,
  minimumDepth1PctUsd: 50_000,
  minimumDepth2PctUsd: 100_000,
  minimumOrganicVolume24hUsd: 100_000,
  maximumRealizedVolatilityPct: 150,
  minimumOracleSources: 2,
  maximumOracleDisagreementPct: 3,
  minimumOracleConfidenceBps: 8_500,
  minimumManipulationCostUsd: 100_000,
  minimumLiquidationCapacityUsd: 100_000,
  maximumLeverage: 5,
  minimumSafeOpenInterestUsd: 25_000,
};

export interface RiskEvaluationOptions {
  readonly assessedAt: string;
  readonly rules?: RiskRuleConfig;
}

export interface IntegrityEvaluation {
  readonly status: IntegrityStatus;
  readonly hardGates: readonly HardGateResult[];
  readonly rejectionReasons: readonly RiskReason[];
  readonly warnings: readonly RiskReason[];
}

export interface DerivativesEvaluation {
  readonly status: DerivativesStatus;
  readonly metrics: DerivativesCapacityMetrics;
  readonly parameters: RiskParameters;
  readonly rejectionReasons: readonly RiskReason[];
  readonly warnings: readonly RiskReason[];
}

const reason = (
  code: string,
  message: string,
  hardGate: boolean,
  details: Readonly<Record<string, string | number | boolean | null>> = {},
): RiskReason => ({ code, message, hardGate, details });

const gate = (
  code: HardGateCode,
  passed: boolean,
  details: Readonly<Record<string, string | number | boolean | null>>,
): HardGateResult => ({ code, passed, hard: true, details });

export function evaluateIntegrity(
  observation: MarketObservation,
  rules: RiskRuleConfig = DEVELOPMENT_RISK_RULES,
  assessedAt: string,
): IntegrityEvaluation {
  const { authorities, liquidity, holders, deployer, activity } = observation;
  const hardGates: HardGateResult[] = [
    gate("MINT_AUTHORITY_ACTIVE", authorities.mintAuthorityActive === false, {
      active: authorities.mintAuthorityActive,
    }),
    gate("FREEZE_AUTHORITY_ACTIVE", authorities.freezeAuthorityActive === false, {
      active: authorities.freezeAuthorityActive,
    }),
    gate("DANGEROUS_OWNER_ADMIN_PRIVILEGE", authorities.dangerousOwnerAdminPrivileges === false, {
      active: authorities.dangerousOwnerAdminPrivileges,
    }),
    gate("UPGRADEABILITY_RISK", authorities.upgradeable === false, {
      upgradeable: authorities.upgradeable,
      upgradeAuthority: authorities.upgradeAuthority,
    }),
    gate(
      "HONEYPOT_OR_TRANSFER_RESTRICTION",
      authorities.honeypotDetected === false && authorities.transferRestricted === false,
      {
        honeypotDetected: authorities.honeypotDetected,
        transferRestricted: authorities.transferRestricted,
      },
    ),
    gate("LIQUIDITY_WITHDRAWABLE", liquidity.lpLockStatus !== "WITHDRAWABLE", {
      lpLockStatus: liquidity.lpLockStatus,
    }),
    gate("LP_UNLOCK_TOO_SOON", lpUnlockIsSafe(liquidity.earliestLpUnlockAt, assessedAt, rules), {
      earliestLpUnlockAt: liquidity.earliestLpUnlockAt,
      minimumLpLockDays: rules.minimumLpLockDays,
    }),
    gate("DEPLOYER_CONCENTRATION", deployer.deployerHoldingsPct <= rules.maxDeployerHoldingsPct, {
      deployerHoldingsPct: deployer.deployerHoldingsPct,
      maxDeployerHoldingsPct: rules.maxDeployerHoldingsPct,
    }),
    gate("INDIVIDUAL_HOLDER_CONCENTRATION", holders.topHolderPct <= rules.maxIndividualHolderPct, {
      topHolderPct: holders.topHolderPct,
      maxIndividualHolderPct: rules.maxIndividualHolderPct,
    }),
    gate(
      "CONNECTED_CLUSTER_CONCENTRATION",
      holders.connectedClusterPct <= rules.maxConnectedClusterPct,
      {
        connectedClusterPct: holders.connectedClusterPct,
        maxConnectedClusterPct: rules.maxConnectedClusterPct,
      },
    ),
    gate("BUNDLED_LAUNCH_CONCENTRATION", holders.bundledLaunchPct <= rules.maxBundledLaunchPct, {
      bundledLaunchPct: holders.bundledLaunchPct,
      maxBundledLaunchPct: rules.maxBundledLaunchPct,
    }),
    gate("KNOWN_RISK_DEPLOYER", deployer.knownRisk === false, {
      knownRisk: deployer.knownRisk,
      priorRugCount: deployer.priorRugCount,
    }),
    gate("RELATED_WALLET_FUNDING", deployer.relatedWalletFundingDetected === false, {
      detected: deployer.relatedWalletFundingDetected,
    }),
    gate("SUSPICIOUS_EARLY_BUYERS", activity.suspiciousEarlyBuyers === false, {
      detected: activity.suspiciousEarlyBuyers,
    }),
    gate("WASH_TRADING", activity.washTradingDetected === false, {
      detected: activity.washTradingDetected,
    }),
    gate("VOLUME_FARMING", activity.volumeFarmingDetected === false, {
      detected: activity.volumeFarmingDetected,
    }),
    gate("SUSPICIOUS_TRANSACTION_REPETITION", activity.suspiciousTransactionRepetition === false, {
      detected: activity.suspiciousTransactionRepetition,
    }),
    gate(
      "INSUFFICIENT_EVIDENCE",
      liquidity.lpLockStatus !== "UNKNOWN" &&
        holders.holderCount > 0 &&
        deployer.deployerAddress !== null &&
        authorities.mintAuthorityActive !== null &&
        authorities.freezeAuthorityActive !== null &&
        authorities.dangerousOwnerAdminPrivileges !== null &&
        authorities.upgradeable !== null &&
        authorities.transferRestricted !== null &&
        authorities.honeypotDetected !== null &&
        deployer.knownRisk !== null &&
        deployer.relatedWalletFundingDetected !== null &&
        activity.suspiciousEarlyBuyers !== null &&
        activity.washTradingDetected !== null &&
        activity.volumeFarmingDetected !== null &&
        activity.suspiciousTransactionRepetition !== null,
      {
        lpLockStatus: liquidity.lpLockStatus,
        authorityEvidenceComplete:
          authorities.mintAuthorityActive !== null && authorities.freezeAuthorityActive !== null,
      },
    ),
  ];

  const failed = hardGates.filter((item) => !item.passed);
  const rejectionReasons = failed.map((item) =>
    reason(item.code, `hard gate failed: ${item.code}`, true, item.details),
  );
  const warnings: RiskReason[] = [];
  if (liquidity.suddenCollapsePct24h >= rules.warningLiquidityCollapsePct24h) {
    warnings.push(
      reason("LIQUIDITY_COLLAPSE", "liquidity has deteriorated rapidly", false, {
        suddenCollapsePct24h: liquidity.suddenCollapsePct24h,
      }),
    );
  }
  if (holders.organicHolderGrowthPct24h < 0) {
    warnings.push(
      reason("NEGATIVE_ORGANIC_HOLDER_GROWTH", "organic holder count is shrinking", false, {
        organicHolderGrowthPct24h: holders.organicHolderGrowthPct24h,
      }),
    );
  }

  return {
    status: failed.length > 0 ? "REJECTED" : warnings.length > 0 ? "WATCH" : "QUALIFIED",
    hardGates,
    rejectionReasons,
    warnings,
  };
}

export function evaluateDerivativesCapacity(
  observation: MarketObservation,
  integrity: IntegrityEvaluation,
  rules: RiskRuleConfig = DEVELOPMENT_RISK_RULES,
): DerivativesEvaluation {
  const { liquidity, activity, oracle, derivatives } = observation;
  const safeOpenInterest = clampNonNegative(
    Math.min(
      derivatives.maximumSafeOpenInterestUsd,
      (liquidity.depth1PctUsd ?? 0) * 2,
      activity.organicVolume24hUsd * 0.5,
      oracle.manipulationCostUsd * 0.25,
      derivatives.liquidationCapacityUsd * 0.8,
    ),
  );
  const safePosition = clampNonNegative(
    Math.min(
      derivatives.maximumPositionSizeUsd,
      (liquidity.depth1PctUsd ?? 0) * 0.25,
      safeOpenInterest * 0.25,
    ),
  );
  const volatilityLeverage =
    derivatives.realizedVolatilityPct <= 0
      ? 1
      : Math.max(1, 100 / derivatives.realizedVolatilityPct);
  const recommendedMaxLeverage = roundDown(
    Math.min(derivatives.maximumLeverage, rules.maximumLeverage, volatilityLeverage),
    2,
  );
  const metrics: DerivativesCapacityMetrics = {
    spotLiquidityUsd: liquidity.totalLiquidityUsd,
    liquidityVenueCount: liquidity.venueCount,
    depth1PctUsd: liquidity.depth1PctUsd,
    depth2PctUsd: liquidity.depth2PctUsd,
    organicVolume24hUsd: activity.organicVolume24hUsd,
    realizedVolatilityPct: derivatives.realizedVolatilityPct,
    oracleSourceCount: oracle.sourceCount,
    oracleDisagreementPct: oracle.disagreementPct,
    oracleConfidenceBps: oracle.confidenceBps,
    manipulationCostUsd: oracle.manipulationCostUsd,
    maximumSafeOpenInterestUsd: safeOpenInterest,
    maximumPositionSizeUsd: safePosition,
    maximumLeverage: recommendedMaxLeverage,
    fundingImbalancePct: derivatives.fundingImbalancePct,
    liquidationCapacityUsd: derivatives.liquidationCapacityUsd,
  };

  const rejectionReasons: RiskReason[] = [];
  const warnings: RiskReason[] = [];
  const checks: readonly [
    string,
    boolean,
    string,
    Record<string, string | number | boolean | null>,
  ][] = [
    [
      "INSUFFICIENT_SPOT_LIQUIDITY",
      liquidity.totalLiquidityUsd >= rules.minimumSpotLiquidityUsd,
      "spot liquidity is below development minimum",
      { actual: liquidity.totalLiquidityUsd, minimum: rules.minimumSpotLiquidityUsd },
    ],
    [
      "INSUFFICIENT_DEPTH_1_PERCENT",
      (liquidity.depth1PctUsd ?? 0) >= rules.minimumDepth1PctUsd,
      "1% market depth is below development minimum",
      { actual: liquidity.depth1PctUsd, minimum: rules.minimumDepth1PctUsd },
    ],
    [
      "INSUFFICIENT_DEPTH_2_PERCENT",
      (liquidity.depth2PctUsd ?? 0) >= rules.minimumDepth2PctUsd,
      "2% market depth is below development minimum",
      { actual: liquidity.depth2PctUsd, minimum: rules.minimumDepth2PctUsd },
    ],
    [
      "INSUFFICIENT_ORGANIC_VOLUME",
      activity.organicVolume24hUsd >= rules.minimumOrganicVolume24hUsd,
      "organic volume is below development minimum",
      { actual: activity.organicVolume24hUsd, minimum: rules.minimumOrganicVolume24hUsd },
    ],
    [
      "EXCESSIVE_REALIZED_VOLATILITY",
      derivatives.realizedVolatilityPct <= rules.maximumRealizedVolatilityPct,
      "realized volatility exceeds development maximum",
      { actual: derivatives.realizedVolatilityPct, maximum: rules.maximumRealizedVolatilityPct },
    ],
    [
      "INSUFFICIENT_ORACLE_SOURCES",
      oracle.sourceCount >= rules.minimumOracleSources,
      "oracle source count is below development minimum",
      { actual: oracle.sourceCount, minimum: rules.minimumOracleSources },
    ],
    [
      "ORACLE_DISAGREEMENT",
      oracle.disagreementPct <= rules.maximumOracleDisagreementPct,
      "oracle disagreement exceeds development maximum",
      { actual: oracle.disagreementPct, maximum: rules.maximumOracleDisagreementPct },
    ],
    [
      "LOW_ORACLE_CONFIDENCE",
      oracle.confidenceBps >= rules.minimumOracleConfidenceBps,
      "oracle confidence is below development minimum",
      { actual: oracle.confidenceBps, minimum: rules.minimumOracleConfidenceBps },
    ],
    [
      "INSUFFICIENT_MANIPULATION_RESISTANCE",
      oracle.manipulationCostUsd >= rules.minimumManipulationCostUsd,
      "estimated manipulation cost is too low",
      { actual: oracle.manipulationCostUsd, minimum: rules.minimumManipulationCostUsd },
    ],
    [
      "INSUFFICIENT_LIQUIDATION_CAPACITY",
      derivatives.liquidationCapacityUsd >= rules.minimumLiquidationCapacityUsd,
      "liquidation capacity is below development minimum",
      { actual: derivatives.liquidationCapacityUsd, minimum: rules.minimumLiquidationCapacityUsd },
    ],
    [
      "INSUFFICIENT_SAFE_OPEN_INTEREST",
      safeOpenInterest >= rules.minimumSafeOpenInterestUsd,
      "safe open interest is below development minimum",
      { actual: safeOpenInterest, minimum: rules.minimumSafeOpenInterestUsd },
    ],
  ];
  for (const [code, passes, message, details] of checks) {
    if (!passes) {
      warnings.push(reason(code, message, false, details));
    }
  }
  if (oracle.stale !== false) {
    rejectionReasons.push(reason("STALE_ORACLE", "oracle data is stale", false, { stale: true }));
  }
  if (integrity.status === "REJECTED") {
    rejectionReasons.push(
      reason(
        "INTEGRITY_NOT_QUALIFIED",
        "derivatives cannot qualify before token integrity qualifies",
        false,
        {
          integrityStatus: integrity.status,
        },
      ),
    );
  }
  if (rejectionReasons.length > 0 || safeOpenInterest <= 0) {
    return {
      status: "BLOCKED",
      metrics,
      parameters: parameters(metrics),
      rejectionReasons,
      warnings,
    };
  }
  if (warnings.length > 0) {
    return {
      status: "WATCH",
      metrics,
      parameters: parameters(metrics),
      rejectionReasons,
      warnings,
    };
  }
  return {
    status: "ELIGIBLE",
    metrics,
    parameters: parameters(metrics),
    rejectionReasons,
    warnings,
  };
}

export function assessRisk(
  observation: MarketObservation,
  options: RiskEvaluationOptions,
): RiskAssessment {
  const rules = options.rules ?? DEVELOPMENT_RISK_RULES;
  const integrity = evaluateIntegrity(observation, rules, options.assessedAt);
  const derivatives = evaluateDerivativesCapacity(observation, integrity, rules);
  return {
    token: observation.token,
    lifecycle: observation.lifecycle,
    integrityStatus: integrity.status,
    derivativesStatus: derivatives.status,
    hardGates: integrity.hardGates,
    riskMetrics: {
      authorities: observation.authorities,
      liquidity: observation.liquidity,
      holders: observation.holders,
      deployer: observation.deployer,
      activity: observation.activity,
      oracle: observation.oracle,
      derivatives: derivatives.metrics,
    },
    rejectionReasons: [...integrity.rejectionReasons, ...derivatives.rejectionReasons],
    warnings: [...integrity.warnings, ...derivatives.warnings],
    recommendedMaxLeverage: derivatives.parameters.recommendedMaxLeverage,
    recommendedMaxOI: derivatives.parameters.recommendedMaxOI,
    recommendedMaxPosition: derivatives.parameters.recommendedMaxPosition,
    assessedAt: options.assessedAt,
    ruleVersion: rules.version,
  };
}

function lpUnlockIsSafe(
  unlockAt: string | null,
  assessedAt: string,
  rules: RiskRuleConfig,
): boolean {
  if (unlockAt === null) {
    return true;
  }
  const unlock = Date.parse(unlockAt);
  const assessed = Date.parse(assessedAt);
  if (!Number.isFinite(unlock) || !Number.isFinite(assessed)) {
    return false;
  }
  return unlock - assessed >= rules.minimumLpLockDays * 86_400_000;
}

function parameters(metrics: DerivativesCapacityMetrics): RiskParameters {
  return {
    recommendedMaxLeverage: metrics.maximumLeverage,
    recommendedMaxOI: metrics.maximumSafeOpenInterestUsd,
    recommendedMaxPosition: metrics.maximumPositionSizeUsd,
    maintenanceMarginBps: 1_000,
    liquidationPenaltyBps: 500,
  };
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function roundDown(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.floor(value * scale) / scale;
}

export function activityQualityIsSuspicious(activity: ActivityQualityMetrics): boolean {
  return (
    activity.washTradingDetected === true ||
    activity.volumeFarmingDetected === true ||
    activity.suspiciousEarlyBuyers === true ||
    activity.suspiciousTransactionRepetition === true
  );
}
