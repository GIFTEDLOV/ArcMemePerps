import { describe, expect, it } from "vitest";
import {
  BackendRepository,
  InMemoryPersistence,
  PostgresPersistence,
  PersistentJobQueue,
  SQLitePersistence,
  type PostgresQueryClient,
} from "./index.js";

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

  it("keeps PostgreSQL portable and parameterized without requiring a driver", async () => {
    const queries: string[] = [];
    const client: PostgresQueryClient = {
      query: <T extends Readonly<Record<string, unknown>>>(text: string) => {
        queries.push(text);
        return Promise.resolve({
          rows:
            text.includes("schema_migrations") && text.includes("LIMIT")
              ? [{ version: 2 } as unknown as T]
              : [],
        });
      },
    };
    const store = new PostgresPersistence(client);
    await store.migrate();
    await store.put("markets", "m1", { chain: "BASE" }, "2026-10-01T00:00:00.000Z");
    expect(queries.some((query) => query.includes("$1") && query.includes("$2"))).toBe(true);
  });

  it("persists notification deduplication and read state with the source event", () => {
    const storage = new SQLitePersistence(":memory:");
    const repository = new BackendRepository(storage);
    repository.saveNotification({
      schemaVersion: "notification-event/v1",
      id: "notification-1",
      recipient: "0xabc",
      type: "WATCHED_WALLET_BUY",
      marketId: null,
      eventId: "event-1",
      sourceEventId: "protocol-event-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:01.000Z",
      readAt: null,
      payload: { wallet: "0xdef" },
    });
    expect(repository.listNotifications("0xABC")).toHaveLength(1);
    expect(
      repository.markNotificationRead("notification-1", "2026-01-01T00:00:02.000Z").readAt,
    ).toBe("2026-01-01T00:00:02.000Z");
    expect(repository.listNotifications("0xabc")[0]?.sourceEventId).toBe("protocol-event-1");
    storage.close();
  });

  it("does not re-claim a live lease and rejects stale-worker completion", () => {
    const storage = new SQLitePersistence(":memory:");
    const firstWorker = new PersistentJobQueue(storage, 1_000);
    const secondWorker = new PersistentJobQueue(storage, 1_000);
    firstWorker.enqueue({
      id: "job-1",
      type: "RECONCILIATION",
      dedupeKey: "reconcile-1",
      payload: { check: "vault" },
      availableAt: "2026-10-01T00:00:00.000Z",
    });
    const first = firstWorker.claim("2026-10-01T00:00:00.000Z");
    expect(first?.leaseId).toMatch(/[0-9a-f-]{36}/);
    expect(secondWorker.claim("2026-10-01T00:00:00.500Z")).toBeNull();

    const recovered = secondWorker.claim("2026-10-01T00:00:01.001Z");
    expect(recovered?.leaseId).not.toBe(first?.leaseId);
    expect(() => firstWorker.succeed("job-1", undefined, first?.leaseId ?? null)).toThrow(
      "JOB_LEASE_LOST",
    );
    secondWorker.succeed("job-1", "2026-10-01T00:00:01.002Z", recovered?.leaseId ?? null);
    expect(secondWorker.get("job-1")?.status).toBe("SUCCEEDED");
    storage.close();
  });
});
