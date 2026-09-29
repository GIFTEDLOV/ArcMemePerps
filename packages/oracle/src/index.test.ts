import { describe, expect, it } from "vitest";
import { assertOracleUsable, normalizeOracleReadings } from "./index.js";

describe("oracle normalization", () => {
  const now = "2026-09-29T00:01:00.000Z";

  it("normalizes multiple sources deterministically", () => {
    const reading = normalizeOracleReadings(
      [
        {
          source: "b",
          priceUsd: 1.01,
          observedAt: "2026-09-29T00:00:30.000Z",
          confidenceBps: 9_500,
        },
        { source: "a", priceUsd: 1, observedAt: "2026-09-29T00:00:45.000Z", confidenceBps: 9_000 },
        {
          source: "c",
          priceUsd: 1.005,
          observedAt: "2026-09-29T00:00:40.000Z",
          confidenceBps: 9_200,
        },
      ],
      now,
    );
    expect(reading.priceUsd).toBe(1.005);
    expect(reading.sourceCount).toBe(3);
    expect(reading.sources).toEqual(["a", "b", "c"]);
    expect(() => assertOracleUsable(reading)).not.toThrow();
  });

  it("marks stale data and rejects it", () => {
    const reading = normalizeOracleReadings(
      [{ source: "a", priceUsd: 1, observedAt: "2026-09-28T00:00:00.000Z", confidenceBps: 9_000 }],
      now,
    );
    expect(reading.stale).toBe(true);
    expect(() => assertOracleUsable(reading)).toThrow("stale oracle price");
  });
});
