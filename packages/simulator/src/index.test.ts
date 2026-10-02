import { describe, expect, it } from "vitest";
import {
  resolveSolvencyWaterfall,
  runAllScenarios,
  runDeterministicPropertyScenarios,
  stressSummary,
} from "./index.js";

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

  it("runs the extended 10,000-sequence hostile stress corpus", () => {
    const results = runDeterministicPropertyScenarios(10_000, 0x4f4e4554);
    const summary = stressSummary(results);
    expect(results).toHaveLength(10_000);
    expect(summary.allReconcile).toBe(true);
    expect(summary.allBadDebtExplicit).toBe(true);
  });

  it("terminates explicitly when collateral, insurance, vault, and ADL are insufficient", () => {
    const result = resolveSolvencyWaterfall({
      deficitUsdc: 200n,
      positionCollateralUsdc: 50n,
      insuranceAvailableUsdc: 25n,
      vaultBackstopUsdc: 75n,
      profitableAdlClaimsUsdc: 30n,
    });
    expect(result.collateralRecoveredUsdc).toBe(50n);
    expect(result.insuranceUsedUsdc).toBe(25n);
    expect(result.vaultBackstopUsedUsdc).toBe(75n);
    expect(result.adlReductionUsdc).toBe(30n);
    expect(result.residualDeficitUsdc).toBe(20n);
    expect(result.terminalInsolvency).toBe(true);
    expect(result.accountingReconciles).toBe(true);
  });

  it("never covers more than the remaining deficit", () => {
    const result = resolveSolvencyWaterfall({
      deficitUsdc: 10n,
      positionCollateralUsdc: 100n,
      insuranceAvailableUsdc: 100n,
      vaultBackstopUsdc: 100n,
      profitableAdlClaimsUsdc: 100n,
    });
    expect(result.residualDeficitUsdc).toBe(0n);
    expect(result.collateralRecoveredUsdc).toBe(10n);
    expect(result.insuranceUsedUsdc + result.vaultBackstopUsedUsdc + result.adlReductionUsdc).toBe(
      0n,
    );
    expect(result.accountingReconciles).toBe(true);
  });
});
