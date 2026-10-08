import { describe, expect, it } from "vitest";
import type { MarketObservation } from "@arcmemeperps/domain";
import { FIXTURE_BY_ID } from "../../../fixtures/corpus.js";
import { assessRisk, FINAL_RISK_RULES } from "./index.js";

const assessedAt = "2026-09-29T00:00:00.000Z";
const clean = FIXTURE_BY_ID.get("clean-mature")!.market.observation;

type Overrides = Partial<{
  authorities: Partial<MarketObservation["authorities"]>;
  liquidity: Partial<MarketObservation["liquidity"]>;
  holders: Partial<MarketObservation["holders"]>;
  deployer: Partial<MarketObservation["deployer"]>;
  activity: Partial<MarketObservation["activity"]>;
  oracle: Partial<MarketObservation["oracle"]>;
  derivatives: Partial<MarketObservation["derivatives"]>;
}>;

function assess(overrides: Overrides = {}) {
  return assessRisk(
    {
      ...clean,
      ...overrides,
      authorities: { ...clean.authorities, ...(overrides.authorities ?? {}) },
      liquidity: { ...clean.liquidity, ...(overrides.liquidity ?? {}) },
      holders: { ...clean.holders, ...(overrides.holders ?? {}) },
      deployer: { ...clean.deployer, ...(overrides.deployer ?? {}) },
      activity: { ...clean.activity, ...(overrides.activity ?? {}) },
      oracle: { ...clean.oracle, ...(overrides.oracle ?? {}) },
      derivatives: { ...clean.derivatives, ...(overrides.derivatives ?? {}) },
    },
    { assessedAt, rules: FINAL_RISK_RULES },
  );
}

describe("risk policy 0.4.0 dynamic capacity", () => {
  it("uses the final version without weakening core safety", () => {
    const result = assess();
    expect(result.ruleVersion).toBe("0.4.0");
    expect(result.coreIntegrityStatus).toBe("QUALIFIED");
    expect(result.derivativesStatus).toBe("ELIGIBLE");
    expect(result.recommendedMaxOI).toBe(47_500);
    expect(result.recommendedMaxPosition).toBe(11_875);
    expect(result.recommendedMaxLeverage).toBe(1.25);
  });

  it("turns low measured capacity into bounded blocking rather than a zero-capacity pass", () => {
    const result = assess({
      liquidity: { totalLiquidityUsd: 20_000, depth1PctUsd: 1_000, depth2PctUsd: 2_000 },
      activity: { organicVolume24hUsd: 10_000 },
      oracle: { manipulationCostUsd: 20_000 },
      derivatives: {
        maximumSafeOpenInterestUsd: 100_000,
        maximumPositionSizeUsd: 1_000,
        liquidationCapacityUsd: 2_000,
      },
    });
    expect(result.coreIntegrityStatus).toBe("QUALIFIED");
    expect(result.derivativesStatus).toBe("BLOCKED");
    expect(result.rejectionReasons.map(({ code }) => code)).toContain(
      "CAPACITY_INSUFFICIENT_SAFE_OPEN_INTEREST",
    );
    expect(result.recommendedMaxOI).toBeLessThan(25_000);
  });

  it("keeps source independence hard under dynamic capacity", () => {
    const result = assess({ oracle: { sourceCount: 1 } });
    expect(result.coreIntegrityStatus).toBe("QUALIFIED");
    expect(result.derivativesStatus).toBe("BLOCKED");
    expect(result.rejectionReasons.map(({ code }) => code)).toContain(
      "CAPACITY_INSUFFICIENT_ORACLE_SOURCES",
    );
  });

  it("keeps unknown applicable core control evidence pending", () => {
    const result = assess({ authorities: { dangerousOwnerAdminPrivileges: null } });
    expect(result.coreIntegrityStatus).toBe("PENDING");
    expect(result.derivativesStatus).toBe("UNASSESSED");
    expect(result.unknownReasons.map(({ code }) => code)).toContain(
      "DANGEROUS_OWNER_ADMIN_PRIVILEGE",
    );
  });

  it.each([
    ["active mint", { authorities: { mintAuthorityActive: true } }, "MINT_AUTHORITY_ACTIVE"],
    ["cluster", { holders: { connectedClusterPct: 5.01 } }, "CONNECTED_CLUSTER_CONCENTRATION"],
    ["privileged LP", { liquidity: { lpLockStatus: "WITHDRAWABLE_BY_PRIVILEGED_ACTOR" as const } }, "LIQUIDITY_WITHDRAWABLE"],
  ] as const)("preserves explicit %s rejection", (_name, overrides, code) => {
    const result = assess(overrides);
    expect(result.coreIntegrityStatus).toBe("REJECTED");
    expect(result.rejectionReasons.map(({ code: reasonCode }) => reasonCode)).toContain(code);
  });
});
