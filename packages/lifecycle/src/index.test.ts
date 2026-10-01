import { describe, expect, it } from "vitest";
import {
  assertLifecycleTransition,
  canTransitionLifecycle,
  classifyProvenLifecycle,
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

  it("requires platform-specific evidence for bonding and graduation", () => {
    expect(classifyProvenLifecycle("PUMP_STYLE", []).status).toBe("DISCOVERED");
    expect(
      classifyProvenLifecycle("PUMP_STYLE", [
        {
          platform: "PUMP_STYLE",
          stage: "GRADUATED",
          evidenceIds: ["pump:graduation"],
          observedAt: "2026-10-01T00:00:00.000Z",
          confidenceBps: 9500,
        },
      ]).status,
    ).toBe("GRADUATED");
    expect(
      classifyProvenLifecycle("PUMP_STYLE", [
        {
          platform: "PUMP_STYLE",
          stage: "GRADUATED",
          evidenceIds: [],
          observedAt: "2026-10-01T00:00:00.000Z",
          confidenceBps: 9500,
        },
      ]).reasonCodes,
    ).toContain("LIFECYCLE_EVIDENCE_UNAVAILABLE");
  });
});
