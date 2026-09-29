import { describe, expect, it } from "vitest";
import { aggregatePriceObservations, type PriceObservation } from "./index.js";

const marketId = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const root = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;

function observation(overrides: Partial<PriceObservation> = {}): PriceObservation {
  return {
    marketId,
    chain: "BASE",
    source: "pool-a",
    sourceFamily: "DIRECT_UNISWAP_POOL",
    rawPrice: 1_000_000_000_000_000_000n,
    priceDecimals: 18,
    observedAt: 1_000n,
    confidenceBps: 9_500n,
    evidenceRoot: root,
    ...overrides,
  };
}

describe("deterministic oracle aggregation", () => {
  it("deduplicates correlated source families and blocks insufficient independence", () => {
    const result = aggregatePriceObservations(
      marketId,
      "BASE",
      [
        observation(),
        observation({ source: "dexscreener", sourceFamily: "DEXSCREENER_AGGREGATION" }),
      ],
      1_010n,
      {
        maxAgeSeconds: 120n,
        maximumDispersionBps: 300n,
        maximumIndividualDeviationBps: 1_000n,
        minimumIndependentSources: 3,
        minimumConfidenceBps: 8_500n,
        confidenceBandBps: 100n,
      },
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.independentSourceCount).toBe(2);
  });

  it("records wrong chain, future, stale, and disagreement inputs", () => {
    const result = aggregatePriceObservations(
      marketId,
      "BASE",
      [
        observation(),
        observation({
          source: "future",
          sourceFamily: "DIRECT_PANCAKESWAP_POOL",
          observedAt: 2_000n,
        }),
        observation({ source: "stale", sourceFamily: "DIRECT_RAYDIUM_POOL", observedAt: 1n }),
        observation({ source: "wrong-chain", sourceFamily: "CHAINLINK_FEED", chain: "ETHEREUM" }),
      ],
      1_010n,
    );
    expect(result.rejected.map((item) => item.reason)).toEqual(
      expect.arrayContaining(["FUTURE", "STALE", "WRONG_CHAIN"]),
    );
  });

  it("does not silently accept material dispersion", () => {
    const result = aggregatePriceObservations(
      marketId,
      "BASE",
      [
        observation(),
        observation({
          source: "pool-b",
          sourceFamily: "DIRECT_PANCAKESWAP_POOL",
          rawPrice: 1_100_000_000_000_000_000n,
        }),
      ],
      1_010n,
    );
    expect(result.status).toBe("BLOCKED");
    expect(result.dispersionBps).toBeGreaterThan(300n);
  });
});
