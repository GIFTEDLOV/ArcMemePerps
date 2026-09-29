import { describe, expect, it } from "vitest";
import type { EvidenceBundle, EvidenceRecord } from "@arcmemeperps/domain";
import type { Hex } from "@arcmemeperps/shared";
import {
  canonicalQualificationProof,
  evidenceRootForBundle,
  qualificationCommitmentFromProof,
  qualificationCommitmentHash,
  type QualificationProof,
  qualificationProofHash,
} from "./index.js";

const position = {
  chain: "BASE" as const,
  blockNumber: "100",
  blockHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex,
  slot: null,
};

const evidence = (id: string, value: unknown): EvidenceRecord => ({
  evidenceId: id,
  kind: id,
  source: {
    provider: "fixture-provider",
    chain: "BASE",
    network: "base-mainnet",
    endpointClass: "FIXTURE",
    dataVersion: "fixture-1",
    schemaVersion: "1",
  },
  position: {
    blockNumber: position.blockNumber,
    blockHash: position.blockHash,
    slot: null,
    transaction: null,
    signature: null,
  },
  observedAt: "2026-09-29T00:00:00.000Z",
  sourceTimestamp: "2026-09-29T00:00:00.000Z",
  fetchedAt: "2026-09-29T00:00:01.000Z",
  freshness: "FRESH",
  confidence: 1,
  status: "AVAILABLE",
  value,
  rawHash: null,
  unavailableReason: null,
});

const bundle: EvidenceBundle = {
  schemaVersion: "1",
  records: [
    evidence("authority", { mintAuthorityActive: false }),
    evidence("liquidity", { usd: 100 }),
  ],
};

const proof: QualificationProof = {
  proofVersion: "2",
  schemaVersion: "2",
  evidenceSchemaVersion: "1",
  chain: "BASE",
  marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  tokenAddress: "0x0000000000000000000000000000000000000001",
  lifecycle: "ESTABLISHED",
  evidenceRoot: evidenceRootForBundle(bundle),
  evidence: bundle.records,
  evidenceHashes: {
    authority: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    liquidity: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
  assessmentPosition: position,
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
  riskRuleVersion: "0.1.0",
  ruleVersion: "0.1.0",
  assessedAt: "2026-09-29T00:00:00.000Z",
  expiresAt: "2026-09-30T00:00:00.000Z",
};

describe("qualification proof v2", () => {
  it("sorts evidence records and keeps canonical JSON deterministic", () => {
    const reordered = {
      ...proof,
      evidence: [...proof.evidence].reverse(),
    };
    expect(canonicalQualificationProof(proof)).toBe(canonicalQualificationProof(reordered));
    const reorderedRoot = evidenceRootForBundle({
      ...bundle,
      records: [...bundle.records].reverse(),
    });
    expect(reorderedRoot.root).toBe(proof.evidenceRoot.root);
  });

  it("creates a typed commitment and changes it for material risk changes", () => {
    const commitment = qualificationCommitmentFromProof(proof);
    const changed = qualificationCommitmentFromProof({
      ...proof,
      riskParameters: { ...proof.riskParameters, recommendedMaxOI: 90_000 },
    });
    expect(qualificationCommitmentHash(commitment)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(qualificationCommitmentHash(commitment)).not.toBe(qualificationCommitmentHash(changed));
    expect(qualificationProofHash(proof)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
