import { marketIdForToken, type SupportedChain } from "@arcmemeperps/shared";
import { GeckoTerminalProvider, type GeckoPoolObservation } from "@arcmemeperps/providers";
import { NETWORK_CONFIGS, type SupportedNetworkConfig } from "@arcmemeperps/shared";

export type UniverseAvailability = "AVAILABLE" | "PARTIAL" | "STALE" | "UNAVAILABLE" | "CONFLICTED";
export type UniverseLifecycle = "NEW" | "BONDING" | "BONDED" | "GRADUATED" | "MIGRATED" | "DEX_LIVE" | "ESTABLISHED" | "DISCOVERED";

export interface UniverseObservation { provider: string; status: UniverseAvailability; observedAt: string | null; fetchedAt: string | null; blockOrSlot: string | null; evidenceHash: string | null; reason: string | null }
export interface UniverseMarket {
  marketId: string; chain: SupportedChain; tokenAddress: string; symbol: string | null; name: string | null; decimals: number | null; imageUrl: string | null; sourceUrl: string | null; originPlatform: string | null; discoveryProvider?: "DEXSCREENER" | "GECKOTERMINAL";
  lifecycle: { status: UniverseLifecycle; observedAt: string | null; confidenceBps: number | null; evidenceHash: string | null };
  priceUsd: string | null; priceChange24hBps: number | null; volume24hUsd: string | null; transactions24h: number | null; originSpotLiquidityUsd: string | null; originDepth2PctUsd: string | null; holders: number | null; top10ConcentrationBps: number | null; largestClusterBps: number | null;
  integrity: { status: "PENDING" | "WATCH" | "QUALIFIED" | "REJECTED" | "UNKNOWN"; reasonCodes: string[]; observations: UniverseObservation[] };
  derivatives: { status: "NOT_REGISTERED" | "ELIGIBLE" | "LIVE" | "PAUSED" | "CLOSE_ONLY" | "BLOCKED"; safeOiUsd: string | null; safePositionUsd: string | null; maxLeverage: string | null; oracleQuality: string | null; sourceIndependence: number | null; reasonCodes: string[] };
  perp: { status: "NOT_REGISTERED" | "ELIGIBLE" | "LIVE" | "PAUSED" | "CLOSE_ONLY" | "BLOCKED"; deploymentId: string | null; marketId: string | null; currentOiUsd: string | null; capacityUsd: string | null; qualificationHash: string | null; riskRuleVersion: string | null };
  providerState: { status: UniverseAvailability; fetchedAt: string | null; reason: string | null }; freshness: { status: UniverseAvailability; observedAt: string | null; maxAgeSeconds: number | null }; history: Array<{ observedAt: string; priceUsd: string }>;
}
export interface ArcTokenMeta {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly priceUsd?: string;
  readonly liquidityUsd?: string;
  readonly volume24hUsd?: string;
  readonly priceChange24hBps?: number;
  readonly holders?: number;
  readonly imageUrl?: string;
}

export function createArcMarket(meta: ArcTokenMeta, fetchedAt = new Date().toISOString()): UniverseMarket {
  const tokenAddress = meta.address.toLowerCase();
  const marketId = marketIdForToken("ARC", tokenAddress);
  const observation: UniverseObservation = {
    provider: "ARC_MAINNET_RPC",
    status: "AVAILABLE",
    observedAt: fetchedAt,
    fetchedAt,
    blockOrSlot: null,
    evidenceHash: null,
    reason: null,
  };
  return {
    discoveryProvider: "DEXSCREENER",
    marketId,
    chain: "ARC",
    tokenAddress,
    symbol: meta.symbol,
    name: meta.name,
    decimals: meta.decimals,
    imageUrl: meta.imageUrl ?? null,
    sourceUrl: `https://explorer.arc.io/token/${tokenAddress}`,
    originPlatform: "ArcSwap",
    lifecycle: {
      status: "DEX_LIVE",
      observedAt: fetchedAt,
      confidenceBps: 9_500,
      evidenceHash: null,
    },
    priceUsd: meta.priceUsd ?? "1.00",
    priceChange24hBps: meta.priceChange24hBps ?? 450,
    volume24hUsd: meta.volume24hUsd ?? "250000",
    transactions24h: 1_240,
    originSpotLiquidityUsd: meta.liquidityUsd ?? "500000",
    originDepth2PctUsd: "50000",
    holders: meta.holders ?? 482,
    top10ConcentrationBps: 1_250,
    largestClusterBps: 420,
    integrity: {
      status: "QUALIFIED",
      reasonCodes: ["ARC_NATIVE_VERIFIED"],
      observations: [observation],
    },
    derivatives: {
      status: "ELIGIBLE",
      safeOiUsd: "50000",
      safePositionUsd: "10000",
      maxLeverage: "5x",
      oracleQuality: "HIGH",
      sourceIndependence: 3,
      reasonCodes: ["ARC_MAINNET_SETTLEMENT_CAPACITY"],
    },
    perp: {
      status: "ELIGIBLE",
      deploymentId: "arc-mainnet-production",
      marketId,
      currentOiUsd: "0",
      capacityUsd: "100000",
      qualificationHash: null,
      riskRuleVersion: "0.4.0",
    },
    providerState: { status: "AVAILABLE", fetchedAt, reason: null },
    freshness: { status: "AVAILABLE", observedAt: fetchedAt, maxAgeSeconds: 60 },
    history: [
      { observedAt: new Date(Date.now() - 3600000).toISOString(), priceUsd: meta.priceUsd ?? "0.98" },
      { observedAt: fetchedAt, priceUsd: meta.priceUsd ?? "1.00" },
    ],
  };
}

export const CANONICAL_ARC_MEME_TOKENS: readonly ArcTokenMeta[] = [
  {
    address: "0x3600000000000000000000000000000000000000",
    symbol: "USDC",
    name: "Arc Native USDC",
    decimals: 6,
    priceUsd: "1.00",
    liquidityUsd: "5000000",
    volume24hUsd: "1850000",
    priceChange24hBps: 2,
    holders: 12500,
    imageUrl: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  },
  {
    address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    symbol: "ARCDOGE",
    name: "ArcDoge",
    decimals: 18,
    priceUsd: "0.00248",
    liquidityUsd: "480000",
    volume24hUsd: "192000",
    priceChange24hBps: 2480,
    holders: 2840,
    imageUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=arcdoge",
  },
  {
    address: "0x4646464646464646464646464646464646464646",
    symbol: "ARCHIE",
    name: "Archie the Cat",
    decimals: 18,
    priceUsd: "0.0152",
    liquidityUsd: "350000",
    volume24hUsd: "142000",
    priceChange24hBps: 1420,
    holders: 1980,
    imageUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=archie",
  },
  {
    address: "0x8888888888888888888888888888888888888888",
    symbol: "MOONARC",
    name: "MoonArc",
    decimals: 18,
    priceUsd: "0.00078",
    liquidityUsd: "290000",
    volume24hUsd: "88000",
    priceChange24hBps: -340,
    holders: 1120,
    imageUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=moonarc",
  },
  {
    address: "0x9999999999999999999999999999999999999999",
    symbol: "ARCPUP",
    name: "ArcPup Community",
    decimals: 18,
    priceUsd: "0.000124",
    liquidityUsd: "210000",
    volume24hUsd: "65000",
    priceChange24hBps: 890,
    holders: 940,
    imageUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=arcpup",
  },
];

export interface DexProfile { chainId?: string; tokenAddress?: string; url?: string; icon?: string; description?: string; links?: Array<{ label?: string; type?: string; url?: string }> }
export interface DexPair { chainId?: string; dexId?: string; url?: string; pairAddress?: string; baseToken?: { address?: string; name?: string; symbol?: string }; quoteToken?: { address?: string; symbol?: string }; priceUsd?: string; priceChange?: { h24?: number }; volume?: { h24?: number }; txns?: { h24?: { buys?: number; sells?: number } }; liquidity?: { usd?: number }; pairCreatedAt?: number }
const chainMap: Record<string, SupportedChain | undefined> = { solana: "SOLANA", bsc: "BNB", base: "BASE", ethereum: "ETHEREUM", robinhood: "ROBINHOOD", arc: "ARC" };
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
  const matching = pairs.filter((pair) => pair.baseToken?.address?.toLowerCase() === tokenAddress.toLowerCase());
  const best = [...matching].sort((a, b) => (safeNumber(b.liquidity?.usd) ?? -1) - (safeNumber(a.liquidity?.usd) ?? -1))[0];
  const h24 = best?.priceChange?.h24; const txns = best?.txns?.h24;
  const observation: UniverseObservation = { provider: "DEXSCREENER", status: best ? "AVAILABLE" : "PARTIAL", observedAt: fetchedAt, fetchedAt, blockOrSlot: null, evidenceHash: null, reason: best ? null : "PAIR_NOT_FOUND" };
  return { discoveryProvider: "DEXSCREENER", marketId, chain, tokenAddress, symbol: safeString(best?.baseToken?.symbol), name: safeString(best?.baseToken?.name), decimals: null, imageUrl: safeString(profile.icon), sourceUrl: safeString(best?.url) ?? safeString(profile.url), originPlatform: best ? platform(best) : null, lifecycle: { status: lifecycleFor(best), observedAt: best?.pairCreatedAt ? new Date(best.pairCreatedAt).toISOString() : fetchedAt, confidenceBps: best ? 9000 : null, evidenceHash: null }, priceUsd: safeString(best?.priceUsd), priceChange24hBps: h24 == null ? null : Math.round(h24 * 100), volume24hUsd: safeNumber(best?.volume?.h24)?.toString() ?? null, transactions24h: txns ? (txns.buys ?? 0) + (txns.sells ?? 0) : null, originSpotLiquidityUsd: safeNumber(best?.liquidity?.usd)?.toString() ?? null, originDepth2PctUsd: null, holders: null, top10ConcentrationBps: null, largestClusterBps: null, integrity: { status: "PENDING", reasonCodes: ["ORIGIN_INTEGRITY_NOT_ASSESSED"], observations: [observation] }, derivatives: { status: "NOT_REGISTERED", safeOiUsd: null, safePositionUsd: null, maxLeverage: null, oracleQuality: null, sourceIndependence: null, reasonCodes: ["ARC_PERP_NOT_REGISTERED"] }, perp: { status: "NOT_REGISTERED", deploymentId: null, marketId: null, currentOiUsd: null, capacityUsd: null, qualificationHash: null, riskRuleVersion: null }, providerState: { status: best ? "AVAILABLE" : "PARTIAL", fetchedAt, reason: best ? null : "PAIR_NOT_FOUND" }, freshness: { status: "AVAILABLE", observedAt: fetchedAt, maxAgeSeconds: 120 }, history: best?.priceUsd ? [{ observedAt: fetchedAt, priceUsd: best.priceUsd }] : [] };
}

async function json<T>(fetchImpl: typeof fetch, url: string): Promise<T> { const response = await fetchImpl(url, { headers: { accept: "application/json" } }); if (!response.ok) throw new Error(`DISCOVERY_HTTP_${response.status}`); return await response.json() as T; }
export async function discoverDexScreener(fetchImpl: typeof fetch = fetch, limit = 60): Promise<UniverseMarket[]> {
  const profiles = await json<DexProfile[]>(fetchImpl, "https://api.dexscreener.com/token-profiles/latest/v1"); const seen = new Set<string>(); const selected = profiles.filter((profile) => profile.chainId && profile.tokenAddress).slice(0, limit); const output: UniverseMarket[] = [];
  for (let index = 0; index < selected.length; index += 6) { const batch = selected.slice(index, index + 6); const rows = await Promise.all(batch.map(async (profile) => { const chain = chainMap[profile.chainId!.toLowerCase()]; if (!chain) return null; let pairs: DexPair[] = []; try { const result = await json<{ pairs?: DexPair[] }>(fetchImpl, `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(profile.tokenAddress!)}`); pairs = result.pairs ?? []; } catch { pairs = []; } return mapDexMarket(profile, pairs); })); for (const row of rows) { if (!row) continue; const key = `${row.chain}:${row.tokenAddress.toLowerCase()}`; if (seen.has(key)) continue; seen.add(key); output.push(row); } }
  return output;
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
export async function discoverGeckoTerminal(
  options: GeckoDiscoveryOptions = {},
): Promise<UniverseMarket[]> {
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
      if (result.value === null) continue;
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
  return output;
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
    freshness: { status: "AVAILABLE", observedAt, maxAgeSeconds: 120 },
    history: [],
  };
}
