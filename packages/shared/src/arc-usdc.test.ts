import { describe, expect, it } from "vitest";
import {
  canonicalArcUsdcTransferKey,
  deduplicateArcUsdcTransfers,
  type ArcUsdcTransferObservation,
} from "./arc-usdc.js";

const transfer = (
  overrides: Partial<ArcUsdcTransferObservation> = {},
): ArcUsdcTransferObservation => ({
  source: "ARC_SYSTEM_LOG",
  blockNumber: 42n,
  transactionHash: "0xABCDEF",
  logIndex: 7n,
  emitter: "0x3600000000000000000000000000000000000000",
  from: "0x0000000000000000000000000000000000000001",
  to: "0x0000000000000000000000000000000000000002",
  valueUsdc6: 1_000_000n,
  ...overrides,
});

describe("Arc USDC event reconciliation helpers", () => {
  it("deduplicates system and ERC-20 views of one movement", () => {
    const result = deduplicateArcUsdcTransfers([
      transfer({ source: "ERC20_LOG", emitter: "0x0000000000000000000000000000000000000003" }),
      transfer(),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe("ARC_SYSTEM_LOG");
    expect(result[0]?.valueUsdc6).toBe(1_000_000n);
  });

  it("keeps distinct log positions as distinct transfers", () => {
    const result = deduplicateArcUsdcTransfers([
      transfer(),
      transfer({ logIndex: 8n, valueUsdc6: 2_000_000n }),
    ]);

    expect(result).toHaveLength(2);
    expect(new Set(result.map(canonicalArcUsdcTransferKey)).size).toBe(2);
  });

  it("does not accept negative normalized amounts", () => {
    expect(() => deduplicateArcUsdcTransfers([transfer({ valueUsdc6: -1n })])).toThrow(
      "transfer amount cannot be negative",
    );
  });
});
