import type {
  ActivityQualityMetrics,
  CoreIntegrityStatus,
  DerivativesCapacityMetrics,
  DerivativesStatus,
  EvidenceCoverage,
  EvidenceCoverageDomain,
  EvidenceCoverageDomainResult,
  EvidenceCoverageStatus,
  GateState,
  HardGateCode,
  HardGateResult,
  IntegrityStatus,
  MarketObservation,
  RiskAssessment,
  RiskParameters,
  RiskReason,
  SurveillanceStatus,
} from "@arcmemeperps/domain";
import { EVIDENCE_COVERAGE_DOMAINS } from "@arcmemeperps/domain";
import {
  gateDisposition,
  policyProfileForObservation,
  RISK_POLICY_PROFILES,
  type RiskPolicyProfile,
  type RiskPolicyProfileId,
} from "./policies.js";

export const RISK_RULE_VERSION = "0.1.0";
export const AUDITED_RISK_RULE_VERSION = "0.2.0";
export const CORE_SAFETY_POLICY_VERSION = "0.3.0";

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

/**
 * Phase 8 policy version. Numeric thresholds are byte-for-byte inherited from
 * the audited 0.2.0 rules; only classification and status projection change.
 */
export const CORE_SAFETY_RISK_RULES: RiskRuleConfig = {
  ...AUDITED_RISK_RULES,
  version: CORE_SAFETY_POLICY_VERSION,
};

export type RiskEvaluationMode = "LEGACY" | "AUDITED" | "CORE_SAFETY_V3";

export interface RiskEvaluationOptions {
  readonly assessedAt: string;
  readonly rules?: RiskRuleConfig;
  readonly mode?: RiskEvaluationMode;
  readonly policyProfile?: RiskPolicyProfileId;
}

function defaultModeForRules(rules: RiskRuleConfig): RiskEvaluationMode {
  if (rules.version === CORE_SAFETY_POLICY_VERSION) return "CORE_SAFETY_V3";
  if (rules.version === AUDITED_RISK_RULE_VERSION) return "AUDITED";
  return "LEGACY";
}

function isTriStateMode(mode: RiskEvaluationMode): boolean {
  return mode !== "LEGACY";
}

export interface IntegrityEvaluation {
  readonly policyProfileId: RiskPolicyProfileId;
  readonly status: IntegrityStatus;
  readonly coreIntegrityStatus?: CoreIntegrityStatus;
  readonly surveillanceStatus?: SurveillanceStatus;
  readonly evidenceCoverage?: EvidenceCoverage;
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

function mandatoryEvidenceState(
  observation: MarketObservation,
  policyProfile: RiskPolicyProfile,
): GateState {
  const required = policyProfile.mandatoryHardGates
    .filter((code) => code !== "INSUFFICIENT_EVIDENCE")
    .map((code) => evidencePresentForGate(observation, code));
  if (observation.token.chain === "SOLANA") {
    required.push(
      observation.token.tokenProgram === "SPL_TOKEN" ||
        observation.token.tokenProgram === "TOKEN_2022",
    );
  }
  return required.every((value) => value === true) ? "PASS" : "UNKNOWN";
}

function evidencePresentForGate(observation: MarketObservation, code: HardGateCode): boolean {
  const { authorities, liquidity, holders, deployer, activity } = observation;
  switch (code) {
    case "MINT_AUTHORITY_ACTIVE":
      return authorities.mintAuthorityActive !== null;
    case "FREEZE_AUTHORITY_ACTIVE":
      return authorities.freezeAuthorityActive !== null;
    case "DANGEROUS_OWNER_ADMIN_PRIVILEGE":
      return authorities.dangerousOwnerAdminPrivileges !== null;
    case "UPGRADEABILITY_RISK":
      return authorities.upgradeable !== null;
    case "HONEYPOT_OR_TRANSFER_RESTRICTION":
      return authorities.honeypotDetected !== null && authorities.transferRestricted !== null;
    case "LIQUIDITY_WITHDRAWABLE":
      return liquidity.lpLockStatus !== "UNKNOWN" && liquidity.lpLockStatus !== "UNAVAILABLE";
    case "LP_UNLOCK_TOO_SOON":
      return (
        [
          "BURNED",
          "PROTOCOL_CONTROLLED",
          "IMMUTABLE_MIGRATION_CONTROL",
          "DISTRIBUTED_NON_PRIVILEGED",
        ].includes(liquidity.lpLockStatus) ||
        (liquidity.lpLockStatus !== "UNKNOWN" &&
          liquidity.lpLockStatus !== "UNAVAILABLE" &&
          liquidity.earliestLpUnlockAt !== null)
      );
    case "DEPLOYER_CONCENTRATION":
      return deployer.deployerHoldingsPct !== null;
    case "INDIVIDUAL_HOLDER_CONCENTRATION":
      return individualOwnerConcentrationPct(holders) !== null;
    case "CONNECTED_CLUSTER_CONCENTRATION":
      return holders.connectedClusterPct !== null;
    case "BUNDLED_LAUNCH_CONCENTRATION":
      return holders.bundledLaunchPct !== null;
    case "KNOWN_RISK_DEPLOYER":
      return deployer.knownRisk !== null;
    case "RELATED_WALLET_FUNDING":
      return deployer.relatedWalletFundingDetected !== null;
    case "SUSPICIOUS_EARLY_BUYERS":
      return activity.suspiciousEarlyBuyers !== null;
    case "WASH_TRADING":
      return activity.washTradingDetected !== null;
    case "VOLUME_FARMING":
      return activity.volumeFarmingDetected !== null;
    case "SUSPICIOUS_TRANSACTION_REPETITION":
      return activity.suspiciousTransactionRepetition !== null;
    case "INSUFFICIENT_EVIDENCE":
      return true;
  }
}

const COVERAGE_GATE_DOMAINS: Readonly<Partial<Record<HardGateCode, EvidenceCoverageDomain>>> = {
  MINT_AUTHORITY_ACTIVE: "authority",
  FREEZE_AUTHORITY_ACTIVE: "authority",
  DANGEROUS_OWNER_ADMIN_PRIVILEGE: "authority",
  UPGRADEABILITY_RISK: "authority",
  HONEYPOT_OR_TRANSFER_RESTRICTION: "transferSafety",
  LIQUIDITY_WITHDRAWABLE: "liquidityControl",
  LP_UNLOCK_TOO_SOON: "liquidityControl",
  DEPLOYER_CONCENTRATION: "creator",
  INDIVIDUAL_HOLDER_CONCENTRATION: "holders",
  CONNECTED_CLUSTER_CONCENTRATION: "clusters",
  BUNDLED_LAUNCH_CONCENTRATION: "history",
  KNOWN_RISK_DEPLOYER: "creator",
  RELATED_WALLET_FUNDING: "funding",
  SUSPICIOUS_EARLY_BUYERS: "history",
  WASH_TRADING: "activity",
  VOLUME_FARMING: "activity",
  SUSPICIOUS_TRANSACTION_REPETITION: "activity",
};

const COVERAGE_LABELS: Readonly<Record<EvidenceCoverageDomain, readonly string[]>> = {
  authority: ["mint authority", "freeze authority", "owner/admin privilege", "upgradeability"],
  transferSafety: ["sellability and transfer restriction behavior"],
  liquidityControl: ["LP withdrawal control", "LP unlock semantics"],
  holders: ["non-system holder concentration"],
  clusters: ["connected holder cluster"],
  creator: ["creator/deployer identity and risk"],
  funding: ["bounded related-wallet funding graph"],
  activity: ["wash/farm/repetition observation window"],
  history: ["launch and market history"],
  depth: ["executable market depth"],
  oracle: ["fresh independent oracle evidence"],
};

function coverageStatus(
  knownFields: readonly string[],
  unknownFields: readonly string[],
): EvidenceCoverageStatus {
  if (unknownFields.length === 0 && knownFields.length > 0) return "COMPLETE";
  if (knownFields.length > 0 && unknownFields.length < knownFields.length) return "PARTIAL";
  return unknownFields.length > 0 ? "WEAK" : "PARTIAL";
}

function domainCoverage(
  domain: EvidenceCoverageDomain,
  states: readonly (GateState | null)[],
  extraKnown: readonly string[] = [],
  extraUnknown: readonly string[] = [],
): EvidenceCoverageDomainResult {
  const knownFields = [
    ...COVERAGE_LABELS[domain].filter(
      (_, index) => states[index] !== undefined && states[index] !== "UNKNOWN",
    ),
    ...extraKnown,
  ];
  const unknownFields = [
    ...COVERAGE_LABELS[domain].filter((_, index) => states[index] === "UNKNOWN"),
    ...extraUnknown,
  ];
  return { status: coverageStatus(knownFields, unknownFields), knownFields, unknownFields };
}

function buildEvidenceCoverage(
  observation: MarketObservation,
  hardGates: readonly HardGateResult[],
  coreGates: readonly HardGateCode[],
  surveillanceGates: readonly HardGateCode[],
): EvidenceCoverage {
  const stateByCode = new Map(hardGates.map((item) => [item.code, item.state]));
  const statesFor = (domain: EvidenceCoverageDomain): GateState[] =>
    Object.entries(COVERAGE_GATE_DOMAINS)
      .filter(([, mapped]) => mapped === domain)
      .map(([code]) => stateByCode.get(code as HardGateCode) ?? "UNKNOWN");
  const domains = {} as Record<EvidenceCoverageDomain, EvidenceCoverageDomainResult>;
  for (const domain of EVIDENCE_COVERAGE_DOMAINS)
    domains[domain] = domainCoverage(domain, statesFor(domain));

  const setDomain = (
    domain: EvidenceCoverageDomain,
    known: readonly string[],
    unknown: readonly string[],
  ): void => {
    domains[domain] = domainCoverage(domain, [], known, unknown);
  };
  setDomain(
    "history",
    observation.activity.realizedVolatility30dPct === null ? [] : ["realized volatility window"],
    observation.activity.realizedVolatility30dPct === null ? ["realized volatility window"] : [],
  );
  setDomain(
    "depth",
    observation.liquidity.depth1PctUsd !== null && observation.liquidity.depth2PctUsd !== null
      ? ["1% and 2% executable depth"]
      : [],
    observation.liquidity.depth1PctUsd === null || observation.liquidity.depth2PctUsd === null
      ? ["1% and 2% executable depth"]
      : [],
  );
  setDomain(
    "oracle",
    observation.oracle.sourceCount !== null &&
      observation.oracle.disagreementPct !== null &&
      observation.oracle.confidenceBps !== null &&
      observation.oracle.stale !== null
      ? ["source count, agreement, confidence, freshness"]
      : [],
    observation.oracle.sourceCount === null ||
      observation.oracle.disagreementPct === null ||
      observation.oracle.confidenceBps === null ||
      observation.oracle.stale === null
      ? ["source count, agreement, confidence, freshness"]
      : [],
  );
  const unknownCoreGates = coreGates.filter((code) => stateByCode.get(code) === "UNKNOWN");
  const unknownSurveillanceGates = surveillanceGates.filter(
    (code) => stateByCode.get(code) === "UNKNOWN",
  );
  const statusValues = Object.values(domains).map((item) => item.status);
  const weakCount = statusValues.filter((status) => status === "WEAK").length;
  const partialCount = statusValues.filter((status) => status === "PARTIAL").length;
  const overall =
    weakCount >= 3
      ? "WEAK"
      : weakCount > 0 || partialCount > 0
        ? "PARTIAL"
        : statusValues.every((status) => status === "COMPLETE")
          ? "COMPLETE"
          : "STRONG";
  return { overall, domains, unknownCoreGates, unknownSurveillanceGates };
}

function surveillanceStatusFor(
  observation: MarketObservation,
  hardGates: readonly HardGateResult[],
  surveillanceGates: readonly HardGateCode[],
  rules: RiskRuleConfig = DEVELOPMENT_RISK_RULES,
): SurveillanceStatus {
  const highRisk =
    observation.deployer.knownRisk === true ||
    observation.deployer.relatedWalletFundingDetected === true ||
    observation.activity.washTradingDetected === true ||
    observation.activity.volumeFarmingDetected === true ||
    observation.activity.suspiciousTransactionRepetition === true;
  if (highRisk) return "HIGH_RISK";
  if (
    surveillanceGates.some((code) =>
      hardGates.some((gate) => gate.code === code && gate.state === "UNKNOWN"),
    )
  )
    return "LIMITED";
  if (
    (observation.liquidity.suddenCollapsePct24h !== null &&
      observation.liquidity.suddenCollapsePct24h >= rules.warningLiquidityCollapsePct24h) ||
    (observation.holders.organicHolderGrowthPct24h !== null &&
      observation.holders.organicHolderGrowthPct24h < 0)
  )
    return "WATCH";
  return "CLEAR";
}

function evaluateCoreIntegrityV3(
  observation: MarketObservation,
  rules: RiskRuleConfig,
  assessedAt: string,
  policyProfileId?: RiskPolicyProfileId,
): IntegrityEvaluation {
  const audited = evaluateIntegrity(observation, rules, assessedAt, "AUDITED", policyProfileId);
  const profile =
    policyProfileId === undefined
      ? policyProfileForObservation(observation)
      : RISK_POLICY_PROFILES[policyProfileId];
  const coreGates = profile.coreMandatoryHardGates;
  const explicitHardCodes = new Set<HardGateCode>([
    ...coreGates,
    "DEPLOYER_CONCENTRATION",
    "BUNDLED_LAUNCH_CONCENTRATION",
    "KNOWN_RISK_DEPLOYER",
  ]);
  const failed = audited.hardGates.filter(
    (item) => item.state === "FAIL" && explicitHardCodes.has(item.code),
  );
  const unknown = audited.hardGates.filter(
    (item) => item.state === "UNKNOWN" && coreGates.includes(item.code),
  );
  const surveillanceGates = profile.surveillanceHardGates;
  const surveillanceUnknown = audited.hardGates.filter(
    (item) => item.state === "UNKNOWN" && surveillanceGates.includes(item.code),
  );
  const rejectionReasons = failed.map((item) =>
    reason(item.code, `core safety gate failed: ${item.code}`, true, item.details),
  );
  const unknownReasons = unknown.map((item) =>
    reason(item.code, `core safety evidence is unknown: ${item.code}`, true, item.details),
  );
  const warnings = audited.warnings.filter(
    (item) => !unknown.some((gate) => gate.code === item.code),
  );
  if (surveillanceUnknown.length > 0)
    warnings.push(
      reason(
        "SURVEILLANCE_EVIDENCE_LIMITED",
        "surveillance evidence is incomplete; core safety is evaluated separately",
        false,
        {
          unknownSignals: surveillanceUnknown.length,
        },
      ),
    );
  if (surveillanceStatusFor(observation, audited.hardGates, surveillanceGates) === "HIGH_RISK")
    warnings.push(
      reason(
        "SURVEILLANCE_HIGH_RISK",
        "explicit market-intelligence risk requires derivatives restriction",
        false,
        {},
      ),
    );
  const coreIntegrityStatus: CoreIntegrityStatus =
    failed.length > 0 ? "REJECTED" : unknown.length > 0 ? "PENDING" : "QUALIFIED";
  const evidenceCoverage = buildEvidenceCoverage(
    observation,
    audited.hardGates,
    coreGates,
    surveillanceGates,
  );
  return {
    policyProfileId: profile.id,
    status: coreIntegrityStatus,
    coreIntegrityStatus,
    surveillanceStatus: surveillanceStatusFor(
      observation,
      audited.hardGates,
      surveillanceGates,
      rules,
    ),
    evidenceCoverage,
    hardGates: audited.hardGates,
    rejectionReasons,
    unknownReasons,
    warnings,
  };
}

export function evaluateIntegrity(
  observation: MarketObservation,
  rules: RiskRuleConfig = DEVELOPMENT_RISK_RULES,
  assessedAt: string,
  mode: RiskEvaluationMode = defaultModeForRules(rules),
  policyProfileId?: RiskPolicyProfileId,
): IntegrityEvaluation {
  if (mode === "CORE_SAFETY_V3")
    return evaluateCoreIntegrityV3(observation, rules, assessedAt, policyProfileId);
  const { authorities, liquidity, holders, deployer, activity } = observation;
  const policyProfile =
    policyProfileId === undefined
      ? policyProfileForObservation(observation)
      : RISK_POLICY_PROFILES[policyProfileId];
  const normalize = (state: GateState): GateState =>
    mode === "AUDITED" ? state : legacyGateState(state);
  const rawHardGates: HardGateResult[] = [
    gate("MINT_AUTHORITY_ACTIVE", normalize(booleanGate(authorities.mintAuthorityActive)), {
      active: authorities.mintAuthorityActive,
    }),
    gate("FREEZE_AUTHORITY_ACTIVE", normalize(booleanGate(authorities.freezeAuthorityActive)), {
      active: authorities.freezeAuthorityActive,
    }),
    gate(
      "DANGEROUS_OWNER_ADMIN_PRIVILEGE",
      normalize(booleanGate(authorities.dangerousOwnerAdminPrivileges)),
      {
        active: authorities.dangerousOwnerAdminPrivileges,
      },
    ),
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
    gate(
      "LP_UNLOCK_TOO_SOON",
      normalize(
        lpUnlockGate(liquidity.lpLockStatus, liquidity.earliestLpUnlockAt, assessedAt, rules),
      ),
      {
        earliestLpUnlockAt: liquidity.earliestLpUnlockAt,
        minimumLpLockDays: rules.minimumLpLockDays,
      },
    ),
    gate(
      "DEPLOYER_CONCENTRATION",
      normalize(thresholdAtMost(deployer.deployerHoldingsPct, rules.maxDeployerHoldingsPct)),
      {
        deployerHoldingsPct: deployer.deployerHoldingsPct,
        maxDeployerHoldingsPct: rules.maxDeployerHoldingsPct,
      },
    ),
    gate(
      "INDIVIDUAL_HOLDER_CONCENTRATION",
      normalize(
        thresholdAtMost(individualOwnerConcentrationPct(holders), rules.maxIndividualHolderPct),
      ),
      {
        topHolderPct: individualOwnerConcentrationPct(holders),
        topTokenAccountPct: holders.topTokenAccountPct ?? null,
        evidenceScope: holders.evidenceScope ?? null,
        maxIndividualHolderPct: rules.maxIndividualHolderPct,
      },
    ),
    gate(
      "CONNECTED_CLUSTER_CONCENTRATION",
      normalize(thresholdAtMost(holders.connectedClusterPct, rules.maxConnectedClusterPct)),
      {
        connectedClusterPct: holders.connectedClusterPct,
        maxConnectedClusterPct: rules.maxConnectedClusterPct,
      },
    ),
    gate(
      "BUNDLED_LAUNCH_CONCENTRATION",
      normalize(thresholdAtMost(holders.bundledLaunchPct, rules.maxBundledLaunchPct)),
      {
        bundledLaunchPct: holders.bundledLaunchPct,
        maxBundledLaunchPct: rules.maxBundledLaunchPct,
      },
    ),
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
    gate(
      "SUSPICIOUS_TRANSACTION_REPETITION",
      normalize(booleanGate(activity.suspiciousTransactionRepetition)),
      {
        detected: activity.suspiciousTransactionRepetition,
      },
    ),
    gate("INSUFFICIENT_EVIDENCE", normalize(mandatoryEvidenceState(observation, policyProfile)), {
      lpLockStatus: liquidity.lpLockStatus,
      authorityEvidenceComplete:
        authorities.mintAuthorityActive !== null && authorities.freezeAuthorityActive !== null,
    }),
  ];
  const hardGates = rawHardGates.map((item) => {
    if (mode !== "AUDITED" || !policyProfile.notApplicableGates.includes(item.code)) return item;
    return gate(item.code, "NOT_APPLICABLE", {
      ...item.details,
      applicability: "NOT_APPLICABLE",
      policyProfile: policyProfile.id,
    });
  });

  const failed = hardGates.filter((item) => item.state === "FAIL");
  const unknown = hardGates.filter(
    (item) => item.state === "UNKNOWN" && gateDisposition(policyProfile, item.code) === "MANDATORY",
  );
  const optionalUnknown = hardGates.filter(
    (item) => item.state === "UNKNOWN" && gateDisposition(policyProfile, item.code) === "OPTIONAL",
  );
  const rejectionReasons = failed.map((item) =>
    reason(item.code, `hard gate failed: ${item.code}`, true, item.details),
  );
  const unknownReasons = unknown.map((item) =>
    reason(item.code, `required evidence is unknown: ${item.code}`, true, item.details),
  );
  const warnings: RiskReason[] = [];
  for (const item of optionalUnknown) {
    warnings.push(
      reason("OPTIONAL_EVIDENCE_UNKNOWN", `optional evidence is unknown: ${item.code}`, false, {
        gate: item.code,
        policyProfile: policyProfile.id,
      }),
    );
  }
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
    policyProfileId: policyProfile.id,
    status:
      failed.length > 0
        ? "REJECTED"
        : unknown.length > 0
          ? "PENDING"
          : warnings.length > 0
            ? "WATCH"
            : "QUALIFIED",
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
  mode: RiskEvaluationMode = defaultModeForRules(rules),
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
      : roundDown(
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
      isTriStateMode(mode)
        ? thresholdAtLeast(liquidity.totalLiquidityUsd, rules.minimumSpotLiquidityUsd)
        : atLeast(liquidity.totalLiquidityUsd, rules.minimumSpotLiquidityUsd)
          ? "PASS"
          : "FAIL",
      "spot liquidity is below development minimum",
      { actual: liquidity.totalLiquidityUsd, minimum: rules.minimumSpotLiquidityUsd },
    ],
    [
      "INSUFFICIENT_DEPTH_1_PERCENT",
      isTriStateMode(mode)
        ? thresholdAtLeast(liquidity.depth1PctUsd, rules.minimumDepth1PctUsd)
        : atLeast(liquidity.depth1PctUsd, rules.minimumDepth1PctUsd)
          ? "PASS"
          : "FAIL",
      "1% market depth is below development minimum",
      { actual: liquidity.depth1PctUsd, minimum: rules.minimumDepth1PctUsd },
    ],
    [
      "INSUFFICIENT_DEPTH_2_PERCENT",
      isTriStateMode(mode)
        ? thresholdAtLeast(liquidity.depth2PctUsd, rules.minimumDepth2PctUsd)
        : atLeast(liquidity.depth2PctUsd, rules.minimumDepth2PctUsd)
          ? "PASS"
          : "FAIL",
      "2% market depth is below development minimum",
      { actual: liquidity.depth2PctUsd, minimum: rules.minimumDepth2PctUsd },
    ],
    [
      "INSUFFICIENT_ORGANIC_VOLUME",
      isTriStateMode(mode)
        ? thresholdAtLeast(activity.organicVolume24hUsd, rules.minimumOrganicVolume24hUsd)
        : atLeast(activity.organicVolume24hUsd, rules.minimumOrganicVolume24hUsd)
          ? "PASS"
          : "FAIL",
      "organic volume is below development minimum",
      { actual: activity.organicVolume24hUsd, minimum: rules.minimumOrganicVolume24hUsd },
    ],
    [
      "EXCESSIVE_REALIZED_VOLATILITY",
      isTriStateMode(mode)
        ? thresholdAtMost(derivatives.realizedVolatilityPct, rules.maximumRealizedVolatilityPct)
        : atMost(derivatives.realizedVolatilityPct, rules.maximumRealizedVolatilityPct)
          ? "PASS"
          : "FAIL",
      "realized volatility exceeds development maximum",
      { actual: derivatives.realizedVolatilityPct, maximum: rules.maximumRealizedVolatilityPct },
    ],
    [
      "INSUFFICIENT_ORACLE_SOURCES",
      isTriStateMode(mode)
        ? thresholdAtLeast(oracle.sourceCount, rules.minimumOracleSources)
        : atLeast(oracle.sourceCount, rules.minimumOracleSources)
          ? "PASS"
          : "FAIL",
      "oracle source count is below development minimum",
      { actual: oracle.sourceCount, minimum: rules.minimumOracleSources },
    ],
    [
      "ORACLE_DISAGREEMENT",
      isTriStateMode(mode)
        ? thresholdAtMost(oracle.disagreementPct, rules.maximumOracleDisagreementPct)
        : atMost(oracle.disagreementPct, rules.maximumOracleDisagreementPct)
          ? "PASS"
          : "FAIL",
      "oracle disagreement exceeds development maximum",
      { actual: oracle.disagreementPct, maximum: rules.maximumOracleDisagreementPct },
    ],
    [
      "LOW_ORACLE_CONFIDENCE",
      isTriStateMode(mode)
        ? thresholdAtLeast(oracle.confidenceBps, rules.minimumOracleConfidenceBps)
        : atLeast(oracle.confidenceBps, rules.minimumOracleConfidenceBps)
          ? "PASS"
          : "FAIL",
      "oracle confidence is below development minimum",
      { actual: oracle.confidenceBps, minimum: rules.minimumOracleConfidenceBps },
    ],
    [
      "INSUFFICIENT_MANIPULATION_RESISTANCE",
      isTriStateMode(mode)
        ? thresholdAtLeast(oracle.manipulationCostUsd, rules.minimumManipulationCostUsd)
        : atLeast(oracle.manipulationCostUsd, rules.minimumManipulationCostUsd)
          ? "PASS"
          : "FAIL",
      "estimated manipulation cost is too low",
      { actual: oracle.manipulationCostUsd, minimum: rules.minimumManipulationCostUsd },
    ],
    [
      "INSUFFICIENT_LIQUIDATION_CAPACITY",
      isTriStateMode(mode)
        ? thresholdAtLeast(derivatives.liquidationCapacityUsd, rules.minimumLiquidationCapacityUsd)
        : atLeast(derivatives.liquidationCapacityUsd, rules.minimumLiquidationCapacityUsd)
          ? "PASS"
          : "FAIL",
      "liquidation capacity is below development minimum",
      { actual: derivatives.liquidationCapacityUsd, minimum: rules.minimumLiquidationCapacityUsd },
    ],
    [
      "INSUFFICIENT_SAFE_OPEN_INTEREST",
      isTriStateMode(mode)
        ? thresholdAtLeast(safeOpenInterest, rules.minimumSafeOpenInterestUsd)
        : atLeast(safeOpenInterest, rules.minimumSafeOpenInterestUsd)
          ? "PASS"
          : "FAIL",
      "safe open interest is below development minimum",
      { actual: safeOpenInterest, minimum: rules.minimumSafeOpenInterestUsd },
    ],
  ];
  for (const [code, state, message, details] of checks) {
    if (state === "FAIL") {
      warnings.push(reason(code, message, false, details));
      if (mode === "CORE_SAFETY_V3") {
        rejectionReasons.push(
          reason(
            `CAPACITY_${code}`,
            `derivatives capacity hard gate failed: ${code}`,
            false,
            details,
          ),
        );
      }
    } else if (state === "UNKNOWN") {
      unknownReasons.push(
        reason(code, `required capacity evidence is unknown: ${code}`, false, details),
      );
    }
  }
  if (oracle.stale === true) {
    rejectionReasons.push(reason("STALE_ORACLE", "oracle data is stale", false, { stale: true }));
  } else if (oracle.stale === null) {
    const freshnessReason = reason(
      "ORACLE_FRESHNESS_UNAVAILABLE",
      "oracle freshness was not observed",
      false,
      {
        stale: null,
      },
    );
    if (isTriStateMode(mode)) unknownReasons.push(freshnessReason);
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
      reason(
        "INTEGRITY_EVIDENCE_PENDING",
        "derivatives cannot qualify before integrity evidence is complete",
        false,
        {
          integrityStatus: integrity.status,
        },
      ),
    );
  }
  if (safeOpenInterest === null && isTriStateMode(mode)) {
    unknownReasons.push(
      reason(
        "SAFE_OPEN_INTEREST_UNAVAILABLE",
        "safe open interest could not be derived",
        false,
        {},
      ),
    );
  }
  if (mode === "CORE_SAFETY_V3") {
    const activityUnknown = [
      observation.activity.washTradingDetected,
      observation.activity.volumeFarmingDetected,
      observation.activity.suspiciousTransactionRepetition,
    ].some((value) => value === null);
    if (activityUnknown)
      unknownReasons.push(
        reason(
          "SURVEILLANCE_ACTIVITY_UNAVAILABLE",
          "wash/farm/repetition telemetry is required for derivatives capacity",
          false,
          {},
        ),
      );
    if (activityQualityIsSuspicious(observation.activity))
      rejectionReasons.push(
        reason(
          "DERIVATIVES_SURVEILLANCE_BLOCKED",
          "explicit activity manipulation signal blocks derivatives capacity",
          false,
          {},
        ),
      );
  }
  if (
    rejectionReasons.length > 0 ||
    safeOpenInterest === null ||
    safeOpenInterest <= 0 ||
    (isTriStateMode(mode) && unknownReasons.length > 0)
  ) {
    return {
      status:
        isTriStateMode(mode) && rejectionReasons.length === 0 && unknownReasons.length > 0
          ? "UNASSESSED"
          : "BLOCKED",
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
  const mode = options.mode ?? defaultModeForRules(rules);
  const integrity = evaluateIntegrity(
    observation,
    rules,
    options.assessedAt,
    mode,
    options.policyProfile,
  );
  const derivatives = evaluateDerivativesCapacity(observation, integrity, rules, mode);
  const profile =
    options.policyProfile === undefined
      ? policyProfileForObservation(observation)
      : RISK_POLICY_PROFILES[options.policyProfile];
  const evidenceCoverage =
    integrity.evidenceCoverage ??
    buildEvidenceCoverage(
      observation,
      integrity.hardGates,
      profile.coreMandatoryHardGates,
      profile.surveillanceHardGates,
    );
  const coreIntegrityStatus =
    integrity.coreIntegrityStatus ?? (integrity.status === "REJECTED" ? "REJECTED" : "QUALIFIED");
  const surveillanceStatus =
    integrity.surveillanceStatus ??
    surveillanceStatusFor(observation, integrity.hardGates, profile.surveillanceHardGates, rules);
  return {
    token: observation.token,
    lifecycle: observation.lifecycle,
    integrityStatus: integrity.status,
    coreIntegrityStatus,
    surveillanceStatus,
    evidenceCoverage,
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
  )
    return "PASS";
  return "UNKNOWN";
}

function individualOwnerConcentrationPct(holders: MarketObservation["holders"]): number | null {
  if (holders.evidenceScope === "TOP_TOKEN_ACCOUNTS") return holders.resolvedTopOwnerPct ?? null;
  return holders.resolvedTopOwnerPct ?? holders.topHolderPct;
}

function lpUnlockGate(
  status: MarketObservation["liquidity"]["lpLockStatus"],
  unlockAt: string | null,
  assessedAt: string,
  rules: RiskRuleConfig,
): GateState {
  if (status === "WITHDRAWABLE" || status === "WITHDRAWABLE_BY_PRIVILEGED_ACTOR") return "FAIL";
  if (
    status === "BURNED" ||
    status === "PROTOCOL_CONTROLLED" ||
    status === "IMMUTABLE_MIGRATION_CONTROL" ||
    status === "DISTRIBUTED_NON_PRIVILEGED"
  )
    return "PASS";
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

function minKnown(
  values: readonly (number | null)[],
  multipliers: readonly number[],
): number | null {
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
