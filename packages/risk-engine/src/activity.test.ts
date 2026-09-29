import { describe, expect, it } from "vitest";
import { analyzeActivity } from "./activity.js";

describe("explainable activity analysis", () => {
  it("does not claim certainty when no trades are available", () => {
    expect(analyzeActivity([]).status).toBe("INSUFFICIENT_DATA");
  });

  it("flags repeated round-trip activity as high risk", () => {
    const trades = Array.from({ length: 10 }, (_, index) => ({
      trader: "wallet-a",
      side: index % 2 === 0 ? ("BUY" as const) : ("SELL" as const),
      amountUsd: 100,
      timestamp: new Date(2026, 8, 29, 0, 0, index).toISOString(),
    }));
    const result = analyzeActivity(trades, { liquidityUsd: 10_000 });
    expect(result.status).toBe("HIGH_RISK");
    expect(result.reasons).toContain("frequent round trips");
  });

  it("returns transparent features for diverse activity", () => {
    const trades = Array.from({ length: 8 }, (_, index) => ({
      trader: `wallet-${index}`,
      side: index % 2 === 0 ? ("BUY" as const) : ("SELL" as const),
      amountUsd: 100 + index,
      timestamp: new Date(2026, 8, 29, 0, 0, index * index).toISOString(),
    }));
    const result = analyzeActivity(trades, { liquidityUsd: 100_000, holderGrowthPct24h: 2 });
    expect(result.status).toBe("CLEAR");
    expect(result.features.uniqueTraderCount).toBe(8);
    expect(result.features.holderGrowthPct24h).toBe(2);
  });
});
