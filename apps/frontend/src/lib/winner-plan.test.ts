import { describe, expect, it } from "vitest";
import { isPretradeIntact } from "./winner-plan";
import type { Pretrade } from "./winner-types";

const base: Pretrade = { status: "AVAILABLE", deploymentId: "arc-testnet-product-v2", chainId: 5042002, marketId: "0xabc", account: "0xUser", action: "OPEN", side: "LONG", collateralUsdUsdc: "1000000", sizeUsdWad: "2000000000000000000", acceptablePriceWad: "1000000000000000000", oracle: { sequence: "7" }, qualification: { ruleVersion: "0.1.0" }, nonce: "2", expiry: "2000", planHash: "0xplan" };
describe("winner pretrade binding", () => {
  it("accepts unchanged material fields", () => expect(isPretradeIntact(base, { ...base }, 1000)).toBe(true));
  it("rejects price, oracle, account, and expiry mutation", () => {
    expect(isPretradeIntact(base, { ...base, acceptablePriceWad: "2" }, 1000)).toBe(false);
    expect(isPretradeIntact(base, { ...base, oracle: { sequence: "8" } }, 1000)).toBe(false);
    expect(isPretradeIntact(base, { ...base, account: "0xother" }, 1000)).toBe(false);
    expect(isPretradeIntact(base, { ...base }, 2000)).toBe(false);
  });
});
