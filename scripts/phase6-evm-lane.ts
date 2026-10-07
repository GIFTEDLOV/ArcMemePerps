import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  ActivityQualityMetrics,
  AuthorityState,
  DeployerRisk,
  HolderConcentration,
  LifecycleSnapshot,
  LiquidityState,
  MarketObservation,
  OracleMetrics,
  TokenIdentity,
  RiskAssessment,
} from "@arcmemeperps/domain";
import { assessRisk, AUDITED_RISK_RULES } from "@arcmemeperps/risk-engine";
import {
  DexScreenerProvider,
  EvmEvidenceReader,
  GeckoTerminalProvider,
  type DexAggregate,
  type DexPairObservation,
  type EvmEvidenceSnapshot,
  type GeckoOhlcvPoint,
  type GeckoTokenObservation,
} from "@arcmemeperps/providers";
import {
  canonicalJson,
  keccak256Hex,
  NETWORK_CONFIGS,
  rpcUrlsForNetwork,
  type SupportedChain,
} from "@arcmemeperps/shared";

interface SnapshotMarket {
  readonly chain: string;
  readonly tokenAddress: string;
  readonly symbol: string | null;
  readonly name: string | null;
  readonly priceUsd: string | null;
  readonly originSpotLiquidityUsd: string | null;
  readonly volume24hUsd: string | null;
  readonly lifecycle?: { readonly status?: string; readonly observedAt?: string | null };
}

interface Candidate extends SnapshotMarket {
  readonly selection: "DISCOVERED_UNIVERSE" | "ESTABLISHED_CONTROL_SET";
}

const fetchedAt = new Date().toISOString();
const snapshot = JSON.parse(
  readFileSync(resolve(process.cwd(), "evidence/winner-rebuild/discovery-snapshot.json"), "utf8"),
) as { readonly observedAt: string; readonly markets: readonly SnapshotMarket[] };

const baseAssets = new Set([
  "SOL",
  "WSOL",
  "ETH",
  "WETH",
  "BNB",
  "WBNB",
  "USDC",
  "USDT",
  "USDE",
  "USDG",
  "USDB",
  "USAD",
  "DAI",
  "BUSD",
  "FDUSD",
  "WBTC",
  "CBTC",
  "CBBTC",
  "CRVUSD",
  "CIRBTC",
  "WSTETH",
  "EURC",
  "EUROC",
  "XAUT",
  "XAUt",
  "XAUG",
]);

const publicEvmFallbacks: Readonly<Record<EvmChain, readonly string[]>> = {
  BASE: ["https://base.publicnode.com", "https://base.llamarpc.com"],
  BNB: ["https://bsc-dataseed1.defibit.io", "https://1rpc.io/bnb"],
  ETHEREUM: ["https://ethereum.publicnode.com", "https://rpc.flashbots.net"],
};

const controls: readonly Candidate[] = [
  {
    chain: "ETHEREUM",
    tokenAddress: "0x6982508145454ce325ddb e47a25d4ec3d2311933".replace(/\s/g, ""),
    symbol: "PEPE",
    name: "Pepe",
    priceUsd: null,
    originSpotLiquidityUsd: null,
    volume24hUsd: null,
    selection: "ESTABLISHED_CONTROL_SET",
  },
  {
    chain: "ETHEREUM",
    tokenAddress: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce",
    symbol: "SHIB",
    name: "Shiba Inu",
    priceUsd: null,
    originSpotLiquidityUsd: null,
    volume24hUsd: null,
    selection: "ESTABLISHED_CONTROL_SET",
  },
  {
    chain: "BASE",
    tokenAddress: "0x532f27101965dd16442e59d40670faf5ebb142e4",
    symbol: "BRETT",
    name: "Brett",
    priceUsd: null,
    originSpotLiquidityUsd: null,
    volume24hUsd: null,
    selection: "ESTABLISHED_CONTROL_SET",
  },
];

const candidates = selectCandidates(
  snapshot.markets,
  controls,
  Number(process.env.PHASE6_EVM_LIMIT ?? 15),
);
const geckoProviders = new Map<SupportedChain, GeckoTerminalProvider>();

function providerFor(chain: SupportedChain): GeckoTerminalProvider {
  const existing = geckoProviders.get(chain);
  if (existing !== undefined) return existing;
  const provider = new GeckoTerminalProvider(NETWORK_CONFIGS[chain]);
  geckoProviders.set(chain, provider);
  return provider;
}

const results: unknown[] = [];
for (const candidate of candidates) {
  const chain = candidate.chain as EvmChain;
  const network = NETWORK_CONFIGS[chain];
  const rpcUrls = [...new Set([...rpcUrlsForNetwork(network), ...publicEvmFallbacks[chain]])];
  const dex = new DexScreenerProvider(network);
  const gecko = providerFor(chain);
  const reader = new EvmEvidenceReader(network, rpcUrls);
  try {
    const dexResult = await dex.readToken(candidate.tokenAddress, fetchedAt);
    const geckoResult = await gecko.readToken(candidate.tokenAddress, fetchedAt);
    const pairs = dexResult.value?.pairs ?? [];
    const geckoPools = geckoResult.value?.pools ?? [];
    const selectedHistoryPool =
      [...geckoPools].sort(
        (left, right) => (right.liquidityUsd ?? -1) - (left.liquidityUsd ?? -1),
      )[0]?.poolAddress ??
      [...pairs].sort((left, right) => (right.liquidityUsd ?? -1) - (left.liquidityUsd ?? -1))[0]
        ?.pairAddress ??
      null;
    const history =
      selectedHistoryPool === null
        ? null
        : await gecko.readOhlcv(selectedHistoryPool, fetchedAt, "day", 1, 100);
    const evidence = await reader.readToken(candidate.tokenAddress, pairs);
    const observation = buildObservation(
      candidate,
      dexResult.value,
      geckoResult.value,
      history?.value ?? null,
      evidence,
    );
    const assessment = assessRisk(observation, {
      assessedAt: fetchedAt,
      rules: AUDITED_RISK_RULES,
      mode: "AUDITED",
    });
    results.push({
      candidate,
      status: "AVAILABLE",
      evidence,
      history:
        history === null
          ? { status: "NOT_REQUESTED" }
          : {
              status: history.status,
              candles: history.value?.length ?? 0,
              reason: history.reason ?? history.error,
            },
      assessment: compactAssessment(assessment),
      exactBlockers: exactBlockers(assessment, evidence, dexResult.value, geckoResult.value),
    });
  } catch (error) {
    results.push({ candidate, status: "UNAVAILABLE", reason: safeError(error) });
  }
}

const normalizedResults = results as readonly {
  readonly candidate: Candidate;
  readonly status: string;
  readonly assessment?: { readonly integrityStatus: string; readonly derivativesStatus: string };
  readonly exactBlockers?: readonly string[];
  readonly evidence?: EvmEvidenceSnapshot;
}[];
const output = {
  schemaVersion: "winner-rebuild/phase6-evm-lane-v1",
  fetchedAt,
  snapshotObservedAt: snapshot.observedAt,
  ruleVersion: AUDITED_RISK_RULES.version,
  selection: "EVM_BASE_BNB_ETHEREUM_LIQUIDITY_VOLUME_STRATIFIED_PLUS_ESTABLISHED_CONTROLS",
  rpcStatusByChain: [...new Set(candidates.map((candidate) => candidate.chain))].map((chain) => ({
    chain,
    endpointsConfigured: [
      ...new Set([
        ...rpcUrlsForNetwork(NETWORK_CONFIGS[chain as EvmChain]),
        ...publicEvmFallbacks[chain as EvmChain],
      ]),
    ].length,
    successfulCandidates: normalizedResults.filter(
      (item) => item.candidate.chain === chain && (item.evidence?.rpc.successful ?? 0) > 0,
    ).length,
  })),
  candidates: results,
  counts: {
    evaluated: normalizedResults.filter((item) => item.status === "AVAILABLE").length,
    qualified: normalizedResults.filter(
      (item) =>
        item.assessment?.integrityStatus === "QUALIFIED" &&
        item.assessment?.derivativesStatus === "ELIGIBLE",
    ).length,
    integrityQualified: normalizedResults.filter(
      (item) => item.assessment?.integrityStatus === "QUALIFIED",
    ).length,
    watch: normalizedResults.filter((item) => item.assessment?.integrityStatus === "WATCH").length,
    pending: normalizedResults.filter((item) => item.assessment?.integrityStatus === "PENDING")
      .length,
    rejected: normalizedResults.filter((item) => item.assessment?.integrityStatus === "REJECTED")
      .length,
    derivativesEligible: normalizedResults.filter(
      (item) => item.assessment?.derivativesStatus === "ELIGIBLE",
    ).length,
    derivativesWatch: normalizedResults.filter(
      (item) => item.assessment?.derivativesStatus === "WATCH",
    ).length,
    derivativesUnassessedOrBlocked: normalizedResults.filter(
      (item) =>
        item.assessment?.derivativesStatus === "UNASSESSED" ||
        item.assessment?.derivativesStatus === "BLOCKED",
    ).length,
  },
  testnetWritePerformed: false,
  mainnetWritePerformed: false,
  contractRedeploymentPerformed: false,
};
const outputPath = resolve(process.cwd(), "evidence/winner-rebuild/phase6-evm-lane.json");
writeFileSync(outputPath, `${JSON.stringify(jsonSafe(output), null, 2)}\n`, "utf8");
const pending = normalizedResults.map((item) => ({
  chain: item.candidate.chain,
  tokenAddress: item.candidate.tokenAddress,
  symbol: item.candidate.symbol,
  integrityStatus: item.assessment?.integrityStatus ?? "UNAVAILABLE",
  derivativesStatus: item.assessment?.derivativesStatus ?? "UNAVAILABLE",
  exactBlockers: item.exactBlockers ?? ["EVIDENCE_READ_FAILED"],
}));
writeFileSync(
  resolve(process.cwd(), "evidence/winner-rebuild/phase6-evm-pending-matrix.json"),
  `${JSON.stringify(jsonSafe({ schemaVersion: "winner-rebuild/phase6-pending-matrix-v1", generatedAt: fetchedAt, ruleVersion: AUDITED_RISK_RULES.version, candidates: pending }), null, 2)}\n`,
  "utf8",
);
process.stdout.write(
  `${JSON.stringify({ evaluated: output.counts.evaluated, qualified: output.counts.qualified, pending: output.counts.pending, rejected: output.counts.rejected, output: outputPath })}\n`,
);

function selectCandidates(
  markets: readonly SnapshotMarket[],
  established: readonly Candidate[],
  limit: number,
): readonly Candidate[] {
  const byIdentity = new Map<string, Candidate>();
  for (const market of markets) {
    if (!isEvm(market.chain) || isBaseAsset(market)) continue;
    const key = `${market.chain}:${market.tokenAddress.toLowerCase()}`;
    const candidate: Candidate = { ...market, selection: "DISCOVERED_UNIVERSE" };
    const previous = byIdentity.get(key);
    if (previous === undefined || score(candidate) > score(previous))
      byIdentity.set(key, candidate);
  }
  for (const candidate of established) {
    const key = `${candidate.chain}:${candidate.tokenAddress.toLowerCase()}`;
    byIdentity.set(key, candidate);
  }
  const groups = new Map<string, Candidate[]>();
  for (const candidate of byIdentity.values()) {
    const group = groups.get(candidate.chain) ?? [];
    group.push(candidate);
    groups.set(candidate.chain, group);
  }
  for (const group of groups.values()) group.sort((left, right) => score(right) - score(left));
  const selected: Candidate[] = [];
  const selectedKeys = new Set<string>();
  for (const candidate of established) {
    if (selected.length >= limit) break;
    const key = `${candidate.chain}:${candidate.tokenAddress.toLowerCase()}`;
    if (selectedKeys.has(key)) continue;
    selected.push(candidate);
    selectedKeys.add(key);
  }
  const chains = ["BASE", "BNB", "ETHEREUM"].filter((chain) => groups.has(chain));
  for (let index = 0; selected.length < limit; index += 1) {
    let added = false;
    for (const chain of chains) {
      const item = groups.get(chain)?.[index];
      if (item === undefined) continue;
      const key = `${item.chain}:${item.tokenAddress.toLowerCase()}`;
      if (selectedKeys.has(key)) continue;
      selected.push(item);
      selectedKeys.add(key);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
  }
  return selected;
}

function buildObservation(
  candidate: Candidate,
  dex: DexAggregate | null,
  gecko: GeckoTokenObservation | null,
  history: readonly GeckoOhlcvPoint[] | null,
  evidence: EvmEvidenceSnapshot,
): MarketObservation {
  const pairs = dex?.pairs ?? [];
  const pools = uniquePools(pairs, gecko);
  const meaningfulPools = pools.filter(
    (pool) =>
      pool.liquidityUsd !== null &&
      pool.liquidityUsd >= 10_000 &&
      pool.priceUsd !== null &&
      pool.priceUsd > 0,
  );
  const prices = meaningfulPools.map((pool) => pool.priceUsd!).sort((left, right) => left - right);
  const median = prices.length === 0 ? null : prices[Math.floor(prices.length / 2)]!;
  const disagreement =
    prices.length < 2 || median === 0 || median === null
      ? prices.length === 0
        ? null
        : 0
      : ((prices.at(-1)! - prices[0]!) / median) * 100;
  const directPools = evidence.pools.filter(
    (pool) => pool.status === "AVAILABLE" && pool.depth !== null,
  );
  const depth1 = conservativeDepth(
    directPools.map((pool) => pool.depth!.buyDepth1PctUsdWad),
    directPools.map((pool) => pool.depth!.sellDepth1PctUsdWad),
  );
  const depth2 = conservativeDepth(
    directPools.map((pool) => pool.depth!.buyDepth2PctUsdWad),
    directPools.map((pool) => pool.depth!.sellDepth2PctUsdWad),
  );
  const lpStatuses = evidence.pools
    .filter((pool) => pool.status === "AVAILABLE")
    .map((pool) => pool.lpControl);
  const lpLockStatus =
    lpStatuses.length > 0 && lpStatuses.every((status) => status === "BURNED")
      ? "BURNED"
      : "UNKNOWN";
  const realizedVolatility = history === null ? null : volatility(history);
  const activityVolume =
    evidence.activity.status === "AVAILABLE" ? evidence.activity.volumeUsd : null;
  const totalLiquidity = meaningfulPools.reduce((sum, pool) => sum + (pool.liquidityUsd ?? 0), 0);
  const sourceCount =
    meaningfulPools.length === 0
      ? null
      : new Set(meaningfulPools.map((pool) => pool.poolAddress.toLowerCase())).size;
  const confidence = oracleConfidence(sourceCount, totalLiquidity, disagreement);
  const createdAt =
    evidence.creation.timestamp === null
      ? null
      : new Date(evidence.creation.timestamp * 1_000).toISOString();
  const token: TokenIdentity = {
    chain: candidate.chain as SupportedChain,
    tokenAddress: candidate.tokenAddress.toLowerCase(),
    symbol: evidence.symbol ?? candidate.symbol,
    name: evidence.name ?? candidate.name,
    decimals: evidence.decimals,
    deployer: evidence.creation.creator,
    createdAt,
    originPlatform: "DIRECT_DEX",
  };
  const lifecycle: LifecycleSnapshot = {
    status: "ESTABLISHED",
    observedAt: fetchedAt,
    confidence: evidence.creation.status === "AVAILABLE" ? 1 : 0.7,
    evidenceHash: keccak256Hex(
      canonicalJson({
        status: evidence.status,
        chainId: evidence.chainId,
        tokenAddress: candidate.tokenAddress,
        blockNumber: evidence.blockNumber,
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
    totalLiquidityUsd: pools.length === 0 ? null : totalLiquidity,
    depth1PctUsd: depth1,
    depth2PctUsd: depth2,
    venueCount: pools.length === 0 ? null : new Set(pools.map((pool) => pool.venue)).size,
    lpOwnershipConcentrationPct: null,
    lpLockStatus,
    earliestLpUnlockAt: null,
    liquidityVenues: [...new Set(pools.map((pool) => pool.venue))],
    suddenCollapsePct24h: null,
  };
  const holders: HolderConcentration = {
    topHolderPct: evidence.holders.largestNonSystemHolderPct,
    topFivePct: evidence.holders.topFiveNonSystemPct,
    connectedClusterPct: null,
    bundledLaunchPct: null,
    individualWalletsUnderFivePct:
      evidence.holders.largestNonSystemHolderPct === null
        ? null
        : evidence.holders.largestNonSystemHolderPct < 5,
    holderCount: evidence.holders.holderCount,
    organicHolderGrowthPct24h: null,
    evidenceScope: evidence.holders.evidenceScope === "FULL_CENSUS" ? "FULL_CENSUS" : "UNAVAILABLE",
    topTokenAccountPct: null,
    resolvedTopOwnerPct: evidence.holders.largestNonSystemHolderPct,
    resolvedTopFiveOwnerPct: evidence.holders.topFiveNonSystemPct,
  };
  const deployer: DeployerRisk = {
    deployerAddress: evidence.creation.creator,
    creatorAddress: evidence.creation.creator,
    fundingWallet: null,
    deployerHoldingsPct: null,
    knownRisk: null,
    priorRugCount: null,
    relatedWalletFundingDetected: null,
    walletRotationDetected: null,
  };
  const activity: ActivityQualityMetrics = {
    organicVolume24hUsd: activityVolume,
    realizedVolatility30dPct: realizedVolatility,
    washTradingDetected: evidence.activity.washTradingDetected,
    volumeFarmingDetected: evidence.activity.volumeFarmingDetected,
    suspiciousEarlyBuyers: null,
    suspiciousTransactionRepetition: evidence.activity.suspiciousTransactionRepetition,
    bundledLaunchDetected: null,
    fundingSourceDiversity: null,
  };
  const oracle: OracleMetrics = {
    sourceCount,
    disagreementPct: disagreement,
    confidenceBps: confidence,
    stale: sourceCount === null ? null : false,
    priceUsd: median,
    observedAt: fetchedAt,
    manipulationCostUsd: depth1,
  };
  return {
    token,
    lifecycle,
    authorities,
    liquidity,
    holders,
    deployer,
    activity,
    oracle,
    derivatives: {
      spotLiquidityUsd: liquidity.totalLiquidityUsd,
      liquidityVenueCount: liquidity.venueCount,
      depth1PctUsd: depth1,
      depth2PctUsd: depth2,
      organicVolume24hUsd: activityVolume,
      realizedVolatilityPct: realizedVolatility,
      oracleSourceCount: sourceCount,
      oracleDisagreementPct: disagreement,
      oracleConfidenceBps: confidence,
      manipulationCostUsd: depth1,
      maximumSafeOpenInterestUsd: depth1,
      maximumPositionSizeUsd: depth1 === null ? null : depth1 * 0.25,
      maximumLeverage: 5,
      fundingImbalancePct: null,
      liquidationCapacityUsd: depth2,
    },
  };
}

function compactAssessment(assessment: RiskAssessment): object {
  return {
    integrityStatus: assessment.integrityStatus,
    derivativesStatus: assessment.derivativesStatus,
    ruleVersion: assessment.ruleVersion,
    hardGates: assessment.hardGates,
    rejectionReasons: assessment.rejectionReasons,
    unknownReasons: assessment.unknownReasons,
    warnings: assessment.warnings,
    recommendedMaxLeverage: assessment.recommendedMaxLeverage,
    recommendedMaxOI: assessment.recommendedMaxOI,
    recommendedMaxPosition: assessment.recommendedMaxPosition,
  };
}

function exactBlockers(
  assessment: RiskAssessment,
  evidence: EvmEvidenceSnapshot,
  dex: DexAggregate | null,
  gecko: GeckoTokenObservation | null,
): readonly string[] {
  const blockers: string[] = assessment.hardGates
    .filter((gate) => gate.state === "UNKNOWN" || gate.state === "FAIL")
    .map((gate) => `${gate.state}:${gate.code}`);
  if (evidence.creation.status !== "AVAILABLE") blockers.push("UNKNOWN_CONTRACT_CREATOR");
  if (evidence.holders.status !== "AVAILABLE") blockers.push("OWNER_RECONSTRUCTION_UNAVAILABLE");
  if (evidence.activity.status !== "AVAILABLE") blockers.push("INSUFFICIENT_ACTIVITY");
  if (evidence.pools.some((pool) => pool.status === "AVAILABLE" && pool.lpControl === "UNKNOWN"))
    blockers.push("UNKNOWN_LP_CONTROL");
  const sourceCount = countUniqueMeaningfulPools(dex, gecko);
  if (sourceCount < 2) blockers.push("NO_SECOND_INDEPENDENT_PRICE_SOURCE");
  if (evidence.pools.every((pool) => pool.depth === null))
    blockers.push("INSUFFICIENT_OR_UNAVAILABLE_DIRECT_DEPTH");
  return [...new Set(blockers)];
}

function uniquePools(
  dex: readonly DexPairObservation[],
  gecko: GeckoTokenObservation | null,
): readonly {
  readonly poolAddress: string;
  readonly venue: string;
  readonly liquidityUsd: number | null;
  readonly priceUsd: number | null;
}[] {
  const map = new Map<
    string,
    { poolAddress: string; venue: string; liquidityUsd: number | null; priceUsd: number | null }
  >();
  for (const pair of dex)
    map.set(pair.pairAddress.toLowerCase(), {
      poolAddress: pair.pairAddress,
      venue: pair.dexId,
      liquidityUsd: pair.liquidityUsd,
      priceUsd: pair.priceUsd,
    });
  for (const pool of gecko?.pools ?? [])
    if (!map.has(pool.poolAddress.toLowerCase()))
      map.set(pool.poolAddress.toLowerCase(), {
        poolAddress: pool.poolAddress,
        venue: pool.dexId ?? "UNKNOWN",
        liquidityUsd: pool.liquidityUsd,
        priceUsd: pool.priceUsd,
      });
  return [...map.values()];
}

function countUniqueMeaningfulPools(
  dex: DexAggregate | null,
  gecko: GeckoTokenObservation | null,
): number {
  return uniquePools(dex?.pairs.slice() ?? [], gecko).filter(
    (pool) => pool.liquidityUsd !== null && pool.liquidityUsd >= 10_000,
  ).length;
}

function conservativeDepth(
  buys: readonly (bigint | null)[],
  sells: readonly (bigint | null)[],
): number | null {
  const buy = buys
    .filter((value): value is bigint => value !== null)
    .reduce((sum, value) => sum + value, 0n);
  const sell = sells
    .filter((value): value is bigint => value !== null)
    .reduce((sum, value) => sum + value, 0n);
  if (
    buys.length === 0 ||
    sells.length === 0 ||
    buys.some((value) => value === null) ||
    sells.some((value) => value === null)
  )
    return null;
  return Number(buy < sell ? buy : sell) / 1e18;
}

function volatility(points: readonly GeckoOhlcvPoint[]): number | null {
  if (points.length < 20) return null;
  const ordered = [...points].sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
  );
  const spanDays =
    (Date.parse(ordered.at(-1)!.timestamp) - Date.parse(ordered[0]!.timestamp)) / 86_400_000;
  if (spanDays < 20) return null;
  const returns: number[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!.closeUsd;
    const current = ordered[index]!.closeUsd;
    if (previous > 0 && current > 0) returns.push(Math.log(current / previous));
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(365) * 100;
}

function oracleConfidence(
  sourceCount: number | null,
  totalLiquidity: number,
  disagreement: number | null,
): number | null {
  if (sourceCount === null || disagreement === null) return null;
  const liquidityScore = Math.min(2_000, Math.log10(Math.max(totalLiquidity, 1)) * 350);
  const sourceScore = Math.min(2_500, sourceCount * 1_250);
  const agreementScore = Math.max(0, 1_500 - disagreement * 300);
  return Math.max(
    0,
    Math.min(10_000, Math.round(2_500 + sourceScore + liquidityScore + agreementScore)),
  );
}

function score(candidate: SnapshotMarket): number {
  return (
    Math.log10(Math.max(1, Number(candidate.originSpotLiquidityUsd ?? "0"))) +
    Math.log10(Math.max(1, Number(candidate.volume24hUsd ?? "0")))
  );
}

type EvmChain = "BASE" | "BNB" | "ETHEREUM";

function isEvm(chain: string): chain is EvmChain {
  return chain === "BASE" || chain === "BNB" || chain === "ETHEREUM";
}

function isBaseAsset(market: SnapshotMarket): boolean {
  return (
    baseAssets.has((market.symbol ?? "").trim().toUpperCase()) ||
    market.tokenAddress.toLowerCase() === "0x0000000000000000000000000000000000000000"
  );
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "EVM_LANE_FAILED").replace(
    /https?:\/\/[^\s)]+/gi,
    "[endpoint]",
  );
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return value;
}
