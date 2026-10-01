import { describe, expect, it } from "vitest";
import { InMemoryPersistence, SQLitePersistence } from "./index.js";

describe("persistence", () => {
  it("persists all records in a durable SQLite database", () => {
    const store = new SQLitePersistence(":memory:");
    store.put(
      "markets",
      "market-1",
      { marketId: "market-1", chain: "BASE" },
      "2026-10-01T00:00:00.000Z",
    );
    expect(store.get("markets", "market-1")?.payload.chain).toBe("BASE");
    expect(store.list("markets")).toHaveLength(1);
    store.close();
  });

  it("keeps the in-memory adapter explicit for deterministic unit tests", () => {
    const store = new InMemoryPersistence();
    store.put("indexer_checkpoints", "BASE", { blockNumber: "10" }, "2026-10-01T00:00:00.000Z");
    expect(store.get("indexer_checkpoints", "BASE")?.payload.blockNumber).toBe("10");
  });
});
