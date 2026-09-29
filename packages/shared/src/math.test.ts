import { describe, expect, it } from "vitest";
import {
  WAD,
  directionalPnl,
  feeOnNotionalUp,
  normalizePriceToWad,
  usdcToUsdWad,
  usdWadToUsdcDown,
  usdWadToUsdcUp,
} from "./math.js";

describe("fixed-point economic math", () => {
  it("converts USDC base units without floating point", () => {
    expect(usdcToUsdWad(1_000_000n)).toBe(WAD);
    expect(usdWadToUsdcDown(WAD + 999_999_999_999n)).toBe(1_000_000n);
    expect(usdWadToUsdcUp(WAD + 1n)).toBe(1_000_001n);
  });

  it("preserves PnL direction at very small prices", () => {
    const prices = [
      WAD,
      100_000_000_000_000_000n,
      100_000_000_000_000n,
      1_000_000_000n,
      1_000_000n,
    ];
    for (const entry of prices) {
      expect(directionalPnl(true, WAD, entry, entry * 2n)).toBeGreaterThan(0n);
      expect(directionalPnl(true, WAD, entry, entry / 2n)).toBeLessThan(0n);
      expect(directionalPnl(false, WAD, entry, entry * 2n)).toBeLessThan(0n);
      expect(directionalPnl(false, WAD, entry, entry / 2n)).toBeGreaterThan(0n);
    }
  });

  it("rounds fees up for solvency", () => {
    expect(feeOnNotionalUp(1n, 1n)).toBe(1n);
  });

  it("normalizes arbitrary source decimals to WAD", () => {
    expect(normalizePriceToWad(1_000_000n, 6)).toBe(WAD);
    expect(normalizePriceToWad(1n, 18)).toBe(1n);
  });
});
