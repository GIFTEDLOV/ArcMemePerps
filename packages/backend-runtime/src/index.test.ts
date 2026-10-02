import { describe, expect, it } from "vitest";
import {
  evaluateExecutionGate,
  evaluateQualificationGate,
  preTradePlanHash,
  assertPreTradePlanImmutable,
} from "./index.js";

describe("dual deterministic gates", () => {
  it("refuses stale or risk-increasing restricted execution", () => {
    const result = evaluateExecutionGate({
      qualificationFresh: true,
      marketState: "PAUSED",
      riskIncreasing: true,
      oracleFresh: true,
      oracleConfidenceBps: 9_000,
      requiredOracleConfidenceBps: 8_500,
      currentOIUsdWad: 0n,
      sideOIUsdWad: 0n,
      sizeDeltaUsdWad: 1n,
      maxOIUsdWad: 10n,
      maxSideOIUsdWad: 10n,
      maxPositionUsdWad: 10n,
      currentPositionUsdWad: 0n,
      vaultCapacityUsdWad: 10n,
      insuranceHealthy: true,
      marginSufficient: true,
      orderUnexpired: true,
      preTradePlanHashMatches: true,
    });
    expect(result).toEqual({ decision: "REFUSE", reasonCodes: ["MARKET_PAUSED"] });
  });

  it("keeps exposure-reducing actions available during an oracle/insurance outage", () => {
    const result = evaluateExecutionGate({
      qualificationFresh: false,
      marketState: "BLOCKED",
      riskIncreasing: false,
      oracleFresh: false,
      oracleConfidenceBps: 0,
      requiredOracleConfidenceBps: 8_500,
      currentOIUsdWad: 100n,
      sideOIUsdWad: 100n,
      sizeDeltaUsdWad: 10n,
      maxOIUsdWad: 1n,
      maxSideOIUsdWad: 1n,
      maxPositionUsdWad: 1n,
      currentPositionUsdWad: 100n,
      vaultCapacityUsdWad: 0n,
      insuranceHealthy: false,
      marginSufficient: false,
      orderUnexpired: true,
      preTradePlanHashMatches: true,
    });
    expect(result).toEqual({ decision: "ALLOW", reasonCodes: [] });
  });

  it("never turns missing qualification evidence into approval", () => {
    const result = evaluateQualificationGate({
      passport: {
        riskResult: {
          integrityStatus: "QUALIFIED",
          derivativesStatus: "ELIGIBLE",
          hardGateCodes: [],
          rejectionReasons: [],
          warnings: [],
          ruleVersion: "0.1.0",
        },
        observedAt: "2026-01-01T00:00:00.000Z",
        riskRuleVersion: "0.1.0",
      } as never,
      proofFresh: true,
      evidenceComplete: false,
      criticalDisagreement: false,
    });
    expect(result.decision).toBe("BLOCKED");
    expect(result.reasonCodes).toContain("INSUFFICIENT_EVIDENCE");
  });
});

describe("immutable pre-trade plan", () => {
  const marketId: `0x${string}` = `0x${"11".repeat(32)}`;
  const plan = {
    version: "pretrade-plan/v1" as const,
    account: "0xabc",
    marketId,
    chain: "ARC" as const,
    action: "OPEN" as const,
    side: "LONG" as const,
    collateralUsdWad: 10n,
    sizeUsdWad: 20n,
    leverageWad: 2n,
    acceptablePriceWad: 100n,
    oracleSequence: 1n,
    oracleExpiry: "2026-01-01T00:01:00.000Z",
    estimatedFeesUsdWad: 1n,
    fundingIndex: 0n,
    borrowIndex: 0n,
    liquidationEstimateUsdWad: 5n,
    marketState: "LIVE",
    oiBeforeUsdWad: 0n,
    oiCapacityUsdWad: 100n,
    nonce: 1n,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiry: "2026-01-01T00:01:00.000Z",
  };
  it("hashes equivalent plans deterministically and rejects mutation", () => {
    expect(preTradePlanHash(plan)).toBe(preTradePlanHash({ ...plan }));
    expect(() => assertPreTradePlanImmutable(plan, { ...plan, sizeUsdWad: 21n })).toThrow(
      "PRETRADE_PLAN_MISMATCH",
    );
  });
});
