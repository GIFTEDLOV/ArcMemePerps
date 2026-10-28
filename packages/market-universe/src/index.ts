import { marketIdForToken, type SupportedChain } from "@arcmemeperps/shared";
import { GeckoTerminalProvider, type GeckoPoolObservation } from "@arcmemeperps/providers";
import { NETWORK_CONFIGS, type SupportedNetworkConfig } from "@arcmemeperps/shared";

export type UniverseAvailability = "AVAILABLE" | "PARTIAL" | "STALE" | "UNAVAILABLE" | "CONFLICTED";
export type UniverseLifecycle = "NEW" | "BONDING" | "BONDED" | "GRADUATED" | "MIGRATED" | "DEX_LIVE" | "ESTABLISHED" | "DISCOVERED";

export interface UniverseObservation { provider: string; status: UniverseAvailability; observedAt: string | null; fetchedAt: string | null; blockOrSlot: string | null; evidenceHash: string | null; reason: string | null }
export interface DiscoveryFeedSnapshot {
  readonly provider: "DEXSCREENER" | "GECKOTERMINAL";
  readonly status: UniverseAvailability;
  readonly fetchedAt: string;
  readonly markets: readonly UniverseMarket[];
  readonly reason: string | null;
}
export interface UniverseMarket {
  marketId: string; chain: SupportedChain; tokenAddress: string; symbol: string | null; name: string | null; decimals: number | null; imageUrl: string | null; sourceUrl: string | null; originPlatform: string | null; discoveryProvider?: "DEXSCREENER" | "GECKOTERMINAL";
  lifecycle: { status: UniverseLifecycle; observedAt: string | null; confidenceBps: number | null; evidenceHash: string | null };
  priceUsd: string | null; priceChange24hBps: number | null; volume24hUsd: string | null; transactions24h: number | null; originSpotLiquidityUsd: string | null; originDepth2PctUsd: string | null; holders: number | null; top10ConcentrationBps: number | null; largestClusterBps: number | null;
  integrity: { status: "PENDING" | "WATCH" | "QUALIFIED" | "REJECTED" | "UNKNOWN"; reasonCodes: string[]; observations: UniverseObservation[] };
  derivatives: { status: "NOT_REGISTERED" | "ELIGIBLE" | "LIVE" | "PAUSED" | "CLOSE_ONLY" | "BLOCKED"; safeOiUsd: string | null; safePositionUsd: string | null; maxLeverage: string | null; oracleQuality: string | null; sourceIndependence: number | null; reasonCodes: string[] };
  perp: { status: "NOT_REGISTERED" | "ELIGIBLE" | "LIVE" | "PAUSED" | "CLOSE_ONLY" | "BLOCKED"; deploymentId: string | null; marketId: string | null; currentOiUsd: string | null; capacityUsd: string | null; qualificationHash: string | null; riskRuleVersion: string | null };
  providerState: { status: UniverseAvailability; fetchedAt: string | null; reason: string | null }; freshness: { status: UniverseAvailability; observedAt: string | null; maxAgeSeconds: number | null }; history: Array<{ observedAt: string; priceUsd: string }>;
}
export interface DexProfile { chainId?: string; tokenAddress?: string; url?: string; icon?: string; description?: string; links?: Array<{ label?: string; type?: string; url?: string }> }
export interface DexPair { chainId?: string; dexId?: string; url?: string; pairAddress?: string; baseToken?: { address?: string; name?: string; symbol?: string }; quoteToken?: { address?: string; symbol?: string }; priceUsd?: string; priceChange?: { h24?: number }; volume?: { h24?: number }; txns?: { h24?: { buys?: number; sells?: number } }; liquidity?: { usd?: number }; pairCreatedAt?: number }
const chainMap: Record<string, SupportedChain | undefined> = { solana: "SOLANA", bsc: "BNB", base: "BASE", ethereum: "ETHEREUM", robinhood: "ROBINHOOD", arc: "ARC" };
const MARKET_FRESHNESS_SECONDS = 300;
const platform = (pair: DexPair) => pair.dexId ?? "DEX_UNAVAILABLE";
const safeString = (value: unknown) => typeof value === "string" && value.length > 0 ? value : null;
const safeNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
function lifecycleFor(pair: DexPair | undefined): UniverseLifecycle { if (!pair) return "DISCOVERED"; return (pair.dexId ?? "").toLowerCase().includes("pump") ? "DEX_LIVE" : "DEX_LIVE"; }

export function mapDexMarket(profile: DexProfile, pairs: readonly DexPair[], fetchedAt = new Date().toISOString()): UniverseMarket | null {
  const chain = chainMap[profile.chainId?.toLowerCase() ?? ""];
  const tokenAddress = safeString(profile.tokenAddress);
  if (!chain || !tokenAddress) return null;
  let marketId: string;
  try { marketId = marketIdForToken(chain, tokenAddress); } catch { return null; }
  const matching = pairs.filter((pair) =>
    pair.baseToken?.address?.toLowerCase() === tokenAddress.toLowerCase() &&
    chainMap[pair.chainId?.toLowerCase() ?? ""] === chain,
  );
  const best = [...matching].sort((a, b) => (safeNumber(b.liquidity?.usd) ?? -1) - (safeNumber(a.liquidity?.usd) ?? -1))[0];
  const h24 = safeNumber(best?.priceChange?.h24);
  const buys = safeNumber(best?.txns?.h24?.buys);
  const sells = safeNumber(best?.txns?.h24?.sells);
  const hasPrice = safeString(best?.priceUsd) !== null;
  const pairCreatedAt = safeNumber(best?.pairCreatedAt);
  const pairCreatedDate = pairCreatedAt === null || pairCreatedAt <= 0 ? null : new Date(pairCreatedAt);
  const pairObservedAt = pairCreatedDate === null || !Number.isFinite(pairCreatedDate.getTime()) ? fetchedAt : pairCreatedDate.toISOString();
  const observation: UniverseObservation = {
    provider: "DEXSCREENER",
    status: best ? "AVAILABLE" : "PARTIAL",
    observedAt: fetchedAt,
    fetchedAt,
    blockOrSlot: null,
    evidenceHash: null,
    reason: best ? null : "PAIR_NOT_FOUND",
  };
  return {
    discoveryProvider: "DEXSCREENER",
    marketId,
    chain,
    tokenAddress,
    symbol: safeString(best?.baseToken?.symbol),
    name: safeString(best?.baseToken?.name),
    decimals: null,
    imageUrl: safeString(profile.icon),
    sourceUrl: safeString(best?.url) ?? safeString(profile.url),
    originPlatform: best ? platform(best) : null,
    lifecycle: {
      status: lifecycleFor(best),
      observedAt: pairObservedAt,
      confidenceBps: best ? 9_000 : null,
      evidenceHash: null,
    },
    priceUsd: safeString(best?.priceUsd),
    priceChange24hBps: h24 === null ? null : Math.round(h24 * 100),
    volume24hUsd: safeNumber(best?.volume?.h24)?.toString() ?? null,
    transactions24h: buys === null && sells === null ? null : (buys ?? 0) + (sells ?? 0),
    originSpotLiquidityUsd: safeNumber(best?.liquidity?.usd)?.toString() ?? null,
    originDepth2PctUsd: null,
    holders: null,
    top10ConcentrationBps: null,
    largestClusterBps: null,
    integrity: {
      status: "PENDING",
      reasonCodes: ["ORIGIN_INTEGRITY_NOT_ASSESSED"],
      observations: [observation],
    },
    derivatives: {
      status: "NOT_REGISTERED",
      safeOiUsd: null,
      safePositionUsd: null,
      maxLeverage: null,
      oracleQuality: null,
      sourceIndependence: null,
      reasonCodes: ["ARC_PERP_NOT_REGISTERED"],
    },
    perp: {
      status: "NOT_REGISTERED",
      deploymentId: null,
      marketId: null,
      currentOiUsd: null,
      capacityUsd: null,
      qualificationHash: null,
      riskRuleVersion: null,
    },
    providerState: { status: best ? "AVAILABLE" : "PARTIAL", fetchedAt, reason: best ? null : "PAIR_NOT_FOUND" },
    freshness: { status: hasPrice ? "AVAILABLE" : "UNAVAILABLE", observedAt: hasPrice ? fetchedAt : null, maxAgeSeconds: hasPrice ? MARKET_FRESHNESS_SECONDS : null },
    history: best?.priceUsd ? [{ observedAt: fetchedAt, priceUsd: best.priceUsd }] : [],
  };
}

async function json<T>(fetchImpl: typeof fetch, url: string): Promise<T> { const response = await fetchImpl(url, { headers: { accept: "application/json" } }); if (!response.ok) throw new Error(`DISCOVERY_HTTP_${response.status}`); return await response.json() as T; }
export async function discoverDexScreenerWithStatus(
  fetchImpl: typeof fetch = fetch,
  limit = 60,
): Promise<DiscoveryFeedSnapshot> {
  const fetchedAt = new Date().toISOString();
  let profiles: DexProfile[];
  try {
    profiles = await json<DexProfile[]>(fetchImpl, "https://api.dexscreener.com/token-profiles/latest/v1");
  } catch {
    return { provider: "DEXSCREENER", status: "UNAVAILABLE", fetchedAt, markets: [], reason: "PROFILE_FEED_REQUEST_FAILED" };
  }

  const maximum = Math.min(200, Math.max(1, limit));
  const selected = profiles
    .filter((profile) => profile.chainId && profile.tokenAddress && chainMap[profile.chainId.toLowerCase()])
    .slice(0, maximum);
  const output: UniverseMarket[] = [];
  const seen = new Set<string>();
  let failedDetails = 0;
  for (let index = 0; index < selected.length; index += 6) {
    const batch = selected.slice(index, index + 6);
    const rows = await Promise.all(batch.map(async (profile) => {
      try {
        const result = await json<{ pairs?: DexPair[] }>(
          fetchImpl,
          `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(profile.tokenAddress!)}`,
        );
        return mapDexMarket(profile, result.pairs ?? [], fetchedAt);
      } catch {
        failedDetails += 1;
        return null;
      }
    }));
    for (const row of rows) {
      if (row === null) continue;
      const key = `${row.chain}:${row.tokenAddress.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(row);
    }
  }
  return {
    provider: "DEXSCREENER",
    status: failedDetails === 0 ? "AVAILABLE" : "PARTIAL",
    fetchedAt,
    markets: output,
    reason: failedDetails === 0 ? null : `${failedDetails}_TOKEN_LOOKUPS_FAILED`,
  };
}

export async function discoverDexScreener(fetchImpl: typeof fetch = fetch, limit = 60): Promise<UniverseMarket[]> {
  return [...(await discoverDexScreenerWithStatus(fetchImpl, limit)).markets];
}

export interface GeckoDiscoveryOptions {
  readonly networks?: readonly SupportedNetworkConfig[];
  readonly pagesPerNetwork?: number;
  readonly minRequestIntervalMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

/**
 * Bounded, provider-native discovery. The public GeckoTerminal API exposes
 * top/new/trending pools by network; each pool is converted to a market keyed
 * only by chain plus canonical token address. No qualification result is
 * inferred here.
 */
export async function discoverGeckoTerminalWithStatus(
  options: GeckoDiscoveryOptions = {},
): Promise<DiscoveryFeedSnapshot> {
  const networks = options.networks ?? [
    NETWORK_CONFIGS.SOLANA,
    NETWORK_CONFIGS.BNB,
    NETWORK_CONFIGS.BASE,
    NETWORK_CONFIGS.ETHEREUM,
    NETWORK_CONFIGS.ROBINHOOD,
  ];
  const pages = Math.max(1, Math.min(10, options.pagesPerNetwork ?? 1));
  const fetchedAt = new Date().toISOString();
  const output: UniverseMarket[] = [];
  const seen = new Set<string>();
  let successfulReads = 0;
  let failedReads = 0;
  for (const network of networks) {
    const provider = new GeckoTerminalProvider(
      network,
      {
        ...(options.minRequestIntervalMs === undefined
          ? {}
          : { minRequestIntervalMs: options.minRequestIntervalMs }),
        ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
      },
    );
    for (let page = 1; page <= pages; page += 1) {
      const result = await provider.readNetworkPools(fetchedAt, "pools", page);
      if (result.value === null) {
        failedReads += 1;
        continue;
      }
      successfulReads += 1;
      for (const pool of result.value) {
        const tokenAddress = pool.baseTokenAddress;
        if (tokenAddress === null) continue;
        let marketId: string;
        try {
          marketId = marketIdForToken(network.chain, tokenAddress);
        } catch {
          continue;
        }
        const key = `${network.chain}:${tokenAddress.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(mapGeckoPool(network.chain, tokenAddress, pool, fetchedAt, marketId));
      }
    }
  }
  const status = successfulReads === 0
    ? "UNAVAILABLE"
    : failedReads > 0
      ? "PARTIAL"
      : "AVAILABLE";
  return {
    provider: "GECKOTERMINAL",
    status,
    fetchedAt,
    markets: output,
    reason: failedReads === 0 ? null : `${failedReads}_NETWORK_READS_FAILED`,
  };
}

export async function discoverGeckoTerminal(
  options: GeckoDiscoveryOptions = {},
): Promise<UniverseMarket[]> {
  return [...(await discoverGeckoTerminalWithStatus(options)).markets];
}

function mapGeckoPool(
  chain: SupportedChain,
  tokenAddress: string,
  pool: GeckoPoolObservation,
  fetchedAt: string,
  marketId: string,
): UniverseMarket {
  const observedAt = pool.observedAt;
  const observation: UniverseObservation = {
    provider: "GECKOTERMINAL",
    status: "AVAILABLE",
    observedAt,
    fetchedAt,
    blockOrSlot: null,
    evidenceHash: null,
    reason: null,
  };
  const lifecyclePair = pool.pairCreatedAt
    ? { dexId: pool.dexId ?? "", pairCreatedAt: Date.parse(pool.pairCreatedAt) }
    : { dexId: pool.dexId ?? "" };
  const lifecycleStatus = lifecycleFor(lifecyclePair);
  const transactions = pool.buys24h === null || pool.sells24h === null ? null : pool.buys24h + pool.sells24h;
  return {
    discoveryProvider: "GECKOTERMINAL",
    marketId,
    chain,
    tokenAddress,
    symbol: pool.baseTokenSymbol,
    name: pool.name,
    decimals: null,
    imageUrl: null,
    sourceUrl: `https://www.geckoterminal.com/${pool.network}/pools/${pool.poolAddress}`,
    originPlatform: pool.dexId,
    lifecycle: {
      status: lifecycleStatus,
      observedAt: pool.pairCreatedAt ?? fetchedAt,
      confidenceBps: 7_500,
      evidenceHash: null,
    },
    priceUsd: pool.priceUsd === null ? null : pool.priceUsd.toString(),
    priceChange24hBps: null,
    volume24hUsd: pool.volume24hUsd === null ? null : pool.volume24hUsd.toString(),
    transactions24h: transactions,
    originSpotLiquidityUsd: pool.liquidityUsd === null ? null : pool.liquidityUsd.toString(),
    originDepth2PctUsd: null,
    holders: null,
    top10ConcentrationBps: null,
    largestClusterBps: null,
    integrity: {
      status: "PENDING",
      reasonCodes: ["ORIGIN_INTEGRITY_NOT_ASSESSED"],
      observations: [observation],
    },
    derivatives: {
      status: "NOT_REGISTERED",
      safeOiUsd: null,
      safePositionUsd: null,
      maxLeverage: null,
      oracleQuality: null,
      sourceIndependence: null,
      reasonCodes: ["ARC_PERP_NOT_REGISTERED"],
    },
    perp: {
      status: "NOT_REGISTERED",
      deploymentId: null,
      marketId: null,
      currentOiUsd: null,
      capacityUsd: null,
      qualificationHash: null,
      riskRuleVersion: null,
    },
    providerState: { status: "AVAILABLE", fetchedAt, reason: null },
    freshness: { status: pool.priceUsd === null ? "PARTIAL" : "AVAILABLE", observedAt, maxAgeSeconds: MARKET_FRESHNESS_SECONDS },
    history: [],
  };
}
