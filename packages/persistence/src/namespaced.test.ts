import { describe, expect, it } from "vitest";
import { InMemoryPersistence, NamespacedPersistence } from "./index.js";

describe("NamespacedPersistence", () => {
  it("isolates identical entity IDs across deployment namespaces", () => {
    const raw = new InMemoryPersistence();
    const mainnet = new NamespacedPersistence(raw, "arcmemeperps:mainnet:chain-5042:pending");
    const testnet = new NamespacedPersistence(raw, "arcmemeperps:testnet:chain-5042002:product");
    mainnet.put("indexer_checkpoints", "ARC", { chain: "ARC", blockNumber: "10" }, "2026-01-01T00:00:00.000Z");
    testnet.put("indexer_checkpoints", "ARC", { chain: "ARC", blockNumber: "20" }, "2026-01-01T00:00:00.000Z");
    expect(mainnet.get("indexer_checkpoints", "ARC")?.payload.blockNumber).toBe("10");
    expect(testnet.get("indexer_checkpoints", "ARC")?.payload.blockNumber).toBe("20");
    expect(raw.list("indexer_checkpoints")).toHaveLength(2);
  });
});
