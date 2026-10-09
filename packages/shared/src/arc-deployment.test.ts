import { describe, expect, it } from "vitest";
import { loadArcDeploymentConfig } from "./arc-deployment.js";

describe("Arc deployment configuration", () => {
  it("keeps an unaddressed Mainnet configuration pending", () => {
    const config = loadArcDeploymentConfig({
      ARCMEMEPERPS_DEPLOYMENT_NETWORK: "MAINNET",
      RISK_RULE_VERSION: "0.4.0",
    });
    expect(config.chainId).toBe(5042);
    expect(config.deploymentStatus).toBe("PENDING");
    expect(config.lifecycle).toBe("DEPLOYMENT_PENDING");
    expect(config.persistenceNamespace).toContain("chain-5042");
    expect(Object.keys(config.addresses)).toHaveLength(0);
  });

  it("rejects a Mainnet chain or USDC override", () => {
    expect(() => loadArcDeploymentConfig({ ARC_MAINNET_CHAIN_ID: "1" })).toThrow("chain ID");
    expect(() => loadArcDeploymentConfig({ ARC_MAINNET_USDC_ADDRESS: "0x0000000000000000000000000000000000000001" })).toThrow("USDC");
  });
});
