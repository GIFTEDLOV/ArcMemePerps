import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { MarketSnapshot, UserProfile, WalletSnapshot } from "@arcmemeperps/domain";
import {
  MarketListResponseSchema,
  MarketResponseSchema,
  ProtocolStatusSchema,
  WalletResponseSchema,
  API_VERSION,
} from "@arcmemeperps/api-contracts";
import type { HealthRecord } from "@arcmemeperps/shared";
import { RealtimeHub } from "./realtime.js";

export interface ApiReadModel {
  listMarkets(): Promise<readonly MarketSnapshot[]>;
  getMarket(marketId: string): Promise<MarketSnapshot | null>;
  getWallet(address: string): Promise<WalletSnapshot | null>;
  getProfile(address: string): Promise<UserProfile | null>;
  getNotifications(address: string): Promise<readonly Record<string, unknown>[]>;
}

export interface ApiServerOptions {
  readonly readModel: ApiReadModel;
  readonly health: () => readonly HealthRecord[];
  readonly realtime?: RealtimeHub;
}

/** Read-only versioned API boundary. Mutations are intentionally not exposed in this gate. */
export function createReadOnlyApiServer(options: ApiServerOptions) {
  const realtime = options.realtime ?? new RealtimeHub();
  return createServer((request, response) => {
    void handleRequest(request, response, options, realtime);
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  realtime: RealtimeHub,
): Promise<void> {
  if (request.method !== "GET") {
    writeJson(response, 405, { error: "READ_ONLY_API" });
    return;
  }
  const url = new URL(request.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/v1/")) {
    writeJson(response, 404, { error: "VERSIONED_API_REQUIRED" });
    return;
  }
  const path = url.pathname.slice("/api/v1".length);
  try {
    if (path === "/markets" || path === "/markets/trending") {
      const items = await options.readModel.listMarkets();
      const body = MarketListResponseSchema.parse({
        schemaVersion: API_VERSION,
        items,
        nextCursor: null,
      });
      writeJson(response, 200, body);
      return;
    }
    const market = /^\/markets\/([^/]+)$/.exec(path);
    if (market !== null) {
      const item = await options.readModel.getMarket(decodeURIComponent(market[1]!));
      if (item === null) {
        writeJson(response, 404, { error: "MARKET_NOT_FOUND" });
        return;
      }
      writeJson(
        response,
        200,
        MarketResponseSchema.parse({ schemaVersion: API_VERSION, market: item }),
      );
      return;
    }
    const wallet = /^\/wallet\/([^/]+)$/.exec(path);
    if (wallet !== null) {
      const item = await options.readModel.getWallet(decodeURIComponent(wallet[1]!));
      if (item === null) {
        writeJson(response, 404, { error: "WALLET_NOT_FOUND" });
        return;
      }
      writeJson(
        response,
        200,
        WalletResponseSchema.parse({ schemaVersion: API_VERSION, wallet: item }),
      );
      return;
    }
    const profile = /^\/profile\/([^/]+)$/.exec(path);
    if (profile !== null) {
      const item = await options.readModel.getProfile(decodeURIComponent(profile[1]!));
      if (item === null) {
        writeJson(response, 404, { error: "PROFILE_NOT_FOUND" });
        return;
      }
      writeJson(response, 200, { schemaVersion: API_VERSION, profile: item });
      return;
    }
    const notifications = /^\/notifications\/([^/]+)$/.exec(path);
    if (notifications !== null) {
      writeJson(response, 200, {
        schemaVersion: API_VERSION,
        items: await options.readModel.getNotifications(decodeURIComponent(notifications[1]!)),
        nextCursor: null,
      });
      return;
    }
    if (path === "/protocol/status") {
      writeJson(
        response,
        200,
        ProtocolStatusSchema.parse({
          schemaVersion: API_VERSION,
          asOf: new Date().toISOString(),
          health: Object.fromEntries(options.health().map((item) => [item.component, item.state])),
          readOnly: true,
        }),
      );
      return;
    }
    if (path === "/stream") {
      const lastEventId = request.headers["last-event-id"];
      await streamEvents(
        response,
        realtime,
        Array.isArray(lastEventId) ? lastEventId[0] : lastEventId,
      );
      return;
    }
    writeJson(response, 404, { error: "ENDPOINT_NOT_FOUND" });
  } catch (error) {
    writeJson(response, 503, {
      error: "DATA_UNAVAILABLE",
      detail: error instanceof Error ? error.message : "unknown",
    });
  }
}

async function streamEvents(
  response: ServerResponse,
  hub: RealtimeHub,
  afterId: string | undefined,
): Promise<void> {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  for (const event of hub.recentEvents(afterId))
    response.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  await new Promise<void>((resolve) => response.once("close", resolve));
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
