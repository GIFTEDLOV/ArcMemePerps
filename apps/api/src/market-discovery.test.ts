import { describe, expect, it } from "vitest";
import { InMemoryPersistence } from "@arcmemeperps/persistence";
import type { ArcDeploymentConfig } from "@arcmemeperps/shared";
import { mapDexMarket, type DiscoveryFeedSnapshot } from "@arcmemeperps/market-universe";
import {
  effectiveDiscoveryAvailability,
  MarketDiscoveryService,
  marketDiscoverySummary,
} from "./market-discovery.js";
import { PersistenceApiReadModel } from "./read-model.js";

const tokenAddress = "0x0000000000000000000000000000000000000001";

function marketAt(fetchedAt: string) {
  const market = mapDexMarket(
    { chainId: "base", tokenAddress },
    [
      {
        chainId: "base",
        baseToken: { address: tokenAddress, name: "Observed Token", symbol: "OBS" },
        priceUsd: "0.25",
      },
    ],
    fetchedAt,
  );
  if (market === null) throw new Error("TEST_MARKET_ID_INVALID");
  return market;
}

function feed(
  provider: DiscoveryFeedSnapshot["provider"],
  status: DiscoveryFeedSnapshot["status"],
  fetchedAt: string,
  markets: DiscoveryFeedSnapshot["markets"] = [],
): DiscoveryFeedSnapshot {
  return {
    provider,
    status,
    fetchedAt,
    markets,
    reason: status === "AVAILABLE" ? null : "TEST_PROVIDER_STATUS",
  };
}

const deployedConfig: ArcDeploymentConfig = {
  network: "MAINNET",
  chainId: 5042,
  chainName: "Arc Mainnet",
  rpcUrl: "https://rpc.mainnet.arc.io",
  explorerUrl: "https://explorer.arc.io",
  usdcAddress: "0x3600000000000000000000000000000000000000",
  deploymentId: "test-deployment",
  policyVersion: "0.4.0",
  startBlock: 1n,
  addresses: {},
  deploymentStatus: "DEPLOYED",
  lifecycle: "DEPLOYED_ZERO_MARKETS",
  persistenceNamespace: "test",
};

describe("read-only market discovery availability", () => {
  it("retains real provider rows and reports current, stale, and source state separately", async () => {
    const storage = new InMemoryPersistence();
    const fetchedAt = new Date().toISOString();
    const timestamp = new Date(fetchedAt);
    let dexSnapshot = feed("DEXSCREENER", "AVAILABLE", fetchedAt, [marketAt(fetchedAt)]);
    let geckoSnapshot = feed("GECKOTERMINAL", "UNAVAILABLE", fetchedAt);
    const service = new MarketDiscoveryService(storage, [
      { provider: "DEXSCREENER", discover: async () => dexSnapshot },
      { provider: "GECKOTERMINAL", discover: async () => geckoSnapshot },
    ]);

    const current = await service.refresh(timestamp);
    expect(current).toMatchObject({
      discoveryCount: 1,
      currentlyObservedCount: 1,
      staleRetainedCount: 0,
    });
    expect(current.sources.map((source) => source.status)).toEqual(["AVAILABLE", "UNAVAILABLE"]);
    expect(service.takeNewlyDiscoveredMarketIds()).toHaveLength(1);

    const later = new Date(timestamp.getTime() + 301_000);
    dexSnapshot = feed("DEXSCREENER", "UNAVAILABLE", later.toISOString());
    geckoSnapshot = feed("GECKOTERMINAL", "UNAVAILABLE", later.toISOString());
    const stale = await service.refresh(later);
    expect(stale).toMatchObject({
      discoveryCount: 1,
      currentlyObservedCount: 0,
      staleRetainedCount: 1,
    });
    expect(
      effectiveDiscoveryAvailability(storage.list("market_universe")[0]!.payload, later.getTime())
        .providerState,
    ).toMatchObject({ status: "STALE" });
    expect(stale.sources.every((source) => source.status === "UNAVAILABLE")).toBe(true);
    const readModel = new PersistenceApiReadModel(storage, undefined, deployedConfig);
    const search = await readModel.searchUniverseMarkets("obs", "BASE", { limit: 60 });
    expect(search.items).toHaveLength(1);
    expect(search.items[0]!.symbol).toBe("OBS");
    storage.close();
  });

  it("rejects future timestamps and counts only fresh registry-verified markets", async () => {
    const now = Date.now();
    const futureMarket = marketAt(new Date(now + 60_000).toISOString());
    expect(effectiveDiscoveryAvailability({ ...futureMarket }, now).providerState).toMatchObject({
      status: "CONFLICTED",
    });

    const storage = new InMemoryPersistence();
    const currentObservedAt = new Date(now).toISOString();
    const staleObservedAt = new Date(now - 121_000).toISOString();
    storage.put(
      "market_universe",
      "verified",
      {
        marketId: "verified",
        registryVerified: true,
        registryAvailability: { status: "BLOCKED", observedAt: currentObservedAt },
        perp: { marketId: "verified", status: "BLOCKED" },
        providerState: { status: "PARTIAL", fetchedAt: currentObservedAt, maxAgeSeconds: 300 },
        freshness: { status: "UNAVAILABLE", observedAt: null, maxAgeSeconds: null },
      },
      currentObservedAt,
    );
    storage.put(
      "market_universe",
      "claimed",
      {
        marketId: "claimed",
        registryVerified: false,
        perp: { marketId: "claimed", status: "LIVE" },
        providerState: { status: "AVAILABLE", fetchedAt: currentObservedAt, maxAgeSeconds: 300 },
        freshness: { status: "UNAVAILABLE", observedAt: null, maxAgeSeconds: null },
      },
      currentObservedAt,
    );
    storage.put(
      "market_universe",
      "old-registry-read",
      {
        marketId: "old-registry-read",
        registryVerified: true,
        registryAvailability: { status: "LIVE", observedAt: staleObservedAt },
        perp: { marketId: "old-registry-read", status: "LIVE" },
        providerState: { status: "AVAILABLE", fetchedAt: currentObservedAt, maxAgeSeconds: 300 },
        freshness: { status: "UNAVAILABLE", observedAt: null, maxAgeSeconds: null },
      },
      staleObservedAt,
    );

    const readModel = new PersistenceApiReadModel(storage, undefined, deployedConfig);
    const page = await readModel.listUniverseMarkets({});
    expect(page.perpCount).toBe(1);
    expect(page.discoveryCount).toBe(3);
    expect(page.currentlyObservedCount).toBe(3);
    expect(page.sources).toEqual([]);
    expect(marketDiscoverySummary(storage).discoveryCount).toBe(3);
    storage.close();
  });
});
