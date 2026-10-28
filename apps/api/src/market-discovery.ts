import {
  discoverDexScreenerWithStatus,
  discoverGeckoTerminalWithStatus,
  type DiscoveryFeedSnapshot,
  type UniverseMarket,
} from "@arcmemeperps/market-universe";
import { healthRecord, type HealthRecord } from "@arcmemeperps/shared";
import type { PersistenceStore } from "@arcmemeperps/persistence";

export const MARKET_DISCOVERY_MAX_AGE_SECONDS = 300;
export const MARKET_REGISTRY_MAX_AGE_SECONDS = 120;
const SOURCE_ID_PREFIX = "market-universe:";

export interface MarketDiscoveryFeed {
  readonly provider: DiscoveryFeedSnapshot["provider"];
  readonly discover: () => Promise<DiscoveryFeedSnapshot>;
}

const defaultFeeds: readonly MarketDiscoveryFeed[] = [
  { provider: "DEXSCREENER", discover: () => discoverDexScreenerWithStatus(fetch, 60) },
  {
    provider: "GECKOTERMINAL",
    discover: () => discoverGeckoTerminalWithStatus({ pagesPerNetwork: 1 }),
  },
];

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function fetchedAtOf(market: Record<string, unknown>): string | null {
  const providerState = object(market.providerState);
  return typeof providerState.fetchedAt === "string" ? providerState.fetchedAt : null;
}

function ageSeconds(fetchedAt: string | null, now: number): number | null {
  if (fetchedAt === null) return null;
  const timestamp = Date.parse(fetchedAt);
  if (!Number.isFinite(timestamp)) return null;
  return Math.floor((now - timestamp) / 1_000);
}

function availability(
  declared: unknown,
  observedAt: string | null,
  maximumAge: unknown,
  now: number,
): string {
  if (
    typeof declared !== "string" ||
    observedAt === null ||
    typeof maximumAge !== "number" ||
    maximumAge < 0
  )
    return "UNAVAILABLE";
  const age = ageSeconds(observedAt, now);
  if (age === null) return "UNAVAILABLE";
  if (age < 0) return "CONFLICTED";
  if (age > maximumAge) return "STALE";
  if (["AVAILABLE", "PARTIAL", "STALE", "UNAVAILABLE", "CONFLICTED"].includes(declared))
    return declared;
  return "UNAVAILABLE";
}

export function effectiveDiscoveryAvailability(
  market: Record<string, unknown>,
  now = Date.now(),
): Record<string, unknown> {
  const providerState = object(market.providerState);
  const freshness = object(market.freshness);
  const fetchedAt = fetchedAtOf(market);
  const status = availability(
    providerState.status,
    fetchedAt,
    typeof providerState.maxAgeSeconds === "number"
      ? providerState.maxAgeSeconds
      : MARKET_DISCOVERY_MAX_AGE_SECONDS,
    now,
  );
  const dataStatus = availability(
    freshness.status,
    typeof freshness.observedAt === "string" ? freshness.observedAt : null,
    freshness.maxAgeSeconds,
    now,
  );
  return {
    ...market,
    providerState: {
      ...providerState,
      status,
      maxAgeSeconds: MARKET_DISCOVERY_MAX_AGE_SECONDS,
    },
    freshness: {
      ...freshness,
      status: dataStatus,
    },
  };
}

export interface MarketDiscoverySummary {
  readonly discoveryCount: number;
  readonly currentlyObservedCount: number;
  readonly staleRetainedCount: number;
  readonly sources: readonly Record<string, unknown>[];
}

export function marketDiscoverySummary(
  storage: PersistenceStore,
  now = Date.now(),
): MarketDiscoverySummary {
  const markets = storage.list("market_universe").map((record) => object(record.payload));
  const observed = markets.filter((market) => {
    const current = effectiveDiscoveryAvailability(market, now);
    return (
      object(current.providerState).status === "AVAILABLE" ||
      object(current.providerState).status === "PARTIAL"
    );
  }).length;
  const staleRetained = markets.filter(
    (market) =>
      object(effectiveDiscoveryAvailability(market, now).providerState).status === "STALE",
  ).length;
  const sources = storage
    .list("discovery_sources")
    .filter((record) => record.id.startsWith(SOURCE_ID_PREFIX))
    .map((record) => {
      const source = object(record.payload);
      const age = ageSeconds(typeof source.fetchedAt === "string" ? source.fetchedAt : null, now);
      const declared = typeof source.status === "string" ? source.status : "UNAVAILABLE";
      const maxAgeSeconds =
        typeof source.maxAgeSeconds === "number"
          ? source.maxAgeSeconds
          : MARKET_DISCOVERY_MAX_AGE_SECONDS;
      const status =
        age === null || declared === "UNAVAILABLE"
          ? "UNAVAILABLE"
          : age < 0
            ? "CONFLICTED"
            : age > maxAgeSeconds
              ? "STALE"
              : declared;
      return { ...source, status, maxAgeSeconds };
    });
  return {
    discoveryCount: markets.length,
    currentlyObservedCount: observed,
    staleRetainedCount: staleRetained,
    sources,
  };
}

export class MarketDiscoveryService {
  private running = false;
  private newlyDiscovered = new Set<string>();

  public constructor(
    private readonly storage: PersistenceStore,
    private readonly feeds: readonly MarketDiscoveryFeed[] = defaultFeeds,
  ) {}

  public async refresh(now = new Date()): Promise<MarketDiscoverySummary> {
    if (this.running) return marketDiscoverySummary(this.storage, now.getTime());
    this.running = true;
    this.newlyDiscovered.clear();
    try {
      const snapshots = await Promise.all(
        this.feeds.map(async (feed) => {
          try {
            return await feed.discover();
          } catch {
            return {
              provider: feed.provider,
              status: "UNAVAILABLE",
              fetchedAt: now.toISOString(),
              markets: [],
              reason: "PROVIDER_REQUEST_FAILED",
            } satisfies DiscoveryFeedSnapshot;
          }
        }),
      );
      const candidates = new Map<
        string,
        Array<{ snapshot: DiscoveryFeedSnapshot; market: UniverseMarket }>
      >();
      for (const snapshot of snapshots) {
        this.storage.put(
          "discovery_sources",
          `${SOURCE_ID_PREFIX}${snapshot.provider}`,
          {
            provider: snapshot.provider,
            status: snapshot.status,
            fetchedAt: snapshot.fetchedAt,
            marketCount: snapshot.markets.length,
            reason: snapshot.reason,
          },
          snapshot.fetchedAt,
        );
        for (const market of snapshot.markets) {
          const rows = candidates.get(market.marketId) ?? [];
          rows.push({ snapshot, market });
          candidates.set(market.marketId, rows);
        }
      }

      for (const [marketId, rows] of candidates) {
        const selected = [...rows].sort(
          (left, right) => completeness(right.market) - completeness(left.market),
        )[0]!;
        const previous = object(this.storage.get("market_universe", marketId)?.payload);
        if (Object.keys(previous).length === 0) this.newlyDiscovered.add(marketId);
        const currentObservations = rows.flatMap(
          ({ market }) => (object(market.integrity).observations as unknown[]) ?? [],
        );
        const oldObservations = object(previous.integrity).observations as unknown[] | undefined;
        const byProvider = new Map<string, Record<string, unknown>>();
        for (const observation of [...(oldObservations ?? []), ...currentObservations]) {
          const value = object(observation);
          if (typeof value.provider !== "string") continue;
          byProvider.set(value.provider, value);
        }
        const providerStatus = object(selected.market.providerState);
        const freshness = object(selected.market.freshness);
        const row = {
          ...selected.market,
          ...(previous.registryVerified === true
            ? {
                registryVerified: true,
                registryAvailability: previous.registryAvailability,
                perp: previous.perp,
              }
            : {}),
          integrity: {
            ...object(selected.market.integrity),
            observations: [...byProvider.values()],
          },
          providerState: {
            ...providerStatus,
            fetchedAt:
              typeof providerStatus.fetchedAt === "string"
                ? providerStatus.fetchedAt
                : selected.snapshot.fetchedAt,
            maxAgeSeconds: MARKET_DISCOVERY_MAX_AGE_SECONDS,
          },
          freshness: {
            ...freshness,
            ...(typeof freshness.maxAgeSeconds === "number"
              ? {}
              : { maxAgeSeconds: MARKET_DISCOVERY_MAX_AGE_SECONDS }),
          },
        };
        this.storage.put("market_universe", marketId, row, selected.snapshot.fetchedAt);
      }
      return marketDiscoverySummary(this.storage, now.getTime());
    } finally {
      this.running = false;
    }
  }

  public recordRegistrySnapshot(input: {
    readonly markets: readonly Record<string, unknown>[];
    readonly status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
    readonly fetchedAt: string;
    readonly reason: string | null;
  }): readonly string[] {
    const newlyDiscovered: string[] = [];
    this.storage.put(
      "discovery_sources",
      `${SOURCE_ID_PREFIX}ARC_MARKET_REGISTRY`,
      {
        provider: "ARC_MARKET_REGISTRY",
        status: input.status,
        fetchedAt: input.fetchedAt,
        marketCount: input.markets.length,
        reason: input.reason,
        maxAgeSeconds: MARKET_REGISTRY_MAX_AGE_SECONDS,
      },
      input.fetchedAt,
    );
    for (const market of input.markets) {
      const marketId = typeof market.marketId === "string" ? market.marketId : null;
      if (marketId === null) continue;
      const previous = object(this.storage.get("market_universe", marketId)?.payload);
      if (Object.keys(previous).length === 0) newlyDiscovered.push(marketId);
      const previousIntegrity = object(previous.integrity);
      const registryIntegrity = object(market.integrity);
      const observations = [
        ...(Array.isArray(previousIntegrity.observations) ? previousIntegrity.observations : []),
        ...(Array.isArray(registryIntegrity.observations) ? registryIntegrity.observations : []),
      ];
      const byProvider = new Map<string, Record<string, unknown>>();
      for (const item of observations) {
        const observation = object(item);
        if (typeof observation.provider === "string")
          byProvider.set(observation.provider, observation);
      }
      const hasExternalRecord = typeof previous.discoveryProvider === "string";
      const merged = {
        ...previous,
        ...market,
        ...(hasExternalRecord
          ? {
              symbol: previous.symbol ?? null,
              name: previous.name ?? null,
              decimals: previous.decimals ?? null,
              imageUrl: previous.imageUrl ?? null,
              sourceUrl: previous.sourceUrl ?? null,
              originPlatform: previous.originPlatform ?? null,
              priceUsd: previous.priceUsd ?? null,
              priceChange24hBps: previous.priceChange24hBps ?? null,
              volume24hUsd: previous.volume24hUsd ?? null,
              transactions24h: previous.transactions24h ?? null,
              originSpotLiquidityUsd: previous.originSpotLiquidityUsd ?? null,
              originDepth2PctUsd: previous.originDepth2PctUsd ?? null,
              holders: previous.holders ?? null,
              top10ConcentrationBps: previous.top10ConcentrationBps ?? null,
              largestClusterBps: previous.largestClusterBps ?? null,
              lifecycle: previous.lifecycle,
              providerState: previous.providerState,
              freshness: previous.freshness,
              history: previous.history,
            }
          : {}),
        integrity: {
          ...(hasExternalRecord ? previousIntegrity : registryIntegrity),
          observations: [...byProvider.values()],
        },
        registryVerified: true,
      };
      this.storage.put("market_universe", marketId, merged, input.fetchedAt);
    }
    return newlyDiscovered;
  }

  public takeNewlyDiscoveredMarketIds(): readonly string[] {
    const result = [...this.newlyDiscovered];
    this.newlyDiscovered.clear();
    return result;
  }

  public health(now = new Date()): HealthRecord {
    const summary = marketDiscoverySummary(this.storage, now.getTime());
    const sourceStates = summary.sources.map((source) => String(source.status));
    const successful = sourceStates.filter(
      (status) => status === "AVAILABLE" || status === "PARTIAL",
    ).length;
    const lastSuccessAt =
      summary.sources
        .filter((source) => source.status === "AVAILABLE" || source.status === "PARTIAL")
        .map((source) => (typeof source.fetchedAt === "string" ? source.fetchedAt : null))
        .filter((value): value is string => value !== null)
        .sort()
        .at(-1) ?? null;
    const state: HealthRecord["state"] =
      summary.sources.length === 0 || successful === 0
        ? "UNAVAILABLE"
        : successful === summary.sources.length &&
            sourceStates.every((status) => status === "AVAILABLE")
          ? "OPERATIONAL"
          : "DEGRADED";
    const failures = summary.sources
      .filter((source) => source.status !== "AVAILABLE")
      .map((source) => `${String(source.provider)}:${String(source.reason ?? source.status)}`);
    return healthRecord("MARKET_DISCOVERY", state, {
      lastSuccessAt,
      latencyMs: null,
      error: state === "OPERATIONAL" ? null : failures.join(",") || "DISCOVERY_SOURCES_NOT_READY",
      freshness:
        state === "OPERATIONAL" ? "FRESH" : state === "UNAVAILABLE" ? "UNAVAILABLE" : "STALE",
    });
  }
}

function completeness(market: UniverseMarket): number {
  return [
    market.symbol,
    market.name,
    market.priceUsd,
    market.volume24hUsd,
    market.originSpotLiquidityUsd,
    market.imageUrl,
    market.sourceUrl,
  ].filter((value) => value !== null && value !== undefined).length;
}
