import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  discoverDexScreenerWithStatus,
  discoverGeckoTerminalWithStatus,
  type UniverseMarket,
} from "@arcmemeperps/market-universe";

const output = resolve(process.argv.find((value) => value.startsWith("--output="))?.slice("--output=".length) ?? "evidence/winner-rebuild/discovery-snapshot.json");
const limit = Math.min(Math.max(Number(process.argv.find((value) => value.startsWith("--limit="))?.slice("--limit=".length) ?? "60"), 1), 200);
const observedAt = new Date().toISOString();
const [dex, gecko] = await Promise.all([
  discoverDexScreenerWithStatus(fetch, limit),
  discoverGeckoTerminalWithStatus({
  pagesPerNetwork: Math.min(Number(process.argv.find((value) => value.startsWith("--gecko-pages="))?.slice("--gecko-pages=".length) ?? "1"), 10),
  }),
]);
const providerResults = [dex, gecko];
const markets = mergeMarkets(providerResults.flatMap((result) => result.markets));
const providers = providerResults.map((result) => ({
  provider: result.provider,
  status: result.status,
  fetchedAt: result.fetchedAt,
  marketCount: result.markets.length,
  reason: result.reason,
}));
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ schemaVersion: 3, observedAt, marketCount: markets.length, providers, markets }, null, 2)}\n`, "utf8");
process.stdout.write(JSON.stringify({ output, observedAt, marketCount: markets.length, providers, chains: [...new Set(markets.map((market) => market.chain))] }) + "\n");

function mergeMarkets(rows: readonly UniverseMarket[]): UniverseMarket[] {
  const merged = new Map<string, UniverseMarket>();
  for (const row of rows) {
    const key = `${row.chain}:${row.tokenAddress.toLowerCase()}`;
    const previous = merged.get(key);
    if (previous === undefined) {
      merged.set(key, row);
      continue;
    }
    const previousLiquidity = Number(previous.originSpotLiquidityUsd ?? "-1");
    const nextLiquidity = Number(row.originSpotLiquidityUsd ?? "-1");
    if (nextLiquidity > previousLiquidity) merged.set(key, row);
  }
  return [...merged.values()].sort((left, right) => `${left.chain}:${left.tokenAddress}`.localeCompare(`${right.chain}:${right.tokenAddress}`));
}
