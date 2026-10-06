import { describe, expect, it } from "vitest";
import type { MarketObservation } from "@arcmemeperps/domain";
import {
  assessRisk,
  AUDITED_RISK_RULES,
  DEVELOPMENT_RISK_RULES,
  RISK_RULE_VERSION,
} from "./index.js";

const base: MarketObservation = {
  token: {
    chain: "BASE",
    tokenAddress: "0x0000000000000000000000000000000000000001",
    symbol: "CLEAN",
    name: "Clean Meme",
    decimals: 18,
    deployer: "0x0000000000000000000000000000000000000002",
    createdAt: "2026-01-01T00:00:00.000Z",
    originPlatform: "UNISWAP_STYLE",
  },
  lifecycle: {
    status: "ESTABLISHED",
    observedAt: "2026-09-29T00:00:00.000Z",
    confidence: 0.99,
    evidenceHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  authorities: {
    mintAuthorityActive: false,
    freezeAuthorityActive: false,
    dangerousOwnerAdminPrivileges: false,
    upgradeable: false,
    upgradeAuthority: null,
    transferRestricted: false,
    honeypotDetected: false,
  },
  liquidity: {
    totalLiquidityUsd: 2_000_000,
    depth1PctUsd: 250_000,
    depth2PctUsd: 500_000,
    venueCount: 3,
    lpOwnershipConcentrationPct: 12,
    lpLockStatus: "LOCKED",
    earliestLpUnlockAt: "2027-01-01T00:00:00.000Z",
    liquidityVenues: ["DEX_A", "DEX_B", "DEX_C"],
    suddenCollapsePct24h: 0,
  },
  holders: {
    topHolderPct: 3,
    topFivePct: 14,
    connectedClusterPct: 4,
    bundledLaunchPct: 2,
    individualWalletsUnderFivePct: true,
    holderCount: 50_000,
    organicHolderGrowthPct24h: 5,
  },
  deployer: {
    deployerAddress: "0x0000000000000000000000000000000000000002",
    deployerHoldingsPct: 2,
    knownRisk: false,
    priorRugCount: 0,
    relatedWalletFundingDetected: false,
    walletRotationDetected: false,
  },
  activity: {
    organicVolume24hUsd: 1_000_000,
    realizedVolatility30dPct: 50,
    washTradingDetected: false,
    volumeFarmingDetected: false,
    suspiciousEarlyBuyers: false,
    suspiciousTransactionRepetition: false,
    bundledLaunchDetected: false,
    fundingSourceDiversity: 0.9,
  },
  oracle: {
    sourceCount: 3,
    disagreementPct: 0.5,
    confidenceBps: 9_500,
    stale: false,
    priceUsd: 1.2,
    observedAt: "2026-09-29T00:00:00.000Z",
    manipulationCostUsd: 1_000_000,
  },
  derivatives: {
    spotLiquidityUsd: 2_000_000,
    liquidityVenueCount: 3,
    depth1PctUsd: 250_000,
    depth2PctUsd: 500_000,
    organicVolume24hUsd: 1_000_000,
    realizedVolatilityPct: 50,
    oracleSourceCount: 3,
    oracleDisagreementPct: 0.5,
    oracleConfidenceBps: 9_500,
    manipulationCostUsd: 1_000_000,
    maximumSafeOpenInterestUsd: 500_000,
    maximumPositionSizeUsd: 100_000,
    maximumLeverage: 5,
    fundingImbalancePct: 2,
    liquidationCapacityUsd: 500_000,
  },
};

describe("risk engine", () => {
  it("qualifies a clean liquid market without allowing scores to bypass gates", () => {
    const assessment = assessRisk(base, {
      assessedAt: "2026-09-29T00:00:00.000Z",
      rules: DEVELOPMENT_RISK_RULES,
    });
    expect(assessment.integrityStatus).toBe("QUALIFIED");
    expect(assessment.derivativesStatus).toBe("ELIGIBLE");
    expect(assessment.ruleVersion).toBe(RISK_RULE_VERSION);
  });

  it("rejects active mint authority even when market metrics are strong", () => {
    const assessment = assessRisk(
      { ...base, authorities: { ...base.authorities, mintAuthorityActive: true } },
      { assessedAt: "2026-09-29T00:00:00.000Z" },
    );
    expect(assessment.integrityStatus).toBe("REJECTED");
    expect(assessment.rejectionReasons.map(({ code }) => code)).toContain("MINT_AUTHORITY_ACTIVE");
  });

  it("keeps a structurally safe but shallow token out of derivatives eligibility", () => {
    const assessment = assessRisk(
      {
        ...base,
        liquidity: {
          ...base.liquidity,
          totalLiquidityUsd: 20_000,
          depth1PctUsd: 1_000,
          depth2PctUsd: 2_000,
        },
        derivatives: {
          ...base.derivatives,
          maximumSafeOpenInterestUsd: 2_000,
          liquidationCapacityUsd: 2_000,
        },
      },
      { assessedAt: "2026-09-29T00:00:00.000Z" },
    );
    expect(assessment.integrityStatus).toBe("QUALIFIED");
    expect(assessment.derivativesStatus).toBe("WATCH");
    expect(assessment.rejectionReasons).toHaveLength(0);
  });

  it("blocks stale oracle data", () => {
    const assessment = assessRisk(
      { ...base, oracle: { ...base.oracle, stale: true } },
      { assessedAt: "2026-09-29T00:00:00.000Z" },
    );
    expect(assessment.derivativesStatus).toBe("BLOCKED");
    expect(assessment.rejectionReasons.map(({ code }) => code)).toContain("STALE_ORACLE");
  });

  it("fails closed when unavailable measurements are represented as null", () => {
    const assessment = assessRisk(
      {
        ...base,
        liquidity: {
          ...base.liquidity,
          totalLiquidityUsd: null,
          venueCount: null,
          lpOwnershipConcentrationPct: null,
          suddenCollapsePct24h: null,
        },
        holders: {
          ...base.holders,
          topHolderPct: null,
          topFivePct: null,
          connectedClusterPct: null,
          bundledLaunchPct: null,
          holderCount: null,
          organicHolderGrowthPct24h: null,
        },
        deployer: { ...base.deployer, deployerHoldingsPct: null, priorRugCount: null },
        activity: {
          ...base.activity,
          organicVolume24hUsd: null,
          realizedVolatility30dPct: null,
          fundingSourceDiversity: null,
        },
        oracle: {
          ...base.oracle,
          sourceCount: null,
          disagreementPct: null,
          confidenceBps: null,
          stale: null,
          priceUsd: null,
          manipulationCostUsd: null,
        },
        derivatives: {
          ...base.derivatives,
          spotLiquidityUsd: null,
          liquidityVenueCount: null,
          organicVolume24hUsd: null,
          realizedVolatilityPct: null,
          oracleSourceCount: null,
          oracleDisagreementPct: null,
          oracleConfidenceBps: null,
          manipulationCostUsd: null,
          maximumSafeOpenInterestUsd: null,
          maximumPositionSizeUsd: null,
          maximumLeverage: null,
          fundingImbalancePct: null,
          liquidationCapacityUsd: null,
        },
      },
      { assessedAt: "2026-09-29T00:00:00.000Z" },
    );
    expect(assessment.integrityStatus).toBe("REJECTED");
    expect(assessment.hardGates.find((item) => item.code === "INSUFFICIENT_EVIDENCE")?.passed).toBe(
      false,
    );
    expect(assessment.rejectionReasons.map(({ code }) => code)).toContain(
      "ORACLE_FRESHNESS_UNAVAILABLE",
    );
    expect(assessment.warnings.map(({ code }) => code)).toContain("INSUFFICIENT_ORACLE_SOURCES");
    expect(assessment.recommendedMaxOI).toBeNull();
  });

  it("keeps missing evidence pending rather than calling it proven unsafe", () => {
    const assessment = assessRisk(
      {
        ...base,
        holders: { ...base.holders, connectedClusterPct: null },
        deployer: { ...base.deployer, knownRisk: null },
      },
      { assessedAt: "2026-09-29T00:00:00.000Z", rules: AUDITED_RISK_RULES },
    );
    expect(assessment.integrityStatus).toBe("PENDING");
    expect(assessment.derivativesStatus).toBe("UNASSESSED");
    expect(assessment.hardGates.find((item) => item.code === "CONNECTED_CLUSTER_CONCENTRATION")?.state).toBe("UNKNOWN");
    expect(assessment.hardGates.find((item) => item.code === "KNOWN_RISK_DEPLOYER")?.state).toBe("UNKNOWN");
    expect(assessment.rejectionReasons.map(({ code }) => code)).not.toContain("CONNECTED_CLUSTER_CONCENTRATION");
  });

  it("keeps an explicit unsafe fact rejected even when other evidence is missing", () => {
    const assessment = assessRisk(
      { ...base, authorities: { ...base.authorities, mintAuthorityActive: true }, holders: { ...base.holders, connectedClusterPct: null } },
      { assessedAt: "2026-09-29T00:00:00.000Z", rules: AUDITED_RISK_RULES },
    );
    expect(assessment.integrityStatus).toBe("REJECTED");
    expect(assessment.rejectionReasons.map(({ code }) => code)).toContain("MINT_AUTHORITY_ACTIVE");
    expect(assessment.hardGates.find((item) => item.code === "CONNECTED_CLUSTER_CONCENTRATION")?.state).toBe("UNKNOWN");
  });

  it("does not turn missing derivative capacity into measured zero or eligibility", () => {
    const assessment = assessRisk(
      {
        ...base,
        derivatives: { ...base.derivatives, maximumSafeOpenInterestUsd: null, liquidationCapacityUsd: null },
        oracle: { ...base.oracle, manipulationCostUsd: null },
      },
      { assessedAt: "2026-09-29T00:00:00.000Z", rules: AUDITED_RISK_RULES },
    );
    expect(assessment.derivativesStatus).toBe("UNASSESSED");
    expect(assessment.recommendedMaxOI).toBeNull();
    expect(assessment.unknownReasons.map(({ code }) => code)).toContain("SAFE_OPEN_INTEREST_UNAVAILABLE");
  });

  it("treats privileged LP withdrawal as an explicit hard failure", () => {
    const assessment = assessRisk(
      { ...base, liquidity: { ...base.liquidity, lpLockStatus: "WITHDRAWABLE_BY_PRIVILEGED_ACTOR" } },
      { assessedAt: "2026-09-29T00:00:00.000Z", rules: AUDITED_RISK_RULES },
    );
    expect(assessment.integrityStatus).toBe("REJECTED");
    expect(assessment.rejectionReasons.map(({ code }) => code)).toContain("LIQUIDITY_WITHDRAWABLE");
  });
});
