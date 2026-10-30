import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { evaluateArcParity, type ArcChainLedger, type ArcIndexLedger } from "./arc-parity.js";

const hash = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}`;
const index: ArcIndexLedger = {
  checkpointBlock: 100n,
  checkpointHash: hash(100),
  coveredThrough: 100n,
  rangeCount: 1,
  gaps: 0,
  singleSourceRanges: 0,
  lpSharesDeposited: 100n,
  lpSharesWithdrawn: 20n,
  insuranceCapitalFunded: 50n,
  insuranceBadDebtCovered: 10n,
  insuranceBadDebtUncovered: 5n,
};
const chain: ArcChainLedger = {
  block: { number: 100n, hash: hash(100), parentHash: hash(99) },
  head: 150n,
  lpShares: 80n,
  insuranceAvailable: 40n,
  insuranceCovered: 10n,
  insuranceUncovered: 5n,
  marginActual: 200n,
  marginExpected: 200n,
  marginUsdcBalance: 200n,
  lpActual: 300n,
  lpExpected: 300n,
  lpUsdcBalance: 300n,
  insuranceActual: 45n,
  insuranceUsdcBalance: 45n,
};

describe("pinned Arc event/custody parity", () => {
  it("compares LP shares, insurance ledgers, and three real USDC custodians at one block", () => {
    const result = evaluateArcParity(index, chain);
    expect(result.status).toBe("PASS_AT_PINNED_BLOCK");
    expect(Object.values(result.checks).every(Boolean)).toBe(true);
  });
  it("fails when token custody differs from ledger or insurance coverage is double-counted", () => {
    const result = evaluateArcParity(
      { ...index, insuranceBadDebtCovered: 20n },
      { ...chain, marginUsdcBalance: 199n },
    );
    expect(result.status).toBe("FAIL");
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "INSURANCE_AVAILABLE_MISMATCH",
        "INSURANCE_COVERED_MISMATCH",
        "MARGIN_CUSTODY_MISMATCH",
      ]),
    );
  });
  it("cannot pass on gaps, single-source ranges, a stale checkpoint, or reorged hash", () => {
    const result = evaluateArcParity(
      { ...index, gaps: 1, singleSourceRanges: 1 },
      { ...chain, head: 200n, block: { ...chain.block, hash: hash(999) } },
    );
    expect(result.status).toBe("INCOMPLETE");
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "INDEX_GAPS",
        "INDEX_SINGLE_SOURCE_RANGES",
        "INDEX_BEHIND_FINALIZED_HEAD",
        "PINNED_BLOCK_HASH_MISMATCH",
      ]),
    );
  });
  it("rejects impossible LP share and insurance-capital reductions", () => {
    const result = evaluateArcParity(
      { ...index, lpSharesWithdrawn: 101n, insuranceBadDebtCovered: 51n },
      chain,
    );
    expect(result.status).toBe("FAIL");
    expect(result.checks.lpShares).toBe(false);
    expect(result.checks.insuranceAvailable).toBe(false);
  });
});
