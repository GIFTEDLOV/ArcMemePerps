import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createReadOnlyApiServer } from "../apps/api/src/server.js";
import { PersistenceApiReadModel } from "../apps/api/src/read-model.js";
import { RealtimeHub } from "../apps/api/src/realtime.js";
import { SQLitePersistence } from "@arcmemeperps/persistence";
import { healthRecord } from "@arcmemeperps/shared";

type Snapshot = { observedAt: string; markets: readonly Record<string, unknown>[] };
const dbPath = resolve(process.argv.find((value) => value.startsWith("--db="))?.slice("--db=".length) ?? "evidence/winner-rebuild/winner.sqlite");
const snapshotPath = resolve(process.argv.find((value) => value.startsWith("--snapshot="))?.slice("--snapshot=".length) ?? "evidence/winner-rebuild/discovery-snapshot.json");
const port = Number(process.argv.find((value) => value.startsWith("--port="))?.slice("--port=".length) ?? "8787");
await mkdir(dirname(dbPath), { recursive: true });
const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as Snapshot;
const storage = new SQLitePersistence(dbPath);
for (const market of snapshot.markets) {
  const marketId = typeof market.marketId === "string" ? market.marketId : null;
  if (marketId) storage.put("market_universe", marketId, market, snapshot.observedAt);
}
const realtime = new RealtimeHub();
realtime.publish(realtime.createEvent({ id: `winner-rebuild:discovery:${snapshot.observedAt}`, type: "market.discovered", occurredAt: snapshot.observedAt, payload: { deploymentId: "arc-testnet-product-v2", marketCount: String(snapshot.markets.length) } }));
const model = new PersistenceApiReadModel(storage);
const server = createReadOnlyApiServer({ readModel: model, realtime, health: () => [
  healthRecord("DATABASE", "OPERATIONAL", { lastSuccessAt: new Date().toISOString(), latencyMs: 0, error: null, freshness: "FRESH" }),
  healthRecord("MARKET_DISCOVERY", "OPERATIONAL", { lastSuccessAt: snapshot.observedAt, latencyMs: 0, error: null, freshness: "FRESH" }),
  healthRecord("INDEXER", "OPERATIONAL", { lastSuccessAt: snapshot.observedAt, latencyMs: 0, error: null, freshness: "FRESH" }),
  healthRecord("RISK_ENGINE", "DEGRADED", { lastSuccessAt: snapshot.observedAt, latencyMs: null, error: "ORIGIN_INTEGRITY_REQUIRES_CONFIGURED_PROVIDERS", freshness: "STALE" }),
  healthRecord("REALTIME_STREAM", realtime.status() === "LIVE" ? "OPERATIONAL" : "STALE", { lastSuccessAt: snapshot.observedAt, latencyMs: 0, error: null, freshness: realtime.status() === "LIVE" ? "FRESH" : "STALE" }),
] });
server.listen(port, "127.0.0.1", () => process.stdout.write(`WINNER_REBUILD_API=http://127.0.0.1:${port}/api/v1\nMARKET_UNIVERSE=${snapshot.markets.length}\n`));
const close = () => { server.close(); storage.close(); };
process.once("SIGINT", close); process.once("SIGTERM", close);
