import { describe, expect, it } from "vitest";
import { FIXTURE_CASES } from "../../../fixtures/corpus.js";
import { DEVELOPMENT_RISK_RULES, calibrateRules, clusterThresholdSensitivity } from "./index.js";

describe("development threshold calibration", () => {
  it("reports corpus outcomes without changing the corpus", () => {
    const result = calibrateRules(
      FIXTURE_CASES.map((item) => ({ id: item.id, observation: item.market.observation })),
      DEVELOPMENT_RISK_RULES,
      "2026-09-29T00:00:00.000Z",
    );
    expect(result.total).toBe(FIXTURE_CASES.length);
    expect(result.rejected + result.watch + result.qualified).toBe(result.total);
    expect(result).toHaveProperty("insufficientEvidence");
  });

  it("makes cluster sensitivity explicit", () => {
    const result = clusterThresholdSensitivity(
      FIXTURE_CASES.map((item) => ({ id: item.id, observation: item.market.observation })),
      DEVELOPMENT_RISK_RULES,
      [5, 10],
      "2026-09-29T00:00:00.000Z",
    );
    expect(result).toHaveLength(2);
    expect(result[0]!.threshold).toBe(5);
  });
});
