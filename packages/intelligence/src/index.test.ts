import { describe, expect, it } from "vitest";
import {
  analyzeFirstBuyers,
  analyzeHolderGraph,
  assessLiquiditySecurity,
  analyzeWashFarmV2,
  buildFundingGraphEvidence,
  rankTrending,
  scoreCompetition,
} from "./index.js";

describe("backend intelligence primitives", () => {
  it("keeps unknown holder wallets in concentration and requires evidence for exclusions", () => {
    const result = analyzeHolderGraph([
      { address: "A", shareBps: 210, classification: "UNKNOWN", clusterId: "x", evidenceIds: [] },
      { address: "B", shareBps: 170, classification: "UNKNOWN", clusterId: "x", evidenceIds: [] },
      {
        address: "LP",
        shareBps: 5000,
        classification: "LP",
        clusterId: null,
        evidenceIds: ["lp:1"],
      },
    ]);
    expect(result.largestConnectedClusterBps).toBe(380);
    expect(result.exclusions).toHaveLength(1);
  });

  it("does not call unproven LP security locked", () => {
    expect(
      assessLiquiditySecurity([
        {
          venue: "dex",
          model: "V2_LP_TOKEN",
          status: "UNKNOWN",
          controller: null,
          unlockAt: null,
          evidenceIds: [],
          reasonCodes: [],
        },
      ]).status,
    ).toBe("UNKNOWN");
  });

  it("bounds funding graph traversal and identifies first buyer signals", () => {
    const graph = buildFundingGraphEvidence(
      ["deployer"],
      [
        {
          from: "deployer",
          to: "buyer",
          amountUsdc: 1n,
          observedAt: "2026-10-01T00:00:00.000Z",
          evidenceIds: ["e"],
        },
      ],
      1,
    );
    expect(graph.visitedWallets).toEqual(["buyer", "deployer"]);
    const buyers = analyzeFirstBuyers("2026-10-01T00:00:00.000Z", [
      {
        wallet: "buyer",
        timestamp: "2026-10-01T00:00:01.000Z",
        amountBps: 100,
        slotOrBlock: "1",
        fundingSource: null,
        walletAgeDays: null,
        exitObserved: null,
        evidenceIds: ["tx"],
      },
    ]);
    expect(buyers.signals[0]?.classifications).toContain("SNIPER_SIGNAL");
  });

  it("returns explainable wash verdicts and separate trending from safety", () => {
    const trades = ["A", "A", "B", "B"].map((wallet, index) => ({
      wallet,
      side: index % 2 === 0 ? ("BUY" as const) : ("SELL" as const),
      amountUsdWad: 100n,
      timestamp: `2026-10-01T00:00:0${index}.000Z`,
      fundingSource: null,
      evidenceIds: [`t${index}`],
    }));
    expect(analyzeWashFarmV2(trades, 1000n, 0).reasons.length).toBeGreaterThan(0);
    expect(
      rankTrending([
        {
          marketId: "m",
          volumeAccelerationBps: 1000,
          liquidityGrowthBps: 500,
          holderGrowthBps: 500,
          traderGrowthBps: 500,
          walletQualityBps: 500,
          graduation: false,
          ageHours: 2,
          riskDegradationBps: 0,
        },
      ])[0]?.safetyIndependent,
    ).toBe(true);
  });

  it("penalizes competition drawdown/liquidations and flags self-offsets", () => {
    const result = scoreCompetition(
      {
        account: "0x1",
        realizedPnlUsdWad: 100n,
        startingEquityUsdWad: 1000n,
        maxDrawdownBps: 1000,
        liquidations: 1,
        tradeCount: 3,
        selfOffsetSignals: 1,
        snapshotEventIds: ["e"],
      },
      {
        scoring: "RISK_ADJUSTED_RETURN",
        maxDrawdownPenaltyBps: 5000,
        liquidationPenaltyBps: 1000,
        minimumTrades: 1,
      },
    );
    expect(result.status).toBe("UNDER_REVIEW");
    expect(result.scoreWad).toBeLessThan(100_000_000_000_000_000n);
  });
});
