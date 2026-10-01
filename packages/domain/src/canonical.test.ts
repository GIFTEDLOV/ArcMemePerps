import { describe, expect, it } from "vitest";
import { marketIdForToken } from "@arcmemeperps/shared";
import { canonicalMarketSnapshot, parseMarketSnapshot, type MarketSnapshot } from "./canonical.js";

const timestamp = "2026-10-01T00:00:00.000Z";
const hash = `0x${"11".repeat(32)}`;
const marketId = marketIdForToken("BASE", "0x0000000000000000000000000000000000000001");

function snapshot(): MarketSnapshot {
  return {
    schemaVersion: "market-snapshot/v1",
    observedAt: timestamp,
    originChain: "BASE",
    originPlatform: "DIRECT_DEX",
    identity: {
      marketId,
      chain: "BASE",
      tokenAddress: "0x0000000000000000000000000000000000000001",
      symbol: "TEST",
      name: "Test",
      decimals: 18,
      deployer: null,
      createdAt: timestamp,
      originPlatform: "DIRECT_DEX",
    },
    lifecycle: {
      status: "DEX_LIVE",
      evidenceIds: ["rpc:code"],
      observedAt: timestamp,
      confidenceBps: 9000,
    },
    marketData: {
      priceUsdWad: "1000000000000000000",
      volume24hUsdWad: "1000000",
      buyCount24h: 10,
      sellCount24h: 9,
      priceChange24hBps: "125",
      volatilityBps: "800",
    },
    liquidity: {
      totalUsdWad: "200000000000000000000000",
      dominantPool: "0x0000000000000000000000000000000000000002",
      poolConcentrationBps: 5000,
      venueCount: 2,
      buyDepth1PctUsdWad: "1000000000000000000000",
      sellDepth1PctUsdWad: "900000000000000000000",
      buyDepth2PctUsdWad: null,
      sellDepth2PctUsdWad: null,
      securityStatus: "UNKNOWN",
      earliestUnlockAt: null,
    },
    holderEvidence: {
      largestHolderBps: 300,
      largestNonSystemHolderBps: 300,
      top10NonSystemBps: 1800,
      largestConnectedClusterBps: 400,
      clusterCount: 1,
      systemExclusions: [],
    },
    deployerEvidence: {
      deployer: null,
      tokensCreated: null,
      survival7dBps: null,
      survival30dBps: null,
      associatedWallets: [],
      reasonCodes: [],
    },
    securityEvidence: {
      mintAuthorityActive: false,
      freezeAuthorityActive: false,
      ownerPrivilege: null,
      upgradeable: null,
      transferRestricted: null,
      honeypot: null,
      lpSecurity: "UNKNOWN",
      evidenceIds: ["rpc:code"],
    },
    oracleEvidence: {
      priceSourceCount: 2,
      independentSourceCount: 1,
      dispersionBps: 25,
      confidenceBps: 9000,
      freshness: "FRESH",
      sourceFamilies: ["DIRECT_UNISWAP_POOL"],
    },
    derivativesEvidence: {
      status: "WATCH",
      maxLeverageWad: "1000000000000000000",
      maxOIWad: "1000000000000000000000",
      maxPositionWad: "100000000000000000000",
      maintenanceMarginBps: 3000,
      manipulationResistance: "LOW",
      reasonCodes: ["INSUFFICIENT_INDEPENDENT_SOURCES"],
    },
    providerState: {
      providers: [
        {
          provider: "rpc",
          status: "AVAILABLE",
          lastSuccessAt: timestamp,
          fetchedAt: timestamp,
          reason: null,
        },
      ],
      disagreements: [],
    },
    freshness: { status: "FRESH", observedAt: timestamp, fetchedAt: timestamp, maxAgeSeconds: 300 },
    riskResult: {
      integrityStatus: "QUALIFIED",
      derivativesStatus: "WATCH",
      hardGateCodes: [],
      rejectionReasons: [],
      warnings: ["INSUFFICIENT_INDEPENDENT_SOURCES"],
      ruleVersion: "0.1.0",
    },
    qualification: {
      eligible: false,
      proofHash: null,
      commitmentHash: null,
      evidenceRoot: hash,
      assessedAt: timestamp,
      expiresAt: null,
    },
    tradability: { status: "WATCH", reasons: ["not qualified"], asOf: timestamp },
  };
}

describe("canonical market schemas", () => {
  it("accepts a complete snapshot and preserves fixed-point strings", () => {
    const parsed = parseMarketSnapshot(snapshot());
    expect(parsed.marketData.priceUsdWad).toBe("1000000000000000000");
  });

  it("rejects missing or unknown fields at the process boundary", () => {
    const invalid = { ...snapshot(), marketData: { ...snapshot().marketData, priceUsdWad: 1 } };
    expect(() => parseMarketSnapshot(invalid)).toThrow();
    expect(() => parseMarketSnapshot({ ...snapshot(), unexpected: true })).toThrow();
  });

  it("rejects a market identity that does not hash to its chain and token", () => {
    expect(() =>
      parseMarketSnapshot({
        ...snapshot(),
        identity: {
          ...snapshot().identity,
          tokenAddress: "0x0000000000000000000000000000000000000002",
        },
      }),
    ).toThrow();
  });

  it("canonicalizes equivalent object key order deterministically", () => {
    const original = snapshot();
    const reordered = { ...original, marketData: { ...original.marketData } };
    expect(canonicalMarketSnapshot(original)).toBe(canonicalMarketSnapshot(reordered));
  });
});
