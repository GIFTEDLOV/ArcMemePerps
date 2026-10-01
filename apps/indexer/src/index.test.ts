import { describe, expect, it } from "vitest";
import { InMemoryPersistence } from "@arcmemeperps/persistence";
import {
  IdempotentEventProcessor,
  PersistentIndexerCheckpointStore,
  PersistentProcessedEventStore,
  ReorgDetectedError,
  assertEvmCheckpointContinuity,
  assertSolanaCheckpointContinuity,
  type ProtocolEventIdentity,
} from "./index.js";

const event: ProtocolEventIdentity = {
  chain: "ARC",
  transactionHash: `0x${"11".repeat(32)}`,
  signature: null,
  blockNumber: "10",
  slot: null,
  logIndex: 0,
  emitter: "0x0000000000000000000000000000000000000001",
  topic0: "0x01",
};

describe("replay-safe indexer state", () => {
  it("persists checkpoints and detects EVM reorgs", () => {
    const store = new InMemoryPersistence();
    const checkpoints = new PersistentIndexerCheckpointStore(store);
    checkpoints.save({
      chain: "ARC",
      cursor: null,
      blockNumber: "10",
      blockHash: `0x${"aa".repeat(32)}`,
      slot: null,
      finality: "finalized",
      lastObservedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(checkpoints.load("ARC")?.blockNumber).toBe("10");
    expect(() =>
      assertEvmCheckpointContinuity(
        { chain: "ARC", blockNumber: 10n, blockHash: `0x${"aa".repeat(32)}` },
        { chain: "ARC", blockNumber: 10n, blockHash: `0x${"bb".repeat(32)}` },
      ),
    ).toThrow(ReorgDetectedError);
  });
  it("rejects backward Solana finalized checkpoints", () => {
    expect(() =>
      assertSolanaCheckpointContinuity(
        { chain: "SOLANA", slot: 10n, commitment: "finalized" },
        { chain: "SOLANA", slot: 9n, commitment: "finalized" },
      ),
    ).toThrow(ReorgDetectedError);
  });
  it("applies one canonical protocol event once", async () => {
    const processor = new IdempotentEventProcessor(
      new PersistentProcessedEventStore(new InMemoryPersistence()),
    );
    let applied = 0;
    const apply = () =>
      Promise.resolve().then(() => {
        applied += 1;
      });
    expect(await processor.process(event, apply)).toBe("APPLIED");
    expect(await processor.process(event, apply)).toBe("DUPLICATE");
    expect(applied).toBe(1);
  });
});
