import { marketIdForToken, type SupportedChain } from "@arcmemeperps/shared";

export type UniverseAvailability = "AVAILABLE" | "PARTIAL" | "STALE" | "UNAVAILABLE" | "CONFLICTED";
export type UniverseLifecycle = "NEW" | "BONDING" | "BONDED" | "GRADUATED" | "MIGRATED" | "DEX_LIVE" | "ESTABLISHED" | "DISCOVERED";

export interface UniverseObservation { provider: string; status: UniverseAvailability; observedAt: string | null; fetchedAt: string | null; blockOrSlot: string | null; evidenceHash: string | null; reason: string | null }
export interface UniverseMarket {
  marketId: string; chain: SupportedChain; tokenAddress: string; symbol: string | null; name: string | null; decimals: number | null; imageUrl: string | null; sourceUrl: string | null; originPlatform: string | null;
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
  return { marketId, chain, tokenAddress, symbol: safeString(best?.baseToken?.symbol), name: safeString(best?.baseToken?.name), decimals: null, imageUrl: safeString(profile.icon), sourceUrl: safeString(best?.url) ?? safeString(profile.url), originPlatform: best ? platform(best) : null, lifecycle: { status: lifecycleFor(best), observedAt: best?.pairCreatedAt ? new Date(best.pairCreatedAt).toISOString() : fetchedAt, confidenceBps: best ? 9000 : null, evidenceHash: null }, priceUsd: safeString(best?.priceUsd), priceChange24hBps: h24 == null ? null : Math.round(h24 * 100), volume24hUsd: safeNumber(best?.volume?.h24)?.toString() ?? null, transactions24h: txns ? (txns.buys ?? 0) + (txns.sells ?? 0) : null, originSpotLiquidityUsd: safeNumber(best?.liquidity?.usd)?.toString() ?? null, originDepth2PctUsd: null, holders: null, top10ConcentrationBps: null, largestClusterBps: null, integrity: { status: "PENDING", reasonCodes: ["ORIGIN_INTEGRITY_NOT_ASSESSED"], observations: [observation] }, derivatives: { status: "NOT_REGISTERED", safeOiUsd: null, safePositionUsd: null, maxLeverage: null, oracleQuality: null, sourceIndependence: null, reasonCodes: ["ARC_PERP_NOT_REGISTERED"] }, perp: { status: "NOT_REGISTERED", deploymentId: null, marketId: null, currentOiUsd: null, capacityUsd: null, qualificationHash: null, riskRuleVersion: null }, providerState: { status: best ? "AVAILABLE" : "PARTIAL", fetchedAt, reason: best ? null : "PAIR_NOT_FOUND" }, freshness: { status: "AVAILABLE", observedAt: fetchedAt, maxAgeSeconds: 120 }, history: best?.priceUsd ? [{ observedAt: fetchedAt, priceUsd: best.priceUsd }] : [] };
}

async function json<T>(fetchImpl: typeof fetch, url: string): Promise<T> { const response = await fetchImpl(url, { headers: { accept: "application/json" } }); if (!response.ok) throw new Error(`DISCOVERY_HTTP_${response.status}`); return await response.json() as T; }
export async function discoverDexScreener(fetchImpl: typeof fetch = fetch, limit = 60): Promise<UniverseMarket[]> {
  const profiles = await json<DexProfile[]>(fetchImpl, "https://api.dexscreener.com/token-profiles/latest/v1"); const seen = new Set<string>(); const selected = profiles.filter((profile) => profile.chainId && profile.tokenAddress).slice(0, limit); const output: UniverseMarket[] = [];
  for (let index = 0; index < selected.length; index += 6) { const batch = selected.slice(index, index + 6); const rows = await Promise.all(batch.map(async (profile) => { const chain = chainMap[profile.chainId!.toLowerCase()]; if (!chain) return null; let pairs: DexPair[] = []; try { const result = await json<{ pairs?: DexPair[] }>(fetchImpl, `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(profile.tokenAddress!)}`); pairs = result.pairs ?? []; } catch { pairs = []; } return mapDexMarket(profile, pairs); })); for (const row of rows) { if (!row) continue; const key = `${row.chain}:${row.tokenAddress.toLowerCase()}`; if (seen.has(key)) continue; seen.add(key); output.push(row); } }
  return output;
}
