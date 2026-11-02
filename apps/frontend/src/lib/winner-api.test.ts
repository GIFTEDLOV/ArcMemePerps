import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARC_INDEX_SSE_TYPES, decodeArcIndexEvent, subscribeRealtime,
} from "./winner-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Arc receipt/reorg SSE integration", () => {
  it("decodes only typed receipt-backed events with bounded numeric cursors", () => {
    const event = {
      id: "31", sequence: "31", type: "protocol.event",
      occurredAt: "2026-11-02T00:00:00.000Z",
      payload: { transactionHash: "0xabc", blockNumber: "10" },
    };
    expect(decodeArcIndexEvent(JSON.stringify(event))?.sequence).toBe("31");
    expect(decodeArcIndexEvent(JSON.stringify({ ...event, type: "protocol.reorg" }))?.type).toBe("protocol.reorg");
    expect(decodeArcIndexEvent(JSON.stringify({ ...event, type: "heartbeat" }))).toBeNull();
    expect(decodeArcIndexEvent(JSON.stringify({ ...event, sequence: "-1" }))).toBeNull();
    expect(decodeArcIndexEvent("not JSON")).toBeNull();
  });

  it("receives named Arc events rather than merely SSE handshakes", () => {
    class FakeSource {
      static instances: FakeSource[] = [];
      listeners = new Map<string, (event: { data: string }) => void>();
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      closed = false;
      constructor(public url: string) { FakeSource.instances.push(this); }
      addEventListener(name: string, callback: (event: { data: string }) => void) {
        this.listeners.set(name, callback);
      }
      close() { this.closed = true; }
      emit(type: string, sequence: string) {
        this.listeners.get(type)?.({ data: JSON.stringify({
          type, sequence, occurredAt: "2026-11-02T00:00:00.000Z",
          payload: { blockNumber: "10" },
        }) });
      }
    }
    vi.stubGlobal("window", { location: { href: "https://cluster.example/markets" } });
    vi.stubGlobal("EventSource", FakeSource);
    const types: string[] = [];
    const states: string[] = [];
    const stop = subscribeRealtime("https://cluster-readonly-api.vercel.app/api/v1", e => types.push(e.type), state => states.push(state));
    const connection = FakeSource.instances[0]!;
    expect(connection.url).toContain("/api/v1/stream");
    expect([...connection.listeners.keys()]).toEqual([...ARC_INDEX_SSE_TYPES]);
    connection.onopen?.();
    expect(states.at(-1)).toBe("STALE");
    connection.emit("protocol.event", "31");
    connection.emit("protocol.event", "31");
    connection.emit("protocol.reorg", "31");
    expect(types).toEqual(["protocol.event", "protocol.reorg"]);
    expect(states.at(-1)).toBe("LIVE");
    stop();
    expect(connection.closed).toBe(true);
    expect(states.at(-1)).toBe("OFFLINE");
  });
});
