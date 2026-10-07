import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  RiskAssessment,
  TokenIdentity,
} from "@arcmemeperps/domain";
import {
  analyzeActivity,
  assessRisk,
  AUDITED_RISK_RULES,
  type ActivityTrade,
} from "@arcmemeperps/risk-engine";
import { classifySystemHolder } from "@arcmemeperps/intelligence";
import {
  BlockscoutEvidenceProvider,
  BoundedEvmRpcPool,
  compareIndexedBalance,
  DexScreenerProvider,
  GeckoTerminalProvider,
  type DexAggregate,
  type DexPairObservation,
  type EvmEvidenceSnapshot,
  type IndexedEventLogs,
  type IndexedHolderCensus,
  type BlockscoutInstanceStatus,
  type IndexedTokenTransfers,
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

const fetchedAt = new Date().toISOString();
const phase6Path = resolve(process.cwd(), "evidence/winner-rebuild/phase6-evm-lane.json");
const phase6 = JSON.parse(readFileSync(phase6Path, "utf8")) as Phase6Output;
const evidenceDirectory = resolve(process.cwd(), "evidence/winner-rebuild/phase7-indexed-evm");
mkdirSync(resolve(evidenceDirectory, "holders"), { recursive: true });

const pendingOrder = ["PEPE", "SHIB", "BRETT", "xdp", "CLAUS", "EPOCH"];
const targets = phase6.candidates
  .filter((item) => item.assessment?.integrityStatus === "PENDING")
  .filter((item) => pendingOrder.includes(item.candidate.symbol ?? ""))
  .sort(
    (left, right) =>
      pendingOrder.indexOf(left.candidate.symbol ?? "") -
      pendingOrder.indexOf(right.candidate.symbol ?? ""),
  );

const publicEvmFallbacks: Readonly<Record<EvmChain, readonly string[]>> = {
  BASE: ["https://base.publicnode.com", "https://base.llamarpc.com"],
  BNB: ["https://bsc-dataseed1.defibit.io", "https://1rpc.io/bnb"],
  ETHEREUM: ["https://ethereum.publicnode.com", "https://rpc.flashbots.net"],
};
const geckoProviders = new Map<SupportedChain, GeckoTerminalProvider>();
const blockscoutProviders = new Map<SupportedChain, BlockscoutEvidenceProvider>();

const blockscoutProbeTokens: Readonly<Record<"ETHEREUM" | "BASE" | "BNB" | "ROBINHOOD", string>> = {
  ETHEREUM: "0x6982508145454ce325ddbE47a25d4ec3d2311933",
  BASE: "0x532f27101965dd16442e59d40670faf5ebb142e4",
  BNB: "0x3c5cd672b204ba0fc48e93b98c0922920a87912d",
  ROBINHOOD: "0x73584f92AA4Cb4484aB901e2622A581A76a9e35f",
};

const holderPageSize = Number(process.env.PHASE7_BLOCKSCOUT_PAGE_SIZE ?? 10_000);
const holderMaxPages = Number(process.env.PHASE7_BLOCKSCOUT_MAX_PAGES ?? 20);

const blockscoutStatus: BlockscoutInstanceStatus[] = [];
for (const chain of ["ETHEREUM", "BASE", "BNB", "ROBINHOOD"] as const) {
  const provider = new BlockscoutEvidenceProvider(chain, {
    pageSize: holderPageSize,
    maxPages: holderMaxPages,
    minRequestIntervalMs: Number(process.env.PHASE7_BLOCKSCOUT_INTERVAL_MS ?? 250),
  });
  blockscoutProviders.set(chain, provider);
  blockscoutStatus.push(await provider.probe(blockscoutProbeTokens[chain], fetchedAt));
}

const results: Phase7CandidateResult[] = [];
for (const item of targets) {
  results.push(await evaluateCandidate(item));
}

const qualified = results.filter(
  (item) =>
    item.assessment.integrityStatus === "QUALIFIED" &&
    item.assessment.derivativesStatus === "ELIGIBLE",
);
const output = {
  schemaVersion: "winner-rebuild/phase7-indexed-evm-lane-v1",
  fetchedAt,
  phase6StartCommit: "e098419892e35418ec8a132b969ad2afcdbef3cf",
  ruleVersion: AUDITED_RISK_RULES.version,
  dataPolicy: "indexed historical evidence; canonical RPC remains current-state authority",
  officialDocs: {
    blockscoutTokenRpc: "https://docs.blockscout.com/devs/apis/rpc/token",
    blockscoutAccountRpc: "https://docs.blockscout.com/devs/apis/rpc/account",
    blockscoutContractRpc: "https://docs.blockscout.com/devs/apis/rpc/contract",
    blockscoutLogsRpc: "https://docs.blockscout.com/devs/apis/rpc/logs",
  },
  blockscoutStatus,
  candidates: results,
  counts: {
    evaluated: results.length,
    qualified: qualified.length,
    integrityQualified: results.filter((item) => item.assessment.integrityStatus === "QUALIFIED")
      .length,
    watch: results.filter((item) => item.assessment.integrityStatus === "WATCH").length,
    pending: results.filter((item) => item.assessment.integrityStatus === "PENDING").length,
    rejected: results.filter((item) => item.assessment.integrityStatus === "REJECTED").length,
    derivativesEligible: results.filter((item) => item.assessment.derivativesStatus === "ELIGIBLE")
      .length,
    derivativesWatch: results.filter((item) => item.assessment.derivativesStatus === "WATCH")
      .length,
    derivativesUnassessedOrBlocked: results.filter(
      (item) =>
        item.assessment.derivativesStatus === "UNASSESSED" ||
        item.assessment.derivativesStatus === "BLOCKED",
    ).length,
  },
  testnetWritePerformed: false,
  mainnetWritePerformed: false,
  contractRedeploymentPerformed: false,
};
const outputPath = resolve(process.cwd(), "evidence/winner-rebuild/phase7-indexed-evm-lane.json");
writeFileSync(outputPath, `${JSON.stringify(jsonSafe(output), null, 2)}\n`, "utf8");

const pendingMatrix = results.map((item) => ({
  chain: item.candidate.chain,
  tokenAddress: item.candidate.tokenAddress,
  symbol: item.candidate.symbol,
  integrityStatus: item.assessment.integrityStatus,
  derivativesStatus: item.assessment.derivativesStatus,
  mandatoryUnknownGates: item.assessment.hardGates
    .filter((gate) => gate.state === "UNKNOWN" && gate.hard)
    .map((gate) => gate.code),
  explicitFailures: item.assessment.hardGates
    .filter((gate) => gate.state === "FAIL")
    .map((gate) => gate.code),
  exactBlockers: item.exactBlockers,
  evidenceClosure: item.evidenceClosure,
}));
writeFileSync(
  resolve(process.cwd(), "evidence/winner-rebuild/phase7-indexed-pending-matrix.json"),
  `${JSON.stringify(jsonSafe({ schemaVersion: "winner-rebuild/phase7-indexed-pending-matrix-v1", generatedAt: fetchedAt, ruleVersion: AUDITED_RISK_RULES.version, candidates: pendingMatrix }), null, 2)}\n`,
  "utf8",
);

if (qualified.length === 0) writePolicyAudit(results);
process.stdout.write(
  `${JSON.stringify({ output: outputPath, evaluated: results.length, qualified: qualified.length, pending: output.counts.pending, rejected: output.counts.rejected })}\n`,
);

async function evaluateCandidate(item: Phase6Candidate): Promise<Phase7CandidateResult> {
  const chain = item.candidate.chain as EvmChain;
  const tokenAddress = item.candidate.tokenAddress.toLowerCase();
  const network = NETWORK_CONFIGS[chain];
  const blockscout = blockscoutProviders.get(chain)!;
  const dex = new DexScreenerProvider(network);
  const gecko = geckoProviders.get(chain) ?? new GeckoTerminalProvider(network);
  geckoProviders.set(chain, gecko);
  const currentEvidence = item.evidence;
  const creation = await blockscout.readContractCreation(tokenAddress, fetchedAt);
  const metadata = await blockscout.readContractMetadata(tokenAddress, fetchedAt);
  const holders = await blockscout.readTokenHolders(tokenAddress, fetchedAt);
  const transferBounds =
    creation.blockNumber === null
      ? {}
      : {
          startBlock: creation.blockNumber,
          endBlock: currentEvidence.blockNumber ?? creation.blockNumber,
        };
  const transfers = await blockscout.readTokenTransfers(tokenAddress, fetchedAt, transferBounds);
  const dexResult = await dex.readToken(tokenAddress, fetchedAt);
  const geckoResult = await gecko.readToken(tokenAddress, fetchedAt);
  const pairs = dexResult.value?.pairs ?? [];
  const pools = uniquePools(pairs, geckoResult.value);
  const swapLogs = await readSwapLogs(blockscout, currentEvidence, pools, fetchedAt);
  const rpcCrossChecks = await crossCheckHolders(chain, holders, currentEvidence, tokenAddress);
  const holderSummary = deriveHolderSummary(holders, currentEvidence);
  const activity = deriveActivity(swapLogs, currentEvidence, pools);
  const history = await readHistory(gecko, pools, fetchedAt);
  const observation = buildObservation(
    item.candidate,
    currentEvidence,
    creation,
    metadata,
    holders,
    holderSummary,
    activity,
    pairs,
    geckoResult.value,
    history,
  );
  const assessment = assessRisk(observation, {
    assessedAt: fetchedAt,
    rules: AUDITED_RISK_RULES,
    mode: "AUDITED",
  });
  const holderFile = resolve(
    evidenceDirectory,
    "holders",
    `${chain.toLowerCase()}-${tokenAddress}.json`,
  );
  if (holders.holders.length > 0)
    writeFileSync(
      holderFile,
      `${JSON.stringify(jsonSafe({ schemaVersion: "indexed-holder-records-v1", provider: "BLOCKSCOUT_INSTANCE", chain, token: tokenAddress, fetchedAt, coverage: holders.coverage, endpointFamily: holders.endpointFamily, records: holders.holders }), null, 2)}\n`,
      "utf8",
    );
  const exactBlockers = exactBlockersFor(
    assessment,
    holders,
    creation,
    activity,
    currentEvidence,
    pools,
    rpcCrossChecks,
    blockscoutStatus.find((entry) => entry.chain === chain) ?? null,
  );
  return {
    candidate: item.candidate,
    status: "AVAILABLE",
    blockscout: {
      instance: blockscoutStatus.find((entry) => entry.chain === chain) ?? null,
      creation,
      metadata,
      holders: { ...holders, holders: holders.holders.slice(0, 20) },
      transfers: { ...transfers, transfers: transfers.transfers.slice(0, 50) },
      swapLogs: swapLogs.map((entry) => ({ ...entry, logs: entry.logs.slice(0, 50) })),
      holderFile: holders.holders.length > 0 ? holderFile : null,
    },
    currentEvidence,
    dex: summarizeDex(dexResult.value),
    gecko: summarizeGecko(geckoResult.value),
    history:
      history === null
        ? { status: "UNAVAILABLE", candles: 0 }
        : {
            status: "AVAILABLE",
            candles: history.length,
            firstTimestamp: history[0]?.timestamp ?? null,
            lastTimestamp: history.at(-1)?.timestamp ?? null,
          },
    holderSummary,
    rpcCrossChecks,
    activity,
    assessment: compactAssessment(assessment),
    exactBlockers,
    evidenceClosure: evidenceClosureFor(
      exactBlockers,
      holders,
      creation,
      activity,
      currentEvidence,
      pools,
    ),
  };
}

async function readSwapLogs(
  provider: BlockscoutEvidenceProvider,
  evidence: EvmEvidenceSnapshot,
  pools: readonly PoolSummary[],
  observedAt: string,
): Promise<readonly IndexedEventLogs[]> {
  const topic = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
  const latest = evidence.blockNumber ?? 0;
  if (latest === 0) return [];
  const from = Math.max(0, latest - 1_000_000);
  const outputs: IndexedEventLogs[] = [];
  for (const pool of pools
    .filter((entry) => entry.liquidityUsd !== null && entry.liquidityUsd >= 10_000)
    .slice(0, 5)) {
    outputs.push(await provider.readLogs(pool.poolAddress, topic, from, latest, observedAt));
  }
  return outputs;
}

async function crossCheckHolders(
  chain: EvmChain,
  holders: IndexedHolderCensus,
  evidence: EvmEvidenceSnapshot,
  token: string,
): Promise<readonly HolderRpcCrossCheck[]> {
  if (holders.holders.length === 0) return [];
  const urls = [
    ...new Set([...rpcUrlsForNetwork(NETWORK_CONFIGS[chain]), ...publicEvmFallbacks[chain]]),
  ];
  const rpc = new BoundedEvmRpcPool(urls, 8_000);
  const checks: HolderRpcCrossCheck[] = [];
  for (const holder of holders.holders.slice(0, 5)) {
    try {
      const raw = await rpc.request<string>("eth_call", [
        { to: token, data: `0x70a08231${holder.address.slice(2).padStart(64, "0")}` },
        "latest",
      ]);
      const rpcAmount = BigInt(raw).toString();
      checks.push({
        holder: holder.address,
        indexedAmount: holder.rawAmount,
        rpcAmount,
        status: compareIndexedBalance(holder.rawAmount, rpcAmount),
      });
    } catch (error) {
      checks.push({
        holder: holder.address,
        indexedAmount: holder.rawAmount,
        rpcAmount: null,
        status: "UNAVAILABLE",
        reason: safeError(error),
      });
    }
  }
  return checks;
}

function deriveHolderSummary(
  census: IndexedHolderCensus,
  evidence: EvmEvidenceSnapshot,
): HolderSummary {
  const supply = census.totalSupply ?? evidence.totalSupply;
  if (supply === null)
    return {
      coverage: census.coverage,
      supply: null,
      observedLargestNonSystemPct: null,
      largestNonSystemPct: null,
      topFiveNonSystemPct: null,
      topTenNonSystemPct: null,
      observedHolderCount: census.holders.length,
      excludedAddresses: [],
    };
  const denominator = BigInt(supply);
  const verifiedPools = evidence.pools
    .filter((pool) => pool.status === "AVAILABLE")
    .map((pool) => pool.pool.toLowerCase())
    .filter(isAddress);
  const excluded = new Set(
    census.holders
      .filter(
        (holder) =>
          classifySystemHolder({
            address: holder.address,
            canonicalPoolAddresses: verifiedPools,
          }).excludedFromConcentration,
      )
      .map((holder) => holder.address.toLowerCase()),
  );
  const entries = census.holders
    .map((holder) => ({ ...holder, amount: BigInt(holder.rawAmount) }))
    .filter((holder) => holder.amount > 0n && !excluded.has(holder.address.toLowerCase()))
    .sort((left, right) => (left.amount > right.amount ? -1 : left.amount < right.amount ? 1 : 0));
  const pct = (amount: bigint): number => Number((amount * 10_000n) / denominator) / 100;
  const largest = entries[0] === undefined ? null : pct(entries[0].amount);
  const topFive =
    entries.length === 0
      ? null
      : entries.slice(0, 5).reduce((sum, holder) => sum + pct(holder.amount), 0);
  const topTen =
    entries.length === 0
      ? null
      : entries.slice(0, 10).reduce((sum, holder) => sum + pct(holder.amount), 0);
  return {
    coverage: census.coverage,
    supply,
    observedLargestNonSystemPct: largest,
    largestNonSystemPct:
      census.coverage === "COMPLETE" ? largest : largest !== null && largest > 5 ? largest : null,
    topFiveNonSystemPct: census.coverage === "COMPLETE" ? topFive : null,
    topTenNonSystemPct: census.coverage === "COMPLETE" ? topTen : null,
    observedHolderCount: entries.length,
    excludedAddresses: [...excluded],
  };
}

function deriveActivity(
  logs: readonly IndexedEventLogs[],
  evidence: EvmEvidenceSnapshot,
  pools: readonly PoolSummary[],
): ActivityDerived {
  const trades: ActivityTrade[] = [];
  const target = evidence.pools[0]?.token0?.toLowerCase() ?? null;
  for (const entry of logs) {
    const pool = pools.find(
      (item) => item.poolAddress.toLowerCase() === entry.address.toLowerCase(),
    );
    if (pool === undefined || entry.coverage !== "COMPLETE") continue;
    for (const log of entry.logs) {
      const words = splitWords(log.data);
      if (words.length < 4) continue;
      const amount0In = BigInt(words[0]!);
      const amount1In = BigInt(words[1]!);
      const amount0Out = BigInt(words[2]!);
      const amount1Out = BigInt(words[3]!);
      const targetIs0 = target === pool.baseTokenAddress?.toLowerCase();
      const baseIn = targetIs0 ? amount0In : amount1In;
      const baseOut = targetIs0 ? amount0Out : amount1Out;
      const quoteIn = targetIs0 ? amount1In : amount0In;
      const quoteOut = targetIs0 ? amount1Out : amount0Out;
      const quoteAmount = Number(quoteIn > quoteOut ? quoteIn : quoteOut) / 1e18;
      const timestamp =
        log.timestamp === null ? null : new Date(log.timestamp * 1_000).toISOString();
      const trader = log.topics[1] === undefined ? null : topicAddress(log.topics[1]);
      if (
        timestamp === null ||
        trader === null ||
        !Number.isFinite(quoteAmount) ||
        quoteAmount <= 0
      )
        continue;
      trades.push({
        trader,
        side: baseIn > 0n ? "SELL" : baseOut > 0n ? "BUY" : "BUY",
        amountUsd: quoteAmount * (pool.priceUsd ?? 0),
        timestamp,
      });
    }
  }
  if (
    logs.length === 0 ||
    logs.some((entry) => entry.coverage !== "COMPLETE") ||
    trades.length < 20
  )
    return {
      status: "UNKNOWN",
      sampleCount: trades.length,
      volumeUsd: null,
      uniqueTraders: null,
      washTradingDetected: null,
      volumeFarmingDetected: null,
      suspiciousTransactionRepetition: null,
      fromBlock: logs[0]?.fromBlock ?? null,
      toBlock: logs[0]?.toBlock ?? null,
      reason: "NO_COMPLETE_INDEXED_SWAP_WINDOW",
    };
  const analysis = analyzeActivity(trades, { liquidityUsd: evidence.pools[0]?.priceUsd ?? null });
  return {
    status: analysis.status === "CLEAR" ? "CLEAR" : "SUSPICIOUS",
    sampleCount: trades.length,
    volumeUsd: analysis.features.grossVolumeUsd,
    uniqueTraders: analysis.features.uniqueTraderCount,
    washTradingDetected: analysis.status === "CLEAR" ? false : true,
    volumeFarmingDetected: analysis.status === "CLEAR" ? false : true,
    suspiciousTransactionRepetition: analysis.features.repeatedTradeSizePct >= 50,
    fromBlock: logs[0]?.fromBlock ?? null,
    toBlock: logs[0]?.toBlock ?? null,
    reason: analysis.reasons.join(";") || null,
  };
}

async function readHistory(
  provider: GeckoTerminalProvider,
  pools: readonly PoolSummary[],
  observedAt: string,
): Promise<readonly GeckoOhlcvPoint[] | null> {
  const pool = [...pools].sort(
    (left, right) => (right.liquidityUsd ?? -1) - (left.liquidityUsd ?? -1),
  )[0];
  if (pool === undefined) return null;
  const result = await provider.readOhlcv(pool.poolAddress, observedAt, "day", 1, 100);
  return result.value;
}

function buildObservation(
  candidate: Phase6Candidate["candidate"],
  evidence: EvmEvidenceSnapshot,
  creation: Phase7CandidateResult["blockscout"]["creation"],
  metadata: Phase7CandidateResult["blockscout"]["metadata"],
  census: IndexedHolderCensus,
  holderSummary: HolderSummary,
  activity: ActivityDerived,
  pairs: readonly DexPairObservation[],
  gecko: GeckoTokenObservation | null,
  history: readonly GeckoOhlcvPoint[] | null,
): MarketObservation {
  const pools = uniquePools(pairs, gecko);
  const meaningful = pools.filter(
    (pool) =>
      pool.liquidityUsd !== null &&
      pool.liquidityUsd >= 10_000 &&
      pool.priceUsd !== null &&
      pool.priceUsd > 0,
  );
  const prices = meaningful.map((pool) => pool.priceUsd!).sort((left, right) => left - right);
  const median = prices.length === 0 ? null : prices[Math.floor(prices.length / 2)]!;
  const disagreement =
    prices.length < 2 || median === null || median === 0
      ? prices.length === 0
        ? null
        : 0
      : ((prices.at(-1)! - prices[0]!) / median) * 100;
  const direct = evidence.pools.filter(
    (pool) => pool.status === "AVAILABLE" && pool.depth !== null,
  );
  const depth1 = conservativeDepth(
    direct.map((pool) => toBigInt(pool.depth!.buyDepth1PctUsdWad)),
    direct.map((pool) => toBigInt(pool.depth!.sellDepth1PctUsdWad)),
  );
  const depth2 = conservativeDepth(
    direct.map((pool) => toBigInt(pool.depth!.buyDepth2PctUsdWad)),
    direct.map((pool) => toBigInt(pool.depth!.sellDepth2PctUsdWad)),
  );
  const allPoolsDirect =
    meaningful.length > 0 &&
    meaningful.every((pool) =>
      direct.some((entry) => entry.pool.toLowerCase() === pool.poolAddress.toLowerCase()),
    );
  const lpLockStatus =
    allPoolsDirect && direct.every((pool) => pool.lpControl === "BURNED") ? "BURNED" : "UNKNOWN";
  const totalLiquidity = meaningful.reduce((sum, pool) => sum + (pool.liquidityUsd ?? 0), 0);
  const sourceCount =
    meaningful.length === 0
      ? null
      : new Set(meaningful.map((pool) => pool.poolAddress.toLowerCase())).size;
  const confidence = oracleConfidence(sourceCount, totalLiquidity, disagreement);
  const createdAt =
    creation.timestamp === null ? null : new Date(creation.timestamp * 1_000).toISOString();
  const token: TokenIdentity = {
    chain: candidate.chain as SupportedChain,
    tokenAddress: candidate.tokenAddress.toLowerCase(),
    symbol: evidence.symbol ?? candidate.symbol,
    name: evidence.name ?? candidate.name,
    decimals: evidence.decimals,
    deployer: creation.creator,
    createdAt,
    originPlatform: "DIRECT_DEX",
  };
  const lifecycle: LifecycleSnapshot = {
    status: "ESTABLISHED",
    observedAt: fetchedAt,
    confidence: creation.status === "AVAILABLE" ? 1 : 0.5,
    evidenceHash: keccak256Hex(
      canonicalJson({
        token: token.tokenAddress,
        chain: token.chain,
        creation: jsonSafe(creation),
        metadata: { status: metadata.status, verified: metadata.verified },
      } as never),
    ),
  };
  const authorities: AuthorityState = {
    mintAuthorityActive: evidence.privileges.mintAuthorityActive,
    freezeAuthorityActive: null,
    dangerousOwnerAdminPrivileges: evidence.privileges.dangerousOwnerAdminPrivileges,
    upgradeable:
      evidence.privileges.upgradeable ?? (metadata.isProxy === null ? null : metadata.isProxy),
    upgradeAuthority:
      evidence.privileges.admin ?? evidence.privileges.implementation ?? metadata.implementation,
    transferRestricted: evidence.privileges.transferRestricted,
    honeypotDetected: evidence.privileges.honeypotDetected,
  };
  const liquidity: LiquidityState = {
    totalLiquidityUsd: meaningful.length === 0 ? null : totalLiquidity,
    depth1PctUsd: depth1,
    depth2PctUsd: depth2,
    venueCount: meaningful.length === 0 ? null : new Set(meaningful.map((pool) => pool.venue)).size,
    lpOwnershipConcentrationPct: null,
    lpLockStatus,
    earliestLpUnlockAt: null,
    liquidityVenues: [...new Set(meaningful.map((pool) => pool.venue))],
    suddenCollapsePct24h: null,
  };
  const holders: HolderConcentration = {
    topHolderPct: holderSummary.largestNonSystemPct,
    topFivePct: holderSummary.topFiveNonSystemPct,
    connectedClusterPct: null,
    bundledLaunchPct: null,
    individualWalletsUnderFivePct:
      holderSummary.largestNonSystemPct === null ? null : holderSummary.largestNonSystemPct <= 5,
    holderCount: census.expectedHolderCount ?? holderSummary.observedHolderCount,
    organicHolderGrowthPct24h: null,
    evidenceScope: holderSummary.coverage === "COMPLETE" ? "FULL_CENSUS" : "UNAVAILABLE",
    topTokenAccountPct: null,
    resolvedTopOwnerPct: holderSummary.largestNonSystemPct,
    resolvedTopFiveOwnerPct: holderSummary.topFiveNonSystemPct,
  };
  const deployer: DeployerRisk = {
    deployerAddress: creation.creator,
    creatorAddress: creation.creator,
    fundingWallet: null,
    deployerHoldingsPct: null,
    knownRisk: null,
    priorRugCount: null,
    relatedWalletFundingDetected: null,
    walletRotationDetected: null,
  };
  const activityMetrics: ActivityQualityMetrics = {
    organicVolume24hUsd: activity.volumeUsd,
    realizedVolatility30dPct: history === null ? null : volatility(history),
    washTradingDetected: activity.washTradingDetected,
    volumeFarmingDetected: activity.volumeFarmingDetected,
    suspiciousEarlyBuyers: null,
    suspiciousTransactionRepetition: activity.suspiciousTransactionRepetition,
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
    activity: activityMetrics,
    oracle,
    derivatives: {
      spotLiquidityUsd: liquidity.totalLiquidityUsd,
      liquidityVenueCount: liquidity.venueCount,
      depth1PctUsd: depth1,
      depth2PctUsd: depth2,
      organicVolume24hUsd: activity.volumeUsd,
      realizedVolatilityPct: history === null ? null : volatility(history),
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

function exactBlockersFor(
  assessment: RiskAssessment,
  holders: IndexedHolderCensus,
  creation: Phase7CandidateResult["blockscout"]["creation"],
  activity: ActivityDerived,
  evidence: EvmEvidenceSnapshot,
  pools: readonly PoolSummary[],
  checks: readonly HolderRpcCrossCheck[],
  instance: Phase7CandidateResult["blockscout"]["instance"],
): readonly string[] {
  const blockers = assessment.hardGates
    .filter((gate) => gate.state === "UNKNOWN" || gate.state === "FAIL")
    .map((gate) => `${gate.state}:${gate.code}`);
  if (instance?.availability !== "AVAILABLE")
    blockers.push(`BLOCKSCOUT_${instance?.availability ?? "UNAVAILABLE"}`);
  if (creation.status !== "AVAILABLE") blockers.push("UNKNOWN_CONTRACT_CREATOR");
  if (holders.coverage !== "COMPLETE") blockers.push("OWNER_CENSUS_INCOMPLETE");
  if (checks.some((check) => check.status === "CONFLICTED")) blockers.push("HOLDER_RPC_CONFLICT");
  if (activity.status === "UNKNOWN") blockers.push("INSUFFICIENT_ACTIVITY");
  if (pools.filter((pool) => pool.liquidityUsd !== null && pool.liquidityUsd >= 10_000).length < 2)
    blockers.push("NO_SECOND_INDEPENDENT_PRICE_SOURCE");
  if (evidence.pools.every((pool) => pool.depth === null))
    blockers.push("INSUFFICIENT_DIRECT_DEPTH");
  if (evidence.pools.some((pool) => pool.lpControl === "UNKNOWN"))
    blockers.push("LP_CONTROL_UNKNOWN");
  blockers.push("UNKNOWN_CONNECTED_CLUSTER", "UNKNOWN_CREATOR_RISK", "UNKNOWN_FUNDING_GRAPH");
  return [...new Set(blockers)];
}

function evidenceClosureFor(
  blockers: readonly string[],
  holders: IndexedHolderCensus,
  creation: Phase7CandidateResult["blockscout"]["creation"],
  activity: ActivityDerived,
  evidence: EvmEvidenceSnapshot,
  pools: readonly PoolSummary[],
): readonly string[] {
  const closure = new Set<string>();
  if (holders.coverage !== "COMPLETE")
    closure.add("complete paginated holder census plus system-address evidence");
  if (creation.status !== "AVAILABLE")
    closure.add("indexed contract creation record cross-checked to canonical receipt");
  if (activity.status === "UNKNOWN")
    closure.add("complete indexed Swap-event observation window and activity analysis");
  if (evidence.pools.some((pool) => pool.lpControl === "UNKNOWN"))
    closure.add("venue-correct LP holder/locker/withdrawal-authority evidence");
  if (pools.filter((pool) => pool.liquidityUsd !== null && pool.liquidityUsd >= 10_000).length < 2)
    closure.add("second meaningful independent economic pool");
  closure.add("completed creator-risk corpus check");
  closure.add("bounded funding graph for creator and material wallets");
  closure.add("connected-cluster graph with coverage sufficient for the 5% rule");
  if (blockers.some((blocker) => blocker.includes("HONEYPOT")))
    closure.add("deterministic buy/sell simulation and transfer-control inspection");
  return [...closure];
}

function compactAssessment(assessment: RiskAssessment): CompactAssessment {
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

function uniquePools(
  pairs: readonly DexPairObservation[],
  gecko: GeckoTokenObservation | null,
): readonly PoolSummary[] {
  const map = new Map<string, PoolSummary>();
  for (const pair of pairs)
    map.set(pair.pairAddress.toLowerCase(), {
      poolAddress: pair.pairAddress,
      venue: pair.dexId,
      liquidityUsd: pair.liquidityUsd,
      priceUsd: pair.priceUsd,
      baseTokenAddress: pair.baseToken.address,
    });
  for (const pool of gecko?.pools ?? [])
    if (!map.has(pool.poolAddress.toLowerCase()))
      map.set(pool.poolAddress.toLowerCase(), {
        poolAddress: pool.poolAddress,
        venue: pool.dexId ?? "UNKNOWN",
        liquidityUsd: pool.liquidityUsd,
        priceUsd: pool.priceUsd,
        baseTokenAddress: null,
      });
  return [...map.values()];
}

function summarizeDex(value: DexAggregate | null): object | null {
  return value === null
    ? null
    : {
        pairCount: value.pairs.length,
        meaningfulPoolCount: value.meaningfulPoolCount,
        priceUsd: value.priceUsd,
        totalObservedLiquidityUsd: value.totalObservedLiquidityUsd,
        volume24hUsd: value.volume24hUsd,
        pools: value.pairs.map((pair) => ({
          pairAddress: pair.pairAddress,
          dexId: pair.dexId,
          liquidityUsd: pair.liquidityUsd,
          priceUsd: pair.priceUsd,
        })),
      };
}

function summarizeGecko(value: GeckoTokenObservation | null): object | null {
  return value === null
    ? null
    : {
        poolCount: value.pools.length,
        pools: value.pools.map((pool) => ({
          poolAddress: pool.poolAddress,
          dexId: pool.dexId,
          liquidityUsd: pool.liquidityUsd,
          priceUsd: pool.priceUsd,
        })),
      };
}

function conservativeDepth(
  buys: readonly (bigint | null)[],
  sells: readonly (bigint | null)[],
): number | null {
  const knownBuys = buys.filter((value): value is bigint => value !== null);
  const knownSells = sells.filter((value): value is bigint => value !== null);
  if (
    buys.length === 0 ||
    sells.length === 0 ||
    knownBuys.length !== buys.length ||
    knownSells.length !== sells.length
  )
    return null;
  const buy = knownBuys.reduce((sum, value) => sum + value, 0n);
  const sell = knownSells.reduce((sum, value) => sum + value, 0n);
  return Number(buy < sell ? buy : sell) / 1e18;
}

function toBigInt(value: bigint | string | null): bigint | null {
  if (value === null) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function volatility(points: readonly GeckoOhlcvPoint[]): number | null {
  if (points.length < 20) return null;
  const ordered = [...points].sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
  );
  if ((Date.parse(ordered.at(-1)!.timestamp) - Date.parse(ordered[0]!.timestamp)) / 86_400_000 < 20)
    return null;
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
  liquidity: number,
  disagreement: number | null,
): number | null {
  if (sourceCount === null || disagreement === null) return null;
  const liquidityScore = Math.min(2_000, Math.log10(Math.max(liquidity, 1)) * 350);
  const sourceScore = Math.min(2_500, sourceCount * 1_250);
  const agreementScore = Math.max(0, 1_500 - disagreement * 300);
  return Math.max(
    0,
    Math.min(10_000, Math.round(2_500 + sourceScore + liquidityScore + agreementScore)),
  );
}

function splitWords(value: string): readonly string[] {
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  if (clean.length % 64 !== 0) return [];
  return Array.from(
    { length: clean.length / 64 },
    (_, index) => `0x${clean.slice(index * 64, index * 64 + 64)}`,
  );
}

function topicAddress(value: string): string | null {
  return /^0x[0-9a-fA-F]{64}$/.test(value) ? `0x${value.slice(-40)}`.toLowerCase() : null;
}

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function writePolicyAudit(results: readonly Phase7CandidateResult[]): void {
  const lines = [
    "# Mandatory Evidence Policy Audit",
    "",
    `Generated: ${fetchedAt}`,
    "",
    "Phase 7 indexed EVM evidence acquisition completed without changing risk-rules/0.2.0. No candidate reached Integrity QUALIFIED plus Derivatives ELIGIBLE.",
    "",
    "For every residual UNKNOWN mandatory gate, this audit records the human-review questions required before any policy change.",
    "",
    "| Candidate | Residual mandatory gates / exact blockers | A. Immediate capital-loss prevention | B. Original token-integrity requirement | C. Sustainable public-market proof | D. Representation review | E. Unsafe scenario stopped |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const item of results) {
    const unknown =
      item.assessment.hardGates
        .filter((gate) => gate.state === "UNKNOWN" && gate.hard)
        .map((gate) => gate.code)
        .join(", ") || "none";
    lines.push(
      `| ${item.candidate.symbol ?? "UNKNOWN"} (${item.candidate.chain}) | ${unknown}; ${item.exactBlockers.join(", ")} | Yes for authority, liquidity, holder, activity, and oracle gates; an unknown must block automatic qualification until reviewed. | Yes where the gate protects token integrity or executable market safety; mature-market launch-only gates remain policy-defined optional evidence. | Indexed APIs close historical retrieval only when complete, cross-checked, and rate-sustainable; creator corpus, graph coverage, LP control, and Swap windows remain candidate-specific. | Do not change in Phase 7; human review may consider BLOCK, WATCH, CAPACITY_PENALTY, or NOT_APPLICABLE only after the unsafe scenario and coverage are documented. | Prevents hidden admin control, concentrated supply, removable liquidity, manipulation, wash/farm activity, creator risk, and false depth/oracle confidence. |`,
    );
  }
  lines.push(
    "",
    "## Required human review",
    "",
    "A. Is this evidence essential to prevent immediate capital loss?",
    "",
    "B. Is this a token-integrity requirement from the original product specification?",
    "",
    "C. Can it realistically be proven for ordinary public markets using sustainable production infrastructure?",
    "",
    "D. Is absence better represented as BLOCK, WATCH, CAPACITY_PENALTY, or NOT_APPLICABLE?",
    "",
    "E. What unsafe scenario does the gate stop?",
    "",
    "No rule classification, numeric threshold, or qualification result was changed by this artifact.",
  );
  writeFileSync(
    resolve(process.cwd(), "docs/MANDATORY_EVIDENCE_POLICY_AUDIT.md"),
    `${lines.join("\n")}\n`,
    "utf8",
  );
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return value;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "INDEXED_EVM_LANE_FAILED").replace(
    /https?:\/\/[^\s)]+/gi,
    "[endpoint]",
  );
}

type EvmChain = "BASE" | "BNB" | "ETHEREUM";
interface Phase6Output {
  readonly candidates: readonly Phase6Candidate[];
}
interface Phase6Candidate {
  readonly candidate: {
    readonly chain: string;
    readonly tokenAddress: string;
    readonly symbol: string | null;
    readonly name: string | null;
  };
  readonly status: string;
  readonly evidence: EvmEvidenceSnapshot;
  readonly assessment?: { readonly integrityStatus: string };
}
interface PoolSummary {
  readonly poolAddress: string;
  readonly venue: string;
  readonly liquidityUsd: number | null;
  readonly priceUsd: number | null;
  readonly baseTokenAddress: string | null;
}
interface HolderSummary {
  readonly coverage: string;
  readonly supply: string | null;
  readonly observedLargestNonSystemPct: number | null;
  readonly largestNonSystemPct: number | null;
  readonly topFiveNonSystemPct: number | null;
  readonly topTenNonSystemPct: number | null;
  readonly observedHolderCount: number;
  readonly excludedAddresses: readonly string[];
}
interface HolderRpcCrossCheck {
  readonly holder: string;
  readonly indexedAmount: string;
  readonly rpcAmount: string | null;
  readonly status: "CONSISTENT" | "CONFLICTED" | "UNAVAILABLE";
  readonly reason?: string;
}
interface ActivityDerived {
  readonly status: "CLEAR" | "SUSPICIOUS" | "UNKNOWN";
  readonly sampleCount: number;
  readonly volumeUsd: number | null;
  readonly uniqueTraders: number | null;
  readonly washTradingDetected: boolean | null;
  readonly volumeFarmingDetected: boolean | null;
  readonly suspiciousTransactionRepetition: boolean | null;
  readonly fromBlock: number | null;
  readonly toBlock: number | null;
  readonly reason: string | null;
}
interface CompactAssessment {
  readonly integrityStatus: string;
  readonly derivativesStatus: string;
  readonly ruleVersion: string;
  readonly hardGates: readonly {
    readonly code: string;
    readonly state: string;
    readonly hard: boolean;
  }[];
  readonly rejectionReasons: readonly unknown[];
  readonly unknownReasons: readonly unknown[];
  readonly warnings: readonly unknown[];
  readonly recommendedMaxLeverage: number | null;
  readonly recommendedMaxOI: number | null;
  readonly recommendedMaxPosition: number | null;
}
interface Phase7CandidateResult {
  readonly candidate: Phase6Candidate["candidate"];
  readonly status: string;
  readonly blockscout: {
    readonly instance: BlockscoutInstanceStatus | null;
    readonly creation: Awaited<ReturnType<BlockscoutEvidenceProvider["readContractCreation"]>>;
    readonly metadata: Awaited<ReturnType<BlockscoutEvidenceProvider["readContractMetadata"]>>;
    readonly holders: Omit<IndexedHolderCensus, "holders"> & {
      readonly holders: IndexedHolderCensus["holders"];
    };
    readonly transfers: Omit<IndexedTokenTransfers, "transfers"> & {
      readonly transfers: IndexedTokenTransfers["transfers"];
    };
    readonly swapLogs: readonly (Omit<IndexedEventLogs, "logs"> & {
      readonly logs: IndexedEventLogs["logs"];
    })[];
    readonly holderFile: string | null;
  };
  readonly currentEvidence: EvmEvidenceSnapshot;
  readonly dex: object | null;
  readonly gecko: object | null;
  readonly history: object;
  readonly holderSummary: HolderSummary;
  readonly rpcCrossChecks: readonly HolderRpcCrossCheck[];
  readonly activity: ActivityDerived;
  readonly assessment: CompactAssessment;
  readonly exactBlockers: readonly string[];
  readonly evidenceClosure: readonly string[];
}
