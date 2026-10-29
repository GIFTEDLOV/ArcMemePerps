import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import type { Address, Hex } from "viem";
import { ArcEventJournal } from "./arc-history.js";
import {
  readArcIndexSnapshot,
  readOutbox,
  readIndexedMarkets,
} from "../../cluster-api-vercel/api/arc-index-read.js";

const connectionString = process.env.ARC_INDEX_TEST_DATABASE_URL;
const pool = connectionString ? new Pool({ connectionString, max: 2 }) : null;
afterAll(async () => {
  await pool?.end();
});

describe.skipIf(!pool)("Arc Postgres event journal", () => {
  it("migrates, commits event and checkpoint atomically, resumes, detects gaps, and rewinds outbox", async () => {
    const db = new ArcEventJournal(pool!, 100n);
    await db.migrate();
    await pool!.query(
      "TRUNCATE arc_event_outbox,arc_raw_events,arc_index_ranges,arc_index_checkpoint RESTART IDENTITY CASCADE",
    );
    const h = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}`;
    const first = { number: 100n, hash: h(100), parentHash: h(99) };
    const second = { number: 101n, hash: h(101), parentHash: h(100) };
    const log = {
      blockNumber: 100n,
      blockHash: h(100),
      transactionHash: h(500),
      transactionIndex: 0,
      logIndex: 0,
      address: "0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf" as Address,
      topics: [h(1)],
      data: "0x" as Hex,
    };
    await db.commitRange(first, second, [log], 2);
    expect((await db.checkpoint())?.blockNumber).toBe(101n);
    expect(await db.coverage()).toMatchObject({
      start: 100n,
      end: 101n,
      ranges: 1,
      events: 1,
      gaps: 0,
    });
    expect(await readOutbox(0n, pool!)).toHaveLength(1);
    expect(await readOutbox(1n, pool!)).toHaveLength(0);
    expect(await readIndexedMarkets(10, pool!)).toHaveLength(0);
    // API snapshot is intentionally tied to the actual Mainnet deployment start.
    expect(await readArcIndexSnapshot(pool!)).toMatchObject({
      observedContractEvents: 1,
      gaps: 1,
      qualifiedMarketCount: null,
      status: "INCOMPLETE",
    });
    await expect(db.commitRange(first, second, [log], 2)).rejects.toThrow("INDEX_RANGE_GAP");
    expect((await db.coverage()).events).toBe(1);
    await expect(
      db.commitRange(
        { number: 103n, hash: h(103), parentHash: h(102) },
        { number: 103n, hash: h(103), parentHash: h(102) },
        [],
        2,
      ),
    ).rejects.toThrow("INDEX_RANGE_GAP");
    await expect(
      db.commitRange(
        { number: 102n, hash: h(102), parentHash: h(999) },
        { number: 102n, hash: h(102), parentHash: h(999) },
        [],
        2,
      ),
    ).rejects.toThrow("INDEX_PARENT_HASH_MISMATCH");
    await db.rewindFrom(100n);
    expect(await db.checkpoint()).toBeNull();
    expect(await db.coverage()).toMatchObject({ ranges: 0, events: 0 });
    const outbox = await pool!.query("SELECT count(*)::int AS count FROM arc_event_outbox");
    expect(outbox.rows[0].count).toBe(0);
  });
});
