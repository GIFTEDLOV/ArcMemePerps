const SAFE_INDEXER_CODES = new Set([
  "DATABASE_URL_REQUIRED",
  "WRONG_ARC_CHAIN",
  "INVALID_INDEX_OPTIONS",
  "CHECKPOINT_WITHOUT_RANGE",
  "INDEX_RANGE_GAP",
  "INDEX_PARENT_HASH_MISMATCH",
  "INDEX_LOG_OUT_OF_RANGE",
  "PRE_DEPLOYMENT_CONTRACT_LOG",
  "RPC_BLOCK_GAP_OR_REORG",
  "RPC_BLOCK_SOURCE_MISMATCH",
  "RPC_LOG_SOURCE_MISMATCH",
  "RPC_RECEIPT_UNAVAILABLE",
  "RPC_RECEIPT_STATUS_OR_BLOCK_MISMATCH",
  "RPC_RECEIPT_LOG_MISMATCH",
  "RPC_RATE_LIMITED",
  "RPC_TIMEOUT",
  "RPC_CONNECTION_ERROR",
]);

/** Return only reviewed diagnostics; provider/driver messages may contain credentials or URLs. */
export function safeIndexerErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return "INDEXER_OPERATION_FAILED";
  if (SAFE_INDEXER_CODES.has(error.message)) return error.message;
  if (error.name === "TransactionReceiptNotFoundError") return "HISTORICAL_RECEIPT_UNAVAILABLE";
  const msg = error.message.toLowerCase();
  if (msg.includes("429") || msg.includes("too many requests") || msg.includes("rate limit")) {
    return "RPC_RATE_LIMITED";
  }
  if (
    error.name === "TimeoutError" ||
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("504")
  ) {
    return "RPC_TIMEOUT";
  }
  if (
    msg.includes("econnreset") ||
    msg.includes("fetch failed") ||
    msg.includes("503") ||
    msg.includes("502")
  ) {
    return "RPC_CONNECTION_ERROR";
  }
  return "INDEXER_OPERATION_FAILED";
}
