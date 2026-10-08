import { describe, expect, it } from "vitest";
import { calculateDynamicRiskCapacity, calculateRiskCapacity } from "./capacity.js";
import { estimateManipulationResistance } from "./manipulation.js";

const WAD = 1_000_000_000_000_000_000n;

describe("risk capacity and manipulation bounds", () => {
  it("takes max OI as the minimum of independent bounds", () => {
    const result = calculateRiskCapacity({
      integrityQualified: true,
      spotLiquidityUsdWad: 1_000_000n * WAD,
      depth1PctUsdWad: 100_000n * WAD,
      depth2PctUsdWad: 200_000n * WAD,
      organicVolume24hUsdWad: 500_000n * WAD,
      realizedVolatilityBps: 500n,
      independentOracleSources: 3,
      oracleDispersionBps: 100n,
      oracleConfidenceBps: 9_000n,
      manipulationCostUsdWad: 500_000n * WAD,
      vaultBackingUsdWad: 1_000_000n * WAD,
      marketAgeDays: 45n,
      liquidityStable: true,
      currentOiUsdWad: 0n,
      currentSkewUsdWad: 0n,
    });
    expect(result.maxOiUsdWad).toBe(100_000n * WAD);
    expect(result.maxLeverageWad).toBeLessThanOrEqual(5n * WAD);
  });

  it("does not make a shallow dominant pool look safe", () => {
    const estimate = estimateManipulationResistance({
      buyDepth1PctUsd: 100_000n * WAD,
      sellDepth1PctUsd: 100_000n * WAD,
      buyDepth2PctUsd: 200_000n * WAD,
      sellDepth2PctUsd: 200_000n * WAD,
      dominantPoolShareBps: 9_000n,
      independentSourceCount: 2,
    });
    expect(estimate.move1PctUsd).toBe(50_000n * WAD);
    expect(estimate.status).toBe("LOW");
  });

  it("derives a positive but bounded capacity from small real depth", () => {
    const result = calculateDynamicRiskCapacity({
      integrityQualified: true,
      spotLiquidityUsdWad: 1_000_000n * WAD,
      depth1PctUsdWad: 80_000n * WAD,
      depth2PctUsdWad: 140_000n * WAD,
      organicVolume24hUsdWad: 500_000n * WAD,
      realizedVolatilityBps: 5_000n,
      independentOracleSources: 3,
      oracleDispersionBps: 50n,
      oracleConfidenceBps: 9_500n,
      manipulationCostUsdWad: 1_000_000n * WAD,
      vaultBackingUsdWad: 1_000_000n * WAD,
      liquidationCapacityUsdWad: 200_000n * WAD,
      marketAgeDays: 45n,
      liquidityStable: true,
      currentOiUsdWad: 0n,
      currentSkewUsdWad: 0n,
    });
    expect(result.derivativesStatus).toBe("ELIGIBLE");
    expect(result.maxOiUsdWad).toBe(38_000n * WAD);
    expect(result.maxPositionUsdWad).toBe(9_500n * WAD);
    expect(result.maxLeverageWad).toBe(125n * 10n ** 16n);
  });

  it("blocks small capacity instead of manufacturing a zero-safe-OI market", () => {
    const result = calculateDynamicRiskCapacity({
      integrityQualified: true,
      spotLiquidityUsdWad: 20_000n * WAD,
      depth1PctUsdWad: 1_000n * WAD,
      depth2PctUsdWad: 2_000n * WAD,
      organicVolume24hUsdWad: 10_000n * WAD,
      realizedVolatilityBps: 10_000n,
      independentOracleSources: 2,
      oracleDispersionBps: 100n,
      oracleConfidenceBps: 9_000n,
      manipulationCostUsdWad: 20_000n * WAD,
      vaultBackingUsdWad: 1_000_000n * WAD,
      liquidationCapacityUsdWad: 2_000n * WAD,
      marketAgeDays: 45n,
      liquidityStable: true,
      currentOiUsdWad: 0n,
      currentSkewUsdWad: 0n,
    });
    expect(result.derivativesStatus).toBe("BLOCKED");
    expect(result.reasons).toContain("CAPACITY_BELOW_MINIMUM");
  });

  it("does not admit a missing liquidation bound", () => {
    const result = calculateDynamicRiskCapacity({
      integrityQualified: true,
      spotLiquidityUsdWad: 1_000_000n * WAD,
      depth1PctUsdWad: 100_000n * WAD,
      depth2PctUsdWad: 200_000n * WAD,
      organicVolume24hUsdWad: 500_000n * WAD,
      realizedVolatilityBps: 500n,
      independentOracleSources: 3,
      oracleDispersionBps: 100n,
      oracleConfidenceBps: 9_000n,
      manipulationCostUsdWad: 500_000n * WAD,
      vaultBackingUsdWad: 1_000_000n * WAD,
      liquidationCapacityUsdWad: null,
      marketAgeDays: 45n,
      liquidityStable: true,
      currentOiUsdWad: 0n,
      currentSkewUsdWad: 0n,
    });
    expect(result.derivativesStatus).toBe("BLOCKED");
    expect(result.reasons).toContain("CRITICAL_BOUND_UNAVAILABLE");
  });
});
