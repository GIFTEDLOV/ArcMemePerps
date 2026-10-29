import { verifyArcMarket } from "./verification.js";
import {
  arcIndexStream,
  indexDatabaseConfigured,
  readArcIndexSnapshot,
  readIndexedMarkets,
  readIndexedPositions,
  readIndexedFinancialTotals,
  readIndexedActivity,
} from "./arc-index-read.js";
import { marketIdForToken, type SupportedChain } from "@arcmemeperps/shared";
/**
 * CLUSTER / Arc deadline read-only API.
 *
 * Ephemeral Vercel Function: NEVER trade, sign, qualify, persist financial
 * state, infer a position, imply perpetual markets are live, or expose secrets.
 * Discovery reflects the current DEX Screener response, not a chain registry.
 */
type AnyRecord = Record<string, any>;
const CHAIN_NAMES: Record<string, string> = {
  solana: "SOLANA",
  bsc: "BNB",
  base: "BASE",
  ethereum: "ETHEREUM",
  robinhood: "ROBINHOOD",
  arc: "ARC",
};
const RPC = "https://rpc.mainnet.arc.io";
const ENGINE = "0xd9c3cbf1841103749f379cc1aae1a9284d8dc3e1";
const LP = "0x9ff8358dc5ee866e0b9707d0139cf47b399f5257";
const CACHE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
};

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), { status, headers: { ...CACHE_HEADERS, ...headers } });
}
function stringValue(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function numberValue(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
async function getJson(url: string, timeout = 6000): Promise<any> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error("PROVIDER_HTTP_" + res.status);
  return res.json();
}
async function rpc(method: string, params: any[]): Promise<any> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(5500),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error("ARC_RPC_HTTP_" + res.status);
  const result = await res.json();
  if (result.error || typeof result.result !== "string")
    throw new Error("ARC_RPC_INVALID_RESPONSE");
  return result.result;
}
function marketFromProfile(profile: AnyRecord, pairs: AnyRecord[], at: string): AnyRecord | null {
  const chain = CHAIN_NAMES[String(profile.chainId ?? "").toLowerCase()];
  const token = stringValue(profile.tokenAddress);
  if (!chain || !token) return null;
  let normalizedToken: string, canonicalMarketId: string;
  try {
    normalizedToken = chain === "SOLANA" ? token : token.toLowerCase();
    canonicalMarketId = marketIdForToken(chain as SupportedChain, token);
  } catch {
    return null;
  }
  const candidates = pairs.filter(
    (p) =>
      String(p.chainId ?? "").toLowerCase() === String(profile.chainId).toLowerCase() &&
      String(p.baseToken?.address ?? "").toLowerCase() === token.toLowerCase(),
  );
  const pair =
    candidates.sort(
      (a, b) => (numberValue(b.liquidity?.usd) ?? 0) - (numberValue(a.liquidity?.usd) ?? 0),
    )[0] ?? null;
  const price = stringValue(pair?.priceUsd);
  const h24 = numberValue(pair?.priceChange?.h24);
  const buys = numberValue(pair?.txns?.h24?.buys),
    sells = numberValue(pair?.txns?.h24?.sells);
  const available = !!pair;
  return {
    marketId: canonicalMarketId,
    chain,
    tokenAddress: normalizedToken,
    symbol: stringValue(pair?.baseToken?.symbol),
    name: stringValue(pair?.baseToken?.name),
    decimals: null,
    imageUrl: stringValue(profile.icon),
    sourceUrl: stringValue(pair?.url) ?? stringValue(profile.url),
    originPlatform: stringValue(pair?.dexId),
    lifecycle: {
      status: available ? "DEX_LIVE" : "DISCOVERED",
      observedAt: at,
      confidenceBps: null,
      evidenceHash: null,
    },
    priceUsd: price,
    priceChange24hBps: h24 === null ? null : Math.round(h24 * 100),
    volume24hUsd: numberValue(pair?.volume?.h24)?.toString() ?? null,
    transactions24h: buys === null && sells === null ? null : (buys ?? 0) + (sells ?? 0),
    originSpotLiquidityUsd: numberValue(pair?.liquidity?.usd)?.toString() ?? null,
    originDepth2PctUsd: null,
    holders: null,
    top10ConcentrationBps: null,
    largestClusterBps: null,
    integrity: {
      status: "UNKNOWN",
      reasonCodes: ["NOT_ASSESSED_ONCHAIN"],
      observations: [
        {
          provider: "DEXSCREENER",
          status: available ? "AVAILABLE" : "PARTIAL",
          observedAt: at,
          fetchedAt: at,
          blockOrSlot: null,
          evidenceHash: null,
          reason: available ? null : "NO_TOKEN_PAIR",
        },
      ],
    },
    derivatives: {
      status: "NOT_REGISTERED",
      safeOiUsd: null,
      safePositionUsd: null,
      maxLeverage: null,
      oracleQuality: null,
      sourceIndependence: null,
      reasonCodes: ["NOT_VERIFIED_AGAINST_ARC_REGISTRY"],
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
    providerState: {
      status: available ? "AVAILABLE" : "PARTIAL",
      fetchedAt: at,
      reason: available ? null : "NO_TOKEN_PAIR",
    },
    freshness: {
      status: price !== null ? "AVAILABLE" : "UNAVAILABLE",
      observedAt: price !== null ? at : null,
      maxAgeSeconds: 300,
    },
    history: price !== null ? [{ observedAt: at, priceUsd: price }] : [],
  };
}
async function discover(): Promise<{ markets: AnyRecord[]; source: AnyRecord }> {
  const at = new Date().toISOString();
  try {
    const raw = await getJson("https://api.dexscreener.com/token-profiles/latest/v1");
    if (!Array.isArray(raw)) throw new Error("INVALID_PROFILE_FEED");
    const profiles = raw
      .filter(
        (p) =>
          p && CHAIN_NAMES[String(p.chainId ?? "").toLowerCase()] && stringValue(p.tokenAddress),
      )
      .slice(0, 60);
    const groups = new Map<string, AnyRecord[]>();
    for (const p of profiles) {
      const k = String(p.chainId).toLowerCase();
      groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    const allPairs: AnyRecord[] = [];
    let failures = 0;
    const jobs: Promise<void>[] = [];
    for (const [chain, rows] of groups) {
      for (let i = 0; i < rows.length; i += 25) {
        const chunk = rows.slice(i, i + 25);
        const endpoint =
          "https://api.dexscreener.com/tokens/v1/" +
          encodeURIComponent(chain) +
          "/" +
          chunk.map((p) => encodeURIComponent(p.tokenAddress)).join(",");
        jobs.push(
          getJson(endpoint)
            .then((data) => {
              if (Array.isArray(data)) allPairs.push(...data);
              else failures++;
            })
            .catch(() => {
              failures++;
            }),
        );
      }
    }
    await Promise.all(jobs);
    const seen = new Set<string>(),
      markets: AnyRecord[] = [];
    for (const p of profiles) {
      const m = marketFromProfile(p, allPairs, at);
      if (m && !seen.has(m.marketId)) {
        seen.add(m.marketId);
        markets.push(m);
      }
    }
    return {
      markets,
      source: {
        provider: "DEXSCREENER",
        status: failures ? "PARTIAL" : "AVAILABLE",
        fetchedAt: at,
        marketCount: markets.length,
        reason: failures ? failures + "_PAIR_BATCHES_FAILED" : null,
      },
    };
  } catch {
    return {
      markets: [],
      source: {
        provider: "DEXSCREENER",
        status: "UNAVAILABLE",
        fetchedAt: at,
        marketCount: null,
        reason: "DISCOVERY_PROVIDER_UNAVAILABLE",
      },
    };
  }
}
function page(all: AnyRecord[], source: AnyRecord, url: URL, path: string) {
  const permitted = ["ALL", "ARC", "SOLANA", "BASE", "BNB", "ETHEREUM", "ROBINHOOD"];
  const chain = (url.searchParams.get("chain") ?? "ALL").toUpperCase();
  if (!permitted.includes(chain)) return json({ error: "UNSUPPORTED_CHAIN" }, 400);
  const q = (path === "markets/search" ? (url.searchParams.get("q") ?? "") : "")
    .toLowerCase()
    .trim();
  const filtered = all.filter(
    (m) =>
      (chain === "ALL" || m.chain === chain) &&
      (!q ||
        [m.name, m.symbol, m.tokenAddress, m.marketId].some(
          (v) => typeof v === "string" && v.toLowerCase().includes(q),
        )),
  );
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "40") || 40));
  const offset = Math.max(0, parseInt(url.searchParams.get("cursor") ?? "0") || 0);
  const items = filtered.slice(offset, offset + limit);
  return json({
    schemaVersion: "v1",
    items,
    nextCursor: offset + limit < filtered.length ? String(offset + limit) : null,
    total: filtered.length,
    discoveryCount: all.length,
    currentlyObservedCount: all.filter((m) => m.providerState.status === "AVAILABLE").length,
    staleRetainedCount: 0,
    perpCount: null,
    sources: [source],
    releaseMode: "READ_ONLY_DISCOVERY",
    qualificationInventory: "UNVERIFIED",
  });
}
async function status() {
  const asOf = new Date().toISOString();
  let arcIndex: Awaited<ReturnType<typeof readArcIndexSnapshot>> | null = null;
  let indexError = false;
  if (indexDatabaseConfigured()) {
    try {
      arcIndex = await readArcIndexSnapshot();
    } catch {
      indexError = true;
    }
  }
  const base = {
    asOf,
    service: "cluster-vercel-readonly",
    readOnly: true,
    chainId: 5042,
    tradingEnabled: false,
    lpDepositsEnabled: false,
    qualifiedMarketCount: null,
    qualificationInventory: "UNVERIFIED",
    indexer:
      arcIndex?.status ??
      (indexError ? "UNAVAILABLE_INDEX_QUERY_FAILED" : "UNAVAILABLE_NO_PERSISTENT_INDEXER"),
    arcIndex,
    sse: arcIndex ? "RECEIPT_BACKED_OUTBOX_INCOMPLETE" : "HEARTBEAT_ONLY",
    health: {
      API: "OPERATIONAL",
      DISCOVERY: "UNVERIFIED",
      ARC_RPC: "UNAVAILABLE",
      PERP_ENGINE: "UNVERIFIED",
      PUBLIC_LP: "UNVERIFIED",
    },
    contracts: { PerpEngine: ENGINE, PublicLPVault: LP },
  };
  try {
    const chain = await rpc("eth_chainId", []);
    if (BigInt(chain) !== 5042n) throw new Error("WRONG_CHAIN");
    const [engineCode, lpCode] = await Promise.all([
      rpc("eth_getCode", [ENGINE, "latest"]),
      rpc("eth_getCode", [LP, "latest"]),
    ]);
    const enginePresent = engineCode.length > 2,
      lpPresent = lpCode.length > 2;
    return {
      ...base,
      health: {
        ...base.health,
        ARC_RPC: "OPERATIONAL",
        PERP_ENGINE: enginePresent ? "DEPLOYED_NOT_BOOTSTRAP_VERIFIED" : "UNAVAILABLE",
        PUBLIC_LP: lpPresent ? "DEPLOYED_NOT_ACTIVE_VERIFIED" : "UNAVAILABLE",
      },
      contracts: { PerpEngine: ENGINE, PublicLPVault: LP },
      chainVerification: "RPC_CHAIN_ID_AND_CODE_ONLY_NOT_A_SOURCE_AUDIT",
    };
  } catch {
    return {
      ...base,
      chainVerification: "RPC_CHECK_FAILED",
      health: { ...base.health, ARC_RPC: "UNAVAILABLE" },
    };
  }
}
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,OPTIONS",
        },
      });
    if (request.method !== "GET")
      return json({ error: "READ_ONLY_API" }, 405, { "Cache-Control": "no-store" });
    const url = new URL(request.url);
    const route = (
      url.searchParams.get("route") ?? url.pathname.replace(/^\/api\/v1\//, "")
    ).replace(/^\/+/, "");
    if (route === "health")
      return json(
        { status: "ok", service: "cluster-vercel-readonly", readOnly: true, storage: "STATELESS" },
        200,
        { "Cache-Control": "no-store" },
      );
    if (route === "verification/markets") {
      const chain = url.searchParams.get("chain") ?? "";
      const tokenAddress = url.searchParams.get("tokenAddress") ?? "";
      return verifyArcMarket(chain, tokenAddress);
    }
    if (route.startsWith("verification/markets/"))
      return json(
        {
          error: "CHAIN_AND_TOKEN_REQUIRED",
          reason:
            "Verification must bind a canonical market ID to its originating chain and token address.",
          tradingEnabled: false,
          lpDepositsEnabled: false,
        },
        400,
        { "Cache-Control": "no-store" },
      );
    if (route === "protocol/status")
      return json(await status(), 200, { "Cache-Control": "public,s-maxage=15" });
    if (
      [
        "index/status",
        "index/markets",
        "index/positions",
        "index/financial-totals",
        "index/activity",
      ].includes(route)
    ) {
      if (!indexDatabaseConfigured()) return json({ error: "PERSISTENT_INDEX_UNAVAILABLE" }, 503);
      try {
        const snapshot = await readArcIndexSnapshot();
        if (route === "index/status") return json(snapshot, 200, { "Cache-Control": "no-store" });
        const items =
          route === "index/markets"
            ? await readIndexedMarkets()
            : route === "index/positions"
              ? await readIndexedPositions()
              : route === "index/financial-totals"
                ? await readIndexedFinancialTotals()
                : await readIndexedActivity((url.searchParams.get("category") ?? "").toUpperCase());
        return json(
          {
            schemaVersion: "v1",
            items,
            inventory: "INCOMPLETE",
            coverage: snapshot,
          },
          200,
          { "Cache-Control": "no-store" },
        );
      } catch (error) {
        if (error instanceof Error && error.message === "UNSUPPORTED_INDEX_CATEGORY")
          return json({ error: "UNSUPPORTED_INDEX_CATEGORY" }, 400);
        return json({ error: "PERSISTENT_INDEX_QUERY_FAILED" }, 503);
      }
    }
    if (route === "stream") {
      if (indexDatabaseConfigured()) return arcIndexStream(request);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode("retry: 15000\n: read-only heartbeat; no indexed events\n\n"),
          );
          let sent = 0;
          const interval = setInterval(() => {
            try {
              if (++sent >= 2) {
                clearInterval(interval);
                controller.close();
              } else
                controller.enqueue(
                  encoder.encode(": heartbeat " + new Date().toISOString() + "\n\n"),
                );
            } catch {
              clearInterval(interval);
            }
          }, 7000);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Access-Control-Allow-Origin": "*",
          "X-Accel-Buffering": "no",
        },
      });
    }
    if (["markets", "markets/trending", "markets/fresh", "markets/search"].includes(route)) {
      const r = await discover();
      return page(r.markets, r.source, url, route);
    }
    if (route.startsWith("markets/")) {
      const marketId = decodeURIComponent(route.slice("markets/".length));
      if (marketId.includes("/"))
        return json({ error: "MARKET_RESOURCE_UNAVAILABLE", reason: "NO_PERSISTENT_INDEXER" }, 503);
      const data = await discover(),
        item = data.markets.find((m) => m.marketId === marketId);
      return item
        ? json({ schemaVersion: "v1", market: item })
        : json({ error: "MARKET_NOT_IN_CURRENT_PROVIDER_WINDOW" }, 404);
    }
    return json({ error: "UNAVAILABLE_READ_ONLY_ENDPOINT", route }, 503, {
      "Cache-Control": "no-store",
    });
  },
};
