import { describe, expect, it } from "vitest";
import {
  analyzeLaunchBundles,
  analyzeOrganicActivity,
  buildWalletIntelligence,
  NeedsAttentionEngine,
  NotificationEngine,
  profileAuthorizationMessage,
  reconcileSourceIndependence,
  scoreRiskAdjustedCompetition,
  updateWatchlist,
} from "./product.js";

describe("complete product intelligence boundaries", () => {
  it("derives wallet analytics only from verified event inputs", () => {
    const result = buildWalletIntelligence(
      "0xwallet",
      [
        {
          eventId: "e1",
          wallet: "0xwallet",
          marketId: `0x${"11".repeat(32)}`,
          side: "LONG",
          action: "CLOSE",
          sizeUsdWad: 100n,
          realizedPnlUsdWad: 20n,
          feeUsdWad: 1n,
          fundingPaidUsdWad: 2n,
          fundingReceivedUsdWad: 0n,
          leverageWad: 2n,
          openedAt: "2026-01-01T00:00:00.000Z",
          closedAt: "2026-01-01T01:00:00.000Z",
        },
      ],
      1_000n,
    );
    expect(result.realizedPnlUsdWad).toBe(20n);
    expect(result.winRateBps).toBe(10_000);
    expect(result.averageHoldSeconds).toBe(3_600);
  });

  it("keeps watchlists deterministic and generates deduplicated notifications", () => {
    const watch = updateWatchlist(
      { wallet: "0xA", marketIds: [], wallets: [], updatedAt: "2026-01-01T00:00:00.000Z" },
      {
        addMarkets: [`0x${"11".repeat(32)}`],
        addWallets: ["0xB"],
        updatedAt: "2026-01-01T00:01:00.000Z",
      },
    );
    expect(watch.marketIds).toHaveLength(1);
    const engine = new NotificationEngine();
    const input = {
      recipient: "0xA",
      type: "MARKET_PAUSED" as const,
      marketId: null,
      eventId: "event-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      payload: {},
    };
    expect(engine.create(input)).not.toBeNull();
    expect(engine.create(input)).toBeNull();
  });

  it("provides actionable attention state and transparent competition scoring", () => {
    const attention = new NeedsAttentionEngine();
    attention.upsert({
      id: "a1",
      wallet: "0xA",
      severity: "WARNING",
      type: "LOW_MARGIN",
      title: "Margin low",
      reason: "maintenance threshold",
      marketId: null,
      orderId: null,
      positionId: "1",
      createdAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: null,
      availableActions: ["CLOSE"],
    });
    expect(attention.list("0xa")).toHaveLength(1);
    const score = scoreRiskAdjustedCompetition(
      {
        account: "0xA",
        startingEquityUsdWad: 1_000n,
        endingEquityUsdWad: 1_100n,
        realizedPnlUsdWad: 100n,
        maxDrawdownBps: 500,
        liquidationCount: 0,
        tradeCount: 5,
        dailyReturnBps: [100, 100],
        linkedWalletSignals: 0,
        eventIds: ["e1"],
      },
      2,
    );
    expect(score.status).toBe("VALID");
    expect(
      profileAuthorizationMessage({
        wallet: "0xA",
        nonce: "1",
        action: "PROFILE_UPDATE",
        payloadHash: `0x${"11".repeat(32)}`,
        issuedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-01T01:00:00.000Z",
      }),
    ).toContain("ArcMemePerps");
  });

  it("keeps organic, bundle, and source-independence signals explainable", () => {
    const organic = analyzeOrganicActivity({
      holderCountNow: 120,
      holderCountBefore: 100,
      newHolders: 20,
      independentTraders: 10,
      retainedTraders: 5,
      grossBuyUsdWad: 1_000n,
      grossSellUsdWad: 400n,
      activeIntervals: 8,
      observedIntervals: 10,
      venues: 2,
    });
    expect(organic.status).toBe("AVAILABLE");
    const bundle = analyzeLaunchBundles([
      {
        wallet: "0xA",
        blockOrSlot: "1",
        transactionId: "a",
        supplyBps: 210,
        creatorLinked: null,
        fundingSource: "0xF",
        evidenceIds: ["e1"],
      },
      {
        wallet: "0xB",
        blockOrSlot: "1",
        transactionId: "b",
        supplyBps: 170,
        creatorLinked: null,
        fundingSource: "0xF",
        evidenceIds: ["e2"],
      },
    ]);
    expect(bundle.effectiveConcentrationBps).toBe(380);
    const independence = reconcileSourceIndependence([
      { sourceId: "direct", sourceFamily: "UNISWAP", underlyingVenueId: "pool-1", marketId: "m" },
      {
        sourceId: "aggregator",
        sourceFamily: "DEXSCREENER",
        underlyingVenueId: "pool-1",
        marketId: "m",
      },
      { sourceId: "other", sourceFamily: "CHAINLINK", underlyingVenueId: "feed-1", marketId: "m" },
    ]);
    expect(independence.count).toBe(2);
    expect(independence.correlatedSourceIds).toEqual(["aggregator"]);
  });
});
