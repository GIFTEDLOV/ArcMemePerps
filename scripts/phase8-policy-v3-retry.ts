import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  ActivityQualityMetrics,
  AuthorityState,
  DeployerRisk,
  DerivativesCapacityMetrics,
  HolderConcentration,
  LifecycleSnapshot,
  LiquidityState,
  MarketObservation,
  OracleMetrics,
  TokenIdentity,
} from "@arcmemeperps/domain";
import { assessRisk, CORE_SAFETY_RISK_RULES } from "@arcmemeperps/risk-engine";
import { canonicalJson, keccak256Hex, type SupportedChain } from "@arcmemeperps/shared";

const assessedAt = new Date().toISOString();
const inputPath = resolve(process.cwd(), "evidence/winner-rebuild/phase7-indexed-evm-lane.json");
const outputPath = resolve(process.cwd(), "evidence/winner-rebuild/phase8-policy-v3-retry.json");
const input = JSON.parse(readFileSync(inputPath, "utf8")) as Phase7Output;

const candidates = input.candidates.map((candidate) => {
  const observation = observationFromPersistedEvidence(candidate);
  const assessment = assessRisk(observation, {
    assessedAt,
    rules: CORE_SAFETY_RISK_RULES,
  });
  return {
    chain: candidate.candidate.chain,
    tokenAddress: candidate.candidate.tokenAddress,
    symbol: candidate.candidate.symbol,
    observationBasis: "phase7-indexed-evm-lane.json; no new provider calls",
    assessment: {
      integrityStatus: assessment.integrityStatus,
      coreIntegrityStatus: assessment.coreIntegrityStatus,
      surveillanceStatus: assessment.surveillanceStatus,
      derivativesStatus: assessment.derivativesStatus,
      ruleVersion: assessment.ruleVersion,
      hardGates: assessment.hardGates.map((gate) => ({
        code: gate.code,
        state: gate.state,
        hard: gate.hard,
        details: gate.details,
      })),
      rejectionReasons: assessment.rejectionReasons,
      unknownReasons: assessment.unknownReasons,
      warnings: assessment.warnings,
      evidenceCoverage: assessment.evidenceCoverage,
      recommendedMaxLeverage: assessment.recommendedMaxLeverage,
      recommendedMaxOI: assessment.recommendedMaxOI,
      recommendedMaxPosition: assessment.recommendedMaxPosition,
    },
  };
});

const output = {
  schemaVersion: "winner-rebuild/phase8-policy-v3-retry-v1",
  generatedAt: assessedAt,
  sourceArtifact: "evidence/winner-rebuild/phase7-indexed-evm-lane.json",
  ruleVersion: CORE_SAFETY_RISK_RULES.version,
  numericThresholdsChanged: false,
  candidates,
  counts: {
    evaluated: candidates.length,
    coreQualified: candidates.filter((item) => item.assessment.coreIntegrityStatus === "QUALIFIED")
      .length,
    corePending: candidates.filter((item) => item.assessment.coreIntegrityStatus === "PENDING")
      .length,
    coreRejected: candidates.filter((item) => item.assessment.coreIntegrityStatus === "REJECTED")
      .length,
    surveillanceClear: candidates.filter((item) => item.assessment.surveillanceStatus === "CLEAR")
      .length,
    surveillanceWatch: candidates.filter((item) => item.assessment.surveillanceStatus === "WATCH")
      .length,
    surveillanceLimited: candidates.filter(
      (item) => item.assessment.surveillanceStatus === "LIMITED",
    ).length,
    surveillanceHighRisk: candidates.filter(
      (item) => item.assessment.surveillanceStatus === "HIGH_RISK",
    ).length,
    derivativesEligible: candidates.filter(
      (item) => item.assessment.derivativesStatus === "ELIGIBLE",
    ).length,
    derivativesWatch: candidates.filter((item) => item.assessment.derivativesStatus === "WATCH")
      .length,
    derivativesBlocked: candidates.filter((item) => item.assessment.derivativesStatus === "BLOCKED")
      .length,
    derivativesUnassessed: candidates.filter(
      (item) => item.assessment.derivativesStatus === "UNASSESSED",
    ).length,
  },
  testnetWritePerformed: false,
  mainnetWritePerformed: false,
  contractRedeploymentPerformed: false,
};

writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(JSON.stringify({ output: outputPath, counts: output.counts }) + "\n");

function observationFromPersistedEvidence(candidate: Phase7Candidate): MarketObservation {
  const evidence = candidate.currentEvidence;
  const meaningfulPools = uniquePersistedPools(candidate.dex, candidate.gecko).filter(
    (pool) =>
      pool.liquidityUsd !== null &&
      pool.liquidityUsd >= 10_000 &&
      pool.priceUsd !== null &&
      pool.priceUsd > 0,
  );
  const totalLiquidity =
    meaningfulPools.length === 0
      ? null
      : meaningfulPools.reduce((sum, pool) => sum + (pool.liquidityUsd ?? 0), 0);
  const directPools = evidence.pools.filter(
    (pool) => pool.status === "AVAILABLE" && pool.depth !== null,
  );
  const depth1 = conservativeDepth(directPools, "buyDepth1PctUsdWad", "sellDepth1PctUsdWad");
  const depth2 = conservativeDepth(directPools, "buyDepth2PctUsdWad", "sellDepth2PctUsdWad");
  const sourceCount = meaningfulPools.length === 0 ? null : meaningfulPools.length;
  const activity = candidate.activity;
  const token: TokenIdentity = {
    chain: candidate.candidate.chain as SupportedChain,
    tokenAddress: candidate.candidate.tokenAddress.toLowerCase(),
    symbol: evidence.symbol ?? candidate.candidate.symbol,
    name: evidence.name ?? candidate.candidate.name,
    decimals: evidence.decimals,
    deployer: evidence.creation?.creator ?? null,
    createdAt: timestamp(evidence.creation?.timestamp ?? null),
    originPlatform: "DIRECT_DEX",
  };
  const lifecycle: LifecycleSnapshot = {
    status: "ESTABLISHED",
    observedAt: assessedAt,
    confidence: evidence.creation?.status === "AVAILABLE" ? 1 : 0.5,
    evidenceHash: keccak256Hex(
      canonicalJson({
        chain: token.chain,
        token: token.tokenAddress,
        source: "phase7-indexed-evm-lane",
        evidenceStatus: evidence.status,
      }),
    ),
  };
  const authorities: AuthorityState = {
    mintAuthorityActive: evidence.privileges.mintAuthorityActive,
    freezeAuthorityActive: null,
    dangerousOwnerAdminPrivileges: evidence.privileges.dangerousOwnerAdminPrivileges,
    upgradeable: evidence.privileges.upgradeable,
    upgradeAuthority: evidence.privileges.admin ?? evidence.privileges.implementation,
    transferRestricted: evidence.privileges.transferRestricted,
    honeypotDetected: evidence.privileges.honeypotDetected,
  };
  const liquidity: LiquidityState = {
    totalLiquidityUsd: totalLiquidity,
    depth1PctUsd: depth1,
    depth2PctUsd: depth2,
    venueCount:
      meaningfulPools.length === 0 ? null : new Set(meaningfulPools.map((pool) => pool.dexId)).size,
    lpOwnershipConcentrationPct: null,
    lpLockStatus: canonicalLpStatus(evidence.pools),
    earliestLpUnlockAt: null,
    liquidityVenues: [...new Set(meaningfulPools.map((pool) => pool.dexId))],
    suddenCollapsePct24h: null,
  };
  const largestHolder = candidate.holderSummary.largestNonSystemPct;
  const holders: HolderConcentration = {
    topHolderPct: largestHolder,
    topFivePct: candidate.holderSummary.topFiveNonSystemPct,
    connectedClusterPct: null,
    bundledLaunchPct: null,
    individualWalletsUnderFivePct: largestHolder === null ? null : largestHolder <= 5,
    holderCount: candidate.holderSummary.observedHolderCount,
    organicHolderGrowthPct24h: null,
    evidenceScope: candidate.holderSummary.coverage === "COMPLETE" ? "FULL_CENSUS" : "UNAVAILABLE",
    topTokenAccountPct: null,
    resolvedTopOwnerPct: largestHolder,
    resolvedTopFiveOwnerPct: candidate.holderSummary.topFiveNonSystemPct,
  };
  const deployer: DeployerRisk = {
    deployerAddress: evidence.creation?.creator ?? null,
    creatorAddress: evidence.creation?.creator ?? null,
    fundingWallet: null,
    deployerHoldingsPct: null,
    knownRisk: null,
    priorRugCount: null,
    relatedWalletFundingDetected: null,
    walletRotationDetected: null,
  };
  const activityMetrics: ActivityQualityMetrics = {
    organicVolume24hUsd: activity.volumeUsd,
    realizedVolatility30dPct: null,
    washTradingDetected: activity.washTradingDetected,
    volumeFarmingDetected: activity.volumeFarmingDetected,
    suspiciousEarlyBuyers: null,
    suspiciousTransactionRepetition: activity.suspiciousTransactionRepetition,
    bundledLaunchDetected: null,
    fundingSourceDiversity: null,
  };
  const price = meaningfulPools[0]?.priceUsd ?? null;
  const oracle: OracleMetrics = {
    sourceCount,
    disagreementPct:
      sourceCount !== null && sourceCount > 1 ? null : sourceCount === null ? null : 0,
    confidenceBps: null,
    stale: price === null ? null : false,
    priceUsd: price,
    observedAt: assessedAt,
    manipulationCostUsd: depth1,
  };
  const derivatives: DerivativesCapacityMetrics = {
    spotLiquidityUsd: totalLiquidity,
    liquidityVenueCount: liquidity.venueCount,
    depth1PctUsd: depth1,
    depth2PctUsd: depth2,
    organicVolume24hUsd: activity.volumeUsd,
    realizedVolatilityPct: null,
    oracleSourceCount: sourceCount,
    oracleDisagreementPct: oracle.disagreementPct,
    oracleConfidenceBps: null,
    manipulationCostUsd: depth1,
    maximumSafeOpenInterestUsd: depth1,
    maximumPositionSizeUsd: depth1 === null ? null : depth1 * 0.25,
    maximumLeverage: 5,
    fundingImbalancePct: null,
    liquidationCapacityUsd: depth2,
  };
  return {
    token,
    lifecycle,
    authorities,
    liquidity,
    holders,
    deployer,
    activity: activityMetrics,
    oracle,
    derivatives,
  };
}

function uniquePersistedPools(
  dex: Phase7Candidate["dex"],
  gecko: Phase7Candidate["gecko"],
): readonly {
  readonly poolAddress: string;
  readonly dexId: string;
  readonly liquidityUsd: number | null;
  readonly priceUsd: number | null;
}[] {
  const pools = new Map<
    string,
    {
      poolAddress: string;
      dexId: string;
      liquidityUsd: number | null;
      priceUsd: number | null;
    }
  >();
  for (const pool of dex?.pools ?? [])
    pools.set(pool.pairAddress.toLowerCase(), {
      poolAddress: pool.pairAddress,
      dexId: pool.dexId,
      liquidityUsd: pool.liquidityUsd,
      priceUsd: pool.priceUsd,
    });
  for (const pool of gecko?.pools ?? []) {
    const key = pool.poolAddress.toLowerCase();
    const old = pools.get(key);
    pools.set(key, {
      poolAddress: old?.poolAddress ?? pool.poolAddress,
      dexId: old?.dexId ?? pool.dexId,
      liquidityUsd: Math.max(old?.liquidityUsd ?? 0, pool.liquidityUsd ?? 0) || null,
      priceUsd: old?.priceUsd ?? pool.priceUsd,
    });
  }
  return [...pools.values()];
}

function canonicalLpStatus(pools: readonly Phase7Pool[]): LiquidityState["lpLockStatus"] {
  if (pools.length === 0) return "UNKNOWN";
  if (pools.every((pool) => pool.lpControl === "BURNED")) return "BURNED";
  if (pools.some((pool) => pool.lpControl === "UNKNOWN" || pool.lpControl === undefined))
    return "UNKNOWN";
  return "UNKNOWN";
}

function conservativeDepth(
  pools: readonly Phase7Pool[],
  buyKey: "buyDepth1PctUsdWad" | "buyDepth2PctUsdWad",
  sellKey: "sellDepth1PctUsdWad" | "sellDepth2PctUsdWad",
): number | null {
  const values = pools.flatMap((pool) => [
    wadNumber(pool.depth?.[buyKey] ?? null),
    wadNumber(pool.depth?.[sellKey] ?? null),
  ]);
  if (values.length === 0 || values.some((value) => value === null)) return null;
  return Math.min(...values.filter((value): value is number => value !== null));
}

function wadNumber(value: string | number | null): number | null {
  if (value === null) return null;
  try {
    return Number(BigInt(String(value))) / 1e18;
  } catch {
    return null;
  }
}

function timestamp(value: number | null): string | null {
  return value === null ? null : new Date(value * 1_000).toISOString();
}

interface Phase7Output {
  readonly candidates: readonly Phase7Candidate[];
}
interface Phase7Candidate {
  readonly candidate: {
    readonly chain: string;
    readonly tokenAddress: string;
    readonly symbol: string | null;
    readonly name: string | null;
  };
  readonly currentEvidence: {
    readonly status: string;
    readonly name: string | null;
    readonly symbol: string | null;
    readonly decimals: number | null;
    readonly creation?: {
      readonly status: string;
      readonly creator: string | null;
      readonly timestamp: number | null;
    };
    readonly privileges: {
      readonly mintAuthorityActive: boolean | null;
      readonly dangerousOwnerAdminPrivileges: boolean | null;
      readonly transferRestricted: boolean | null;
      readonly honeypotDetected: boolean | null;
      readonly admin: string | null;
      readonly implementation: string | null;
      readonly upgradeable: boolean | null;
    };
    readonly pools: readonly Phase7Pool[];
  };
  readonly dex: {
    readonly meaningfulPoolCount: number;
    readonly totalObservedLiquidityUsd: number | null;
    readonly pools: readonly {
      readonly pairAddress: string;
      readonly dexId: string;
      readonly liquidityUsd: number | null;
      readonly priceUsd: number | null;
    }[];
  } | null;
  readonly gecko: {
    readonly pools: readonly {
      readonly poolAddress: string;
      readonly dexId: string;
      readonly liquidityUsd: number | null;
      readonly priceUsd: number | null;
    }[];
  } | null;
  readonly holderSummary: {
    readonly coverage: string;
    readonly largestNonSystemPct: number | null;
    readonly topFiveNonSystemPct: number | null;
    readonly observedHolderCount: number;
  };
  readonly activity: {
    readonly volumeUsd: number | null;
    readonly washTradingDetected: boolean | null;
    readonly volumeFarmingDetected: boolean | null;
    readonly suspiciousTransactionRepetition: boolean | null;
  };
}
interface Phase7Pool {
  readonly status: string;
  readonly lpControl?: "BURNED" | "TIME_LOCKED" | "DISTRIBUTED_NON_PRIVILEGED" | "UNKNOWN";
  readonly depth?: {
    readonly buyDepth1PctUsdWad?: string | null;
    readonly sellDepth1PctUsdWad?: string | null;
    readonly buyDepth2PctUsdWad?: string | null;
    readonly sellDepth2PctUsdWad?: string | null;
  } | null;
}
