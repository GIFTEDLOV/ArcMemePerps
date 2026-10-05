import { describe, expect, it } from "vitest";
import { isPlanStillValid } from "./plan";

const plan = {
  account: "0xAbC",
  marketId: "0xMarket",
  side: "LONG" as const,
  oracleSequence: 12,
  expiresAt: 2_000,
};

describe("immutable review plan guard", () => {
  it("accepts an unchanged plan before expiry", () => {
    expect(isPlanStillValid(plan, { ...plan, now: 1_000 })).toBe(true);
  });

  it("rejects account, oracle and expiry changes", () => {
    expect(isPlanStillValid(plan, { ...plan, account: "0xOther", now: 1_000 })).toBe(false);
    expect(isPlanStillValid(plan, { ...plan, oracleSequence: 13, now: 1_000 })).toBe(false);
    expect(isPlanStillValid(plan, { ...plan, now: 2_000 })).toBe(false);
  });
});
