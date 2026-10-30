import { Pool } from "pg";
import { reconcileArcIndex, rpcParityReader } from "./arc-parity.js";
import { ARC_RPC } from "./arc-history.js";
import { safeIndexerErrorCode } from "./safe-error.js";

async function main(): Promise<void> {
  const raw =
    process.env.DATABASE_URL ||
    process.env.CLUSTER_INDEX_WORKER_DATABASE_URL ||
    process.env.ARC_INDEX_DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL_REQUIRED");
  const connectionString = raw.trim().replace(/^["']|["']$/g, "");
  const pool = new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 10_000,
  });
  try {
    const result = await reconcileArcIndex(
      pool,
      rpcParityReader(process.env.ARC_INDEX_RPC_PRIMARY || ARC_RPC),
    );
    process.stdout.write(JSON.stringify(result) + "\n");
    if (result.status !== "PASS_AT_PINNED_BLOCK") process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${safeIndexerErrorCode(error)}\n`);
  process.exitCode = 1;
});
