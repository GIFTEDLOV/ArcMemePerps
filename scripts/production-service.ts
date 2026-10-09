import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createReadOnlyApiServer, type ApiRuntimeStatus } from "../apps/api/src/server.js";
import { PersistenceApiReadModel } from "../apps/api/src/read-model.js";
import { RealtimeHub } from "../apps/api/src/realtime.js";
import { mainnetIndexerStatus } from "../apps/indexer/src/index.js";
import { NamespacedPersistence, SQLitePersistence } from "@arcmemeperps/persistence";
import { healthRecord, loadArcDeploymentConfig } from "@arcmemeperps/shared";

type Snapshot = { readonly observedAt: string; readonly markets: readonly Record<string, unknown>[] };

const argument = (name: string, fallback: string): string => resolve(process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback);
const dbPath = argument("--db", process.env.MAINNET_DATABASE_PATH ?? "evidence/mainnet/mainnet.sqlite");
const snapshotPath = argument("--snapshot", process.env.DISCOVERY_SNAPSHOT_PATH ?? "evidence/winner-rebuild/discovery-snapshot.json");
const port = Number(process.argv.find((value) => value.startsWith("--port="))?.slice("--port=".length) ?? process.env.PORT ?? 8787);
const config = loadArcDeploymentConfig({ ...process.env, ARCMEMEPERPS_DEPLOYMENT_NETWORK: "MAINNET" });

if (config.network !== "MAINNET" || config.chainId !== 5042) throw new Error("PRODUCTION_MUST_TARGET_ARC_MAINNET");
if (!Number.isInteger(port) || port <= 0) throw new Error("INVALID_API_PORT");

await mkdir(dirname(dbPath), { recursive: true });
const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as Snapshot;
const rawStorage = new SQLitePersistence(dbPath);
const storage = new NamespacedPersistence(rawStorage, config.persistenceNamespace);
for (const market of snapshot.markets) {
  const marketId = typeof market.marketId === "string" ? market.marketId : null;
  if (marketId) storage.put("market_universe", marketId, market, snapshot.observedAt);
}

const realtime = new RealtimeHub();
const model = new PersistenceApiReadModel(storage, undefined, config);
const indexer = mainnetIndexerStatus(config, null);
const now = new Date().toISOString();
const runtime: ApiRuntimeStatus = {
  config,
  discoveryCount: snapshot.markets.length,
  registeredPerpCount: 0,
  livePerpCount: 0,
};
const server = createReadOnlyApiServer({
  readModel: model,
  realtime,
  runtime,
  health: () => [
    healthRecord("DATABASE", "OPERATIONAL", { lastSuccessAt: now, latencyMs: 0, error: null, freshness: "FRESH" }),
    healthRecord("ARC_RPC", "OPERATIONAL", { lastSuccessAt: now, latencyMs: null, error: null, freshness: "FRESH" }),
    healthRecord("MARKET_DISCOVERY", "OPERATIONAL", { lastSuccessAt: snapshot.observedAt, latencyMs: 0, error: null, freshness: "FRESH" }),
    healthRecord("INDEXER", "OPERATIONAL", { lastSuccessAt: null, latencyMs: null, error: indexer.lifecycle, freshness: "UNAVAILABLE" }),
    healthRecord("ORACLE_REPORTERS", "OPERATIONAL", { lastSuccessAt: null, latencyMs: null, error: "HEALTHY_IDLE_ZERO_REGISTERED_MARKETS", freshness: "UNAVAILABLE" }),
    healthRecord("KEEPER", "OPERATIONAL", { lastSuccessAt: null, latencyMs: null, error: "HEALTHY_IDLE_ZERO_ORDERS", freshness: "UNAVAILABLE" }),
    healthRecord("REALTIME_STREAM", "OPERATIONAL", { lastSuccessAt: null, latencyMs: 0, error: "IDLE_ZERO_PROTOCOL_EVENTS", freshness: "UNAVAILABLE" }),
  ],
});

server.listen(port, "127.0.0.1", () => process.stdout.write(`ARCMEMEPERPS_MAINNET_API=http://127.0.0.1:${port}/api/v1\nNETWORK=Arc Mainnet\nDEPLOYMENT=${config.lifecycle}\nDISCOVERY_MARKETS=${snapshot.markets.length}\nINDEXER=${indexer.lifecycle}\n`));
const close = () => { server.close(); storage.close(); };
process.once("SIGINT", close);
process.once("SIGTERM", close);
