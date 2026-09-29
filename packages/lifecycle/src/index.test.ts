import { describe, expect, it } from "vitest";
import {
  assertLifecycleTransition,
  canTransitionLifecycle,
  lifecyclePathForPlatform,
} from "./index.js";

describe("lifecycle engine", () => {
  it("supports pump-style and direct DEX paths independently", () => {
    expect(lifecyclePathForPlatform("PUMP_STYLE")).toEqual([
      "DISCOVERED",
      "BONDING",
      "GRADUATED",
      "DEX_LIVE",
      "ESTABLISHED",
    ]);
    expect(lifecyclePathForPlatform("UNISWAP_STYLE")).toEqual([
      "DISCOVERED",
      "DEX_LIVE",
      "ESTABLISHED",
    ]);
  });

  it("rejects lifecycle regression", () => {
    expect(canTransitionLifecycle("DEX_LIVE", "BONDING")).toBe(false);
    expect(() => assertLifecycleTransition("DEX_LIVE", "BONDING")).toThrow(
      "invalid lifecycle transition",
    );
  });
});
