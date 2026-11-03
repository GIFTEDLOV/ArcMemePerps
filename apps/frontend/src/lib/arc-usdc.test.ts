import { describe, expect, it } from "vitest";
import { formatArcErc20Usdc } from "./arc-usdc";
describe("Arc ERC-20 USDC balance precision", () => {
  it("formats six decimal token units without floating point", () => {
    expect(formatArcErc20Usdc(1_000_000n)).toBe("1.00");
    expect(formatArcErc20Usdc(1_235_000n)).toBe("1.24");
    expect(formatArcErc20Usdc(1_234_999n)).toBe("1.23");
    expect(formatArcErc20Usdc(100n)).toBe("0.00");
  });
  it("never loses cents for balances larger than JS safe integer", () => {
    expect(formatArcErc20Usdc(1_000_000_000_000_000_000n)).toBe("1000000000000.00");
  });
  it("rejects negative balances", () => {
    expect(() => formatArcErc20Usdc(-1n)).toThrow("NEGATIVE_USDC_BALANCE");
  });
});
