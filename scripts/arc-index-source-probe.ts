import { createPublicClient, http } from "viem";
import {
  ARC_CHAIN_ID,
  ARC_CONTRACTS,
  ARC_RPC,
  rpcEventSource,
  verifyLogReceipts,
} from "../apps/indexer/src/arc-history.js";
import { decodeArcEvent } from "../apps/indexer/src/arc-decode.js";

// Read-only archive capability probe. A successful sample is not a complete backfill.
const rpc = process.env.ARC_INDEX_RPC_PRIMARY || ARC_RPC;
const source = rpcEventSource(rpc);
const client = createPublicClient({ transport: http(rpc, { timeout: 20_000, retryCount: 1 }) });
const depositTx = "0x7dd1dfeddc682e745ed84ba885ad3fd800400952522b03cc1126fd81915c4dc9";
const [chainId, head, deployment, receipt, logs] = await Promise.all([
  source.chainId(),
  source.head(),
  source.block(ARC_CONTRACTS.USDCMarginVault[1]),
  client.getTransactionReceipt({ hash: depositTx }),
  source.logs(ARC_CONTRACTS.USDCMarginVault[1], ARC_CONTRACTS.USDCMarginVault[1] + 10n, [
    ARC_CONTRACTS.USDCMarginVault[0],
  ]),
]);
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
process.stdout.write(
  JSON.stringify({
    chainId,
    head: head.toString(),
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
