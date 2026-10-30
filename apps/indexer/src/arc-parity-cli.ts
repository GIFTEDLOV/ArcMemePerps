import { Pool } from "pg";
import { reconcileArcIndex, rpcParityReader } from "./arc-parity.js";
import { ARC_RPC } from "./arc-history.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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
