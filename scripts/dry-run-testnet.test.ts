import { describe, expect, it } from "vitest";
import { deploymentRiskBudget } from "./dry-run-testnet.js";

describe("Arc Testnet deployment risk budget", () => {
  it("accepts the conservative canary budget", () => {
    expect(
      deploymentRiskBudget({
        vaultBackingUsdc: 500_000_000n,
        insuranceUsdc: 100_000_000n,
        maxLeverageX: 2n,
        maxOIUsdc: 10_000_000n,
        maxLongOIUsdc: 5_000_000n,
        maxShortOIUsdc: 5_000_000n,
        maxPositionUsdc: 2_000_000n,
      }).status,
    ).toBe("RISK_BUDGET_SAFE");
  });

  it("rejects a budget that is too close to its backstop", () => {
    expect(
      deploymentRiskBudget({
        vaultBackingUsdc: 1_000_000n,
        insuranceUsdc: 0n,
        maxLeverageX: 2n,
        maxOIUsdc: 500_000n,
        maxLongOIUsdc: 500_000n,
        maxShortOIUsdc: 500_000n,
        maxPositionUsdc: 100_000n,
      }).status,
    ).toBe("RISK_BUDGET_UNSAFE");
  });
});
