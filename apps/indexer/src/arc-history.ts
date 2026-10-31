import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { createPublicClient, http, type Address, type Hex, type PublicClient } from "viem";
import { decodeArcEvent } from "./arc-decode.js";

export const ARC_CHAIN_ID = 5042;
export const ARC_RPC = "https://rpc.mainnet.arc.io";
export const ARC_CONTRACTS = {
  USDCMarginVault: ["0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf", 27246890n],
  QualificationRegistry: ["0x67b175dd57d17d8ef4bd307d1a20a8d5438180e7", 27427039n],
  MarketRegistry: ["0x7ebddb2c1f1ae68a2e5b984fe9e75115cdb8ef1b", 27427043n],
  OracleRouter: ["0x1531c83ac90e5ec5998eaf42a4464757dcd2c3ff", 27427047n],
  RiskConfig: ["0x89ea15e527f7d06503ed2e7c958c2ac0e5799f85", 27427053n],
  InsuranceFund: ["0x8b0550babc3b802d89c17dfbee85828e14e6a22b", 27427057n],
  PerpEngine: ["0xd9c3cbf1841103749f379cc1aae1a9284d8dc3e1", 27427061n],
  PublicLPVault: ["0x9ff8358dc5ee866e0b9707d0139cf47b399f5257", 27427072n],
  ADLController: ["0x3c53f9f8d0c651c8a7e061872367274d8a8bf257", 27427076n],
  ProtocolTimelock: ["0xab0177c7fdad783faf27f145ecb95e92863fd4c2", 27427079n],
} as const;

export interface IndexedLog {
  blockNumber: bigint;
  blockHash: Hex;
  transactionHash: Hex;
  transactionIndex: number;
  logIndex: number;
  address: Address;
  topics: readonly Hex[];
  data: Hex;
}
export interface BlockAnchor {
  number: bigint;
  hash: Hex;
  parentHash: Hex;
}
export interface ArcEventSource {
  chainId(): Promise<number>;
  head(): Promise<bigint>;
  block(number: bigint): Promise<BlockAnchor>;
  logs(from: bigint, to: bigint, addresses: readonly Address[]): Promise<IndexedLog[]>;
  receipt(
    txHash: Hex,
  ): Promise<{ status: "success" | "reverted"; blockHash: Hex; logs: IndexedLog[] }>;
}

async function withRpcRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message.toLowerCase() : "";
      const isTransient =
        msg.includes("429") ||
        msg.includes("too many requests") ||
        msg.includes("rate limit") ||
        msg.includes("503") ||
        msg.includes("504") ||
        msg.includes("timeout") ||
        msg.includes("etimedout") ||
        msg.includes("econnreset") ||
        msg.includes("fetch failed");
      if (!isTransient && attempt > 0) throw error;
      const backoffMs = Math.min(300 * Math.pow(2, attempt) + Math.floor(Math.random() * 100), 3000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError;
}

export function rpcEventSource(url: string): ArcEventSource {
  const client: PublicClient = createPublicClient({
    transport: http(url, { timeout: 20_000, retryCount: 2 }),
  });
  return {
    chainId: () => client.getChainId(),
    head: () => client.getBlockNumber(),
    block: (number) =>
      withRpcRetry(async () => {
        const block = await client.getBlock({ blockNumber: number });
        return { number: block.number, hash: block.hash, parentHash: block.parentHash };
      }),
    logs: (from, to, addresses) =>
      withRpcRetry(async () => {
        const logs = await client.getLogs({ address: [...addresses], fromBlock: from, toBlock: to });
        return logs.map((log) => {
          if (
            log.blockNumber === null ||
            log.blockHash === null ||
            log.transactionHash === null ||
            log.transactionIndex === null ||
            log.logIndex === null ||
            log.topics[0] === undefined
          ) {
            throw new Error("INCOMPLETE_RPC_LOG");
          }
          return {
            blockNumber: log.blockNumber,
            blockHash: log.blockHash,
            transactionHash: log.transactionHash,
            transactionIndex: log.transactionIndex,
            logIndex: log.logIndex,
            address: log.address,
            topics: log.topics,
            data: log.data,
          };
        });
      }),
    async receipt(txHash) {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const receipt = await client.getTransactionReceipt({ hash: txHash });
          return {
            status: receipt.status,
            blockHash: receipt.blockHash,
            logs: receipt.logs
              .filter((log) => log.topics[0] !== undefined)
              .map((log) => ({
                blockNumber: log.blockNumber,
                blockHash: log.blockHash,
                transactionHash: log.transactionHash,
                transactionIndex: log.transactionIndex,
                logIndex: log.logIndex,
                address: log.address,
                topics: log.topics,
                data: log.data,
              })),
          };
        } catch (error) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      throw lastError;
    },
  };
}

export function logIdentity(log: IndexedLog): string {
  return `${log.blockNumber}:${log.blockHash.toLowerCase()}:${log.transactionHash.toLowerCase()}:${log.logIndex}:${log.address.toLowerCase()}:${log.topics.join(",").toLowerCase()}:${log.data.toLowerCase()}`;
}

export function compareProviderLogs(
  primary: readonly IndexedLog[],
  secondary: readonly IndexedLog[],
): void {
  const a = primary.map(logIdentity).sort();
  const b = secondary.map(logIdentity).sort();
  if (a.length !== b.length || a.some((key, index) => key !== b[index]))
    throw new Error("RPC_LOG_SOURCE_MISMATCH");
}

export async function verifyLogReceipts(
  source: ArcEventSource,
  logs: readonly IndexedLog[],
  addresses: readonly Address[],
  secondary: ArcEventSource | null = null,
): Promise<void> {
  const watched = new Set(addresses.map((address) => address.toLowerCase()));
  const byTransaction = new Map<string, IndexedLog[]>();
  for (const log of logs)
    byTransaction.set(log.transactionHash.toLowerCase(), [
      ...(byTransaction.get(log.transactionHash.toLowerCase()) ?? []),
      log,
    ]);
  for (const [txHash, expected] of byTransaction) {
    const responses = await Promise.allSettled([
      source.receipt(txHash as Hex),
      ...(secondary ? [secondary.receipt(txHash as Hex)] : []),
    ]);
    const fulfilled = responses.filter(
      (
        response,
      ): response is PromiseFulfilledResult<Awaited<ReturnType<ArcEventSource["receipt"]>>> =>
        response.status === "fulfilled",
    );
    if (fulfilled.length === 0) {
      const primaryFailure = responses[0];
      throw primaryFailure?.status === "rejected"
        ? primaryFailure.reason
        : new Error("RPC_RECEIPT_UNAVAILABLE");
    }

    // A provider may not retain an old receipt even when its logs are available.
    // Use the second, already log-matched RPC as receipt evidence in that case.
    // Any receipt that is returned must still agree with the indexed logs.
    for (const response of fulfilled) {
      const receipt = response.value;
      if (
        receipt.status !== "success" ||
        receipt.blockHash.toLowerCase() !== expected[0]!.blockHash.toLowerCase()
      )
        throw new Error("RPC_RECEIPT_STATUS_OR_BLOCK_MISMATCH");
      const actual = receipt.logs
        .filter((log) => watched.has(log.address.toLowerCase()))
        .map(logIdentity)
        .sort();
      const observed = expected.map(logIdentity).sort();
      if (actual.length !== observed.length || actual.some((id, index) => id !== observed[index]))
        throw new Error("RPC_RECEIPT_LOG_MISMATCH");
    }
  }
}

export class ArcEventJournal {
  constructor(
    readonly pool: Pool,
    readonly startBlock: bigint = ARC_CONTRACTS.USDCMarginVault[1],
  ) {}
  async migrate(): Promise<void> {
    for (const name of [
      "001_arc_events.sql",
      "002_arc_projections.sql",
      "003_arc_read_models.sql",
      "004_arc_reorg_notice.sql",
    ]) {
      const sql = await readFile(
        fileURLToPath(new URL(`../migrations/${name}`, import.meta.url)),
        "utf8",
      );
      await this.pool.query(sql);
    }
  }
  async checkpoint(): Promise<{ blockNumber: bigint; blockHash: Hex; sourceCount: number } | null> {
    const result = await this.pool.query<{
      block_number: string;
      block_hash: Hex;
      source_count: number;
    }>(
      "SELECT block_number, block_hash, source_count FROM arc_index_checkpoint WHERE chain_id = $1",
      [ARC_CHAIN_ID],
    );
    const row = result.rows[0];
    return row
      ? {
          blockNumber: BigInt(row.block_number),
          blockHash: row.block_hash,
          sourceCount: row.source_count,
        }
      : null;
  }
  async commitRange(
    from: BlockAnchor,
    to: BlockAnchor,
    logs: readonly IndexedLog[],
    sourceCount: number,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [ARC_CHAIN_ID]);
      const current = await client.query<{ block_number: string; block_hash: string }>(
        "SELECT block_number, block_hash FROM arc_index_checkpoint WHERE chain_id=$1 FOR UPDATE",
        [ARC_CHAIN_ID],
      );
      const prior = current.rows[0];
      if (prior ? BigInt(prior.block_number) + 1n !== from.number : from.number !== this.startBlock)
        throw new Error("INDEX_RANGE_GAP");
      if (prior && from.parentHash.toLowerCase() !== prior.block_hash.toLowerCase())
        throw new Error("INDEX_PARENT_HASH_MISMATCH");
      for (const log of logs) {
        if (
          log.blockNumber < from.number ||
          log.blockNumber > to.number ||
          log.topics[0] === undefined
        )
          throw new Error("INDEX_LOG_OUT_OF_RANGE");
        await client.query(
          `INSERT INTO arc_raw_events
          (chain_id,block_number,block_hash,transaction_hash,transaction_index,log_index,emitter,topic0,topics,data)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
          [
            ARC_CHAIN_ID,
            log.blockNumber.toString(),
            log.blockHash.toLowerCase(),
            log.transactionHash.toLowerCase(),
            log.transactionIndex,
            log.logIndex,
            log.address.toLowerCase(),
            log.topics[0].toLowerCase(),
            JSON.stringify(log.topics),
            log.data.toLowerCase(),
          ],
        );
        const decoded = decodeArcEvent(log);
        if (decoded)
          await client.query(
            `INSERT INTO arc_decoded_events
          (chain_id,block_number,transaction_hash,log_index,contract_name,event_name,category,market_id,account,position_id,arguments,decode_version)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1) ON CONFLICT DO NOTHING`,
            [
              ARC_CHAIN_ID,
              log.blockNumber.toString(),
              log.transactionHash.toLowerCase(),
              log.logIndex,
              decoded.contractName,
              decoded.eventName,
              decoded.category,
              decoded.marketId,
              decoded.account,
              decoded.positionId,
              JSON.stringify(decoded.arguments),
            ],
          );
        await client.query(
          `INSERT INTO arc_event_outbox (chain_id,block_number,transaction_hash,log_index,event_type,payload)
          VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
          [
            ARC_CHAIN_ID,
            log.blockNumber.toString(),
            log.transactionHash.toLowerCase(),
            log.logIndex,
            decoded?.eventName ?? "ARC_CONTRACT_LOG",
            JSON.stringify({
              blockNumber: log.blockNumber.toString(),
              blockHash: log.blockHash,
              emitter: log.address,
              topic0: log.topics[0],
              transactionHash: log.transactionHash,
              logIndex: log.logIndex,
              contract: decoded?.contractName ?? null,
              category: decoded?.category ?? null,
              args: decoded?.arguments ?? null,
            }),
          ],
        );
      }
      await client.query(
        `INSERT INTO arc_index_ranges
        (chain_id,from_block,to_block,from_hash,to_hash,event_count,source_count)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          ARC_CHAIN_ID,
          from.number.toString(),
          to.number.toString(),
          from.hash.toLowerCase(),
          to.hash.toLowerCase(),
          logs.length,
          sourceCount,
        ],
      );
      await client.query(
        `INSERT INTO arc_index_checkpoint
        (chain_id,deployment_start,block_number,block_hash,source_count)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (chain_id) DO UPDATE SET block_number=EXCLUDED.block_number,
          block_hash=EXCLUDED.block_hash,source_count=LEAST(arc_index_checkpoint.source_count,EXCLUDED.source_count),updated_at=now()`,
        [
          ARC_CHAIN_ID,
          this.startBlock.toString(),
          to.number.toString(),
          to.hash.toLowerCase(),
          sourceCount,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async rewindFrom(block: bigint): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [ARC_CHAIN_ID]);
      const old = await client.query<{ block_number: string; block_hash: string }>(
        "SELECT block_number,block_hash FROM arc_index_checkpoint WHERE chain_id=$1 FOR UPDATE",
        [ARC_CHAIN_ID],
      );
      const checkpoint = old.rows[0];
      if (checkpoint && BigInt(checkpoint.block_number) >= block)
        await client.query(
          `INSERT INTO arc_reorg_notices
          (chain_id,from_block,previous_through,previous_checkpoint_hash) VALUES ($1,$2,$3,$4)`,
          [ARC_CHAIN_ID, block.toString(), checkpoint.block_number, checkpoint.block_hash],
        );
      await client.query("DELETE FROM arc_index_ranges WHERE chain_id=$1 AND from_block >= $2", [
        ARC_CHAIN_ID,
        block.toString(),
      ]);
      await client.query("DELETE FROM arc_raw_events WHERE chain_id=$1 AND block_number >= $2", [
        ARC_CHAIN_ID,
        block.toString(),
      ]);
      const prior = await client.query<{ to_block: string; to_hash: Hex; source_count: number }>(
        "SELECT to_block,to_hash,source_count FROM arc_index_ranges WHERE chain_id=$1 ORDER BY to_block DESC LIMIT 1",
        [ARC_CHAIN_ID],
      );
      const row = prior.rows[0];
      if (row)
        await client.query(
          "UPDATE arc_index_checkpoint SET block_number=$2,block_hash=$3,source_count=$4,updated_at=now() WHERE chain_id=$1",
          [ARC_CHAIN_ID, row.to_block, row.to_hash, row.source_count],
        );
      else await client.query("DELETE FROM arc_index_checkpoint WHERE chain_id=$1", [ARC_CHAIN_ID]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async latestRange(): Promise<{ from: bigint; to: bigint; hash: Hex } | null> {
    const result = await this.pool.query<{ from_block: string; to_block: string; to_hash: Hex }>(
      "SELECT from_block,to_block,to_hash FROM arc_index_ranges WHERE chain_id=$1 ORDER BY to_block DESC LIMIT 1",
      [ARC_CHAIN_ID],
    );
    const row = result.rows[0];
    return row
      ? { from: BigInt(row.from_block), to: BigInt(row.to_block), hash: row.to_hash }
      : null;
  }
  async coverage(): Promise<{
    start: bigint;
    end: bigint | null;
    ranges: number;
    events: number;
    singleSourceRanges: number;
    gaps: number;
  }> {
    const result = await this.pool.query<{
      start: string;
      end: string | null;
      ranges: string;
      events: string;
      single_source: string;
      gaps: string;
    }>(
      `
      WITH ordered AS (SELECT from_block,to_block,source_count,
        lag(to_block) OVER (ORDER BY from_block) AS previous_end FROM arc_index_ranges WHERE chain_id=$1)
      SELECT $2::bigint AS start,max(to_block) AS end,count(*) AS ranges,
        (SELECT count(*) FROM arc_raw_events WHERE chain_id=$1) AS events,
        count(*) FILTER (WHERE source_count<2) AS single_source,
        count(*) FILTER (WHERE from_block <> COALESCE(previous_end+1,$2::bigint)) AS gaps FROM ordered`,
      [ARC_CHAIN_ID, this.startBlock.toString()],
    );
    const row = result.rows[0]!;
    return {
      start: BigInt(row.start),
      end: row.end === null ? null : BigInt(row.end),
      ranges: Number(row.ranges),
      events: Number(row.events),
      singleSourceRanges: Number(row.single_source),
      gaps: Number(row.gaps),
    };
  }
}

export interface IndexRunOptions {
  windowSize?: bigint;
  finalityDepth?: bigint;
  maxWindows?: number;
}

export async function indexArcHistory(
  journal: ArcEventJournal,
  primary: ArcEventSource,
  secondary: ArcEventSource | null,
  options: IndexRunOptions = {},
): Promise<{ windows: number; through: bigint | null }> {
  if (
    (await primary.chainId()) !== ARC_CHAIN_ID ||
    (secondary && (await secondary.chainId()) !== ARC_CHAIN_ID)
  )
    throw new Error("WRONG_ARC_CHAIN");
  const finalityDepth = options.finalityDepth ?? 64n;
  const windowSize = options.windowSize ?? 250n;
  if (finalityDepth < 0n || windowSize < 1n || windowSize > 2000n)
    throw new Error("INVALID_INDEX_OPTIONS");
  const heads = [await primary.head(), ...(secondary ? [await secondary.head()] : [])];
  const lowestHead = heads.reduce((a, b) => (a < b ? a : b));
  const finalized = lowestHead - finalityDepth;
  if (finalized < journal.startBlock) return { windows: 0, through: null };
  const addresses = Object.values(ARC_CONTRACTS).map(([address]) => address as Address);
  let windows = 0;
  let activeWindow = windowSize;
  while (windows < (options.maxWindows ?? Number.MAX_SAFE_INTEGER)) {
    const checkpoint = await journal.checkpoint();
    if (checkpoint) {
      const canonical = await primary.block(checkpoint.blockNumber);
      if (canonical.hash.toLowerCase() !== checkpoint.blockHash.toLowerCase()) {
        const last = await journal.latestRange();
        if (!last) throw new Error("CHECKPOINT_WITHOUT_RANGE");
        await journal.rewindFrom(last.from);
        continue;
      }
    }
    const fromNumber = checkpoint ? checkpoint.blockNumber + 1n : journal.startBlock;
    if (fromNumber > finalized) return { windows, through: checkpoint?.blockNumber ?? null };
    const toNumber =
      fromNumber + activeWindow - 1n < finalized ? fromNumber + activeWindow - 1n : finalized;
    let from: BlockAnchor;
    let to: BlockAnchor;
    let logs: IndexedLog[];
    try {
      [from, to, logs] = await Promise.all([
        primary.block(fromNumber),
        primary.block(toNumber),
        primary.logs(fromNumber, toNumber, addresses),
      ]);
    } catch (error) {
      if (activeWindow === 1n) {
        if (windows > 0) return { windows, through: (await journal.checkpoint())?.blockNumber ?? null };
        throw error;
      }
      activeWindow = activeWindow / 2n;
      continue;
    }
    if (
      from.number !== fromNumber ||
      to.number !== toNumber ||
      (checkpoint && from.parentHash.toLowerCase() !== checkpoint.blockHash.toLowerCase())
    )
      throw new Error("RPC_BLOCK_GAP_OR_REORG");
    if (secondary) {
      let otherFrom: BlockAnchor;
      let otherTo: BlockAnchor;
      let otherLogs: IndexedLog[];
      try {
        [otherFrom, otherTo, otherLogs] = await Promise.all([
          secondary.block(fromNumber),
          secondary.block(toNumber),
          secondary.logs(fromNumber, toNumber, addresses),
        ]);
      } catch (error) {
        if (activeWindow === 1n) {
          if (windows > 0) return { windows, through: (await journal.checkpoint())?.blockNumber ?? null };
          throw error;
        }
        activeWindow = activeWindow / 2n;
        continue;
      }
      if (
        otherFrom.hash.toLowerCase() !== from.hash.toLowerCase() ||
        otherTo.hash.toLowerCase() !== to.hash.toLowerCase()
      )
        throw new Error("RPC_BLOCK_SOURCE_MISMATCH");
      compareProviderLogs(logs, otherLogs);
    }
    await verifyLogReceipts(primary, logs, addresses, secondary);
    const accepted = logs.filter((log) => {
      const contract = Object.values(ARC_CONTRACTS).find(
        ([address]) => address.toLowerCase() === log.address.toLowerCase(),
      );
      return contract && log.blockNumber >= contract[1];
    });
    if (accepted.length !== logs.length) throw new Error("PRE_DEPLOYMENT_CONTRACT_LOG");
    await journal.commitRange(from, to, accepted, secondary ? 2 : 1);
    windows++;
    if (activeWindow < windowSize)
      activeWindow = activeWindow * 2n > windowSize ? windowSize : activeWindow * 2n;
    if (windows < (options.maxWindows ?? Number.MAX_SAFE_INTEGER)) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }
  return { windows, through: (await journal.checkpoint())?.blockNumber ?? null };
}

export function journalFromEnvironment(): ArcEventJournal {
  const raw =
    process.env.DATABASE_URL ||
    process.env.CLUSTER_INDEX_WORKER_DATABASE_URL ||
    process.env.ARC_INDEX_DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL_REQUIRED");
  const connectionString = raw.trim().replace(/^["']|["']$/g, "");
  return new ArcEventJournal(
    new Pool({
      connectionString,
      max: 3,
      connectionTimeoutMillis: 10_000,
    }),
  );
}

/** Apply idempotent schema migrations using a dedicated owner connection. */
export async function migrateArcIndexer(): Promise<void> {
  const raw =
    process.env.ARC_INDEX_MIGRATION_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.CLUSTER_INDEX_WORKER_DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL_REQUIRED");
  const connectionString = raw.trim().replace(/^["']|["']$/g, "");
  const journal = new ArcEventJournal(
    new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 }),
  );
  try {
    await journal.migrate();
  } finally {
    await journal.pool.end();
  }
}

export const ARC_INDEX_WORKER_LOCK_ID = 5042001n;

export async function runArcIndexer(): Promise<void> {
  const journal = journalFromEnvironment();
  const lockClient = await journal.pool.connect();
  let lockAcquired = false;
  try {
    const lockRes = await lockClient.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [ARC_INDEX_WORKER_LOCK_ID.toString()],
    );
    if (!lockRes.rows[0]?.locked) {
      process.stdout.write(
        JSON.stringify({ status: "SKIPPED_CONCURRENT_INDEXER_RUNNING", chainId: ARC_CHAIN_ID }) + "\n",
      );
      return;
    }
    lockAcquired = true;

    const primary = rpcEventSource(process.env.ARC_INDEX_RPC_PRIMARY || ARC_RPC);
    const secondary = process.env.ARC_INDEX_RPC_SECONDARY
      ? rpcEventSource(process.env.ARC_INDEX_RPC_SECONDARY)
      : null;
    const maxWindows = process.env.ARC_INDEX_MAX_WINDOWS
      ? parseInt(process.env.ARC_INDEX_MAX_WINDOWS, 10)
      : 25;
    const options: IndexRunOptions = { maxWindows };
    if (process.env.ARC_INDEX_WINDOW_SIZE) {
      options.windowSize = BigInt(process.env.ARC_INDEX_WINDOW_SIZE);
    }
    const result = await indexArcHistory(journal, primary, secondary, options);
    process.stdout.write(
      JSON.stringify(
        {
          ...result,
          through: result.through?.toString() ?? null,
          coverage: await journal.coverage(),
        },
        (_, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
      ) + "\n",
    );
  } finally {
    if (lockAcquired) {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [ARC_INDEX_WORKER_LOCK_ID.toString()]).catch(() => {});
    }
    lockClient.release();
    await journal.pool.end();
  }
}
