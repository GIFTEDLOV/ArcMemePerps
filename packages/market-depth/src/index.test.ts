import { describe, expect, it } from "vitest";
import {
  UnavailableQuoteAdapter,
  aggregateReadOnlyVenueDepth,
  calculateConstantProductDepth,
  quoteConstantProduct,
} from "./index.js";

describe("quote-based market depth", () => {
  it("quotes without using total liquidity as a depth proxy", () => {
    expect(quoteConstantProduct(1_000n, 1_000n, 100n, 30n)).toBeGreaterThan(0n);
    const result = calculateConstantProductDepth(
      [
        {
          venue: "uniswap",
          poolAddress: "0x1",
          baseReserveUsdWad: 1_000_000n,
          quoteReserveUsdWad: 1_000_000n,
          feeBps: 30n,
        },
      ],
      "2026-09-29T00:00:00.000Z",
    );
    expect(result.status).toBe("AVAILABLE");
    expect(result.buyDepth1PctUsdWad).not.toBeNull();
    expect(result.venueBreakdown).toHaveLength(1);
  });

  it("returns explicit unavailable for missing quote pools", () => {
    expect(calculateConstantProductDepth([]).reason).toBe("NO_QUOTE_POOLS");
  });

  it("does not fabricate depth for unsupported venue models", async () => {
    const result = await aggregateReadOnlyVenueDepth([
      new UnavailableQuoteAdapter("raydium", "RAYDIUM", "QUOTE_INFRASTRUCTURE_NOT_CONFIGURED"),
    ]);
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.buyDepth1PctUsdWad).toBeNull();
  });
});
