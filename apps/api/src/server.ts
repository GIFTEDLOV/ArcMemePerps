import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { MarketSnapshot, UserProfile, WalletSnapshot } from "@arcmemeperps/domain";
import {
  MarketListResponseSchema,
  MarketResponseSchema,
  NotificationListResponseSchema,
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
  searchMarkets?(query: string, chain?: string): Promise<readonly MarketSnapshot[]>;
  listFreshMarkets?(): Promise<readonly MarketSnapshot[]>;
  getMarketResource?(
    marketId: string,
    resource:
      "history" | "risk" | "proof" | "holders" | "clusters" | "deployer" | "depth" | "activity",
  ): Promise<unknown>;
  getWalletActivity?(address: string): Promise<readonly Record<string, unknown>[]>;
  getWalletIntelligence?(address: string): Promise<WalletSnapshot | null>;
  getProfileStats?(address: string): Promise<unknown>;
  getProfileWatchlist?(address: string): Promise<unknown>;
  listCompetitions?(): Promise<readonly Record<string, unknown>[]>;
  getCompetition?(id: string): Promise<Record<string, unknown> | null>;
  getCompetitionLeaderboard?(id: string): Promise<readonly Record<string, unknown>[]>;
  getCompetitionAccount?(id: string, address: string): Promise<Record<string, unknown> | null>;
  getAttention?(address: string): Promise<readonly Record<string, unknown>[]>;
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
    if (path === "/markets" || path === "/markets/trending" || path === "/markets/fresh") {
      const items =
        path === "/markets/fresh" && options.readModel.listFreshMarkets
          ? await options.readModel.listFreshMarkets()
          : await options.readModel.listMarkets();
      const body = MarketListResponseSchema.parse({
        schemaVersion: API_VERSION,
        items,
        nextCursor: null,
      });
      writeJson(response, 200, body);
      return;
    }
    if (path === "/markets/search") {
      if (options.readModel.searchMarkets === undefined) throw new Error("SEARCH_UNAVAILABLE");
      const items = await options.readModel.searchMarkets(
        url.searchParams.get("q") ?? "",
        url.searchParams.get("chain") ?? undefined,
      );
      writeJson(
        response,
        200,
        MarketListResponseSchema.parse({ schemaVersion: API_VERSION, items, nextCursor: null }),
      );
      return;
    }
    const marketResource =
      /^\/markets\/([^/]+)\/(history|risk|proof|holders|clusters|deployer|depth|activity)$/.exec(
        path,
      );
    if (marketResource !== null) {
      if (options.readModel.getMarketResource === undefined)
        throw new Error("MARKET_RESOURCE_UNAVAILABLE");
      const data = await options.readModel.getMarketResource(
        decodeURIComponent(marketResource[1]!),
        marketResource[2] as Parameters<NonNullable<ApiReadModel["getMarketResource"]>>[1],
      );
      writeJson(response, 200, { schemaVersion: API_VERSION, data });
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
    const walletActivity = /^\/wallet\/([^/]+)\/(activity|intelligence)$/.exec(path);
    if (walletActivity !== null) {
      const address = decodeURIComponent(walletActivity[1]!);
      if (walletActivity[2] === "activity" && options.readModel.getWalletActivity !== undefined)
        writeJson(response, 200, {
          schemaVersion: API_VERSION,
          items: await options.readModel.getWalletActivity(address),
        });
      else if (
        walletActivity[2] === "intelligence" &&
        options.readModel.getWalletIntelligence !== undefined
      )
        writeJson(response, 200, {
          schemaVersion: API_VERSION,
          wallet: await options.readModel.getWalletIntelligence(address),
        });
      else throw new Error("WALLET_RESOURCE_UNAVAILABLE");
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
    const profileResource = /^\/profile\/([^/]+)\/(stats|watchlist)$/.exec(path);
    if (profileResource !== null) {
      const address = decodeURIComponent(profileResource[1]!);
      if (profileResource[2] === "stats" && options.readModel.getProfileStats !== undefined)
        writeJson(response, 200, {
          schemaVersion: API_VERSION,
          data: await options.readModel.getProfileStats(address),
        });
      else if (
        profileResource[2] === "watchlist" &&
        options.readModel.getProfileWatchlist !== undefined
      )
        writeJson(response, 200, {
          schemaVersion: API_VERSION,
          data: await options.readModel.getProfileWatchlist(address),
        });
      else throw new Error("PROFILE_RESOURCE_UNAVAILABLE");
      return;
    }
    const competitionAccount = /^\/competitions\/([^/]+)\/account\/([^/]+)$/.exec(path);
    if (competitionAccount !== null) {
      if (options.readModel.getCompetitionAccount === undefined)
        throw new Error("COMPETITION_UNAVAILABLE");
      writeJson(response, 200, {
        schemaVersion: API_VERSION,
        data: await options.readModel.getCompetitionAccount(
          competitionAccount[1]!,
          competitionAccount[2]!,
        ),
      });
      return;
    }
    const competitionLeaderboard = /^\/competitions\/([^/]+)\/leaderboard$/.exec(path);
    if (competitionLeaderboard !== null) {
      if (options.readModel.getCompetitionLeaderboard === undefined)
        throw new Error("COMPETITION_UNAVAILABLE");
      writeJson(response, 200, {
        schemaVersion: API_VERSION,
        items: await options.readModel.getCompetitionLeaderboard(competitionLeaderboard[1]!),
      });
      return;
    }
    if (path === "/competitions") {
      if (options.readModel.listCompetitions === undefined)
        throw new Error("COMPETITION_UNAVAILABLE");
      writeJson(response, 200, {
        schemaVersion: API_VERSION,
        items: await options.readModel.listCompetitions(),
      });
      return;
    }
    const competition = /^\/competitions\/([^/]+)$/.exec(path);
    if (competition !== null) {
      if (options.readModel.getCompetition === undefined)
        throw new Error("COMPETITION_UNAVAILABLE");
      writeJson(response, 200, {
        schemaVersion: API_VERSION,
        data: await options.readModel.getCompetition(competition[1]!),
      });
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
        ...NotificationListResponseSchema.parse({
          schemaVersion: API_VERSION,
          items: await options.readModel.getNotifications(decodeURIComponent(notifications[1]!)),
          nextCursor: null,
        }),
      });
      return;
    }
    const attention = /^\/attention\/([^/]+)$/.exec(path);
    if (attention !== null) {
      if (options.readModel.getAttention === undefined) throw new Error("ATTENTION_UNAVAILABLE");
      writeJson(response, 200, {
        schemaVersion: API_VERSION,
        items: await options.readModel.getAttention(decodeURIComponent(attention[1]!)),
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
    response.write(
      `id: ${event.sequence.toString()}\nevent: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence: event.sequence.toString() })}\n\n`,
    );
  await new Promise<void>((resolve) => response.once("close", resolve));
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
