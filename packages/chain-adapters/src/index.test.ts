import { describe, expect, it } from "vitest";
import { FIXTURE_CASES } from "../../../fixtures/corpus.js";
import { DeterministicFixtureAdapter } from "./index.js";

describe("deterministic chain adapters", () => {
  it("implement the complete normalized adapter surface without provider calls", async () => {
    const adapter = new DeterministicFixtureAdapter(FIXTURE_CASES[0]!.market);
    const token = FIXTURE_CASES[0]!.market.observation.token.tokenAddress;
    expect((await adapter.discoverTokens())[0]?.tokenAddress).toBe(token);
    await expect(adapter.getTokenMetadata(token)).resolves.toBeDefined();
    await expect(adapter.getLifecycle(token)).resolves.toBeDefined();
    await expect(adapter.getHolders(token)).resolves.toBeDefined();
    await expect(adapter.getLiquidity(token)).resolves.toBeDefined();
    await expect(adapter.getLiquidityLocks(token)).resolves.toBeDefined();
    await expect(adapter.getPools(token)).resolves.toBeDefined();
    await expect(adapter.getTrades(token)).resolves.toBeDefined();
    await expect(adapter.getPrice(token)).resolves.toBeDefined();
    await expect(adapter.getPriceSources(token)).resolves.toBeDefined();
    await expect(adapter.getDeployer(token)).resolves.toBeDefined();
    await expect(adapter.getDeployerHistory(token)).resolves.toBeDefined();
    await expect(adapter.getAuthorities(token)).resolves.toBeDefined();
    await expect(adapter.getTokenPermissions(token)).resolves.toBeDefined();
    await expect(adapter.getLaunchData(token)).resolves.toBeDefined();
    await expect(adapter.getTransactionHistory(token)).resolves.toBeDefined();
  });
});
