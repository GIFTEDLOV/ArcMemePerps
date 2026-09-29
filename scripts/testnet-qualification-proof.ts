import { mkdir, writeFile } from "node:fs/promises";
import type {
  AssessmentPosition,
  EvidenceBundle,
  EvidenceRecord,
} from "@arcmemeperps/domain";
import {
  evidenceLeafHash,
  evidenceRootForBundle,
  qualificationCommitmentFromProof,
  qualificationCommitmentHash,
  qualificationProofHash,
  type QualificationProof,
} from "@arcmemeperps/qualification-proof";
import { marketIdForToken } from "@arcmemeperps/shared";

const tokenAddress = "0x0000000000000000000000000000000000000001";
const assessedAt = "2026-09-30T00:00:00.000Z";
const position: AssessmentPosition = {
  chain: "BASE",
  blockNumber: null,
  blockHash: null,
  slot: null,
};

function evidence(evidenceId: string, value: unknown): EvidenceRecord {
  return {
    evidenceId,
    kind: evidenceId,
    source: {
      provider: "testnet-canary-fixture",
      chain: "BASE",
      network: "arc-testnet-canary",
      endpointClass: "FIXTURE",
      dataVersion: "gate4-canary-v1",
      schemaVersion: "1",
    },
    position: {
      blockNumber: null,
      blockHash: null,
      slot: null,
      transaction: null,
      signature: null,
    },
    observedAt: assessedAt,
    sourceTimestamp: assessedAt,
    fetchedAt: assessedAt,
    freshness: "FRESH",
    confidence: 1,
    status: "AVAILABLE",
    value,
    rawHash: null,
    unavailableReason: null,
  };
}

const evidenceBundle: EvidenceBundle = {
  schemaVersion: "1",
  records: [
    evidence("canary-authority", {
      mintAuthorityActive: false,
      freezeAuthorityActive: false,
      dangerousOwnerAdminPrivileges: false,
      upgradeable: false,
    }),
    evidence("canary-liquidity", {
      totalLiquidityUsd: 1_000_000,
      depth1PctUsd: 100_000,
      depth2PctUsd: 200_000,
      venueCount: 2,
      lpLockStatus: "LOCKED",
    }),
    evidence("canary-oracle", {
      sourceCount: 3,
      independentSourceCount: 3,
      confidenceBps: 9_500,
      disagreementPct: 0.4,
    }),
  ],
};

const marketId = marketIdForToken("BASE", tokenAddress);
const proof: QualificationProof = {
  proofVersion: "2",
  schemaVersion: "2",
  evidenceSchemaVersion: evidenceBundle.schemaVersion,
  chain: "BASE",
  marketId,
  tokenAddress,
  lifecycle: "ESTABLISHED",
  evidenceRoot: evidenceRootForBundle(evidenceBundle),
  evidence: evidenceBundle.records,
  evidenceHashes: Object.fromEntries(
    evidenceBundle.records.map((record) => [record.kind, evidenceLeafHash(record)]),
  ),
  assessmentPosition: position,
  liquidityMetrics: {
    totalLiquidityUsd: 1_000_000,
    depth1PctUsd: 100_000,
    depth2PctUsd: 200_000,
    venueCount: 2,
    lpOwnershipConcentrationPct: 10,
    lpLockStatus: "LOCKED",
    earliestLpUnlockAt: "2027-01-01T00:00:00.000Z",
    liquidityVenues: ["TESTNET_CANARY_POOL_A", "TESTNET_CANARY_POOL_B"],
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
    deployerAddress: tokenAddress,
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
    observedAt: assessedAt,
    manipulationCostUsd: 500_000,
  },
  manipulationCostEstimate: 500_000,
  finalStatuses: { integrity: "QUALIFIED", derivatives: "ELIGIBLE" },
  riskParameters: {
    recommendedMaxLeverage: 2,
    recommendedMaxOI: 1,
    recommendedMaxPosition: 0.2,
  },
  riskRuleVersion: "0.1.0",
  ruleVersion: "0.1.0",
  assessedAt,
  expiresAt: null,
};

const output = {
  testnetCanary: true,
  productionQualification: false,
  marketId,
  proofHash: qualificationProofHash(proof),
  commitmentHash: qualificationCommitmentHash(qualificationCommitmentFromProof(proof)),
  proof,
};

await mkdir("evidence/gate4", { recursive: true });
await writeFile(
  "evidence/gate4/qualification-proof.json",
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify({
  marketId: output.marketId,
  proofHash: output.proofHash,
  commitmentHash: output.commitmentHash,
}, null, 2));
