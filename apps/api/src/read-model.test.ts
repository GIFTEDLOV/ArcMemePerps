import { describe, expect, it } from "vitest";
import { SQLitePersistence } from "@arcmemeperps/persistence";
import { PersistenceApiReadModel } from "./read-model.js";

describe("durable API read model", () => {
  it("reads notifications from canonical persistent state", async () => {
    const storage = new SQLitePersistence(":memory:");
    storage.put(
      "notifications",
      "n1",
      {
        schemaVersion: "notification-event/v1",
        id: "n1",
        recipient: "0xabc",
        type: "MARKET_PAUSED",
        marketId: null,
        eventId: "protocol-event-1",
        sourceEventId: "protocol-event-1",
        occurredAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:01.000Z",
        readAt: null,
        payload: {},
      },
      "2026-01-01T00:00:01.000Z",
    );
    const model = new PersistenceApiReadModel(storage);
    expect(await model.getNotifications("0xABC")).toHaveLength(1);
    storage.close();
  });
});
