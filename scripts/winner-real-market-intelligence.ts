import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GenericEvmChainAdapter, SolanaChainAdapter } from "@arcmemeperps/chain-adapters";
import { assessRisk } from "@arcmemeperps/risk-engine";
import { NETWORK_CONFIGS, rpcUrlsForNetwork } from "@arcmemeperps/shared";

type SnapshotMarket = {
  readonly marketId: string;
  readonly chain: string;
  readonly tokenAddress: string;
  readonly symbol: string | null;
  readonly name: string | null;
  readonly originPlatform: string | null;
  readonly discoveryProvider?: "DEXSCREENER" | "GECKOTERMINAL";
  readonly priceUsd: string | null;
  readonly originSpotLiquidityUsd: string | null;
  readonly volume24hUsd: string | null;
  readonly transactions24h: number | null;
  readonly lifecycle: { readonly status: string; readonly observedAt: string | null };
  readonly freshness: { readonly observedAt: string | null };
};

const snapshot = JSON.parse(
  readFileSync(resolve(process.cwd(), "evidence/winner-rebuild/discovery-snapshot.json"), "utf8"),
) as { readonly observedAt: string; readonly markets: readonly SnapshotMarket[] };

const NON_MEME_BASE_SYMBOLS = new Set([
  "SOL",
  "WSOL",
  "WETH",
  "USDC",
  "USDT",
  "USDE",
  "USDG",
  "PYUSD",
  "WBTC",
  "CBTC",
  "WSTETH",
]);

const candidates = selectCandidates(snapshot.markets, 20);

function adapterFor(chain: SnapshotMarket["chain"]) {
  if (chain === "SOLANA") return new SolanaChainAdapter(NETWORK_CONFIGS.SOLANA, { rpcUrls: rpcUrlsForNetwork(NETWORK_CONFIGS.SOLANA) });
  if (chain === "BNB") return new GenericEvmChainAdapter(NETWORK_CONFIGS.BNB, { rpcUrls: rpcUrlsForNetwork(NETWORK_CONFIGS.BNB) });
  if (chain === "BASE") return new GenericEvmChainAdapter(NETWORK_CONFIGS.BASE, { rpcUrls: rpcUrlsForNetwork(NETWORK_CONFIGS.BASE) });
  if (chain === "ETHEREUM") return new GenericEvmChainAdapter(NETWORK_CONFIGS.ETHEREUM, { rpcUrls: rpcUrlsForNetwork(NETWORK_CONFIGS.ETHEREUM) });
  if (chain === "ROBINHOOD") return new GenericEvmChainAdapter(NETWORK_CONFIGS.ROBINHOOD, { rpcUrls: rpcUrlsForNetwork(NETWORK_CONFIGS.ROBINHOOD) });
  throw new Error(`UNSUPPORTED_CANDIDATE_CHAIN:${chain}`);
}

function selectCandidates(markets: readonly SnapshotMarket[], limit: number): SnapshotMarket[] {
  const groups = new Map<string, SnapshotMarket[]>();
  for (const market of markets) {
    if (isNonMemeBaseAsset(market)) continue;
    const group = groups.get(market.chain) ?? [];
    group.push(market);
    groups.set(market.chain, group);
  }
  const score = (market: SnapshotMarket): number => {
    const liquidity = Number(market.originSpotLiquidityUsd ?? "0");
    const volume = Number(market.volume24hUsd ?? "0");
    const providerBoost = market.discoveryProvider === "DEXSCREENER" ? 4 : 0;
    return providerBoost + Math.log10(Math.max(1, liquidity)) + Math.log10(Math.max(1, volume));
  };
  for (const group of groups.values()) group.sort((left, right) => score(right) - score(left));
  const selected: SnapshotMarket[] = [];
  const chains = [...groups.keys()].sort();
  const target = Math.min(limit, markets.length);
  for (let index = 0; selected.length < target; index += 1) {
    let added = false;
    for (const chain of chains) {
      const candidate = groups.get(chain)?.[index];
      if (candidate === undefined) continue;
      selected.push(candidate);
      added = true;
      if (selected.length >= target) break;
    }
    if (!added) break;
  }
  return selected;
}

function isNonMemeBaseAsset(market: SnapshotMarket): boolean {
  const symbol = market.symbol?.trim().toUpperCase() ?? "";
  const address = market.tokenAddress.toLowerCase();
  return (
    NON_MEME_BASE_SYMBOLS.has(symbol) ||
    address === "0x0000000000000000000000000000000000000000" ||
    address === "0x4200000000000000000000000000000000000006" ||
    address === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  );
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return value;
}

const results = [];
for (const candidate of candidates) {
  try {
    const record = await adapterFor(candidate.chain).inspectToken(candidate.tokenAddress);
    const assessment = assessRisk(record, { assessedAt: new Date().toISOString() });
    results.push({
      candidate,
      status: "AVAILABLE",
      observedAt: new Date().toISOString(),
      assessment: {
        integrityStatus: assessment.integrityStatus,
        derivativesStatus: assessment.derivativesStatus,
        rejectionReasons: assessment.rejectionReasons,
        warnings: assessment.warnings,
        recommendedMaxLeverage: assessment.recommendedMaxLeverage,
        recommendedMaxOI: assessment.recommendedMaxOI,
        recommendedMaxPosition: assessment.recommendedMaxPosition,
      },
      record: jsonSafe(record),
    });
  } catch (error) {
    results.push({
      candidate,
      status: "UNAVAILABLE",
      observedAt: new Date().toISOString(),
      reason: error instanceof Error ? error.message : "INTELLIGENCE_READ_FAILED",
    });
  }
}

const output = {
  schemaVersion: "winner-rebuild/real-market-intelligence-v2",
  snapshotObservedAt: snapshot.observedAt,
  fetchedAt: new Date().toISOString(),
  evaluatedMarketCount: snapshot.markets.length,
  candidateSelection: "LIQUIDITY_AND_VOLUME_STRATIFIED_ACROSS_ALL_DISCOVERED_CHAINS",
  enrichmentMode: "CANONICAL_RPC_PLUS_DEXSCREENER_PLUS_GECKOTERMINAL_OPTIONAL_CREDENTIALS_IF_CONFIGURED",
  candidates: results,
};
writeFileSync(resolve(process.cwd(), "evidence/winner-rebuild/real-market-intelligence.json"), `${JSON.stringify(jsonSafe(output), null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ fetchedAt: output.fetchedAt, evaluatedMarketCount: snapshot.markets.length, candidateCount: results.length, available: results.filter((item) => item.status === "AVAILABLE").length })}\n`);
