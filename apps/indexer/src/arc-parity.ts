import type { Pool } from "pg";
import { createPublicClient, http, parseAbi, type Address, type Hex } from "viem";
import { ARC_CHAIN_ID, ARC_CONTRACTS, ARC_RPC, type BlockAnchor } from "./arc-history.js";

const USDC = "0x3600000000000000000000000000000000000000" as Address;
const NUMBER_ABI = parseAbi([
  "function totalShares() view returns (uint256)",
  "function availableCapital() view returns (uint256)",
  "function badDebtCovered() view returns (uint256)",
  "function uncoveredBadDebt() view returns (uint256)",
  "function actualCustodyUsdc() view returns (uint256)",
  "function expectedCustodyUsdc() view returns (uint256)",
]);
const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);
type NumberGetter =
  | "totalShares"
  | "availableCapital"
  | "badDebtCovered"
  | "uncoveredBadDebt"
  | "actualCustodyUsdc"
  | "expectedCustodyUsdc";

export interface ArcParityReader {
  chainId(): Promise<number>;
  head(): Promise<bigint>;
  block(number: bigint): Promise<BlockAnchor>;
  value(address: Address, getter: NumberGetter, blockNumber: bigint): Promise<bigint>;
  usdcBalance(address: Address, blockNumber: bigint): Promise<bigint>;
}

export function rpcParityReader(url = ARC_RPC): ArcParityReader {
  const client = createPublicClient({ transport: http(url, { timeout: 20_000, retryCount: 2 }) });
  return {
    chainId: () => client.getChainId(),
    head: () => client.getBlockNumber(),
    async block(number) {
      const value = await client.getBlock({ blockNumber: number });
      return { number: value.number, hash: value.hash, parentHash: value.parentHash };
    },
    value: (address, getter, blockNumber) =>
      client.readContract({ address, abi: NUMBER_ABI, functionName: getter, blockNumber }),
    usdcBalance: (address, blockNumber) =>
      client.readContract({
        address: USDC,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
        blockNumber,
      }),
  };
}

export interface ArcIndexLedger {
  checkpointBlock: bigint | null;
  checkpointHash: Hex | null;
  coveredThrough: bigint | null;
  rangeCount: number;
  gaps: number;
  singleSourceRanges: number;
  lpSharesDeposited: bigint;
  lpSharesWithdrawn: bigint;
  insuranceCapitalFunded: bigint;
  insuranceBadDebtCovered: bigint;
  insuranceBadDebtUncovered: bigint;
}

/** A single repeatable-read snapshot keeps checkpoint, coverage and totals aligned. */
export async function readArcIndexLedger(pool: Pool): Promise<ArcIndexLedger> {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const checkpoint = await connection.query<{ block_number: string; block_hash: Hex }>(
      "SELECT block_number,block_hash FROM arc_index_checkpoint WHERE chain_id=$1",
      [ARC_CHAIN_ID],
    );
    const coverage = await connection.query<{
      through: string | null;
      ranges: string;
      gaps: string;
      single: string;
    }>(
      `
      WITH ordered AS (SELECT from_block,to_block,source_count,
        lag(to_block) OVER (ORDER BY from_block) AS previous_end
        FROM arc_index_ranges WHERE chain_id=$1)
      SELECT max(to_block) AS through,count(*) AS ranges,
        count(*) FILTER (WHERE from_block <> COALESCE(previous_end+1,$2::bigint)) AS gaps,
        count(*) FILTER (WHERE source_count<2) AS single FROM ordered`,
      [ARC_CHAIN_ID, ARC_CONTRACTS.USDCMarginVault[1].toString()],
    );
    const sums = await connection.query<{
      lp_deposited: string;
      lp_withdrawn: string;
      insurance_funded: string;
      insurance_covered: string;
      insurance_uncovered: string;
    }>(
      `SELECT
      COALESCE(sum((arguments->>'shares')::numeric) FILTER
        (WHERE contract_name='PublicLPVault' AND event_name='Deposited'),0)::text AS lp_deposited,
      COALESCE(sum((arguments->>'shares')::numeric) FILTER
        (WHERE contract_name='PublicLPVault' AND event_name='Withdrawn'),0)::text AS lp_withdrawn,
      COALESCE(sum((arguments->>'amount')::numeric) FILTER
        (WHERE contract_name='InsuranceFund' AND event_name='CapitalFunded'),0)::text AS insurance_funded,
      COALESCE(sum((arguments->>'covered')::numeric) FILTER
        (WHERE contract_name='InsuranceFund' AND event_name='BadDebtRecorded'),0)::text AS insurance_covered,
      COALESCE(sum((arguments->>'uncovered')::numeric) FILTER
        (WHERE contract_name='InsuranceFund' AND event_name='BadDebtRecorded'),0)::text AS insurance_uncovered
      FROM arc_decoded_events WHERE chain_id=$1`,
      [ARC_CHAIN_ID],
    );
    await connection.query("COMMIT");
    const c = checkpoint.rows[0],
      r = coverage.rows[0]!,
      s = sums.rows[0]!;
    return {
      checkpointBlock: c ? BigInt(c.block_number) : null,
      checkpointHash: c?.block_hash ?? null,
      coveredThrough: r.through === null ? null : BigInt(r.through),
      rangeCount: Number(r.ranges),
      gaps: Number(r.gaps),
      singleSourceRanges: Number(r.single),
      lpSharesDeposited: BigInt(s.lp_deposited),
      lpSharesWithdrawn: BigInt(s.lp_withdrawn),
      insuranceCapitalFunded: BigInt(s.insurance_funded),
      insuranceBadDebtCovered: BigInt(s.insurance_covered),
      insuranceBadDebtUncovered: BigInt(s.insurance_uncovered),
    };
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

export interface ArcChainLedger {
  block: BlockAnchor;
  head: bigint;
  lpShares: bigint;
  insuranceAvailable: bigint;
  insuranceCovered: bigint;
  insuranceUncovered: bigint;
  marginActual: bigint;
  marginExpected: bigint;
  marginUsdcBalance: bigint;
  lpActual: bigint;
  lpExpected: bigint;
  lpUsdcBalance: bigint;
  insuranceActual: bigint;
  insuranceUsdcBalance: bigint;
}

export async function readArcChainLedger(
  reader: ArcParityReader,
  blockNumber: bigint,
): Promise<ArcChainLedger> {
  if ((await reader.chainId()) !== ARC_CHAIN_ID) throw new Error("WRONG_ARC_CHAIN");
  const vault = ARC_CONTRACTS.USDCMarginVault[0] as Address;
  const lp = ARC_CONTRACTS.PublicLPVault[0] as Address;
  const insurance = ARC_CONTRACTS.InsuranceFund[0] as Address;
  const [
    block,
    head,
    lpShares,
    insuranceAvailable,
    insuranceCovered,
    insuranceUncovered,
    marginActual,
    marginExpected,
    marginUsdcBalance,
    lpActual,
    lpExpected,
    lpUsdcBalance,
    insuranceActual,
    insuranceUsdcBalance,
  ] = await Promise.all([
    reader.block(blockNumber),
    reader.head(),
    reader.value(lp, "totalShares", blockNumber),
    reader.value(insurance, "availableCapital", blockNumber),
    reader.value(insurance, "badDebtCovered", blockNumber),
    reader.value(insurance, "uncoveredBadDebt", blockNumber),
    reader.value(vault, "actualCustodyUsdc", blockNumber),
    reader.value(vault, "expectedCustodyUsdc", blockNumber),
    reader.usdcBalance(vault, blockNumber),
    reader.value(lp, "actualCustodyUsdc", blockNumber),
    reader.value(lp, "expectedCustodyUsdc", blockNumber),
    reader.usdcBalance(lp, blockNumber),
    reader.value(insurance, "actualCustodyUsdc", blockNumber),
    reader.usdcBalance(insurance, blockNumber),
  ]);
  return {
    block,
    head,
    lpShares,
    insuranceAvailable,
    insuranceCovered,
    insuranceUncovered,
    marginActual,
    marginExpected,
    marginUsdcBalance,
    lpActual,
    lpExpected,
    lpUsdcBalance,
    insuranceActual,
    insuranceUsdcBalance,
  };
}

export interface ArcParityResult {
  status: "PASS_AT_PINNED_BLOCK" | "FAIL" | "INCOMPLETE";
  blockNumber: string | null;
  blockHash: Hex | null;
  checks: Record<string, boolean>;
  reasons: readonly string[];
}

export function evaluateArcParity(
  index: ArcIndexLedger,
  chain: ArcChainLedger,
  finalityDepth = 64n,
): ArcParityResult {
  const reasons: string[] = [];
  if (index.checkpointBlock === null || index.checkpointHash === null || index.rangeCount === 0)
    reasons.push("INDEX_EMPTY");
  if (index.gaps !== 0) reasons.push("INDEX_GAPS");
  if (index.singleSourceRanges !== 0) reasons.push("INDEX_SINGLE_SOURCE_RANGES");
  if (index.coveredThrough !== index.checkpointBlock)
    reasons.push("INDEX_CHECKPOINT_COVERAGE_MISMATCH");
  if (index.checkpointBlock !== null && index.checkpointBlock < chain.head - finalityDepth)
    reasons.push("INDEX_BEHIND_FINALIZED_HEAD");
  if (
    index.checkpointBlock !== chain.block.number ||
    index.checkpointHash?.toLowerCase() !== chain.block.hash.toLowerCase()
  )
    reasons.push("PINNED_BLOCK_HASH_MISMATCH");
  const checks = {
    lpShares:
      index.lpSharesDeposited >= index.lpSharesWithdrawn &&
      index.lpSharesDeposited - index.lpSharesWithdrawn === chain.lpShares,
    insuranceAvailable:
      index.insuranceCapitalFunded >= index.insuranceBadDebtCovered &&
      index.insuranceCapitalFunded - index.insuranceBadDebtCovered === chain.insuranceAvailable,
    insuranceCovered: index.insuranceBadDebtCovered === chain.insuranceCovered,
    insuranceUncovered: index.insuranceBadDebtUncovered === chain.insuranceUncovered,
    marginCustody:
      chain.marginActual === chain.marginExpected && chain.marginActual === chain.marginUsdcBalance,
    lpCustody: chain.lpActual === chain.lpExpected && chain.lpActual === chain.lpUsdcBalance,
    insuranceCustody:
      chain.insuranceActual === chain.insuranceUsdcBalance &&
      chain.insuranceActual >= chain.insuranceAvailable,
  };
  for (const [key, pass] of Object.entries(checks))
    if (!pass)
      reasons.push(`${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_MISMATCH`);
  const incomplete = reasons.some(
    (reason) => reason.startsWith("INDEX_") || reason === "PINNED_BLOCK_HASH_MISMATCH",
  );
  return {
    status: incomplete ? "INCOMPLETE" : reasons.length > 0 ? "FAIL" : "PASS_AT_PINNED_BLOCK",
    blockNumber: index.checkpointBlock?.toString() ?? null,
    blockHash: index.checkpointHash,
    checks,
    reasons,
  };
}

export async function reconcileArcIndex(
  pool: Pool,
  reader: ArcParityReader,
): Promise<ArcParityResult> {
  const index = await readArcIndexLedger(pool);
  if (index.checkpointBlock === null)
    return {
      status: "INCOMPLETE",
      blockNumber: null,
      blockHash: null,
      checks: {},
      reasons: ["INDEX_EMPTY"],
    };
  const chain = await readArcChainLedger(reader, index.checkpointBlock);
  const after = await pool.query<{ block_number: string; block_hash: Hex }>(
    "SELECT block_number,block_hash FROM arc_index_checkpoint WHERE chain_id=$1",
    [ARC_CHAIN_ID],
  );
  const current = after.rows[0];
  if (
    !current ||
    BigInt(current.block_number) !== index.checkpointBlock ||
    current.block_hash.toLowerCase() !== index.checkpointHash?.toLowerCase()
  )
    return {
      status: "INCOMPLETE",
      blockNumber: index.checkpointBlock.toString(),
      blockHash: index.checkpointHash,
      checks: {},
      reasons: ["INDEX_CHANGED_DURING_RECONCILIATION"],
    };
  const depth = process.env.ARC_INDEX_FINALITY_DEPTH
    ? BigInt(process.env.ARC_INDEX_FINALITY_DEPTH)
    : 64n;
  return evaluateArcParity(index, chain, depth);
}
