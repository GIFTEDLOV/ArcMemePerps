import { describe, expect, it } from "vitest";
import { RealtimeHub } from "./realtime.js";

describe("realtime replay", () => {
  it("assigns monotonic sequences and reconnects after the last sequence", () => {
    const hub = new RealtimeHub();
    const first = hub.createEvent({
      id: "e1",
      type: "market.discovered",
      occurredAt: "2026-01-01T00:00:00.000Z",
      payload: {},
    });
    hub.publish(first);
    const second = hub.createEvent({
      id: "e2",
      type: "market.risk.changed",
      occurredAt: "2026-01-01T00:00:01.000Z",
      payload: {},
    });
    hub.publish(second);
    expect(hub.recentEvents("1").map((event) => event.id)).toEqual(["e2"]);
    expect(hub.status("2026-01-01T00:00:02.000Z")).toBe("LIVE");
  });
});
