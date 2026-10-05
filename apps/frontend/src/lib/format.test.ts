import { describe, expect, it } from "vitest";
import { effectiveFreshness, pctBps, usdc, wad } from "./format";

describe("financial formatting", () => {
  it("formats fixed-point WAD without floating-point math", () => {
    expect(wad("1234500000000000000", 4)).toBe("$1.2345");
  });

  it("formats USDC base units", () => {
    expect(usdc("1250000", 2)).toBe("$1.25");
  });

  it("formats basis points", () => {
    expect(pctBps(1250)).toBe("12.50%");
  });

  it("does not present an old observation as fresh", () => {
    expect(effectiveFreshness("FRESH", "1970-01-01T00:00:00.000Z", 120)).toBe("STALE");
    expect(effectiveFreshness("FRESH", undefined, 120)).toBe("UNAVAILABLE");
    expect(effectiveFreshness("FRESH", new Date(Date.now() - 1_000).toISOString(), 120)).toBe("FRESH");
  });
});
