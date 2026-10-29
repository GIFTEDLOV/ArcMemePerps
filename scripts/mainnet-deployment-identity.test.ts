import { describe, expect, it } from "vitest";
import {
  resolveMainnetContractAddress,
  resolveMainnetDeployer,
  resolveMainnetDeploymentBlockRange,
} from "./mainnet-deployment-identity";

const deployedMainnetDeployer = "0xB65685037041Ff56574a53FC49B1F5dB88ABe043";
const pendingPlanDeployer = "0x456A3ab835Bea90b42FF207B6c42BCE0BFF3e833";

describe("Mainnet deployment identity", () => {
  it("uses the actual deployer recorded with the deployed contract addresses", () => {
    expect(resolveMainnetDeployer(deployedMainnetDeployer)).toBe(deployedMainnetDeployer);
  });

  it("accepts only a matching explicit address override", () => {
    expect(
      resolveMainnetDeployer(deployedMainnetDeployer, deployedMainnetDeployer.toLowerCase()),
    ).toBe(deployedMainnetDeployer);
  });

  it("rejects a stale pending-plan address instead of checking the wrong account", () => {
    expect(() => resolveMainnetDeployer(deployedMainnetDeployer, pendingPlanDeployer)).toThrow(
      "MAINNET_DEPLOYER_OVERRIDE_MISMATCH",
    );
  });

  it("rejects a missing or malformed deployed-manifest address", () => {
    expect(() => resolveMainnetDeployer(undefined)).toThrow(
      "INVALID_MAINNET_DEPLOYER_IN_CONTRACTS_MANIFEST",
    );
    expect(() => resolveMainnetDeployer("not-an-address")).toThrow(
      "INVALID_MAINNET_DEPLOYER_IN_CONTRACTS_MANIFEST",
    );
  });

  it("rejects a malformed override", () => {
    expect(() => resolveMainnetDeployer(deployedMainnetDeployer, "0x1234")).toThrow(
      "INVALID_MAINNET_DEPLOYER_OVERRIDE",
    );
  });

  it("resolves addresses from the deployed contracts manifest", () => {
    expect(
      resolveMainnetContractAddress(
        { deployedAddresses: { PerpEngine: "0x0000000000000000000000000000000000005042" } },
        "PerpEngine",
      ),
    ).toBe("0x0000000000000000000000000000000000005042");
  });

  it("supports verified deployment records and rejects missing addresses", () => {
    expect(
      resolveMainnetContractAddress(
        {
          contracts: [
            { name: "PerpEngine", address: "0x0000000000000000000000000000000000005042" },
          ],
        },
        "PerpEngine",
      ),
    ).toBe("0x0000000000000000000000000000000000005042");
    expect(() => resolveMainnetContractAddress({}, "PerpEngine")).toThrow(
      "MISSING_OR_INVALID_MAINNET_CONTRACT:PerpEngine",
    );
  });

  it("derives a deployment range from receipts when the legacy manifest omits it", () => {
    expect(
      resolveMainnetDeploymentBlockRange({
        receipts: {
          PerpEngine: { blockNumber: "27427061" },
          MarketRegistry: { blockNumber: "27427043" },
        },
      }),
    ).toEqual({ first: 27427043n, last: 27427061n });
  });

  it("rejects missing or invalid deployment ranges", () => {
    expect(() => resolveMainnetDeploymentBlockRange({ receipts: {} })).toThrow(
      "MAINNET_DEPLOYMENT_BLOCK_RANGE_MISSING",
    );
    expect(() =>
      resolveMainnetDeploymentBlockRange({
        deploymentBlocks: { first: "9", last: "2" },
      }),
    ).toThrow("MAINNET_DEPLOYMENT_BLOCK_RANGE_MISSING");
  });
});

