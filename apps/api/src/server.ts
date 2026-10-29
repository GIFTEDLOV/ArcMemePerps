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
import { isSupportedChain, type ArcDeploymentConfig, type HealthRecord } from "@arcmemeperps/shared";
import { RealtimeHub } from "./realtime.js";

export interface ApiReadModel {
  listMarkets(): Promise<readonly MarketSnapshot[]>;
  listMarketsWithOptions?(options: {
    readonly chain?: string;
    readonly lifecycle?: string;
    readonly qualification?: string;
    readonly limit?: number;
    readonly offset?: number;
  }): Promise<readonly MarketSnapshot[]>;
  listTrending?(): Promise<readonly MarketSnapshot[]>;
  getMarket(marketId: string): Promise<MarketSnapshot | null>;
  getWallet(address: string): Promise<WalletSnapshot | null>;
  getProfile(address: string): Promise<UserProfile | null>;
  getNotifications(address: string): Promise<readonly Record<string, unknown>[]>;
  searchMarkets?(query: string, chain?: string): Promise<readonly MarketSnapshot[]>;
  listFreshMarkets?(): Promise<readonly MarketSnapshot[]>;
  getMarketResource?(
    marketId: string,
    resource:
      | "history"
      | "risk"
      | "proof"
      | "holders"
      | "clusters"
      | "deployer"
      | "depth"
      | "activity"
      | "pretrade",
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
  listUniverseMarkets?(options: { readonly chain?: string; readonly lifecycle?: string; readonly perp?: string; readonly limit?: number; readonly offset?: number }): Promise<{ readonly items: readonly Record<string, unknown>[]; readonly total: number; readonly discoveryCount: number; readonly currentlyObservedCount: number; readonly staleRetainedCount: number; readonly perpCount: number; readonly sources: readonly Record<string, unknown>[] }>;
  searchUniverseMarkets?(query: string, chain?: string, options?: { readonly lifecycle?: string; readonly limit?: number; readonly offset?: number }): Promise<{ readonly items: readonly Record<string, unknown>[]; readonly total: number; readonly discoveryCount: number; readonly currentlyObservedCount: number; readonly staleRetainedCount: number; readonly perpCount: number; readonly sources: readonly Record<string, unknown>[] }>;
  getUniverseMarket?(marketId: string): Promise<Record<string, unknown> | null>;
  getUniverseResource?(marketId: string, resource: string): Promise<unknown>;
}

export interface ApiServerOptions {
  readonly readModel: ApiReadModel;
  readonly health: () => readonly HealthRecord[];
  readonly realtime?: RealtimeHub;
  readonly runtime?: ApiRuntimeStatus | (() => ApiRuntimeStatus);
}

export interface ApiRuntimeStatus {
  readonly config: ArcDeploymentConfig;
  readonly discoveryCount: number;
  readonly currentlyObservedCount?: number;
  readonly staleRetainedCount?: number;
  readonly registeredPerpCount?: number;
  readonly livePerpCount?: number;
}

class ApiRequestError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "ApiRequestError";
  }
}

/** Read-only versioned API boundary. Mutations are intentionally not exposed in this gate. */
export function createReadOnlyApiServer(options: ApiServerOptions) {
  const realtime = options.realtime ?? new RealtimeHub();
  const allowedOrigin = process.env.API_ALLOWED_ORIGIN ?? "*";
  return createServer((request, response) => {
    void handleRequest(request, response, options, realtime, allowedOrigin);
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  realtime: RealtimeHub,
  allowedOrigin: string,
): Promise<void> {
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method !== "GET") {
    writeJson(response, 405, { error: "READ_ONLY_API" });
    return;
  }
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/health") {
    writeJson(response, 200, { status: "ok", service: "cluster-api", readOnly: true });
    return;
  }
  if (!url.pathname.startsWith("/api/v1/")) {
    writeJson(response, 404, { error: "VERSIONED_API_REQUIRED" });
    return;
  }
  const path = url.pathname.slice("/api/v1".length);
  try {
    if (path === "/markets" || path === "/markets/trending" || path === "/markets/fresh") {
      const limit = parseLimit(url.searchParams.get("limit"));
      const offset = parseOffset(url.searchParams.get("cursor"));
      const chain = url.searchParams.get("chain");
      if (chain !== null && !isSupportedChain(chain)) throw new ApiRequestError("UNSUPPORTED_CHAIN");
      let discoverySummary: Awaited<ReturnType<NonNullable<ApiReadModel["listUniverseMarkets"]>>> | undefined;
      if (options.readModel.listUniverseMarkets) {
        const universe = await options.readModel.listUniverseMarkets({
          ...(chain !== null ? { chain } : {}),
          ...(url.searchParams.has("lifecycle") ? { lifecycle: url.searchParams.get("lifecycle")! } : {}),
          ...(url.searchParams.has("perp") ? { perp: url.searchParams.get("perp")! } : {}),
          limit,
          offset,
        });
        discoverySummary = universe;
        if (universe.discoveryCount > 0) {
          writeJson(response, 200, { schemaVersion: API_VERSION, items: universe.items, total: universe.total, discoveryCount: universe.discoveryCount, currentlyObservedCount: universe.currentlyObservedCount, staleRetainedCount: universe.staleRetainedCount, perpCount: universe.perpCount, sources: universe.sources, nextCursor: nextCursorFor(universe.items.length, limit, offset) });
          return;
        }
      }
      const items =
        path === "/markets/trending" && options.readModel.listTrending
          ? await options.readModel.listTrending()
          : path === "/markets/fresh" && options.readModel.listFreshMarkets
            ? await options.readModel.listFreshMarkets()
            : options.readModel.listMarketsWithOptions
              ? await options.readModel.listMarketsWithOptions({
                  ...(url.searchParams.has("chain")
                    ? { chain: url.searchParams.get("chain")! }
                    : {}),
                  ...(url.searchParams.has("lifecycle")
                    ? { lifecycle: url.searchParams.get("lifecycle")! }
                    : {}),
                  ...(url.searchParams.has("qualification")
                    ? { qualification: url.searchParams.get("qualification")! }
                    : {}),
                  limit,
                  offset,
                })
              : await options.readModel.listMarkets();
      const body = MarketListResponseSchema.parse({
        schemaVersion: API_VERSION,
        items,
        nextCursor: nextCursorFor(items.length, limit, offset),
      });
      writeJson(response, 200, {
        ...body,
        ...(discoverySummary === undefined ? {} : {
          discoveryCount: discoverySummary.discoveryCount,
          currentlyObservedCount: discoverySummary.currentlyObservedCount,
          staleRetainedCount: discoverySummary.staleRetainedCount,
          perpCount: discoverySummary.perpCount,
          sources: discoverySummary.sources,
        }),
      });
      return;
    }
    if (path === "/markets/search") {
      const limit = parseLimit(url.searchParams.get("limit"));
      const offset = parseOffset(url.searchParams.get("cursor"));
      const chain = url.searchParams.get("chain");
      if (chain !== null && !isSupportedChain(chain)) throw new ApiRequestError("UNSUPPORTED_CHAIN");
      let discoverySummary: Awaited<ReturnType<NonNullable<ApiReadModel["searchUniverseMarkets"]>>> | undefined;
      if (options.readModel.searchUniverseMarkets) {
        const universe = await options.readModel.searchUniverseMarkets(url.searchParams.get("q") ?? "", chain ?? undefined, {
          ...(url.searchParams.has("lifecycle") ? { lifecycle: url.searchParams.get("lifecycle")! } : {}),
          limit,
          offset,
        });
        discoverySummary = universe;
        if (universe.discoveryCount > 0) {
          writeJson(response, 200, { schemaVersion: API_VERSION, items: universe.items, total: universe.total, discoveryCount: universe.discoveryCount, currentlyObservedCount: universe.currentlyObservedCount, staleRetainedCount: universe.staleRetainedCount, perpCount: universe.perpCount, sources: universe.sources, nextCursor: nextCursorFor(universe.items.length, limit, offset) });
          return;
        }
      }
      if (options.readModel.searchMarkets === undefined) throw new Error("SEARCH_UNAVAILABLE");
      const items = await options.readModel.searchMarkets(
        url.searchParams.get("q") ?? "",
        chain ?? undefined,
      );
      writeJson(
        response,
        200,
        {
          ...MarketListResponseSchema.parse({
          schemaVersion: API_VERSION,
          items,
          nextCursor: nextCursorFor(
            items.length,
            parseLimit(url.searchParams.get("limit")),
            parseOffset(url.searchParams.get("cursor")),
          ),
          }),
          ...(discoverySummary === undefined ? {} : {
            discoveryCount: discoverySummary.discoveryCount,
            currentlyObservedCount: discoverySummary.currentlyObservedCount,
            staleRetainedCount: discoverySummary.staleRetainedCount,
            perpCount: discoverySummary.perpCount,
            sources: discoverySummary.sources,
          }),
        },
      );
      return;
    }
    const marketResource =
      /^\/markets\/([^/]+)\/(history|risk|proof|holders|clusters|deployer|depth|activity|pretrade)$/.exec(
        path,
      );
    if (marketResource !== null) {
      if (options.readModel.getUniverseResource) {
        const data = await options.readModel.getUniverseResource(decodeURIComponent(marketResource[1]!), marketResource[2]!);
        if (data !== null) {
          writeJson(response, 200, { schemaVersion: API_VERSION, data });
          return;
        }
      }
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
      if (options.readModel.getUniverseMarket) {
        const item = await options.readModel.getUniverseMarket(decodeURIComponent(market[1]!));
        if (item === null) { /* fall through to the canonical Product projection */ }
        else {
        writeJson(response, 200, { schemaVersion: API_VERSION, market: item });
        return;
        }
      }
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
      const address = parseAddress(walletActivity[1]!);
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
      const item = await options.readModel.getWallet(parseAddress(wallet[1]!));
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
      const address = parseAddress(profileResource[1]!);
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
          parseAddress(competitionAccount[2]!),
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
      const item = await options.readModel.getProfile(parseAddress(profile[1]!));
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
          items: await options.readModel.getNotifications(parseAddress(notifications[1]!)),
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
        items: await options.readModel.getAttention(parseAddress(attention[1]!)),
      });
      return;
    }
    if (path === "/protocol/status") {
      const runtime = typeof options.runtime === "function" ? options.runtime() : options.runtime;
      writeJson(
        response,
        200,
        ProtocolStatusSchema.parse({
          schemaVersion: API_VERSION,
          asOf: new Date().toISOString(),
          health: Object.fromEntries(options.health().map((item) => [item.component, item.state])),
          readOnly: true,
          ...(runtime === undefined
            ? {}
            : {
                network: runtime.config.chainName,
                chainId: runtime.config.chainId,
                deployment: runtime.config.lifecycle,
                deploymentId: runtime.config.deploymentId,
                policyVersion: runtime.config.policyVersion,
                discoveryCount: runtime.discoveryCount,
                ...(runtime.currentlyObservedCount === undefined ? {} : { currentlyObservedCount: runtime.currentlyObservedCount }),
                ...(runtime.staleRetainedCount === undefined ? {} : { staleRetainedCount: runtime.staleRetainedCount }),
                ...(runtime.registeredPerpCount === undefined ? {} : { registeredPerpCount: runtime.registeredPerpCount }),
                ...(runtime.livePerpCount === undefined ? {} : { livePerpCount: runtime.livePerpCount }),
                contracts: runtime.config.addresses,
              }),
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
    if (error instanceof ApiRequestError || error instanceof URIError) {
      writeJson(response, 400, { error: error instanceof ApiRequestError ? error.code : "MALFORMED_PATH" });
    } else {
      writeJson(response, 503, { error: "DATA_UNAVAILABLE" });
    }
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
  response.flushHeaders();
  response.write(": connected\n\n");
  for (const event of hub.recentEvents(afterId))
    response.write(
      `id: ${event.sequence.toString()}\nevent: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence: event.sequence.toString() })}\n\n`,
    );
  const keepAlive = setInterval(() => response.write(": keep-alive\n\n"), 15_000);
  keepAlive.unref();
  await new Promise<void>((resolve) => response.once("close", resolve));
  clearInterval(keepAlive);
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function parseLimit(value: string | null): number {
  if (value === null) return 100;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new ApiRequestError("INVALID_LIMIT");
  return parsed;
}

function parseOffset(value: string | null): number {
  if (value === null || value.length === 0) return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new ApiRequestError("INVALID_CURSOR");
  return parsed;
}

function parseAddress(value: string): string {
  const address = decodeURIComponent(value);
  const validEvm = /^0x[0-9a-fA-F]{40}$/.test(address);
  const validSolana = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  if (!validEvm && !validSolana) throw new ApiRequestError("MALFORMED_ADDRESS");
  return address;
}

function nextCursorFor(length: number, limit: number, offset: number): string | null {
  return length === limit ? String(offset + length) : null;
}

