import { describe, expect, it } from "vitest";
import { safeIndexerErrorCode } from "./safe-error.js";

describe("indexer operational error redaction", () => {
  it("keeps reviewed failure codes actionable", () => {
    expect(safeIndexerErrorCode(new Error("RPC_BLOCK_SOURCE_MISMATCH"))).toBe(
      "RPC_BLOCK_SOURCE_MISMATCH",
    );
  });

  it("does not expose provider URLs, keys, or database connection details", () => {
    expect(
      safeIndexerErrorCode(new Error("request failed https://rpc.example/key?token=secret")),
    ).toBe("INDEXER_OPERATION_FAILED");
    expect(safeIndexerErrorCode(new Error("password=secret host=postgres.example"))).toBe(
      "INDEXER_OPERATION_FAILED",
    );
  });

  it("normalizes missing historical receipts without exposing provider internals", () => {
    const error = new Error("rpc response for https://rpc.example/private-key");
    error.name = "TransactionReceiptNotFoundError";
    expect(safeIndexerErrorCode(error)).toBe("HISTORICAL_RECEIPT_UNAVAILABLE");
  });
});
