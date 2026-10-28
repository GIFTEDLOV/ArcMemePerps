import { describe, expect, it } from "vitest";
import { normalizeMarket } from "./market-normalization";

describe("market normalization", () => {
  it("does not treat provider qualification claims as verified chain state", () => {
    const market = normalizeMarket({
      marketId: "arc:token",
      chain: "ARC",
      integrity: { status: "QUALIFIED" },
      derivatives: { status: "LIVE", safeOiUsd: "100000", maxLeverage: "5x" },
      perp: {
        status: "LIVE",
        qualificationHash: `0x${"a".repeat(64)}`,
        capacityUsd: "100000",
      },
    });

    expect(market.integrity.status).toBe("UNKNOWN");
    expect(market.derivatives.status).toBe("NOT_REGISTERED");
    expect(market.derivatives.safeOiUsd).toBeNull();
    expect(market.derivatives.maxLeverage).toBeNull();
    expect(market.perp.status).toBe("NOT_REGISTERED");
    expect(market.perp.qualificationHash).toBeNull();
    expect(market.perp.capacityUsd).toBeNull();
  });

  it("leaves absent measurements unavailable instead of inventing zeroes", () => {
    const market = normalizeMarket({ marketId: "arc:token", chain: "ARC" });

    expect(market.priceChange24hBps).toBeNull();
    expect(market.volume24hUsd).toBeNull();
    expect(market.transactions24h).toBeNull();
    expect(market.holders).toBeNull();
    expect(market.providerState.status).toBe("UNAVAILABLE");
    expect(market.freshness.status).toBe("UNAVAILABLE");
  });

  it("marks historical snapshots stale and removes their live freshness claim", () => {
    const market = normalizeMarket({
      marketId: "arc:token",
      chain: "ARC",
      providerState: { status: "AVAILABLE", fetchedAt: "2026-10-06T00:00:00.000Z" },
      freshness: { status: "AVAILABLE", observedAt: "2026-10-06T00:00:00.000Z" },
    }, { historicalSnapshot: true });

    expect(market.providerState.status).toBe("STALE");
    expect(market.freshness.status).toBe("STALE");
  });

  it("marks observations older than the declared freshness window stale", () => {
    const market = normalizeMarket({
      marketId: "arc:token",
      chain: "ARC",
      providerState: { status: "AVAILABLE", fetchedAt: new Date().toISOString() },
      freshness: { status: "AVAILABLE", observedAt: "2026-10-01T00:00:00.000Z", maxAgeSeconds: 30 },
    });

    expect(market.providerState.status).toBe("AVAILABLE");
    expect(market.freshness.status).toBe("STALE");
  });

  it("drops malformed financial values instead of rendering non-numeric text", () => {
    const market = normalizeMarket({
      marketId: "arc:token",
      chain: "ARC",
      priceUsd: "NaN",
      volume24hUsd: "Infinity",
      originSpotLiquidityUsd: "$500",
    });

    expect(market.priceUsd).toBeNull();
    expect(market.volume24hUsd).toBeNull();
    expect(market.originSpotLiquidityUsd).toBeNull();
  });
});
