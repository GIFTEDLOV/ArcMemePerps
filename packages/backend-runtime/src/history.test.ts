import { describe, expect, it } from "vitest";
import {
  aggregateHistoricalWindows,
  HealthRegistry,
  HistoricalMarketPointSchema,
} from "./index.js";

const point = (observedAt: string, priceUsdWad: string) =>
  HistoricalMarketPointSchema.parse({
    observedAt,
    priceUsdWad,
    liquidityUsdWad: "1000000000000000000000",
    volumeUsdWad: "100000000000000000000",
    holderCount: 10,
    depth1PctUsdWad: "1000000000000000000",
    clusterConcentrationBps: 200,
    oracleStatus: "FRESH",
    riskStatus: "WATCH",
  });

describe("historical snapshots", () => {
  it("does not fabricate a window without two persisted observations", () => {
    const result = aggregateHistoricalWindows(
      [point("2026-01-01T00:00:00.000Z", "1000000000000000000")],
      "2026-01-01T00:01:00.000Z",
    );
    expect(result.find((item) => item.window === "1m")?.status).toBe("INSUFFICIENT_DATA");
  });

  it("calculates a fixed-point price change from real observations", () => {
    const result = aggregateHistoricalWindows(
      [
        point("2026-01-01T00:00:00.000Z", "1000000000000000000"),
        point("2026-01-01T00:04:00.000Z", "1100000000000000000"),
      ],
      "2026-01-01T00:05:00.000Z",
    );
    const fiveMinutes = result.find((item) => item.window === "5m");
    expect(fiveMinutes?.status).toBe("AVAILABLE");
    expect(fiveMinutes?.priceChangeBps).toBe(1000);
  });
});

describe("health registry", () => {
  it("surfaces the most severe component state", () => {
    const registry = new HealthRegistry();
    registry.update("DATABASE", {
      state: "OPERATIONAL",
      lastSuccessAt: null,
      latencyMs: 1,
      error: null,
      freshness: "FRESH",
    });
    registry.update("INDEXER", {
      state: "CRITICAL",
      lastSuccessAt: null,
      latencyMs: null,
      error: "checkpoint mismatch",
      freshness: "STALE",
    });
    expect(registry.overall()).toBe("CRITICAL");
  });
});
