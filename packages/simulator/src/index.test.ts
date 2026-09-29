import { describe, expect, it } from "vitest";
import { runAllScenarios, runDeterministicPropertyScenarios, stressSummary } from "./index.js";

describe("economic simulation corpus", () => {
  it("runs every named adversarial scenario deterministically", () => {
    const summary = stressSummary(runAllScenarios());
    expect(summary.count).toBeGreaterThan(30);
    expect(summary.allReconcile).toBe(true);
    expect(summary.allBadDebtExplicit).toBe(true);
  });

  it("runs thousands of seeded property scenarios", () => {
    const results = runDeterministicPropertyScenarios(2_000);
    expect(results).toHaveLength(2_000);
    expect(stressSummary(results).allReconcile).toBe(true);
  });
});
