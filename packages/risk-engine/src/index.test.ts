import { describe, expect, it } from "vitest";
import { HARD_GATE_CODES } from "@arcmemeperps/domain";
import type { MarketObservation } from "@arcmemeperps/domain";
import {
  assessRisk,
  AUDITED_RISK_RULES,
  DEVELOPMENT_RISK_RULES,
  RISK_RULE_VERSION,
} from "./index.js";
import {
  gateDisposition,
  policyProfileForObservation,
  RISK_POLICY_PROFILES,
} from "./policies.js";

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

  it("partitions every hard gate for every versioned policy profile", () => {
    for (const profile of Object.values(RISK_POLICY_PROFILES)) {
      for (const code of HARD_GATE_CODES) {
        expect(gateDisposition(profile, code)).toMatch(/^(MANDATORY|OPTIONAL|NOT_APPLICABLE)$/);
      }
      const declared = [
        ...profile.mandatoryHardGates,
        ...profile.optionalHardGates,
        ...profile.notApplicableGates,
      ];
      expect(new Set(declared).size).toBe(HARD_GATE_CODES.length);
      expect(declared.sort()).toEqual([...HARD_GATE_CODES].sort());
    }
  });

  it("does not pend an EVM market on the non-existent Solana freeze-authority field", () => {
    const assessment = assessRisk(
      { ...base, authorities: { ...base.authorities, freezeAuthorityActive: null } },
      { assessedAt: "2026-09-29T00:00:00.000Z", rules: AUDITED_RISK_RULES },
    );
    expect(assessment.hardGates.find((item) => item.code === "FREEZE_AUTHORITY_ACTIVE")?.state).toBe("NOT_APPLICABLE");
    expect(assessment.integrityStatus).toBe("QUALIFIED");
    expect(assessment.unknownReasons.map(({ code }) => code)).not.toContain("FREEZE_AUTHORITY_ACTIVE");
  });

  it("keeps an applicable EVM mintability check unknown when it was not inspected", () => {
    const assessment = assessRisk(
      { ...base, authorities: { ...base.authorities, mintAuthorityActive: null } },
      { assessedAt: "2026-09-29T00:00:00.000Z", rules: AUDITED_RISK_RULES },
    );
    expect(assessment.hardGates.find((item) => item.code === "MINT_AUTHORITY_ACTIVE")?.state).toBe("UNKNOWN");
    expect(assessment.integrityStatus).toBe("PENDING");
  });

  it("does not treat token-account concentration as proven owner concentration", () => {
    const assessment = assessRisk(
      {
        ...base,
        holders: {
          ...base.holders,
          topHolderPct: 25,
          topTokenAccountPct: 25,
          resolvedTopOwnerPct: null,
          evidenceScope: "TOP_TOKEN_ACCOUNTS",
        },
      },
      { assessedAt: "2026-09-29T00:00:00.000Z", rules: AUDITED_RISK_RULES },
    );
    expect(assessment.hardGates.find((item) => item.code === "INDIVIDUAL_HOLDER_CONCENTRATION")?.state).toBe("UNKNOWN");
    expect(assessment.integrityStatus).toBe("PENDING");
    expect(assessment.rejectionReasons.map(({ code }) => code)).not.toContain("INDIVIDUAL_HOLDER_CONCENTRATION");
  });

  it("uses Solana policy applicability for SPL and Token-2022 without inventing EVM admin gates", () => {
    const solana: MarketObservation = {
      ...base,
      token: { ...base.token, chain: "SOLANA", tokenProgram: "SPL_TOKEN", originPlatform: "RAYDIUM_STYLE" },
      authorities: {
        ...base.authorities,
        dangerousOwnerAdminPrivileges: null,
        upgradeable: null,
        upgradeAuthority: null,
        mintAuthorityActive: false,
        freezeAuthorityActive: false,
      },
    };
    const spl = assessRisk(solana, { assessedAt: "2026-09-29T00:00:00.000Z", rules: AUDITED_RISK_RULES });
    expect(policyProfileForObservation(solana).id).toBe("SOLANA_SPL");
    expect(spl.hardGates.find((item) => item.code === "DANGEROUS_OWNER_ADMIN_PRIVILEGE")?.state).toBe("NOT_APPLICABLE");
    expect(spl.hardGates.find((item) => item.code === "UPGRADEABILITY_RISK")?.state).toBe("NOT_APPLICABLE");
    expect(spl.integrityStatus).toBe("QUALIFIED");

    const token2022 = { ...solana, token: { ...solana.token, tokenProgram: "TOKEN_2022" as const } };
    expect(policyProfileForObservation(token2022).id).toBe("SOLANA_TOKEN_2022");
  });

  it("keeps optional mature-market launch history as a warning rather than pending", () => {
    const assessment = assessRisk(
      { ...base, activity: { ...base.activity, suspiciousEarlyBuyers: null } },
      { assessedAt: "2026-09-29T00:00:00.000Z", rules: AUDITED_RISK_RULES },
    );
    expect(assessment.integrityStatus).toBe("WATCH");
    expect(assessment.unknownReasons.map(({ code }) => code)).not.toContain("SUSPICIOUS_EARLY_BUYERS");
    expect(assessment.warnings.map(({ code }) => code)).toContain("OPTIONAL_EVIDENCE_UNKNOWN");
  });
});
