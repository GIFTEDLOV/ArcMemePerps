import { describe, expect, it } from "vitest";
import { formatIndexedSse, parseResumeId } from "../api/arc-index-read.js";

describe("Arc index SSE contract", () => {
  it("accepts only bounded decimal replay cursors", () => {
    expect(parseResumeId("42")).toBe(42n);
    for (const invalid of [null, "-1", "1.0", "1e3", "0001", "184467440737095516160", "abc"])
      expect(parseResumeId(invalid)).toBe(0n);
  });
  it("sends committed receipt identity with an SSE ID and frontend-compatible sequence", () => {
    const frame = formatIndexedSse({
      id: "31",
      type: "protocol.event",
      committedAt: new Date("2026-10-29T00:00:00Z"),
      payload: { transactionHash: "0xreceipt", blockNumber: "27246895", logIndex: 5 },
    });
    expect(frame).toContain("id: 31\nevent: protocol.event\ndata: ");
    expect(frame).toContain('"sequence":"31"');
    expect(frame).toContain('"transactionHash":"0xreceipt"');
    expect(frame.endsWith("\n\n")).toBe(true);
  });
  it("emits a monotonic reorg invalidation after orphaned events are removed", () => {
    const frame = formatIndexedSse({
      id: "32",
      type: "protocol.reorg",
      committedAt: new Date("2026-10-29T00:00:01Z"),
      payload: { fromBlock: "100", previousThrough: "101" },
    });
    expect(frame).toContain("id: 32\nevent: protocol.reorg\ndata: ");
    expect(frame).toContain('"type":"protocol.reorg"');
  });
});
