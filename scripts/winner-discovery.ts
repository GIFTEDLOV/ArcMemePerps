import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { discoverDexScreener } from "@arcmemeperps/market-universe";

const output = resolve(process.argv.find((value) => value.startsWith("--output="))?.slice("--output=".length) ?? "evidence/winner-rebuild/discovery-snapshot.json");
const limit = Math.min(Math.max(Number(process.argv.find((value) => value.startsWith("--limit="))?.slice("--limit=".length) ?? "60"), 1), 200);
const observedAt = new Date().toISOString();
const markets = await discoverDexScreener(fetch, limit);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ schemaVersion: 1, provider: "DEXSCREENER", observedAt, marketCount: markets.length, markets }, null, 2)}\n`, "utf8");
process.stdout.write(JSON.stringify({ output, provider: "DEXSCREENER", observedAt, marketCount: markets.length, chains: [...new Set(markets.map((market) => market.chain))] }) + "\n");
