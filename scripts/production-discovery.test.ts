import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCanonicalDiscovery } from "./production-discovery.js";

describe("production discovery source semantics", () => {
  it("uses the durable canonical universe and keeps refresh counts separate", () => {
    const canonical = loadCanonicalDiscovery(resolve("evidence/winner-rebuild/winner.sqlite"));
    const refresh = JSON.parse(readFileSync(resolve("evidence/winner-rebuild/discovery-snapshot.json"), "utf8")) as {
      readonly markets: readonly unknown[];
    };

    expect(canonical.markets).toHaveLength(262);
    expect(refresh.markets).toHaveLength(161);
    expect(canonical.markets.length).toBeGreaterThan(refresh.markets.length);
    expect(new Set(canonical.markets.map((market) => market.marketId)).size).toBe(canonical.markets.length);
  });

  it("fails closed on a missing canonical source instead of falling back", () => {
    expect(() => loadCanonicalDiscovery(resolve("evidence", "mainnet", "missing.sqlite"))).toThrow();
  });
});
