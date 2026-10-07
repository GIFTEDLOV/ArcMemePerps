import { describe, expect, it } from "vitest";
import { FIXTURE_BY_ID } from "../../../fixtures/corpus.js";
import type { MarketObservation } from "@arcmemeperps/domain";
import { assessRisk, CORE_SAFETY_RISK_RULES } from "./index.js";

const assessedAt = "2026-09-29T00:00:00.000Z";
const clean = FIXTURE_BY_ID.get("clean-mature")!.market.observation;

function assess(
  overrides: Partial<{
    authorities: Partial<MarketObservation["authorities"]>;
    liquidity: Partial<MarketObservation["liquidity"]>;
    holders: Partial<MarketObservation["holders"]>;
    deployer: Partial<MarketObservation["deployer"]>;
    activity: Partial<MarketObservation["activity"]>;
    oracle: Partial<MarketObservation["oracle"]>;
  }> = {},
) {
  const observation: MarketObservation = {
    ...clean,
    authorities: { ...clean.authorities, ...overrides.authorities },
    liquidity: { ...clean.liquidity, ...overrides.liquidity },
    holders: { ...clean.holders, ...overrides.holders },
    deployer: { ...clean.deployer, ...overrides.deployer },
    activity: { ...clean.activity, ...overrides.activity },
    oracle: { ...clean.oracle, ...overrides.oracle },
  };
  return assessRisk(observation, { assessedAt, rules: CORE_SAFETY_RISK_RULES });
}

describe("risk policy 0.3.0 core safety architecture", () => {
  it("admits a fully evidenced safe control observation without weakening thresholds", () => {
    const result = assess();
    expect(result.coreIntegrityStatus).toBe("QUALIFIED");
    expect(result.derivativesStatus).toBe("ELIGIBLE");
    expect(result.surveillanceStatus).toBe("CLEAR");
    expect(result.evidenceCoverage.overall).toBe("COMPLETE");
  });

  it("does not make unknown creator, funding, or surveillance history a core safety pass", () => {
    const result = assess({
      deployer: {
        deployerAddress: null,
        deployerHoldingsPct: null,
        knownRisk: null,
        priorRugCount: null,
        relatedWalletFundingDetected: null,
      },
      holders: { bundledLaunchPct: null },
      activity: {
        suspiciousEarlyBuyers: null,
        washTradingDetected: null,
        volumeFarmingDetected: null,
        suspiciousTransactionRepetition: null,
      },
    });
    expect(result.ruleVersion).toBe("0.3.0");
    expect(result.coreIntegrityStatus).toBe("QUALIFIED");
    expect(result.integrityStatus).toBe("QUALIFIED");
    expect(result.surveillanceStatus).toBe("LIMITED");
    expect(result.evidenceCoverage.domains.creator.status).not.toBe("COMPLETE");
    expect(result.evidenceCoverage.domains.activity.status).not.toBe("COMPLETE");
    expect(result.derivativesStatus).toBe("UNASSESSED");
    expect(result.unknownReasons.map(({ code }) => code)).not.toContain("KNOWN_RISK_DEPLOYER");
  });

  it.each([
    ["active mint", { authorities: { mintAuthorityActive: true } }, "MINT_AUTHORITY_ACTIVE"],
    [
      "owner privilege",
      { authorities: { dangerousOwnerAdminPrivileges: true } },
      "DANGEROUS_OWNER_ADMIN_PRIVILEGE",
    ],
    ["upgradeability", { authorities: { upgradeable: true } }, "UPGRADEABILITY_RISK"],
    ["honeypot", { authorities: { honeypotDetected: true } }, "HONEYPOT_OR_TRANSFER_RESTRICTION"],
    [
      "transfer restriction",
      { authorities: { transferRestricted: true } },
      "HONEYPOT_OR_TRANSFER_RESTRICTION",
    ],
    [
      "withdrawable LP",
      { liquidity: { lpLockStatus: "WITHDRAWABLE_BY_PRIVILEGED_ACTOR" as const } },
      "LIQUIDITY_WITHDRAWABLE",
    ],
    [
      "early LP unlock",
      {
        liquidity: {
          lpLockStatus: "TIME_LOCKED" as const,
          earliestLpUnlockAt: "2026-09-30T00:00:00.000Z",
        },
      },
      "LP_UNLOCK_TOO_SOON",
    ],
    [
      "holder concentration",
      { holders: { topHolderPct: 5.01 } },
      "INDIVIDUAL_HOLDER_CONCENTRATION",
    ],
    [
      "cluster concentration",
      { holders: { connectedClusterPct: 5.01 } },
      "CONNECTED_CLUSTER_CONCENTRATION",
    ],
    [
      "bundle concentration",
      { holders: { bundledLaunchPct: 10.01 } },
      "BUNDLED_LAUNCH_CONCENTRATION",
    ],
    ["known dangerous creator", { deployer: { knownRisk: true } }, "KNOWN_RISK_DEPLOYER"],
  ] as const)("keeps explicit %s as a hard core rejection", (_name, overrides, code) => {
    const result = assess(overrides);
    expect(result.coreIntegrityStatus).toBe("REJECTED");
    expect(result.rejectionReasons.map(({ code: reasonCode }) => reasonCode)).toContain(code);
  });

  it("keeps an applicable unknown core gate pending", () => {
    const result = assess({ authorities: { dangerousOwnerAdminPrivileges: null } });
    expect(result.coreIntegrityStatus).toBe("PENDING");
    expect(
      result.hardGates.find((gate) => gate.code === "DANGEROUS_OWNER_ADMIN_PRIVILEGE")?.state,
    ).toBe("UNKNOWN");
    expect(result.unknownReasons.map(({ code }) => code)).toContain(
      "DANGEROUS_OWNER_ADMIN_PRIVILEGE",
    );
  });

  it("moves explicit wash activity into surveillance and derivatives blocking", () => {
    const result = assess({ activity: { washTradingDetected: true } });
    expect(result.coreIntegrityStatus).toBe("QUALIFIED");
    expect(result.surveillanceStatus).toBe("HIGH_RISK");
    expect(result.derivativesStatus).toBe("BLOCKED");
    expect(result.rejectionReasons.map(({ code }) => code)).toContain(
      "DERIVATIVES_SURVEILLANCE_BLOCKED",
    );
  });

  it("keeps a single economic oracle source ineligible", () => {
    const result = assess({ oracle: { sourceCount: 1 } });
    expect(result.coreIntegrityStatus).toBe("QUALIFIED");
    expect(result.derivativesStatus).toBe("BLOCKED");
    expect(result.rejectionReasons.map(({ code }) => code)).toContain(
      "CAPACITY_INSUFFICIENT_ORACLE_SOURCES",
    );
  });

  it("keeps insufficient manipulation resistance out of derivatives eligibility", () => {
    const result = assess({ oracle: { manipulationCostUsd: 99_999 } });
    expect(result.coreIntegrityStatus).toBe("QUALIFIED");
    expect(result.derivativesStatus).toBe("BLOCKED");
    expect(result.rejectionReasons.map(({ code }) => code)).toContain(
      "CAPACITY_INSUFFICIENT_MANIPULATION_RESISTANCE",
    );
  });

  it("marks an EVM-only freeze field not applicable", () => {
    const result = assess({ authorities: { freezeAuthorityActive: null } });
    expect(result.hardGates.find((gate) => gate.code === "FREEZE_AUTHORITY_ACTIVE")?.state).toBe(
      "NOT_APPLICABLE",
    );
    expect(result.coreIntegrityStatus).toBe("QUALIFIED");
  });

  it("keeps an applicable Solana freeze authority as a core rejection", () => {
    const observation: MarketObservation = {
      ...clean,
      token: {
        ...clean.token,
        chain: "SOLANA",
        tokenProgram: "SPL_TOKEN",
        originPlatform: "RAYDIUM_STYLE",
      },
      authorities: {
        ...clean.authorities,
        mintAuthorityActive: false,
        freezeAuthorityActive: true,
        dangerousOwnerAdminPrivileges: null,
        upgradeable: null,
        upgradeAuthority: null,
      },
    };
    const result = assessRisk(observation, { assessedAt, rules: CORE_SAFETY_RISK_RULES });
    expect(result.coreIntegrityStatus).toBe("REJECTED");
    expect(result.rejectionReasons.map(({ code }) => code)).toContain("FREEZE_AUTHORITY_ACTIVE");
  });

  it("blocks stale oracle and missing depth without changing thresholds", () => {
    const result = assess({
      oracle: { stale: true },
      liquidity: { depth1PctUsd: null, depth2PctUsd: null },
    });
    expect(result.coreIntegrityStatus).toBe("QUALIFIED");
    expect(result.derivativesStatus).toBe("BLOCKED");
    expect(result.rejectionReasons.map(({ code }) => code)).toContain("STALE_ORACLE");
    expect(result.unknownReasons.map(({ code }) => code)).toContain("INSUFFICIENT_DEPTH_1_PERCENT");
  });

  it("retains the historical core-unsafe fixture corpus under 0.3.0", () => {
    const coreUnsafeFixtureIds = [
      "active-mint-authority",
      "withdrawable-lp",
      "cluster-fifteen",
      "cluster-over-five-individual-under-five",
      "cluster-six-point-three-individuals-under-five",
      "bundled-launch",
      "known-risk-deployer",
    ];
    for (const id of coreUnsafeFixtureIds) {
      const fixture = FIXTURE_BY_ID.get(id)!;
      const result = assessRisk(fixture.market.observation, {
        assessedAt,
        rules: CORE_SAFETY_RISK_RULES,
      });
      expect(result.coreIntegrityStatus, id).toBe("REJECTED");
    }
  });
});
