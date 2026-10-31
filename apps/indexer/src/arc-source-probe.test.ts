import { describe, expect, it } from "vitest";
import { classifySourceProbeFailure } from "./arc-source-probe.js";

describe("Arc historical source probe failure classification", () => {
  it("marks a missing historical receipt as incomplete evidence", () => {
    const error = new Error("provider returned no receipt");
    error.name = "TransactionReceiptNotFoundError";
    expect(classifySourceProbeFailure(error)).toBe("HISTORICAL_RECEIPT_UNAVAILABLE");
  });

  it("does not leak provider error messages or URLs", () => {
    expect(classifySourceProbeFailure(new Error("request failed at https://rpc.example/key"))).toBe(
      "RPC_QUERY_FAILED",
    );
  });

  it("preserves explicit verification failures", () => {
    expect(classifySourceProbeFailure(new Error("WRONG_ARC_CHAIN"))).toBe("WRONG_ARC_CHAIN");
    expect(classifySourceProbeFailure(new Error("RPC_SOURCE_MISMATCH"))).toBe(
      "RPC_SOURCE_MISMATCH",
    );
  });
});
