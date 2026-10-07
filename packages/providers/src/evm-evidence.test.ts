import { describe, expect, it } from "vitest";
import {
  countMeaningfulIndependentPools,
  isCreationTransaction,
  storageAddress,
} from "./evm-evidence.js";

describe("EVM qualification evidence helpers", () => {
  it("does not count a dust pool as an independent economic source", () => {
    expect(
      countMeaningfulIndependentPools([
        { pairAddress: "0x0000000000000000000000000000000000000001", liquidityUsd: 1_000_000 },
        { pairAddress: "0x0000000000000000000000000000000000000002", liquidityUsd: 9_999 },
      ]),
    ).toBe(1);
  });

  it("deduplicates the same underlying pool even when observed more than once", () => {
    expect(
      countMeaningfulIndependentPools([
        { pairAddress: "0x0000000000000000000000000000000000000001", liquidityUsd: 1_000_000 },
        { pairAddress: "0x0000000000000000000000000000000000000001", liquidityUsd: 2_000_000 },
      ]),
    ).toBe(1);
  });

  it("recognizes a canonical EIP-1967 address word", () => {
    expect(storageAddress(`0x${"0".repeat(24)}1111111111111111111111111111111111111111`)).toBe(
      "0x1111111111111111111111111111111111111111",
    );
    expect(storageAddress(`0x${"0".repeat(64)}`)).toBeNull();
  });

  it("requires a creation transaction receipt and does not infer creator from a transfer", () => {
    expect(
      isCreationTransaction(
        { to: null },
        { contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toBe(true);
    expect(
      isCreationTransaction(
        { to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
        { contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toBe(false);
  });
});
