import { describe, expect, it } from "vitest";
import {
  assessSkew,
  computeBorrowUpdate,
  computeFundingUpdate,
  evaluateLiquidation,
} from "./economics.js";

const WAD = 1_000_000_000_000_000_000n;

describe("V1 economic formulas", () => {
  it("conserves long-heavy funding between payer, receiver, vault and dust", () => {
    const update = computeFundingUpdate(80_000n * WAD, 20_000n * WAD, 3_600n, {
      factorPerSecondWad: 1_000_000_000_000n,
      capPerSecondWad: 10_000_000_000_000n,
      minimumDenominatorUsdWad: WAD,
    });
    expect(update.longPaymentUsdWad).toBe(172_800_000_000_000_000_000n);
    expect(update.shortPaymentUsdWad + update.vaultRoutedUsdWad + update.roundingDustUsdWad).toBe(
      update.longPaymentUsdWad,
    );
  });

  it("raises borrow cost at high utilization", () => {
    const low = computeBorrowUpdate(100n * WAD, 1_000n * WAD, 3_600n, 100n * WAD, {
      baseRatePerSecondWad: 1_000_000_000n,
      slopePerSecondWad: 2_000_000_000n,
      kinkUtilizationWad: 800_000_000_000_000_000n,
      maxRatePerSecondWad: 2_500_000_000n,
    });
    const high = computeBorrowUpdate(1_000n * WAD, 1_000n * WAD, 3_600n, 100n * WAD, {
      baseRatePerSecondWad: 1_000_000_000n,
      slopePerSecondWad: 2_000_000_000n,
      kinkUtilizationWad: 800_000_000_000_000_000n,
      maxRatePerSecondWad: 2_500_000_000n,
    });
    expect(high.feeUsdWad).toBeGreaterThan(low.feeUsdWad);
  });

  it("charges worsening skew without funding unlimited rebates", () => {
    const decision = assessSkew(80n * WAD, 20n * WAD, "LONG", 10n * WAD, {
      maxSkewRatioWad: WAD,
      worseningFeeRateWad: 1_000_000_000_000_000n,
    });
    expect(decision.worsensSkew).toBe(true);
    expect(decision.feeUsdWad).toBeGreaterThan(0n);
    expect(
      assessSkew(80n * WAD, 20n * WAD, "SHORT", 10n * WAD, {
        maxSkewRatioWad: WAD,
        worseningFeeRateWad: 1_000_000_000_000_000n,
      }).feeUsdWad,
    ).toBe(0n);
  });

  it("records the exact deficit as bad debt", () => {
    const result = evaluateLiquidation(100n * WAD, {
      collateralUsdc: 100n,
      signedPnlUsdWad: -300n * 1_000_000_000_000n,
      fundingOwedUsdWad: 0n,
      fundingReceivableUsdWad: 0n,
      borrowFeeUsdWad: 0n,
      otherFeesUsdc: 0n,
      maintenanceMarginBps: 1_000n,
      minimumCollateralUsdc: 1n,
      liquidationFeeUsdc: 10n,
      liquidationBufferBps: 100n,
    });
    expect(result.badDebtUsdc).toBe(200n);
  });
});
