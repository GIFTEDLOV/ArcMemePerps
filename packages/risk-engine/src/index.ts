import type {
  ActivityQualityMetrics,
  DerivativesCapacityMetrics,
  DerivativesStatus,
  GateState,
  HardGateCode,
  HardGateResult,
  IntegrityStatus,
  MarketObservation,
  RiskAssessment,
  RiskParameters,
  RiskReason,
} from "@arcmemeperps/domain";

export const RISK_RULE_VERSION = "0.1.0";
export const AUDITED_RISK_RULE_VERSION = "0.2.0";

export * from "./activity.js";
export * from "./economics.js";
export * from "./capacity.js";
export * from "./manipulation.js";
export * from "./calibration.js";
export * from "./policies.js";

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

/**
 * Audited semantics keep the same numeric development defaults for the first
 * calibration run. The version changes because missing/conflicted evidence is
 * now represented as UNKNOWN rather than an explicit unsafe result.
 */
export const AUDITED_RISK_RULES: RiskRuleConfig = {
  ...DEVELOPMENT_RISK_RULES,
  version: AUDITED_RISK_RULE_VERSION,
};

export type RiskEvaluationMode = "LEGACY" | "AUDITED";

export interface RiskEvaluationOptions {
  readonly assessedAt: string;
  readonly rules?: RiskRuleConfig;
  readonly mode?: RiskEvaluationMode;
}

export interface IntegrityEvaluation {
  readonly status: IntegrityStatus;
  readonly hardGates: readonly HardGateResult[];
  readonly rejectionReasons: readonly RiskReason[];
  readonly unknownReasons: readonly RiskReason[];
  readonly warnings: readonly RiskReason[];
}

export interface DerivativesEvaluation {
  readonly status: DerivativesStatus;
  readonly metrics: DerivativesCapacityMetrics;
  readonly parameters: RiskParameters;
  readonly rejectionReasons: readonly RiskReason[];
  readonly unknownReasons: readonly RiskReason[];
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
  state: GateState,
  details: Readonly<Record<string, string | number | boolean | null>>,
): HardGateResult => ({ code, state, passed: state === "PASS", hard: true, details });

const legacyGateState = (state: GateState): GateState => (state === "UNKNOWN" ? "FAIL" : state);

const booleanGate = (value: boolean | null): GateState =>
  value === null ? "UNKNOWN" : value ? "FAIL" : "PASS";

const andGate = (...values: readonly (boolean | null)[]): GateState => {
  if (values.some((value) => value === true)) return "FAIL";
  if (values.some((value) => value === null)) return "UNKNOWN";
  return "PASS";
};

const thresholdAtMost = (value: number | null, maximum: number): GateState =>
  value === null ? "UNKNOWN" : value <= maximum ? "PASS" : "FAIL";

const thresholdAtLeast = (value: number | null, minimum: number): GateState =>
  value === null ? "UNKNOWN" : value >= minimum ? "PASS" : "FAIL";

const completenessGate = (values: readonly unknown[]): GateState =>
  values.every((value) => value !== null && value !== undefined) ? "PASS" : "UNKNOWN";

export function evaluateIntegrity(
  observation: MarketObservation,
  rules: RiskRuleConfig = DEVELOPMENT_RISK_RULES,
  assessedAt: string,
  mode: RiskEvaluationMode = rules.version === AUDITED_RISK_RULE_VERSION ? "AUDITED" : "LEGACY",
): IntegrityEvaluation {
  const { authorities, liquidity, holders, deployer, activity } = observation;
  const normalize = (state: GateState): GateState =>
    mode === "AUDITED" ? state : legacyGateState(state);
  const hardGates: HardGateResult[] = [
    gate("MINT_AUTHORITY_ACTIVE", normalize(booleanGate(authorities.mintAuthorityActive)), {
      active: authorities.mintAuthorityActive,
    }),
    gate("FREEZE_AUTHORITY_ACTIVE", normalize(booleanGate(authorities.freezeAuthorityActive)), {
      active: authorities.freezeAuthorityActive,
    }),
    gate("DANGEROUS_OWNER_ADMIN_PRIVILEGE", normalize(booleanGate(authorities.dangerousOwnerAdminPrivileges)), {
      active: authorities.dangerousOwnerAdminPrivileges,
    }),
    gate("UPGRADEABILITY_RISK", normalize(booleanGate(authorities.upgradeable)), {
      upgradeable: authorities.upgradeable,
      upgradeAuthority: authorities.upgradeAuthority,
    }),
    gate(
      "HONEYPOT_OR_TRANSFER_RESTRICTION",
      normalize(andGate(authorities.honeypotDetected, authorities.transferRestricted)),
      {
        honeypotDetected: authorities.honeypotDetected,
        transferRestricted: authorities.transferRestricted,
      },
    ),
    gate("LIQUIDITY_WITHDRAWABLE", normalize(lpControlGate(liquidity.lpLockStatus)), {
      lpLockStatus: liquidity.lpLockStatus,
    }),
    gate("LP_UNLOCK_TOO_SOON", normalize(lpUnlockGate(liquidity.lpLockStatus, liquidity.earliestLpUnlockAt, assessedAt, rules)), {
      earliestLpUnlockAt: liquidity.earliestLpUnlockAt,
      minimumLpLockDays: rules.minimumLpLockDays,
    }),
    gate("DEPLOYER_CONCENTRATION", normalize(thresholdAtMost(deployer.deployerHoldingsPct, rules.maxDeployerHoldingsPct)), {
      deployerHoldingsPct: deployer.deployerHoldingsPct,
      maxDeployerHoldingsPct: rules.maxDeployerHoldingsPct,
    }),
    gate("INDIVIDUAL_HOLDER_CONCENTRATION", normalize(thresholdAtMost(holders.topHolderPct, rules.maxIndividualHolderPct)), {
      topHolderPct: holders.topHolderPct,
      maxIndividualHolderPct: rules.maxIndividualHolderPct,
    }),
    gate(
      "CONNECTED_CLUSTER_CONCENTRATION",
      normalize(thresholdAtMost(holders.connectedClusterPct, rules.maxConnectedClusterPct)),
      {
        connectedClusterPct: holders.connectedClusterPct,
        maxConnectedClusterPct: rules.maxConnectedClusterPct,
      },
    ),
    gate("BUNDLED_LAUNCH_CONCENTRATION", normalize(thresholdAtMost(holders.bundledLaunchPct, rules.maxBundledLaunchPct)), {
      bundledLaunchPct: holders.bundledLaunchPct,
      maxBundledLaunchPct: rules.maxBundledLaunchPct,
    }),
    gate("KNOWN_RISK_DEPLOYER", normalize(booleanGate(deployer.knownRisk)), {
      knownRisk: deployer.knownRisk,
      priorRugCount: deployer.priorRugCount,
    }),
    gate("RELATED_WALLET_FUNDING", normalize(booleanGate(deployer.relatedWalletFundingDetected)), {
      detected: deployer.relatedWalletFundingDetected,
    }),
    gate("SUSPICIOUS_EARLY_BUYERS", normalize(booleanGate(activity.suspiciousEarlyBuyers)), {
      detected: activity.suspiciousEarlyBuyers,
    }),
    gate("WASH_TRADING", normalize(booleanGate(activity.washTradingDetected)), {
      detected: activity.washTradingDetected,
    }),
    gate("VOLUME_FARMING", normalize(booleanGate(activity.volumeFarmingDetected)), {
      detected: activity.volumeFarmingDetected,
    }),
    gate("SUSPICIOUS_TRANSACTION_REPETITION", normalize(booleanGate(activity.suspiciousTransactionRepetition)), {
      detected: activity.suspiciousTransactionRepetition,
    }),
    gate(
      "INSUFFICIENT_EVIDENCE",
      normalize(completenessGate([
        liquidity.lpLockStatus === "UNKNOWN" || liquidity.lpLockStatus === "UNAVAILABLE" ? null : liquidity.lpLockStatus,
        holders.holderCount,
        holders.topHolderPct,
        holders.topFivePct,
        holders.connectedClusterPct,
        holders.bundledLaunchPct,
        holders.organicHolderGrowthPct24h,
        liquidity.totalLiquidityUsd,
        liquidity.venueCount,
        liquidity.lpOwnershipConcentrationPct,
        liquidity.suddenCollapsePct24h,
        deployer.deployerAddress,
        deployer.deployerHoldingsPct,
        deployer.priorRugCount,
        authorities.mintAuthorityActive,
        authorities.freezeAuthorityActive,
        authorities.dangerousOwnerAdminPrivileges,
        authorities.upgradeable,
        authorities.transferRestricted,
        authorities.honeypotDetected,
        deployer.knownRisk,
        deployer.relatedWalletFundingDetected,
        activity.suspiciousEarlyBuyers,
        activity.washTradingDetected,
        activity.volumeFarmingDetected,
        activity.suspiciousTransactionRepetition,
      ])),
      {
        lpLockStatus: liquidity.lpLockStatus,
        authorityEvidenceComplete:
          authorities.mintAuthorityActive !== null && authorities.freezeAuthorityActive !== null,
      },
    ),
  ];

  const failed = hardGates.filter((item) => item.state === "FAIL");
  const unknown = hardGates.filter((item) => item.state === "UNKNOWN");
  const rejectionReasons = failed.map((item) =>
    reason(item.code, `hard gate failed: ${item.code}`, true, item.details),
  );
  const unknownReasons = unknown.map((item) =>
    reason(item.code, `required evidence is unknown: ${item.code}`, true, item.details),
  );
  const warnings: RiskReason[] = [];
  if (
    liquidity.suddenCollapsePct24h !== null &&
    liquidity.suddenCollapsePct24h >= rules.warningLiquidityCollapsePct24h
  ) {
    warnings.push(
      reason("LIQUIDITY_COLLAPSE", "liquidity has deteriorated rapidly", false, {
        suddenCollapsePct24h: liquidity.suddenCollapsePct24h,
      }),
    );
  }
  if (holders.organicHolderGrowthPct24h !== null && holders.organicHolderGrowthPct24h < 0) {
    warnings.push(
      reason("NEGATIVE_ORGANIC_HOLDER_GROWTH", "organic holder count is shrinking", false, {
        organicHolderGrowthPct24h: holders.organicHolderGrowthPct24h,
      }),
    );
  }

  return {
    status: failed.length > 0 ? "REJECTED" : unknown.length > 0 ? "PENDING" : warnings.length > 0 ? "WATCH" : "QUALIFIED",
    hardGates,
    rejectionReasons,
    unknownReasons,
    warnings,
  };
}

export function evaluateDerivativesCapacity(
  observation: MarketObservation,
  integrity: IntegrityEvaluation,
  rules: RiskRuleConfig = DEVELOPMENT_RISK_RULES,
  mode: RiskEvaluationMode = rules.version === AUDITED_RISK_RULE_VERSION ? "AUDITED" : "LEGACY",
): DerivativesEvaluation {
  const { liquidity, activity, oracle, derivatives } = observation;
  const safeOpenInterestInputs = [
    derivatives.maximumSafeOpenInterestUsd,
    liquidity.depth1PctUsd,
    activity.organicVolume24hUsd,
    oracle.manipulationCostUsd,
    derivatives.liquidationCapacityUsd,
  ];
  const safeOpenInterest = minKnown(safeOpenInterestInputs, [1, 2, 0.5, 0.25, 0.8]);
  const safePosition =
    derivatives.maximumPositionSizeUsd === null ||
    liquidity.depth1PctUsd === null ||
    safeOpenInterest === null
      ? null
      : clampNonNegative(
          Math.min(
            derivatives.maximumPositionSizeUsd,
            liquidity.depth1PctUsd * 0.25,
            safeOpenInterest * 0.25,
          ),
        );
  const volatilityLeverage =
    derivatives.realizedVolatilityPct === null
      ? null
      : derivatives.realizedVolatilityPct <= 0
        ? 1
        : Math.max(1, 100 / derivatives.realizedVolatilityPct);
  const recommendedMaxLeverage =
    derivatives.maximumLeverage === null || volatilityLeverage === null
      ? null
      : roundDown(Math.min(derivatives.maximumLeverage, rules.maximumLeverage, volatilityLeverage), 2);
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
  const unknownReasons: RiskReason[] = [];
  const warnings: RiskReason[] = [];
  const checks: readonly [
    string,
    GateState,
    string,
    Record<string, string | number | boolean | null>,
  ][] = [
    [
      "INSUFFICIENT_SPOT_LIQUIDITY",
      mode === "AUDITED" ? thresholdAtLeast(liquidity.totalLiquidityUsd, rules.minimumSpotLiquidityUsd) : (atLeast(liquidity.totalLiquidityUsd, rules.minimumSpotLiquidityUsd) ? "PASS" : "FAIL"),
      "spot liquidity is below development minimum",
      { actual: liquidity.totalLiquidityUsd, minimum: rules.minimumSpotLiquidityUsd },
    ],
    [
      "INSUFFICIENT_DEPTH_1_PERCENT",
      mode === "AUDITED" ? thresholdAtLeast(liquidity.depth1PctUsd, rules.minimumDepth1PctUsd) : (atLeast(liquidity.depth1PctUsd, rules.minimumDepth1PctUsd) ? "PASS" : "FAIL"),
      "1% market depth is below development minimum",
      { actual: liquidity.depth1PctUsd, minimum: rules.minimumDepth1PctUsd },
    ],
    [
      "INSUFFICIENT_DEPTH_2_PERCENT",
      mode === "AUDITED" ? thresholdAtLeast(liquidity.depth2PctUsd, rules.minimumDepth2PctUsd) : (atLeast(liquidity.depth2PctUsd, rules.minimumDepth2PctUsd) ? "PASS" : "FAIL"),
      "2% market depth is below development minimum",
      { actual: liquidity.depth2PctUsd, minimum: rules.minimumDepth2PctUsd },
    ],
    [
      "INSUFFICIENT_ORGANIC_VOLUME",
      mode === "AUDITED" ? thresholdAtLeast(activity.organicVolume24hUsd, rules.minimumOrganicVolume24hUsd) : (atLeast(activity.organicVolume24hUsd, rules.minimumOrganicVolume24hUsd) ? "PASS" : "FAIL"),
      "organic volume is below development minimum",
      { actual: activity.organicVolume24hUsd, minimum: rules.minimumOrganicVolume24hUsd },
    ],
    [
      "EXCESSIVE_REALIZED_VOLATILITY",
      mode === "AUDITED" ? thresholdAtMost(derivatives.realizedVolatilityPct, rules.maximumRealizedVolatilityPct) : (atMost(derivatives.realizedVolatilityPct, rules.maximumRealizedVolatilityPct) ? "PASS" : "FAIL"),
      "realized volatility exceeds development maximum",
      { actual: derivatives.realizedVolatilityPct, maximum: rules.maximumRealizedVolatilityPct },
    ],
    [
      "INSUFFICIENT_ORACLE_SOURCES",
      mode === "AUDITED" ? thresholdAtLeast(oracle.sourceCount, rules.minimumOracleSources) : (atLeast(oracle.sourceCount, rules.minimumOracleSources) ? "PASS" : "FAIL"),
      "oracle source count is below development minimum",
      { actual: oracle.sourceCount, minimum: rules.minimumOracleSources },
    ],
    [
      "ORACLE_DISAGREEMENT",
      mode === "AUDITED" ? thresholdAtMost(oracle.disagreementPct, rules.maximumOracleDisagreementPct) : (atMost(oracle.disagreementPct, rules.maximumOracleDisagreementPct) ? "PASS" : "FAIL"),
      "oracle disagreement exceeds development maximum",
      { actual: oracle.disagreementPct, maximum: rules.maximumOracleDisagreementPct },
    ],
    [
      "LOW_ORACLE_CONFIDENCE",
      mode === "AUDITED" ? thresholdAtLeast(oracle.confidenceBps, rules.minimumOracleConfidenceBps) : (atLeast(oracle.confidenceBps, rules.minimumOracleConfidenceBps) ? "PASS" : "FAIL"),
      "oracle confidence is below development minimum",
      { actual: oracle.confidenceBps, minimum: rules.minimumOracleConfidenceBps },
    ],
    [
      "INSUFFICIENT_MANIPULATION_RESISTANCE",
      mode === "AUDITED" ? thresholdAtLeast(oracle.manipulationCostUsd, rules.minimumManipulationCostUsd) : (atLeast(oracle.manipulationCostUsd, rules.minimumManipulationCostUsd) ? "PASS" : "FAIL"),
      "estimated manipulation cost is too low",
      { actual: oracle.manipulationCostUsd, minimum: rules.minimumManipulationCostUsd },
    ],
    [
      "INSUFFICIENT_LIQUIDATION_CAPACITY",
      mode === "AUDITED" ? thresholdAtLeast(derivatives.liquidationCapacityUsd, rules.minimumLiquidationCapacityUsd) : (atLeast(derivatives.liquidationCapacityUsd, rules.minimumLiquidationCapacityUsd) ? "PASS" : "FAIL"),
      "liquidation capacity is below development minimum",
      { actual: derivatives.liquidationCapacityUsd, minimum: rules.minimumLiquidationCapacityUsd },
    ],
    [
      "INSUFFICIENT_SAFE_OPEN_INTEREST",
      mode === "AUDITED" ? thresholdAtLeast(safeOpenInterest, rules.minimumSafeOpenInterestUsd) : (atLeast(safeOpenInterest, rules.minimumSafeOpenInterestUsd) ? "PASS" : "FAIL"),
      "safe open interest is below development minimum",
      { actual: safeOpenInterest, minimum: rules.minimumSafeOpenInterestUsd },
    ],
  ];
  for (const [code, state, message, details] of checks) {
    if (state === "FAIL") {
      warnings.push(reason(code, message, false, details));
    } else if (state === "UNKNOWN") {
      unknownReasons.push(reason(code, `required capacity evidence is unknown: ${code}`, false, details));
    }
  }
  if (oracle.stale === true) {
    rejectionReasons.push(reason("STALE_ORACLE", "oracle data is stale", false, { stale: true }));
  } else if (oracle.stale === null) {
    const freshnessReason =
      reason("ORACLE_FRESHNESS_UNAVAILABLE", "oracle freshness was not observed", false, {
        stale: null,
      });
    if (mode === "AUDITED") unknownReasons.push(freshnessReason);
    else rejectionReasons.push(freshnessReason);
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
  } else if (integrity.status === "PENDING") {
    unknownReasons.push(
      reason("INTEGRITY_EVIDENCE_PENDING", "derivatives cannot qualify before integrity evidence is complete", false, {
        integrityStatus: integrity.status,
      }),
    );
  }
  if (safeOpenInterest === null && mode === "AUDITED") {
    unknownReasons.push(reason("SAFE_OPEN_INTEREST_UNAVAILABLE", "safe open interest could not be derived", false, {}));
  }
  if (rejectionReasons.length > 0 || safeOpenInterest === null || safeOpenInterest <= 0 || (mode === "AUDITED" && unknownReasons.length > 0)) {
    return {
      status: mode === "AUDITED" && rejectionReasons.length === 0 && unknownReasons.length > 0 ? "UNASSESSED" : "BLOCKED",
      metrics,
      parameters: parameters(metrics),
      rejectionReasons,
      unknownReasons,
      warnings,
    };
  }
  if (warnings.length > 0) {
    return {
      status: "WATCH",
      metrics,
      parameters: parameters(metrics),
      rejectionReasons,
      unknownReasons,
      warnings,
    };
  }
  return {
    status: "ELIGIBLE",
    metrics,
    parameters: parameters(metrics),
    rejectionReasons,
    unknownReasons,
    warnings,
  };
}

export function assessRisk(
  observation: MarketObservation,
  options: RiskEvaluationOptions,
): RiskAssessment {
  const rules = options.rules ?? DEVELOPMENT_RISK_RULES;
  const mode = options.mode ?? (rules.version === AUDITED_RISK_RULE_VERSION ? "AUDITED" : "LEGACY");
  const integrity = evaluateIntegrity(observation, rules, options.assessedAt, mode);
  const derivatives = evaluateDerivativesCapacity(observation, integrity, rules, mode);
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
    unknownReasons: [...integrity.unknownReasons, ...derivatives.unknownReasons],
    warnings: [...integrity.warnings, ...derivatives.warnings],
    recommendedMaxLeverage: derivatives.parameters.recommendedMaxLeverage,
    recommendedMaxOI: derivatives.parameters.recommendedMaxOI,
    recommendedMaxPosition: derivatives.parameters.recommendedMaxPosition,
    assessedAt: options.assessedAt,
    ruleVersion: rules.version,
  };
}

function lpControlGate(status: MarketObservation["liquidity"]["lpLockStatus"]): GateState {
  if (status === "WITHDRAWABLE" || status === "WITHDRAWABLE_BY_PRIVILEGED_ACTOR") return "FAIL";
  if (
    status === "LOCKED" ||
    status === "TIME_LOCKED" ||
    status === "BURNED" ||
    status === "PROTOCOL_CONTROLLED" ||
    status === "IMMUTABLE_MIGRATION_CONTROL" ||
    status === "DISTRIBUTED_NON_PRIVILEGED"
  ) return "PASS";
  return "UNKNOWN";
}

function lpUnlockGate(
  status: MarketObservation["liquidity"]["lpLockStatus"],
  unlockAt: string | null,
  assessedAt: string,
  rules: RiskRuleConfig,
): GateState {
  if (status === "WITHDRAWABLE" || status === "WITHDRAWABLE_BY_PRIVILEGED_ACTOR") return "FAIL";
  if (status === "BURNED" || status === "PROTOCOL_CONTROLLED" || status === "IMMUTABLE_MIGRATION_CONTROL" || status === "DISTRIBUTED_NON_PRIVILEGED") return "PASS";
  if (unlockAt === null) return "UNKNOWN";
  const unlock = Date.parse(unlockAt);
  const assessed = Date.parse(assessedAt);
  if (!Number.isFinite(unlock) || !Number.isFinite(assessed)) return "UNKNOWN";
  return unlock - assessed >= rules.minimumLpLockDays * 86_400_000 ? "PASS" : "FAIL";
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

function atLeast(value: number | null, minimum: number): boolean {
  return value !== null && value >= minimum;
}

function atMost(value: number | null, maximum: number): boolean {
  return value !== null && value <= maximum;
}

function minKnown(values: readonly (number | null)[], multipliers: readonly number[]): number | null {
  if (values.some((value) => value === null)) return null;
  const numbers = values as readonly number[];
  return clampNonNegative(Math.min(...numbers.map((value, index) => value * multipliers[index]!)));
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
