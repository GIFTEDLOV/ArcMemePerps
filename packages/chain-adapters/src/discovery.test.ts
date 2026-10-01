import { describe, expect, it } from "vitest";
import { DiscoveryCoordinator, UnavailableLaunchpadDiscovery } from "./discovery.js";

describe("discovery plugin boundaries", () => {
  it("does not synthesize candidates when a launchpad source is unavailable", async () => {
    const adapter = new UnavailableLaunchpadDiscovery(
      "PUMP_FUN",
      "SOLANA",
      "DOCUMENTATION_OR_ACCESS_UNAVAILABLE",
    );
    expect(await new DiscoveryCoordinator([adapter]).discoverAll()).toEqual([]);
    await expect(adapter.lifecycle("mint")).rejects.toThrow("UNAVAILABLE:PUMP_FUN");
  });
});
