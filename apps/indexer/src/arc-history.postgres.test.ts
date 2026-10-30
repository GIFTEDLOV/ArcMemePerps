import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";
import { ArcEventJournal } from "./arc-history.js";
import { readArcIndexLedger } from "./arc-parity.js";
import {
  readArcIndexSnapshot,
  readOutbox,
  readIndexedMarkets,
  readIndexedPositions,
  readIndexedFinancialTotals,
  readIndexedActivity,
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
      "TRUNCATE arc_reorg_notices,arc_event_outbox,arc_raw_events,arc_index_ranges,arc_index_checkpoint RESTART IDENTITY CASCADE",
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
    expect(await readOutbox(0n, pool!)).toEqual([
      expect.objectContaining({
        type: "protocol.reorg",
        payload: expect.objectContaining({ fromBlock: "100" }),
      }),
    ]);
  });
  it("rebuilds event-derived market, position, custody, and outbox reads from decoded receipts", async () => {
    const db = new ArcEventJournal(pool!, 100n);
    await db.migrate();
    await pool!.query(
      "TRUNCATE arc_reorg_notices,arc_event_outbox,arc_raw_events,arc_index_ranges,arc_index_checkpoint RESTART IDENTITY CASCADE",
    );
    const h = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}`;
    const market = h(3);
    const trader = "0x1111111111111111111111111111111111111111" as Address;
    const registration = parseAbiItem(
      "event MarketRegistered(bytes32 indexed marketId,bytes32 indexed originChain,bytes originToken)",
    );
    await db.commitRange(
      { number: 100n, hash: h(100), parentHash: h(99) },
      { number: 100n, hash: h(100), parentHash: h(99) },
      [
        {
          blockNumber: 100n,
          blockHash: h(100),
          transactionHash: h(501),
          transactionIndex: 0,
          logIndex: 0,
          address: "0x7ebddb2c1f1ae68a2e5b984fe9e75115cdb8ef1b" as Address,
          topics: encodeEventTopics({
            abi: [registration],
            eventName: "MarketRegistered",
            args: { marketId: market, originChain: h(5042) },
          }) as Hex[],
          data: encodeAbiParameters(parseAbiParameters("bytes"), ["0x1234"]),
        },
      ],
      2,
    );
    const position = parseAbiItem(
      "event PositionOpened(uint256 indexed positionId,address indexed trader,bytes32 indexed marketId,bool isLong,uint256 collateral,uint256 size,uint256 entryPrice)",
    );
    const deposit = parseAbiItem(
      "event CollateralDeposited(address indexed trader,uint256 amount)",
    );
    await db.commitRange(
      { number: 101n, hash: h(101), parentHash: h(100) },
      { number: 101n, hash: h(101), parentHash: h(100) },
      [
        {
          blockNumber: 101n,
          blockHash: h(101),
          transactionHash: h(502),
          transactionIndex: 0,
          logIndex: 0,
          address: "0xd9c3cbf1841103749f379cc1aae1a9284d8dc3e1" as Address,
          topics: encodeEventTopics({
            abi: [position],
            eventName: "PositionOpened",
            args: { positionId: 1n, trader, marketId: market },
          }) as Hex[],
          data: encodeAbiParameters(parseAbiParameters("bool,uint256,uint256,uint256"), [
            true,
            100n,
            200n,
            10n ** 18n,
          ]),
        },
        {
          blockNumber: 101n,
          blockHash: h(101),
          transactionHash: h(503),
          transactionIndex: 1,
          logIndex: 1,
          address: "0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf" as Address,
          topics: encodeEventTopics({
            abi: [deposit],
            eventName: "CollateralDeposited",
            args: { trader },
          }) as Hex[],
          data: encodeAbiParameters(parseAbiParameters("uint256"), [1_000_000n]),
        },
      ],
      2,
    );
    expect(await readIndexedMarkets(10, pool!)).toEqual([
      expect.objectContaining({
        marketId: market,
        verificationState: "EVENTS_ONLY_REQUIRES_PINNED_STATE_AND_ORACLE_EVIDENCE",
      }),
    ]);
    expect(await readIndexedPositions(10, pool!)).toEqual([
      expect.objectContaining({
        positionId: "1",
        eventDerivedSize: "200",
      }),
    ]);
    expect(await readIndexedFinancialTotals(pool!)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contract: "USDCMarginVault",
          eventName: "CollateralDeposited",
          reportedAmount: "1000000",
        }),
      ]),
    );
    expect(await readIndexedActivity("CUSTODY", 10, pool!)).toEqual([
      expect.objectContaining({
        eventName: "CollateralDeposited",
        transactionHash: h(503),
      }),
    ]);
    expect(await readOutbox(0n, pool!)).toHaveLength(3);
    await db.rewindFrom(101n);
    expect(await readIndexedPositions(10, pool!)).toHaveLength(0);
    expect(await readOutbox(0n, pool!)).toHaveLength(2);
  });
  it("aggregates LP shares and insurance coverage without double counting and removes them on rewind", async () => {
    const db = new ArcEventJournal(pool!, 100n);
    await db.migrate();
    await pool!.query(
      "TRUNCATE arc_reorg_notices,arc_event_outbox,arc_raw_events,arc_index_ranges,arc_index_checkpoint RESTART IDENTITY CASCADE",
    );
    const h = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}`;
    const account = "0x1111111111111111111111111111111111111111" as Address;
    const deposit = parseAbiItem(
      "event Deposited(address indexed account,uint256 assets,uint256 shares)",
    );
    const funded = parseAbiItem("event CapitalFunded(uint256 amount)");
    const debt = parseAbiItem(
      "event BadDebtRecorded(uint256 amount,uint256 covered,uint256 uncovered)",
    );
    await db.commitRange(
      { number: 100n, hash: h(100), parentHash: h(99) },
      { number: 100n, hash: h(100), parentHash: h(99) },
      [
        {
          blockNumber: 100n,
          blockHash: h(100),
          transactionHash: h(504),
          transactionIndex: 0,
          logIndex: 0,
          address: "0x9ff8358dc5ee866e0b9707d0139cf47b399f5257" as Address,
          topics: encodeEventTopics({
            abi: [deposit],
            eventName: "Deposited",
            args: { account },
          }) as Hex[],
          data: encodeAbiParameters(parseAbiParameters("uint256,uint256"), [10n, 10n]),
        },
        {
          blockNumber: 100n,
          blockHash: h(100),
          transactionHash: h(505),
          transactionIndex: 1,
          logIndex: 1,
          address: "0x8b0550babc3b802d89c17dfbee85828e14e6a22b" as Address,
          topics: encodeEventTopics({ abi: [funded], eventName: "CapitalFunded" }) as Hex[],
          data: encodeAbiParameters(parseAbiParameters("uint256"), [20n]),
        },
        {
          blockNumber: 100n,
          blockHash: h(100),
          transactionHash: h(506),
          transactionIndex: 2,
          logIndex: 2,
          address: "0x8b0550babc3b802d89c17dfbee85828e14e6a22b" as Address,
          topics: encodeEventTopics({ abi: [debt], eventName: "BadDebtRecorded" }) as Hex[],
          data: encodeAbiParameters(parseAbiParameters("uint256,uint256,uint256"), [4n, 3n, 1n]),
        },
      ],
      2,
    );
    expect(await readArcIndexLedger(pool!)).toMatchObject({
      lpSharesDeposited: 10n,
      insuranceCapitalFunded: 20n,
      insuranceBadDebtCovered: 3n,
      insuranceBadDebtUncovered: 1n,
    });
    await db.rewindFrom(100n);
    expect(await readArcIndexLedger(pool!)).toMatchObject({
      lpSharesDeposited: 0n,
      insuranceCapitalFunded: 0n,
      insuranceBadDebtCovered: 0n,
    });
  });
});
