import { describe, expect, it } from "vitest";
import { InMemoryPersistence } from "@arcmemeperps/persistence";
import { BackendWorkerService, REQUIRED_WORK_TYPES } from "./workers.js";

describe("durable backend workers", () => {
  it("registers every required worker class and executes idempotently", async () => {
    const storage = new InMemoryPersistence();
    const worker = new BackendWorkerService(storage);
    for (const type of REQUIRED_WORK_TYPES) worker.register(type, () => Promise.resolve());
    worker.enqueue("MARKET_REFRESH", "market-1", { marketId: "market-1" });
    worker.enqueue("MARKET_REFRESH", "market-1", { marketId: "market-1" });
    expect(storage.list("jobs")).toHaveLength(1);
    expect((await worker.runOne())?.status).toBe("SUCCEEDED");
    expect(await worker.runOne()).toBeNull();
  });

  it("fails unsupported work without infinite retry", async () => {
    const storage = new InMemoryPersistence();
    const worker = new BackendWorkerService(storage);
    worker.enqueue("RECONCILIATION", "critical-1", { check: "vault" });
    const result = await worker.runOne();
    expect(result?.status).toBe("FAILED");
    expect(worker.metrics().failed).toBe(1);
  });
});
