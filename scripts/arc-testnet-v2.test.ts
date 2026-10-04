import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_ORDER,
  assertDistinctActors,
  assertRuntimeBytecode,
  buildDeploymentPlan,
  deploymentArtifacts,
  expectedFunding,
  fundingDeficit,
  remainingDeployments,
  validateActorManifest,
  validateManifestBasics,
  type ActorRecord,
} from "./arc-testnet-v2.js";

const actors: ActorRecord[] = [
  "V2_DEPLOYER",
  "GOVERNANCE_ADMIN",
  "RISK_ADMIN",
].map((role, index) => ({
  role,
  publicAddress: `0x${String(index + 1).padStart(40, "0")}`,
  signerSourceLabel: "local encrypted keystore outside repository",
}));

describe("Arc Testnet V2 deployment tooling", () => {
  it("requires the complete frozen-suite deployment order", () => {
    expect(
      buildDeploymentPlan({ deploymentOrder: [...DEPLOYMENT_ORDER] }),
    ).toEqual([...DEPLOYMENT_ORDER]);
    expect(() => buildDeploymentPlan({ deploymentOrder: ["PerpEngine"] })).toThrow(
      "complete V2 deployment order",
    );
  });

  it("rejects duplicate actor identities", () => {
    expect(() => assertDistinctActors([actors[0]!, actors[0]!])).toThrow(
      "duplicate signer address",
    );
    expect(() => assertDistinctActors(actors)).not.toThrow();
  });

  it("keeps deployment artifacts explicit for every suite contract", () => {
    const artifacts = deploymentArtifacts("root");
    expect(Object.keys(artifacts)).toEqual([...DEPLOYMENT_ORDER]);
    expect(artifacts.PublicLPVault.replaceAll("\\", "/")).toContain("out/PublicLPVault.sol/PublicLPVault.json");
    expect(artifacts.ProtocolTimelock).toContain(
      "out/ProtocolTimelock.sol/ProtocolTimelock.json".replaceAll("/", "\\"),
    );
  });

  it("does not merge native gas balance with ERC-20 collateral requirements", () => {
    const requirements = expectedFunding();
    const deployer = requirements.find((item) => item.role === "V2_DEPLOYER");
    const reporter = requirements.find((item) => item.role === "REPORTER_1");
    expect(deployer?.protocolRequiredUsdcBaseUnits).toBe(7_000_000n);
    expect(deployer?.gasReserveUsdcBaseUnits).toBe(1_000_000n);
    expect(deployer?.requiredEconomicUsdcBaseUnits).toBe(8_000_000n);
    expect(deployer?.requiresOnchainWrite).toBe(true);
    expect(reporter?.protocolRequiredUsdcBaseUnits).toBe(0n);
    expect(reporter?.gasReserveUsdcBaseUnits).toBe(0n);
    expect(reporter?.requiredEconomicUsdcBaseUnits).toBe(0n);
    expect(reporter?.requiresOnchainWrite).toBe(false);
  });

  it("rejects wrong-chain, wrong-USDC, hash-mismatch, and corrupt candidates before RPC work", () => {
    const valid = {
      status: "CANDIDATE_ONLY_NOT_DEPLOYED",
      chainId: 5_042_002,
      rpcIdentity: "https://rpc.testnet.arc.io",
      collateral: { address: "0x3600000000000000000000000000000000000000" },
      contractSourceSha256:
        "0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b",
      deploymentOrder: [...DEPLOYMENT_ORDER],
      constructorArguments: Object.fromEntries(DEPLOYMENT_ORDER.map((name) => [name, []])),
    };
    expect(validateManifestBasics(valid)).toEqual([]);
    expect(validateManifestBasics({ ...valid, chainId: 1 })).toContain(
      "candidate chain ID is not Arc Testnet",
    );
    expect(validateManifestBasics({ ...valid, collateral: { address: "0x0000000000000000000000000000000000000001" } })).toContain(
      "candidate USDC address mismatch",
    );
    expect(validateManifestBasics({ ...valid, contractSourceSha256: "0xdeadbeef" })).toContain(
      "candidate contract SHA mismatch",
    );
    expect(validateManifestBasics({ ...valid, deploymentOrder: ["PerpEngine"] })).toContain(
      "candidate manifest does not contain the complete V2 deployment order",
    );
  });

  it("rejects missing signer roles and preserves the distinct-identity rule", () => {
    expect(validateActorManifest(actors)).toContain("missing actor REPORTER_3");
    const complete = [
      ...actors,
      { role: "REPORTER_1", publicAddress: "0x0000000000000000000000000000000000000004", signerSourceLabel: "test" },
      { role: "REPORTER_2", publicAddress: "0x0000000000000000000000000000000000000005", signerSourceLabel: "test" },
      { role: "REPORTER_3", publicAddress: "0x0000000000000000000000000000000000000006", signerSourceLabel: "test" },
      ...["EMERGENCY_ADMIN", "ORACLE_ADMIN", "QUALIFICATION_WRITER", "KEEPER", "INSURANCE_MANAGER", "TRADER_LONG", "TRADER_SHORT", "LIQUIDATOR", "LP_1", "LP_2"].map((role, index) => ({
        role,
        publicAddress: `0x${String(index + 10).padStart(40, "0")}`,
        signerSourceLabel: "test",
      })),
    ] as ActorRecord[];
    expect(validateActorManifest(complete)).toEqual([]);
    expect(
      validateActorManifest([
        { ...complete[0]!, publicAddress: complete[1]!.publicAddress },
        ...complete.slice(1),
      ]).some((failure) => failure.includes("duplicate signer address")),
    ).toBe(true);
  });

  it("resumes only the missing contracts and never treats a zero address as deployed", () => {
    const manifest = { deploymentOrder: [...DEPLOYMENT_ORDER] };
    expect(
      remainingDeployments(manifest, {
        QualificationRegistry: "0x0000000000000000000000000000000000000001",
        MarketRegistry: "0x0000000000000000000000000000000000000002",
        OracleRouter: "0x0000000000000000000000000000000000000003",
        RiskConfig: "0x0000000000000000000000000000000000000004",
      }),
    ).toEqual([
      "USDCMarginVault",
      "InsuranceFund",
      "PerpEngine",
      "PublicLPVault",
      "ADLController",
      "ProtocolTimelock",
    ]);
  });

  it("fails closed on unexpected runtime bytecode and measured funding deficits", () => {
    expect(() => assertRuntimeBytecode("0x6000", "0x6001")).toThrow("runtime bytecode mismatch");
    expect(() => assertRuntimeBytecode("0xzz", "0x6000")).toThrow("not valid hexadecimal");
    expect(assertRuntimeBytecode("0x6000", "6000")).toBeUndefined();
    expect(fundingDeficit(0n, 7n)).toBe(7n);
    expect(fundingDeficit(8n, 7n)).toBe(0n);
  });
});
