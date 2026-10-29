import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import {
  ARC_CHAIN_ID,
  compareProviderLogs,
  indexArcHistory,
  type ArcEventJournal,
  type ArcEventSource,
  type BlockAnchor,
  type IndexedLog,
} from "./arc-history.js";

const hash = (value: number): Hex => `0x${value.toString(16).padStart(64, "0")}`;
const address = "0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf" as Address;
const start = 27246890n;
const block = (number: bigint, offset = 0): BlockAnchor => ({
  number,
  hash: hash(Number(number) + offset),
  parentHash: hash(Number(number - 1n) + offset),
});
const event = (number: bigint, offset = 0): IndexedLog => ({
  blockNumber: number,
  blockHash: hash(Number(number) + offset),
  transactionHash: hash(Number(number) + 1_000_000),
  transactionIndex: 0,
  logIndex: 0,
  address,
  topics: [hash(1)],
  data: "0x",
});

class MemoryJournal {
  readonly startBlock = start;
  ranges: { from: bigint; to: bigint; hash: Hex; count: number }[] = [];
  events: IndexedLog[] = [];
  async checkpoint() {
    const last = this.ranges.at(-1);
    return last ? { blockNumber: last.to, blockHash: last.hash, sourceCount: last.count } : null;
  }
  async commitRange(
    from: BlockAnchor,
    to: BlockAnchor,
    logs: readonly IndexedLog[],
    sourceCount: number,
  ) {
    const previous = this.ranges.at(-1);
    if (from.number !== (previous?.to ?? start - 1n) + 1n) throw new Error("INDEX_RANGE_GAP");
    if (previous && from.parentHash !== previous.hash)
      throw new Error("INDEX_PARENT_HASH_MISMATCH");
    this.ranges.push({ from: from.number, to: to.number, hash: to.hash, count: sourceCount });
    this.events.push(...logs);
  }
  async latestRange() {
    return this.ranges.at(-1) ?? null;
  }
  async rewindFrom(number: bigint) {
    this.ranges = this.ranges.filter((range) => range.from < number);
    this.events = this.events.filter((log) => log.blockNumber < number);
  }
}
function source(
  options: {
    offset?: number;
    head?: bigint;
    events?: IndexedLog[];
    wrongChain?: boolean;
    failLogs?: boolean;
    badReceipt?: boolean;
  } = {},
): ArcEventSource {
  return {
    chainId: async () => (options.wrongChain ? 1 : ARC_CHAIN_ID),
    head: async () => options.head ?? start + 5n,
    block: async (number) => block(number, options.offset),
    logs: async (from, to) => {
      if (options.failLogs) throw new Error("PROVIDER_UNAVAILABLE");
      return (options.events ?? []).filter(
        (log) => log.blockNumber >= from && log.blockNumber <= to,
      );
    },
    receipt: async (txHash) => ({
      status: options.badReceipt ? "reverted" : "success",
      blockHash:
        (options.events ?? []).find((log) => log.transactionHash === txHash)?.blockHash ?? hash(0),
      logs: (options.events ?? []).filter((log) => log.transactionHash === txHash),
    }),
  };
}
const journal = () => new MemoryJournal() as unknown as ArcEventJournal & MemoryJournal;

describe("Arc historical indexing boundary", () => {
  it("indexes exact receipt block through bounded finalized head and resumes without duplicates", async () => {
    const db = journal();
    const log = event(start);
    const first = await indexArcHistory(db, source({ events: [log] }), source({ events: [log] }), {
      finalityDepth: 2n,
      windowSize: 2n,
      maxWindows: 1,
    });
    expect(first).toEqual({ windows: 1, through: start + 1n });
    const resumed = await indexArcHistory(
      db,
      source({ events: [log] }),
      source({ events: [log] }),
      { finalityDepth: 2n, windowSize: 2n },
    );
    expect(resumed.through).toBe(start + 3n);
    expect(db.events).toHaveLength(1);
    expect(db.ranges.map((range) => range.count)).toEqual([2, 2]);
  });
  it("rejects provider disagreement and does not advance a checkpoint", async () => {
    const db = journal();
    await expect(
      indexArcHistory(db, source({ events: [event(start)] }), source(), { finalityDepth: 2n }),
    ).rejects.toThrow("RPC_LOG_SOURCE_MISMATCH");
    expect(await db.checkpoint()).toBeNull();
  });
  it("rejects wrong chain, source outage, and invalid windows without committing", async () => {
    const db = journal();
    await expect(indexArcHistory(db, source({ wrongChain: true }), null)).rejects.toThrow(
      "WRONG_ARC_CHAIN",
    );
    await expect(
      indexArcHistory(db, source({ failLogs: true }), null, { finalityDepth: 0n }),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
    await expect(indexArcHistory(db, source(), null, { windowSize: 0n })).rejects.toThrow(
      "INVALID_INDEX_OPTIONS",
    );
    expect(db.ranges).toHaveLength(0);
  });
  it("rewinds a changed last range, then replays the canonical fork", async () => {
    const db = journal();
    await indexArcHistory(db, source({ head: start + 1n, events: [event(start)] }), null, {
      finalityDepth: 0n,
      windowSize: 1n,
    });
    expect(db.events).toHaveLength(1);
    const forkEvent = event(start, 100);
    const result = await indexArcHistory(
      db,
      source({ offset: 100, head: start + 1n, events: [forkEvent] }),
      null,
      { finalityDepth: 0n, windowSize: 1n },
    );
    expect(result.through).toBe(start + 1n);
    expect(db.events).toEqual([forkEvent]);
  });
  it("does not ingest out-of-window or unknown-emitter logs", async () => {
    const db = journal();
    const bad = { ...event(start), blockNumber: start - 1n };
    await expect(
      indexArcHistory(db, source({ events: [bad] }), null, { finalityDepth: 0n }),
    ).resolves.toEqual({ windows: 1, through: start + 5n });
    expect(db.events).toHaveLength(0);
    const invalid = {
      ...event(start),
      address: "0x0000000000000000000000000000000000000001" as Address,
    };
    const db2 = journal();
    await expect(
      indexArcHistory(db2, source({ events: [invalid] }), null, { finalityDepth: 0n }),
    ).rejects.toThrow("RPC_RECEIPT_LOG_MISMATCH");
  });
  it("compares full log payload, not just counts", () => {
    expect(() =>
      compareProviderLogs([event(start)], [{ ...event(start), data: "0x12" }]),
    ).toThrow();
  });
  it("rejects logs whose transaction receipt is reverted or inconsistent", async () => {
    const db = journal();
    await expect(
      indexArcHistory(db, source({ events: [event(start)], badReceipt: true }), null, {
        finalityDepth: 0n,
      }),
    ).rejects.toThrow("RPC_RECEIPT_STATUS_OR_BLOCK_MISMATCH");
    expect(await db.checkpoint()).toBeNull();
  });
});
