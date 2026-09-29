import { describe, expect, it } from "vitest";
import type { QualificationProof } from "./index.js";
import { canonicalQualificationProof, qualificationProofHash } from "./index.js";

const proof: QualificationProof = {
  schemaVersion: "1",
  chain: "BASE",
  tokenAddress: "0x0000000000000000000000000000000000000001",
  lifecycle: "ESTABLISHED",
  evidenceHashes: {
    oracle: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    holders: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
  liquidityMetrics: {
    totalLiquidityUsd: 1_000_000,
    depth1PctUsd: 100_000,
    depth2PctUsd: 200_000,
    venueCount: 2,
    lpOwnershipConcentrationPct: 10,
    lpLockStatus: "LOCKED",
    earliestLpUnlockAt: "2027-01-01T00:00:00.000Z",
    liquidityVenues: ["A", "B"],
    suddenCollapsePct24h: 0,
  },
  authorityState: {
    mintAuthorityActive: false,
    freezeAuthorityActive: false,
    dangerousOwnerAdminPrivileges: false,
    upgradeable: false,
    upgradeAuthority: null,
    transferRestricted: false,
    honeypotDetected: false,
  },
  holderConcentration: {
    topHolderPct: 2,
    topFivePct: 10,
    connectedClusterPct: 5,
    bundledLaunchPct: 2,
    individualWalletsUnderFivePct: true,
    holderCount: 10_000,
    organicHolderGrowthPct24h: 3,
  },
  connectedClusterConcentration: 5,
  bundleConcentration: 2,
  deployerRisk: {
    deployerAddress: "0x0000000000000000000000000000000000000002",
    deployerHoldingsPct: 2,
    knownRisk: false,
    priorRugCount: 0,
    relatedWalletFundingDetected: false,
    walletRotationDetected: false,
  },
  activityQualityMetrics: {
    organicVolume24hUsd: 500_000,
    realizedVolatility30dPct: 60,
    washTradingDetected: false,
    volumeFarmingDetected: false,
    suspiciousEarlyBuyers: false,
    suspiciousTransactionRepetition: false,
    bundledLaunchDetected: false,
    fundingSourceDiversity: 0.8,
  },
  oracleMetrics: {
    sourceCount: 3,
    disagreementPct: 0.4,
    confidenceBps: 9_500,
    stale: false,
    priceUsd: 1,
    observedAt: "2026-09-29T00:00:00.000Z",
    manipulationCostUsd: 500_000,
  },
  manipulationCostEstimate: 500_000,
  finalStatuses: { integrity: "QUALIFIED", derivatives: "ELIGIBLE" },
  riskParameters: {
    recommendedMaxLeverage: 2,
    recommendedMaxOI: 100_000,
    recommendedMaxPosition: 25_000,
  },
  ruleVersion: "0.1.0",
  assessedAt: "2026-09-29T00:00:00.000Z",
};

describe("qualification proof", () => {
  it("sorts object keys and gives the same logical record the same keccak hash", () => {
    const reordered = {
      ...proof,
      evidenceHashes: {
        holders: proof.evidenceHashes.holders!,
        oracle: proof.evidenceHashes.oracle!,
      },
    };
    expect(canonicalQualificationProof(proof)).toBe(canonicalQualificationProof(reordered));
    expect(qualificationProofHash(proof)).toBe(qualificationProofHash(reordered));
    expect(qualificationProofHash(proof)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
