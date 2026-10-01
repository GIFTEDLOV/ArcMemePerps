import type { ChainAdapter, LiveInspectionAdapter } from "@arcmemeperps/chain-adapters";
import {
  MarketPassportSchema,
  type MarketIntelligenceRecord,
  type MarketPassport,
} from "@arcmemeperps/domain";
import { assessRisk, DEVELOPMENT_RISK_RULES } from "@arcmemeperps/risk-engine";
import { PersistentJobQueue, type PersistenceStore } from "@arcmemeperps/persistence";
import {
  canonicalJson,
  keccak256Hex,
  marketIdForToken,
  type Hex,
  type SupportedChain,
} from "@arcmemeperps/shared";

export type QualificationDecision = "QUALIFIED" | "WATCH" | "REJECTED" | "BLOCKED";
export type ExecutionDecision = "ALLOW" | "REFUSE";

export interface QualificationGateResult {
  readonly decision: QualificationDecision;
  readonly reasonCodes: readonly string[];
  readonly assessedAt: string;
  readonly ruleVersion: string;
}

export interface QualificationGateInput {
  readonly passport: MarketPassport;
  readonly proofFresh: boolean;
  readonly evidenceComplete: boolean;
  readonly criticalDisagreement: boolean;
}

/** Separate derivatives-market admission from trade execution authorization. */
export function evaluateQualificationGate(input: QualificationGateInput): QualificationGateResult {
  const reasons: string[] = [];
  const risk = input.passport.riskResult;
  if (!input.evidenceComplete) reasons.push("INSUFFICIENT_EVIDENCE");
  if (!input.proofFresh) reasons.push("QUALIFICATION_PROOF_STALE");
  if (input.criticalDisagreement) reasons.push("CRITICAL_PROVIDER_DISAGREEMENT");
  if (risk.integrityStatus === "REJECTED") reasons.push(...risk.hardGateCodes);
  if (risk.integrityStatus === "PENDING") reasons.push("INTEGRITY_UNASSESSED");
  if (risk.derivativesStatus === "BLOCKED" || risk.derivativesStatus === "UNASSESSED")
    reasons.push("DERIVATIVES_CAPACITY_UNAVAILABLE");
  if (reasons.some((reason) => risk.hardGateCodes.includes(reason))) {
    return {
      decision: "REJECTED",
      reasonCodes: unique(reasons),
      assessedAt: input.passport.observedAt,
      ruleVersion: input.passport.riskRuleVersion,
    };
  }
  if (reasons.length > 0) {
    return {
      decision: "BLOCKED",
      reasonCodes: unique(reasons),
      assessedAt: input.passport.observedAt,
      ruleVersion: input.passport.riskRuleVersion,
    };
  }
  if (risk.integrityStatus === "WATCH" || risk.derivativesStatus === "WATCH") {
    return {
      decision: "WATCH",
      reasonCodes: [...risk.warnings],
      assessedAt: input.passport.observedAt,
      ruleVersion: input.passport.riskRuleVersion,
    };
  }
  return {
    decision: "QUALIFIED",
    reasonCodes: [],
    assessedAt: input.passport.observedAt,
    ruleVersion: input.passport.riskRuleVersion,
  };
}

export interface ExecutionGateInput {
  readonly qualificationFresh: boolean;
  readonly marketState: "LIVE" | "PAUSED" | "CLOSE_ONLY" | "BLOCKED";
  readonly riskIncreasing: boolean;
  readonly oracleFresh: boolean;
  readonly oracleConfidenceBps: number;
  readonly requiredOracleConfidenceBps: number;
  readonly currentOIUsdWad: bigint;
  readonly sideOIUsdWad: bigint;
  readonly sizeDeltaUsdWad: bigint;
  readonly maxOIUsdWad: bigint;
  readonly maxSideOIUsdWad: bigint;
  readonly maxPositionUsdWad: bigint;
  readonly currentPositionUsdWad: bigint;
  readonly vaultCapacityUsdWad: bigint;
  readonly insuranceHealthy: boolean;
  readonly marginSufficient: boolean;
  readonly orderUnexpired: boolean;
  readonly preTradePlanHashMatches: boolean;
}

export interface ExecutionGateResult {
  readonly decision: ExecutionDecision;
  readonly reasonCodes: readonly string[];
}

export function evaluateExecutionGate(input: ExecutionGateInput): ExecutionGateResult {
  const reasons: string[] = [];
  if (!input.qualificationFresh) reasons.push("QUALIFICATION_STALE");
  if (!input.oracleFresh) reasons.push("ORACLE_STALE");
  if (input.oracleConfidenceBps < input.requiredOracleConfidenceBps)
    reasons.push("ORACLE_CONFIDENCE_LOW");
  if (!input.orderUnexpired) reasons.push("ORDER_EXPIRED");
  if (!input.preTradePlanHashMatches) reasons.push("PRETRADE_PLAN_MISMATCH");
  if (!input.marginSufficient) reasons.push("MARGIN_INSUFFICIENT");
  if (!input.insuranceHealthy) reasons.push("INSURANCE_DEGRADED");
  if (input.currentOIUsdWad + input.sizeDeltaUsdWad > input.maxOIUsdWad) reasons.push("OI_CAP");
  if (input.sideOIUsdWad + input.sizeDeltaUsdWad > input.maxSideOIUsdWad)
    reasons.push("SIDE_OI_CAP");
  if (input.currentPositionUsdWad + input.sizeDeltaUsdWad > input.maxPositionUsdWad)
    reasons.push("POSITION_CAP");
  if (input.sizeDeltaUsdWad > input.vaultCapacityUsdWad) reasons.push("VAULT_CAPACITY");
  if (input.riskIncreasing && input.marketState !== "LIVE")
    reasons.push(`MARKET_${input.marketState}`);
  if (!input.riskIncreasing && input.marketState === "BLOCKED")
    reasons.push("MARKET_BLOCKED_CLOSE_POLICY");
  return reasons.length === 0
    ? { decision: "ALLOW", reasonCodes: [] }
    : { decision: "REFUSE", reasonCodes: unique(reasons) };
}

export interface PreTradePlan {
  readonly version: "pretrade-plan/v1";
  readonly account: string;
  readonly marketId: Hex;
  readonly chain: "ARC";
  readonly action: "OPEN" | "INCREASE" | "DECREASE" | "CLOSE";
  readonly side: "LONG" | "SHORT";
  readonly collateralUsdWad: bigint;
  readonly sizeUsdWad: bigint;
  readonly leverageWad: bigint;
  readonly acceptablePriceWad: bigint;
  readonly oracleSequence: bigint;
  readonly oracleExpiry: string;
  readonly estimatedFeesUsdWad: bigint;
  readonly fundingIndex: bigint;
  readonly borrowIndex: bigint;
  readonly liquidationEstimateUsdWad: bigint;
  readonly marketState: string;
  readonly oiBeforeUsdWad: bigint;
  readonly oiCapacityUsdWad: bigint;
  readonly nonce: bigint;
  readonly createdAt: string;
  readonly expiry: string;
}

export function preTradePlanHash(plan: PreTradePlan): Hex {
  return keccak256Hex(canonicalJson(toCanonicalPlan(plan)));
}

export function assertPreTradePlanImmutable(original: PreTradePlan, current: PreTradePlan): void {
  if (preTradePlanHash(original).toLowerCase() !== preTradePlanHash(current).toLowerCase())
    throw new Error("PRETRADE_PLAN_MISMATCH");
}

function toCanonicalPlan(plan: PreTradePlan): Record<string, string> {
  return Object.fromEntries(
    Object.entries(plan).map(([key, value]) => [
      key,
      typeof value === "bigint" ? value.toString() : String(value),
    ]),
  );
}

export function buildMarketPassport(
  record: MarketIntelligenceRecord,
  now = new Date().toISOString(),
): MarketPassport {
  const risk = assessRisk(record, {
    rules: DEVELOPMENT_RISK_RULES,
    assessedAt: record.oracle.observedAt,
  });
  const providerHealth = record.providerAvailability.map((provider) => ({
    component: provider.provider,
    state:
      provider.status === "AVAILABLE"
        ? ("OPERATIONAL" as const)
        : provider.status === "ERROR"
          ? ("DEGRADED" as const)
          : ("UNAVAILABLE" as const),
    lastSuccessAt: provider.status === "AVAILABLE" ? provider.fetchedAt : null,
    latencyMs: null,
    error: provider.reason,
  }));
  const snapshot = {
    schemaVersion: "market-snapshot/v1" as const,
    observedAt: now,
    identity: {
      marketId: record.marketId,
      chain: record.token.chain,
      tokenAddress: record.token.tokenAddress,
      symbol: record.token.symbol,
      name: record.token.name,
      decimals: record.token.decimals,
      deployer: record.token.deployer,
      createdAt: record.token.createdAt,
      originPlatform: record.token.originPlatform,
    },
    originChain: record.token.chain,
    originPlatform: record.token.originPlatform,
    lifecycle: {
      status: record.lifecycle.status,
      evidenceIds: [record.lifecycle.evidenceHash],
      observedAt: record.lifecycle.observedAt,
      confidenceBps: Math.max(
        0,
        Math.min(10_000, Math.round(record.lifecycle.confidence * 10_000)),
      ),
    },
    marketData: {
      priceUsdWad: usdWad(record.oracle.priceUsd),
      volume24hUsdWad: usdWad(record.activity.organicVolume24hUsd),
      buyCount24h: null,
      sellCount24h: null,
      priceChange24hBps: null,
      volatilityBps:
        record.activity.realizedVolatility30dPct === 0
          ? null
          : integer(record.activity.realizedVolatility30dPct * 100),
    },
    liquidity: {
      totalUsdWad: usdWad(record.liquidity.totalLiquidityUsd),
      dominantPool: null,
      poolConcentrationBps: null,
      venueCount: record.liquidity.venueCount,
      buyDepth1PctUsdWad: nullableUsdWad(record.liquidity.depth1PctUsd),
      sellDepth1PctUsdWad: nullableUsdWad(record.liquidity.depth1PctUsd),
      buyDepth2PctUsdWad: nullableUsdWad(record.liquidity.depth2PctUsd),
      sellDepth2PctUsdWad: nullableUsdWad(record.liquidity.depth2PctUsd),
      securityStatus: record.liquidity.lpLockStatus,
      earliestUnlockAt: record.liquidity.earliestLpUnlockAt,
    },
    holderEvidence: {
      largestHolderBps: percentBps(record.holders.topHolderPct),
      largestNonSystemHolderBps: percentBps(record.holders.topHolderPct),
      top10NonSystemBps: percentBps(record.holders.topFivePct),
      largestConnectedClusterBps: percentBps(record.holders.connectedClusterPct),
      clusterCount: null,
      systemExclusions: [],
    },
    deployerEvidence: {
      deployer: record.deployer.deployerAddress,
      tokensCreated: null,
      survival7dBps: null,
      survival30dBps: null,
      associatedWallets: [],
      reasonCodes: record.deployer.knownRisk === true ? ["KNOWN_RISK_DEPLOYER"] : [],
    },
    securityEvidence: {
      mintAuthorityActive: record.authorities.mintAuthorityActive,
      freezeAuthorityActive: record.authorities.freezeAuthorityActive,
      ownerPrivilege: record.authorities.dangerousOwnerAdminPrivileges,
      upgradeable: record.authorities.upgradeable,
      transferRestricted: record.authorities.transferRestricted,
      honeypot: record.authorities.honeypotDetected,
      lpSecurity: record.liquidity.lpLockStatus,
      evidenceIds: record.evidence.map((item) => item.evidenceId),
    },
    oracleEvidence: {
      priceSourceCount: record.oracle.sourceCount,
      // An aggregation API is not independent from the pools it observes.
      independentSourceCount: 0,
      dispersionBps: integer(record.oracle.disagreementPct * 100),
      confidenceBps: record.oracle.confidenceBps,
      freshness:
        record.oracle.stale === true
          ? ("STALE" as const)
          : record.oracle.stale === null
            ? ("UNAVAILABLE" as const)
            : ("FRESH" as const),
      sourceFamilies: ["DEXSCREENER_AGGREGATION"],
    },
    derivativesEvidence: {
      status: risk.derivativesStatus,
      maxLeverageWad: usdWad(risk.recommendedMaxLeverage),
      maxOIWad: usdWad(risk.recommendedMaxOI),
      maxPositionWad: usdWad(risk.recommendedMaxPosition),
      maintenanceMarginBps: risk.riskMetrics.derivatives.maximumLeverage > 0 ? 1_000 : null,
      manipulationResistance:
        record.oracle.manipulationCostUsd >= 1_000_000
          ? ("HIGH" as const)
          : record.oracle.manipulationCostUsd > 0
            ? ("LOW" as const)
            : ("UNAVAILABLE" as const),
      reasonCodes: [...risk.rejectionReasons.map((item) => item.code)],
    },
    providerState: {
      providers: record.providerAvailability.map((provider) => ({
        provider: provider.provider,
        status: provider.status,
        lastSuccessAt: provider.status === "AVAILABLE" ? provider.fetchedAt : null,
        fetchedAt: now,
        reason: provider.reason,
      })),
      disagreements: record.dataQuality.disagreements.map((item) => ({
        field: item.field,
        status: item.status,
        sources: item.sources,
        resolution: "BLOCK_AUTOMATIC_QUALIFICATION" as const,
      })),
    },
    freshness: {
      status:
        record.oracle.stale === true
          ? ("STALE" as const)
          : record.oracle.stale === null
            ? ("UNAVAILABLE" as const)
            : ("FRESH" as const),
      observedAt: record.oracle.observedAt,
      fetchedAt: now,
      maxAgeSeconds: 60,
    },
    riskResult: {
      integrityStatus: risk.integrityStatus,
      derivativesStatus: risk.derivativesStatus,
      hardGateCodes: risk.hardGates.filter((gate) => !gate.passed).map((gate) => gate.code),
      rejectionReasons: risk.rejectionReasons.map((item) => item.code),
      warnings: risk.warnings.map((item) => item.code),
      ruleVersion: DEVELOPMENT_RISK_RULES.version,
    },
    qualification: {
      eligible: risk.integrityStatus === "QUALIFIED" && risk.derivativesStatus === "ELIGIBLE",
      proofHash: record.evidenceRoot,
      commitmentHash: null,
      evidenceRoot: record.evidenceRoot,
      assessedAt: record.oracle.observedAt,
      expiresAt: null,
    },
    tradability: {
      status:
        risk.integrityStatus === "QUALIFIED" && risk.derivativesStatus === "ELIGIBLE"
          ? ("WATCH" as const)
          : ("NOT_TRADABLE" as const),
      reasons: risk.rejectionReasons.map((item) => item.code),
      asOf: now,
    },
    passportSchemaVersion: "market-passport/v1" as const,
    marketAgeSeconds:
      record.token.createdAt === null
        ? null
        : Math.max(0, Math.floor((Date.parse(now) - Date.parse(record.token.createdAt)) / 1_000)),
    priceHistory: [
      {
        observedAt: record.oracle.observedAt,
        priceUsdWad: usdWad(record.oracle.priceUsd),
        source: "canonical-record",
      },
    ],
    pools: [],
    lpControl: {
      status: record.liquidity.lpLockStatus,
      reason: "normalized liquidity-security evidence",
      evidenceIds: record.evidence.map((item) => item.evidenceId),
      observedAt: now,
    },
    bundleEvidence: {
      effectiveConcentrationBps: percentBps(record.holders.bundledLaunchPct),
      coordinatedWallets: [],
      evidenceIds: [],
    },
    firstBuyers: [],
    sniperSignals:
      record.activity.suspiciousEarlyBuyers === true ? ["SUSPICIOUS_EARLY_BUYERS"] : [],
    deployerProfile: {
      tokensCreated: null,
      survival1dBps: null,
      survival7dBps: null,
      survival30dBps: null,
      liquidityRemovalIncidents: null,
      mintAdminIncidents: null,
      associatedWallets: [],
      reasonCodes: [],
    },
    fundingGraph: {
      status: "INSUFFICIENT_DATA" as const,
      nodes: [],
      edges: [],
      reasonCodes: ["FUNDING_GRAPH_UNAVAILABLE"],
    },
    washFarm: {
      verdict:
        record.activity.washTradingDetected === true ||
        record.activity.volumeFarmingDetected === true
          ? ("HIGH_RISK" as const)
          : ("INSUFFICIENT_DATA" as const),
      reasonCodes: [],
      features: {},
    },
    organicActivity: {
      holderGrowthBps: percentBps(record.holders.organicHolderGrowthPct24h),
      newHolderVelocity: null,
      independentTraderCount: null,
      retentionBps: null,
      netCapitalFlowUsdWad: null,
      venueDiversity: record.liquidity.venueCount,
      persistenceBps: null,
    },
    smartWalletActivity: { participatingWallets: [], qualityBps: null, evidenceIds: [] },
    marketDepth: {
      status:
        record.liquidity.depth1PctUsd === null ? ("UNAVAILABLE" as const) : ("AVAILABLE" as const),
      buyDepth1PctUsdWad: nullableUsdWad(record.liquidity.depth1PctUsd),
      sellDepth1PctUsdWad: nullableUsdWad(record.liquidity.depth1PctUsd),
      buyDepth2PctUsdWad: nullableUsdWad(record.liquidity.depth2PctUsd),
      sellDepth2PctUsdWad: nullableUsdWad(record.liquidity.depth2PctUsd),
      buyDepth5PctUsdWad: null,
      sellDepth5PctUsdWad: null,
      observedAt: now,
      reason: record.liquidity.depth1PctUsd === null ? "DEPTH_UNAVAILABLE" : null,
    },
    sourceIndependence: {
      independentSourceCount: 0,
      sourceIds: ["dexscreener"],
      correlatedSourceIds: ["dexscreener"],
    },
    arcMarketState: "UNREGISTERED" as const,
    providerHealth,
    riskRuleVersion: DEVELOPMENT_RISK_RULES.version,
  };
  return MarketPassportSchema.parse(snapshot);
}

export interface SnapshotIngestionResult {
  readonly passport: MarketPassport;
  readonly snapshotId: string;
  readonly persistedAt: string;
}

export class SnapshotIngestionWorker {
  private readonly jobs: PersistentJobQueue;
  public constructor(
    private readonly storage: PersistenceStore,
    private readonly adapters: ReadonlyMap<SupportedChain, ChainAdapter>,
  ) {
    this.jobs = new PersistentJobQueue(storage);
  }

  public enqueueRefresh(chain: SupportedChain, tokenAddress: string): void {
    const marketId = marketIdForToken(chain, tokenAddress);
    this.jobs.enqueue({
      id: `market-refresh:${marketId}`,
      type: "MARKET_REFRESH",
      dedupeKey: `MARKET_REFRESH:${marketId}`,
      payload: { chain, tokenAddress },
      maxAttempts: 3,
    });
  }

  public async runOne(): Promise<SnapshotIngestionResult | null> {
    const job = this.jobs.claim();
    if (job === null) return null;
    try {
      const chain = job.payload.chain;
      const tokenAddress = job.payload.tokenAddress;
      if (typeof chain !== "string" || typeof tokenAddress !== "string")
        throw new Error("invalid market refresh payload");
      const adapter = this.adapters.get(chain as SupportedChain);
      if (adapter === undefined) throw new Error(`adapter unavailable: ${chain}`);
      if (!("inspectToken" in adapter))
        throw new Error("adapter does not expose canonical inspection");
      const record = await (adapter as LiveInspectionAdapter).inspectToken(tokenAddress, {
        noEnrichment: false,
      });
      const passport = buildMarketPassport(record);
      const observedAt = passport.observedAt;
      this.storage.put("markets", passport.identity.marketId, passport, observedAt);
      this.storage.put(
        "market_snapshots",
        `${passport.identity.marketId}:${observedAt}`,
        passport,
        observedAt,
      );
      for (const evidence of record.evidence)
        this.storage.put(
          "evidence",
          evidence.evidenceId,
          evidence as unknown as Readonly<Record<string, unknown>>,
          observedAt,
        );
      this.jobs.succeed(job.id);
      return {
        passport,
        snapshotId: `${passport.identity.marketId}:${observedAt}`,
        persistedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.jobs.fail(
        job.id,
        error instanceof Error ? error.message : "market refresh failed",
        null,
      );
      throw error;
    }
  }
}

export interface ReconciliationCheck {
  readonly name: string;
  readonly status: "MATCH" | "SURPLUS" | "DEFICIT" | "MISMATCH" | "UNAVAILABLE";
  readonly expected: string | null;
  readonly actual: string | null;
  readonly checkedAt: string;
  readonly critical: boolean;
}

export * from "./workers.js";
export * from "./history.js";
export * from "./health.js";

export class ReconciliationService {
  public constructor(private readonly storage: PersistenceStore) {}
  public record(check: ReconciliationCheck): void {
    this.storage.put(
      "reconciliation_snapshots",
      `${check.name}:${check.checkedAt}`,
      check as unknown as Readonly<Record<string, unknown>>,
      check.checkedAt,
    );
  }
  public latest(): readonly ReconciliationCheck[] {
    const byName = new Map<string, ReconciliationCheck>();
    for (const row of this.storage.list("reconciliation_snapshots")) {
      const check = row.payload as unknown as ReconciliationCheck;
      const previous = byName.get(check.name);
      if (previous === undefined || previous.checkedAt < check.checkedAt)
        byName.set(check.name, check);
    }
    return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
  }
  public healthState(): "OPERATIONAL" | "CRITICAL" {
    return this.latest().some((check) => check.critical && check.status !== "MATCH")
      ? "CRITICAL"
      : "OPERATIONAL";
  }
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}
function integer(value: number): string {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)).toString() : "0";
}
function usdWad(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  return decimalToWad(value.toString()).toString();
}
function nullableUsdWad(value: number | null): string | null {
  return value === null ? null : usdWad(value);
}
function percentBps(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10_000, Math.round(value * 100)));
}

/** Convert a provider decimal representation without multiplying a JS Number. */
function decimalToWad(value: string): bigint {
  const match = /^([0-9]+)(?:\.([0-9]+))?(?:e([+-]?[0-9]+))?$/i.exec(value.trim());
  if (match === null) return 0n;
  const whole = match[1]!;
  const fraction = match[2] ?? "";
  const exponent = Number.parseInt(match[3] ?? "0", 10);
  const digits = BigInt(`${whole}${fraction}`);
  const scale = 18 + exponent - fraction.length;
  if (scale >= 0) return digits * 10n ** BigInt(scale);
  return digits / 10n ** BigInt(-scale);
}
