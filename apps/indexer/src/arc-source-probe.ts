import { createPublicClient, http, type Hex } from "viem";
import {
  ARC_CHAIN_ID,
  ARC_CONTRACTS,
  ARC_RPC,
  compareProviderLogs,
  rpcEventSource,
  verifyLogReceipts,
} from "./arc-history.js";
import { decodeArcEvent } from "./arc-decode.js";

// Read-only archive capability probe. A successful sample is not a complete backfill.
const rpc = process.env.ARC_INDEX_RPC_PRIMARY || ARC_RPC;
const secondaryRpc = process.env.ARC_INDEX_RPC_SECONDARY || null;
const depositTx = "0x7dd1dfeddc682e745ed84ba885ad3fd800400952522b03cc1126fd81915c4dc9";

export type SourceProbeFailureCode =
  | "HISTORICAL_RECEIPT_UNAVAILABLE"
  | "RPC_QUERY_FAILED"
  | "WRONG_ARC_CHAIN"
  | "DEPOSIT_RECEIPT_MISMATCH"
  | "HISTORICAL_LOG_MISSING"
  | "RPC_SOURCE_MISMATCH"
  | "SECONDARY_RPC_QUERY_FAILED"
  | "RPC_RECEIPT_STATUS_OR_BLOCK_MISMATCH"
  | "DEPOSIT_EVENT_DECODE_MISMATCH"
  | "SOURCE_PROBE_VALIDATION_FAILED";

const knownFailures = new Set<SourceProbeFailureCode>([
  "WRONG_ARC_CHAIN",
  "DEPOSIT_RECEIPT_MISMATCH",
  "HISTORICAL_LOG_MISSING",
  "RPC_SOURCE_MISMATCH",
  "RPC_RECEIPT_STATUS_OR_BLOCK_MISMATCH",
  "DEPOSIT_EVENT_DECODE_MISMATCH",
]);

export function classifySourceProbeFailure(error: unknown): SourceProbeFailureCode {
  if (!(error instanceof Error)) return "RPC_QUERY_FAILED";
  if (error.name === "TransactionReceiptNotFoundError") return "HISTORICAL_RECEIPT_UNAVAILABLE";
  if (knownFailures.has(error.message as SourceProbeFailureCode))
    return error.message as SourceProbeFailureCode;
  return "RPC_QUERY_FAILED";
}

async function runProbe(): Promise<void> {
  const source = rpcEventSource(rpc);
  const client = createPublicClient({ transport: http(rpc, { timeout: 20_000, retryCount: 1 }) });
  const [chainIdResult, headResult, deploymentResult, receiptResult, logsResult] =
    await Promise.allSettled([
      source.chainId(),
      source.head(),
      source.block(ARC_CONTRACTS.USDCMarginVault[1]),
      client.getTransactionReceipt({ hash: depositTx }),
      source.logs(ARC_CONTRACTS.USDCMarginVault[1], ARC_CONTRACTS.USDCMarginVault[1] + 10n, [
        ARC_CONTRACTS.USDCMarginVault[0],
      ]),
    ]);

  const failures = [
    ...(chainIdResult.status === "rejected"
      ? [{ query: "chainId", reason: classifySourceProbeFailure(chainIdResult.reason) }]
      : []),
    ...(headResult.status === "rejected"
      ? [{ query: "head", reason: classifySourceProbeFailure(headResult.reason) }]
      : []),
    ...(deploymentResult.status === "rejected"
      ? [{ query: "deploymentBlock", reason: classifySourceProbeFailure(deploymentResult.reason) }]
      : []),
    ...(receiptResult.status === "rejected"
      ? [{ query: "historicalReceipt", reason: classifySourceProbeFailure(receiptResult.reason) }]
      : []),
    ...(logsResult.status === "rejected"
      ? [{ query: "historicalLogs", reason: classifySourceProbeFailure(logsResult.reason) }]
      : []),
  ];
  if (failures.length > 0) {
    process.stdout.write(
      JSON.stringify({
        status: "INCOMPLETE",
        chainId: chainIdResult.status === "fulfilled" ? chainIdResult.value : null,
        head: headResult.status === "fulfilled" ? headResult.value.toString() : null,
        failures,
      }) + "\n",
    );
    process.exitCode = 1;
    return;
  }

  // The rejected-result guard above narrows these to fulfilled results.
  if (
    chainIdResult.status !== "fulfilled" ||
    headResult.status !== "fulfilled" ||
    deploymentResult.status !== "fulfilled" ||
    receiptResult.status !== "fulfilled" ||
    logsResult.status !== "fulfilled"
  )
    throw new Error("SOURCE_PROBE_VALIDATION_FAILED");
  const chainId = chainIdResult.value;
  const head = headResult.value;
  const deployment = deploymentResult.value;
  const receipt = receiptResult.value;
  const logs = logsResult.value;

  if (chainId !== ARC_CHAIN_ID) throw new Error("WRONG_ARC_CHAIN");
  if (receipt.status !== "success" || receipt.blockNumber !== 27246895n)
    throw new Error("DEPOSIT_RECEIPT_MISMATCH");
  if (!logs.some((log) => log.transactionHash.toLowerCase() === depositTx))
    throw new Error("HISTORICAL_LOG_MISSING");
  await verifyLogReceipts(source, logs, [ARC_CONTRACTS.USDCMarginVault[0]]);
  const depositLog = logs.find((log) => log.transactionHash.toLowerCase() === depositTx)!;
  const decoded = decodeArcEvent(depositLog);
  if (decoded?.eventName !== "CollateralDeposited" || decoded.arguments.amount !== "1000000")
    throw new Error("DEPOSIT_EVENT_DECODE_MISMATCH");
  let secondaryHead: bigint | null = null;
  if (secondaryRpc) {
    const secondary = rpcEventSource(secondaryRpc);
    try {
      const [secondaryChainId, observedHead, secondaryDeployment, secondaryLogs, secondaryReceipt] =
        await Promise.all([
          secondary.chainId(),
          secondary.head(),
          secondary.block(ARC_CONTRACTS.USDCMarginVault[1]),
          secondary.logs(ARC_CONTRACTS.USDCMarginVault[1], ARC_CONTRACTS.USDCMarginVault[1] + 10n, [
            ARC_CONTRACTS.USDCMarginVault[0],
          ]),
          secondary.receipt(depositTx as Hex),
        ]);
      if (
        secondaryChainId !== chainId ||
        secondaryDeployment.hash.toLowerCase() !== deployment.hash.toLowerCase() ||
        secondaryReceipt.status !== receipt.status ||
        secondaryReceipt.blockHash.toLowerCase() !== receipt.blockHash.toLowerCase()
      )
        throw new Error("RPC_SOURCE_MISMATCH");
      compareProviderLogs(logs, secondaryLogs);
      await verifyLogReceipts(secondary, secondaryLogs, [ARC_CONTRACTS.USDCMarginVault[0]]);
      secondaryHead = observedHead;
    } catch (error) {
      const reason =
        error instanceof Error && error.message === "RPC_SOURCE_MISMATCH"
          ? "RPC_SOURCE_MISMATCH"
          : "SECONDARY_RPC_QUERY_FAILED";
      process.stdout.write(
        JSON.stringify({
          status: "INCOMPLETE",
          chainId,
          head: head.toString(),
          sourceCount: 1,
          failures: [{ query: "secondarySource", reason }],
        }) + "\n",
      );
      process.exitCode = 1;
      return;
    }
  }
  process.stdout.write(
    JSON.stringify({
      status: "VERIFIED_SAMPLE_ONLY",
      chainId,
      head: head.toString(),
      sourceCount: secondaryRpc ? 2 : 1,
      secondaryHead: secondaryHead?.toString() ?? null,
      crossSourceMatched: secondaryRpc ? true : null,
      deploymentBlock: deployment.number.toString(),
      deploymentHash: deployment.hash,
      receiptBlock: receipt.blockNumber.toString(),
      receiptHash: receipt.blockHash,
      receiptStatus: receipt.status,
      historicalVaultLogCount: logs.length,
      receiptVaultLogCount: logs.filter((log) => log.transactionHash.toLowerCase() === depositTx)
        .length,
      decodedEvent: decoded.eventName,
      decodedAmount: decoded.arguments.amount,
    }) + "\n",
  );
}

export async function runArcSourceProbe(): Promise<void> {
  try {
    await runProbe();
  } catch (error) {
    process.stdout.write(
      JSON.stringify({ status: "INCOMPLETE", failures: [classifySourceProbeFailure(error)] }) +
        "\n",
    );
    process.exitCode = 1;
  }
}
