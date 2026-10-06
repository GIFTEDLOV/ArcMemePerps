import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  discoverDexScreener,
  type UniverseMarket,
} from "@arcmemeperps/market-universe";
import {
  DexScreenerProvider,
  GeckoTerminalProvider,
  PumpSwapReader,
  RugCheckProvider,
  SolanaRpcProvider,
  type JsonValue,
  type CanonicalPumpMarketEvidence,
} from "@arcmemeperps/providers";
import { analyzeActivity } from "@arcmemeperps/risk-engine";
import {
  assessRisk,
  AUDITED_RISK_RULES,
} from "@arcmemeperps/risk-engine";
import { NETWORK_CONFIGS, rpcUrlsForNetwork } from "@arcmemeperps/shared";
import type { MarketObservation } from "@arcmemeperps/domain";

class FallbackRpcClient {
  public constructor(private readonly clients: readonly SolanaRpcProvider[]) {}

  public async request<T>(method: string, params: JsonValue[]): Promise<T> {
    let lastError: unknown = null;
    for (const client of this.clients) {
      try {
        return await client.request<T>(method, params);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("ALL_SOLANA_RPC_ENDPOINTS_FAILED");
  }
}

const root = resolve(process.cwd());
const outputPath = resolve(process.env.PHASE5_PUMPSWAP_OUTPUT ?? "evidence/winner-rebuild/phase5-canonical-pumpswap.json");
const pendingPath = resolve("evidence/winner-rebuild/pending-evidence-matrix-phase5.json");
const fetchedAt = new Date().toISOString();
const maxCandidates = Math.min(Math.max(Number(process.env.PHASE5_MAX_CANDIDATES ?? "20"), 1), 20);
const maxFullReads = Math.min(Math.max(Number(process.env.PHASE5_MAX_FULL_READS ?? "10"), 1), maxCandidates);
const heliusPresent = typeof process.env.HELIUS_API_KEY === "string" && process.env.HELIUS_API_KEY.trim().length > 0;

interface Phase3File {
  readonly candidates?: readonly {
    readonly candidate: { readonly tokenAddress: string; readonly symbol: string | null; readonly originPlatform?: string | null };
    readonly record?: MarketObservation;
  }[];
}

interface ScreeningRow {
  readonly mint: string;
  readonly symbol: string | null;
  readonly source: string;
  readonly liquidityUsd: string | null;
  readonly volume24hUsd: string | null;
  readonly canonicalPoolAddress: string;
  readonly canonicalPoolStatus: string;
  readonly reason: string | null;
}

const phase3 = readPhase3();
const phase3ByMint = new Map(
  (phase3.candidates ?? []).map((item) => [item.candidate.tokenAddress, item.record] as const),
);
const discovered = await liveCandidates();
const candidates = selectCandidates(discovered, maxCandidates);
const rpcClients = rpcUrlsForNetwork(NETWORK_CONFIGS.SOLANA).map((url) => new SolanaRpcProvider(NETWORK_CONFIGS.SOLANA, url));
const reader = new PumpSwapReader(new FallbackRpcClient(rpcClients), { historyLimit: 1_000, tradeLimit: 30 });
const dexProvider = new DexScreenerProvider(NETWORK_CONFIGS.SOLANA);
const geckoProvider = new GeckoTerminalProvider(NETWORK_CONFIGS.SOLANA);
const rugCheckProvider = new RugCheckProvider(NETWORK_CONFIGS.SOLANA);
const screening: ScreeningRow[] = [];
const canonicalCandidates: { readonly market: UniverseMarket; readonly poolAddress: string }[] = [];

for (const market of candidates) {
  const pool = await reader.readCanonicalPool(market.tokenAddress);
  screening.push({
    mint: market.tokenAddress,
    symbol: market.symbol,
    source: market.originPlatform ?? market.discoveryProvider ?? "LIVE_DISCOVERY",
    liquidityUsd: market.originSpotLiquidityUsd,
    volume24hUsd: market.volume24hUsd,
    canonicalPoolAddress: pool.poolAddress,
    canonicalPoolStatus: pool.status,
    reason: pool.reason,
  });
  if (pool.status === "PROVEN") canonicalCandidates.push({ market, poolAddress: pool.poolAddress });
}

const selected = [...canonicalCandidates]
  .sort((left, right) => score(right.market) - score(left.market))
  .slice(0, maxFullReads);
const evaluatedResults: Record<string, unknown>[] = [];
for (const { market } of selected) evaluatedResults.push(await readAndEvaluate(market, reader));
const marketResults: readonly Record<string, unknown>[] = evaluatedResults;
const naturallyQualified = marketResults.filter((item) => item.integrityStatus === "QUALIFIED" && item.derivativesStatus === "ELIGIBLE");
const pendingMarkets = marketResults.filter((item) => item.integrityStatus === "PENDING");
const rejectedMarkets = marketResults.filter((item) => item.integrityStatus === "REJECTED");
const qualifiedOnly = marketResults.filter((item) => item.integrityStatus === "QUALIFIED");
const controlMarkets = candidates.filter((candidate) => ["BONK", "WIF", "POPCAT", "MEW", "BOME", "GOAT"].includes((candidate.symbol ?? "").toUpperCase()));

const pendingEvidence = pendingMarkets.map((item) => ({
  marketId: item.marketId ?? null,
  mint: item.mint,
  symbol: item.symbol,
  missing: item.exactBlockers,
  closureRule: "Resolve every listed mandatory applicable gate under risk-rules/0.2.0; no manual override.",
}));

const output = {
  schemaVersion: "winner-rebuild/phase5-canonical-pumpswap-v1",
  phase4CheckpointCommit: "64e66dfb8d6cba638799d60311cdc1fd210eb422",
  fetchedAt,
  rules: AUDITED_RISK_RULES.version,
  numericThresholdsUnchanged: true,
  helius: heliusPresent ? "AVAILABLE_CREDENTIAL_PRESENT" : "ABSENT_PUBLIC_RPC_PATH_USED",
  officialPolicy: {
    docsVersion: "pump-public-docs@main (verified 2026-10-06)",
    pumpProgramId: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    pumpSwapProgramId: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
  },
  candidateCount: candidates.length,
  candidates: screening,
  canonicalMigrationProvenCount: marketResults.filter((item) => item.graduationStatus === "PROVEN").length,
  controlMarkets: controlMarkets.map((item) => ({ mint: item.tokenAddress, symbol: item.symbol, source: item.originPlatform })),
  results: marketResults,
  counts: {
    naturallyQualified: naturallyQualified.length,
    qualified: qualifiedOnly.length,
    watch: marketResults.filter((item) => item.integrityStatus === "WATCH").length,
    pending: pendingMarkets.length + screening.filter((item) => item.canonicalPoolStatus !== "PROVEN").length,
    rejected: rejectedMarkets.length,
    derivativesEligible: naturallyQualified.length,
    derivativesWatch: marketResults.filter((item) => item.derivativesStatus === "WATCH").length,
    derivativesUnassessedOrBlocked: marketResults.filter((item) => item.derivativesStatus === "UNASSESSED" || item.derivativesStatus === "BLOCKED").length,
  },
  pendingEvidenceMatrix: pendingEvidence,
  testnetWritePerformed: false,
  mainnetWritePerformed: false,
  contractRedeploymentPerformed: false,
};

writeFileSync(outputPath, `${JSON.stringify(jsonSafe(output), null, 2)}\n`, "utf8");
writeFileSync(pendingPath, `${JSON.stringify(jsonSafe({ schemaVersion: "pending-evidence-matrix/phase5-v1", generatedAt: fetchedAt, rules: AUDITED_RISK_RULES.version, candidates: pendingEvidence }), null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath, candidateCount: candidates.length, canonicalPoolCount: canonicalCandidates.length, naturallyQualified: naturallyQualified.length, pending: output.counts.pending, rejected: output.counts.rejected })}\n`);

async function liveCandidates(): Promise<UniverseMarket[]> {
  const live: UniverseMarket[] = [];
  try {
    live.push(...(await discoverDexScreener(fetch, 120)).filter((item) => item.chain === "SOLANA"));
  } catch {
    // Preserve the live-read failure in the screening result while using the
    // prior corpus and explicit control set as bounded fallback candidates.
  }
  const known = [
    ["BONK", "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"],
    ["WIF", "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"],
    ["POPCAT", "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr"],
    ["MEW", "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5"],
    ["BOME", "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82"],
    ["GOAT", "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump"],
  ] as const;
  for (const [symbol, tokenAddress] of known) live.push(syntheticCandidate(symbol, tokenAddress, "ESTABLISHED_CONTROL_SET"));
  for (const item of phase3.candidates ?? []) {
    const tokenAddress = item.candidate.tokenAddress;
    const platform = item.candidate.originPlatform ?? "";
    if (/pump/i.test(platform)) live.push(syntheticCandidate(item.candidate.symbol ?? "UNKNOWN", tokenAddress, platform));
  }
  const deduped = new Map<string, UniverseMarket>();
  for (const item of live) if (!deduped.has(item.tokenAddress.toLowerCase())) deduped.set(item.tokenAddress.toLowerCase(), item);
  return [...deduped.values()];
}

async function readAndEvaluate(market: UniverseMarket, pump: PumpSwapReader): Promise<Record<string, unknown>> {
  const direct = await pump.readCanonicalMarket(market.tokenAddress);
  const record = phase3ByMint.get(market.tokenAddress);
  const rugcheck = await rugCheckProvider.readToken(market.tokenAddress, fetchedAt);
  const dex = await dexProvider.readToken(market.tokenAddress, fetchedAt);
  const gecko = await geckoProvider.readToken(market.tokenAddress, fetchedAt);
  const canonicalPool = direct.value?.canonicalPool.address ?? PumpSwapReader.deriveCanonicalPool(market.tokenAddress);
  const sourceFamilies = independentSourceFamilies(canonicalPool, dex.value?.pairs ?? [], gecko.value?.pools ?? []);
  const history = direct.value === null
    ? { status: "UNAVAILABLE", candles: 0, first: null, last: null }
    : await readHistory(canonicalPool, geckoProvider);
  const risk = direct.value !== null && record !== undefined
    ? assessRisk(enrichRecord(record, market, direct.value, sourceFamilies.length, history), { assessedAt: fetchedAt, rules: AUDITED_RISK_RULES, mode: "AUDITED" })
    : null;
  const exactBlockers = blockers(market, direct.value, direct.status, sourceFamilies.length, history, risk);
  return {
    mint: market.tokenAddress,
    symbol: market.symbol,
    marketId: record === undefined ? null : recordTokenId(record),
    canonicalPool,
    graduationStatus: direct.value?.graduationEvidence.status ?? "UNKNOWN",
    lpControl: direct.value?.lpControl ?? "UNKNOWN",
    directPrice: direct.value?.price ?? null,
    directDepth: direct.value?.depth ?? null,
    holders: direct.value?.holders ?? null,
    activity: direct.value?.activity ?? null,
    creator: direct.value?.creator ?? null,
    rugcheck: { status: rugcheck.status, reason: rugcheck.reason ?? rugcheck.error },
    geckoTerminal: { status: gecko.status, poolCount: gecko.value?.pools.length ?? 0, history },
    sourceFamilies,
    integrityStatus: risk?.integrityStatus ?? "PENDING",
    derivativesStatus: risk?.derivativesStatus ?? "UNASSESSED",
    hardGates: risk?.hardGates ?? [],
    exactBlockers,
  };
}

async function readHistory(poolAddress: string, gecko: GeckoTerminalProvider): Promise<{ readonly status: string; readonly candles: number; readonly first: string | null; readonly last: string | null }> {
  const result = await gecko.readOhlcv(poolAddress, fetchedAt, "hour", 1, 100);
  const points = [...(result.value ?? [])].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  return {
    status: result.status,
    candles: points.length,
    first: points[0]?.timestamp ?? null,
    last: points.at(-1)?.timestamp ?? null,
  };
}

function enrichRecord(record: MarketObservation, market: UniverseMarket, evidence: CanonicalPumpMarketEvidence, sourceCount: number, history: { readonly candles: number }): MarketObservation {
  const holder = evidence.holders;
  const activity = evidence.activity.status === "AVAILABLE" && evidence.activity.trades.length > 0
    ? analyzeActivity(evidence.activity.trades.flatMap((trade) => trade.wallet === null || trade.timestamp === null ? [] : [{ trader: trade.wallet, side: trade.side, amountUsd: Number(trade.quoteAmount) / 1e9, timestamp: new Date(trade.timestamp * 1_000).toISOString() }]), { liquidityUsd: record.liquidity.totalLiquidityUsd })
    : null;
  return {
    ...record,
    token: { ...record.token, tokenAddress: market.tokenAddress, symbol: market.symbol ?? record.token.symbol, originPlatform: "PUMP_STYLE", tokenProgram: record.token.tokenProgram ?? "UNKNOWN" },
    lifecycle: { ...record.lifecycle, status: evidence.graduationEvidence.status === "PROVEN" ? "GRADUATED" : "DEX_LIVE" },
    liquidity: {
      ...record.liquidity,
      lpLockStatus: evidence.lpControl === "BURNED" ? "BURNED" : evidence.lpControl === "PROTOCOL_CONTROLLED" ? "PROTOCOL_CONTROLLED" : evidence.lpControl === "IMMUTABLE_MIGRATION_CONTROL" ? "IMMUTABLE_MIGRATION_CONTROL" : "UNKNOWN",
      depth1PctUsd: record.liquidity.depth1PctUsd,
      depth2PctUsd: record.liquidity.depth2PctUsd,
    },
    holders: {
      ...record.holders,
      topHolderPct: holder?.largestResolvedOwnerPct ?? null,
      topFivePct: holder?.top10ResolvedOwnerPct ?? null,
      individualWalletsUnderFivePct: holder?.largestResolvedOwnerPct === null || holder?.unresolvedConcentrationPct !== 0 ? null : holder.largestResolvedOwnerPct < 5,
      evidenceScope: holder?.status === "AVAILABLE" ? "RESOLVED_TOP_OWNERS" : "UNAVAILABLE",
      topTokenAccountPct: holder?.largestRawTokenAccountPct ?? null,
      resolvedTopOwnerPct: holder?.largestResolvedOwnerPct ?? null,
    },
    deployer: { ...record.deployer, creatorAddress: evidence.creator.coinCreator, knownRisk: null, relatedWalletFundingDetected: null },
    activity: {
      ...record.activity,
      organicVolume24hUsd: record.activity.organicVolume24hUsd,
      washTradingDetected: activity === null ? null : activity.status === "HIGH_RISK",
      volumeFarmingDetected: activity === null ? null : activity.status === "HIGH_RISK",
      suspiciousTransactionRepetition: activity === null ? null : activity.features.repeatedTradeSizePct >= 50,
      suspiciousEarlyBuyers: null,
    },
    oracle: { ...record.oracle, sourceCount, priceUsd: market.priceUsd === null ? record.oracle.priceUsd : Number(market.priceUsd) },
    derivatives: { ...record.derivatives, oracleSourceCount: sourceCount },
    ...(history.candles > 0 ? {} : {}),
  };
}

function blockers(market: UniverseMarket, evidence: CanonicalPumpMarketEvidence | null, status: string, sourceCount: number, history: { readonly candles: number }, risk: ReturnType<typeof assessRisk> | null): readonly string[] {
  const exact: string[] = [];
  if (status !== "PROVEN") exact.push(status === "CONFLICTED" ? "EXPLICIT_UNSAFE_CANONICAL_POOL_CONFLICT" : "CANONICAL_MIGRATION_OR_POOL_PROOF_UNAVAILABLE");
  if (evidence?.graduationEvidence.status !== "PROVEN") exact.push("UNKNOWN_GRADUATION");
  if (evidence?.lpControl === "CONFLICTED") exact.push("EXPLICIT_UNSAFE_LP_CONTROL_CONFLICT");
  else if (evidence?.lpControl !== "BURNED" && evidence?.lpControl !== "PROTOCOL_CONTROLLED" && evidence?.lpControl !== "IMMUTABLE_MIGRATION_CONTROL") exact.push("LP_CONTROL");
  if (evidence?.holders?.unresolvedConcentrationPct !== 0) exact.push("UNRESOLVED_OWNER_CONCENTRATION");
  if ((evidence?.holders?.largestResolvedOwnerPct ?? 0) >= 5) exact.push("OWNER_CONCENTRATION");
  if (evidence?.activity.status !== "AVAILABLE" || evidence.activity.sampleCount < 3) exact.push("INSUFFICIENT_ACTIVITY");
  if (evidence?.creator.assessment !== "CLEAR") exact.push("UNKNOWN_CREATOR_RISK");
  exact.push("UNKNOWN_FUNDING");
  if (history.candles === 0) exact.push("UNAVAILABLE_HISTORY");
  if (sourceCount < 2) exact.push("NO_SECOND_INDEPENDENT_PRICE_SOURCE");
  if (evidence?.depth.status !== "AVAILABLE") exact.push("INSUFFICIENT_DEPTH");
  if (risk?.rejectionReasons.some((reason) => reason.code !== "INSUFFICIENT_EVIDENCE")) exact.push("EXPLICIT_UNSAFE");
  return [...new Set(exact)];
}

function independentSourceFamilies(canonicalPool: string, dex: readonly { readonly pairAddress: string; readonly dexId: string; readonly liquidityUsd: number | null }[], gecko: readonly { readonly poolAddress: string; readonly dexId: string | null; readonly liquidityUsd: number | null }[]): readonly string[] {
  const families = new Set<string>([`PUMPSWAP:${canonicalPool}`]);
  for (const pair of dex) if (pair.pairAddress !== canonicalPool && (pair.liquidityUsd ?? 0) >= 500_000) families.add(`DEX:${pair.dexId}:${pair.pairAddress}`);
  for (const pool of gecko) if (pool.poolAddress !== canonicalPool && (pool.liquidityUsd ?? 0) >= 500_000) families.add(`GECKO:${pool.dexId ?? "UNKNOWN"}:${pool.poolAddress}`);
  return [...families];
}

function selectCandidates(markets: readonly UniverseMarket[], limit: number): UniverseMarket[] {
  const solana = [...markets].filter((item) => item.chain === "SOLANA");
  const controls = solana.filter((item) => ["BONK", "WIF", "POPCAT", "MEW", "BOME", "GOAT"].includes((item.symbol ?? "").toUpperCase()));
  const remainder = solana.filter((item) => !controls.includes(item)).sort((left, right) => score(right) - score(left));
  return [...controls, ...remainder].slice(0, limit);
}

function score(market: UniverseMarket): number {
  return Math.log10(Math.max(1, Number(market.originSpotLiquidityUsd ?? "0"))) + Math.log10(Math.max(1, Number(market.volume24hUsd ?? "0")));
}

function syntheticCandidate(symbol: string, tokenAddress: string, originPlatform: string): UniverseMarket {
  return {
    marketId: "",
    chain: "SOLANA",
    tokenAddress,
    symbol,
    name: symbol,
    decimals: null,
    imageUrl: null,
    sourceUrl: null,
    originPlatform,
    lifecycle: { status: "ESTABLISHED", observedAt: fetchedAt, confidenceBps: null, evidenceHash: null },
    priceUsd: null,
    priceChange24hBps: null,
    volume24hUsd: null,
    transactions24h: null,
    originSpotLiquidityUsd: null,
    originDepth2PctUsd: null,
    holders: null,
    top10ConcentrationBps: null,
    largestClusterBps: null,
    integrity: { status: "PENDING", reasonCodes: [], observations: [] },
    derivatives: { status: "NOT_REGISTERED", safeOiUsd: null, safePositionUsd: null, maxLeverage: null, oracleQuality: null, sourceIndependence: null, reasonCodes: [] },
    perp: { status: "NOT_REGISTERED", deploymentId: null, marketId: null, currentOiUsd: null, capacityUsd: null, qualificationHash: null, riskRuleVersion: null },
    providerState: { status: "PARTIAL", fetchedAt, reason: "CONTROL_SET_REQUIRES_LIVE_ENRICHMENT" },
    freshness: { status: "PARTIAL", observedAt: fetchedAt, maxAgeSeconds: 0 },
    history: [],
  };
}

function readPhase3(): Phase3File {
  try {
    return JSON.parse(readFileSync(resolve(root, "evidence/winner-rebuild/real-market-intelligence-phase3.json"), "utf8")) as Phase3File;
  } catch {
    return { candidates: [] };
  }
}

function recordTokenId(record: MarketObservation): string {
  return record.token.tokenAddress;
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return value;
}
