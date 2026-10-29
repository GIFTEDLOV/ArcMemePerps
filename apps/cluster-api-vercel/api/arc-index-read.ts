import { Pool } from "pg";

const ARC_CHAIN_ID = 5042;
const DEPLOYMENT_START = 27246890n;
let pool: Pool | null = null;

export interface ArcIndexSnapshot {
  status: "INCOMPLETE";
  startBlock: string;
  throughBlock: string | null;
  ranges: number;
  gaps: number;
  singleSourceRanges: number;
  observedContractEvents: number;
  observedRegisteredMarkets: number;
  observedQualificationApprovals: number;
  qualifiedMarketCount: null;
  lastCommitAt: string | null;
}

export function indexDatabaseConfigured(): boolean {
  return Boolean(process.env.ARC_INDEX_DATABASE_URL);
}
function database(): Pool {
  if (!process.env.ARC_INDEX_DATABASE_URL) throw new Error("ARC_INDEX_DATABASE_URL_REQUIRED");
  pool ??= new Pool({
    connectionString: process.env.ARC_INDEX_DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 4_000,
    idleTimeoutMillis: 10_000,
  });
  return pool;
}

export async function readArcIndexSnapshot(
  connection: Pool = database(),
): Promise<ArcIndexSnapshot> {
  const result = await connection.query<{
    through_block: string | null;
    ranges: string;
    gaps: string;
    single_source_ranges: string;
    events: string;
    markets: string;
    approvals: string;
    last_commit_at: Date | null;
  }>(
    `WITH ordered AS (
      SELECT from_block,to_block,source_count,committed_at,
        lag(to_block) OVER (ORDER BY from_block) AS previous_end
      FROM arc_index_ranges WHERE chain_id=$1
    ) SELECT max(to_block) AS through_block,count(*) AS ranges,
      count(*) FILTER (WHERE from_block <> COALESCE(previous_end+1,$2::bigint)) AS gaps,
      count(*) FILTER (WHERE source_count<2) AS single_source_ranges,
      max(committed_at) AS last_commit_at,
      (SELECT count(*) FROM arc_raw_events WHERE chain_id=$1) AS events,
      (SELECT count(*) FROM arc_decoded_events WHERE chain_id=$1 AND event_name='MarketRegistered') AS markets,
      (SELECT count(*) FROM arc_decoded_events WHERE chain_id=$1 AND event_name='QualificationApproved') AS approvals
    FROM ordered`,
    [ARC_CHAIN_ID, DEPLOYMENT_START.toString()],
  );
  const row = result.rows[0]!;
  return {
    status: "INCOMPLETE",
    startBlock: DEPLOYMENT_START.toString(),
    throughBlock: row.through_block,
    ranges: Number(row.ranges),
    gaps: Number(row.gaps),
    singleSourceRanges: Number(row.single_source_ranges),
    observedContractEvents: Number(row.events),
    observedRegisteredMarkets: Number(row.markets),
    observedQualificationApprovals: Number(row.approvals),
    qualifiedMarketCount: null,
    lastCommitAt: row.last_commit_at?.toISOString() ?? null,
  };
}

export async function readIndexedMarkets(
  limit = 100,
  connection: Pool = database(),
): Promise<unknown[]> {
  const result = await connection.query(
    `SELECT market_id AS "marketId",arguments AS "registration",
      block_number::text AS "blockNumber",transaction_hash AS "transactionHash",log_index AS "logIndex"
      FROM arc_decoded_events WHERE chain_id=$1 AND event_name='MarketRegistered'
      ORDER BY block_number,transaction_hash,log_index LIMIT $2`,
    [ARC_CHAIN_ID, Math.min(100, Math.max(1, limit))],
  );
  return result.rows;
}

export interface OutboxEvent {
  id: string;
  payload: Record<string, unknown>;
  committedAt: Date;
}
export async function readOutbox(
  afterId: bigint,
  connection: Pool = database(),
): Promise<OutboxEvent[]> {
  const result = await connection.query<{
    id: string;
    payload: Record<string, unknown>;
    committed_at: Date;
  }>(
    `
    SELECT o.id::text AS id,o.payload,r.committed_at FROM arc_event_outbox o
    JOIN arc_index_ranges r ON r.chain_id=o.chain_id AND o.block_number BETWEEN r.from_block AND r.to_block
    WHERE o.chain_id=$1 AND o.id>$2 ORDER BY o.id LIMIT 100`,
    [ARC_CHAIN_ID, afterId.toString()],
  );
  return result.rows.map((row) => ({
    id: row.id,
    payload: row.payload,
    committedAt: row.committed_at,
  }));
}

export function parseResumeId(raw: string | null): bigint {
  if (!raw || !/^(0|[1-9][0-9]{0,18})$/.test(raw)) return 0n;
  return BigInt(raw);
}

export function formatIndexedSse(row: OutboxEvent): string {
  return `id: ${row.id}\nevent: protocol.event\ndata: ${JSON.stringify({
    id: row.id,
    sequence: row.id,
    type: "protocol.event",
    occurredAt: row.committedAt.toISOString(),
    payload: row.payload,
  })}\n\n`;
}

export function arcIndexStream(request: Request): Response {
  const url = new URL(request.url);
  let cursor = parseResumeId(request.headers.get("Last-Event-ID") ?? url.searchParams.get("after"));
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode("retry: 2000\n: receipt-backed Arc event stream\n\n"));
      const until = Date.now() + 24_000;
      while (!cancelled && Date.now() < until) {
        try {
          const rows = await readOutbox(cursor);
          for (const row of rows) {
            if (cancelled) break;
            controller.enqueue(encoder.encode(formatIndexedSse(row)));
            cursor = BigInt(row.id);
          }
          if (rows.length === 0)
            controller.enqueue(encoder.encode(`: heartbeat ${new Date().toISOString()}\n\n`));
        } catch {
          controller.enqueue(encoder.encode(": index unavailable\n\n"));
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      if (!cancelled) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    },
  });
}
