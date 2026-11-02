import { describe, expect, it } from "vitest";
import { tradeReleaseBlocker } from "./winner-trade-safety";
import type { OriginMarket, Pretrade } from "./winner-types";

const address = "0x1111111111111111111111111111111111111111";
const market = {
  marketId: "0x" + "a".repeat(64),
  isQuarantined: false,
  integrity: { status: "QUALIFIED" },
  derivatives: { status: "LIVE" },
  perp: { status: "LIVE", marketId: "0x" + "a".repeat(64) },
} as OriginMarket;
const plan = {
  status: "AVAILABLE", chainId: 5042, marketId: market.marketId,
  account: address, action: "OPEN", side: "LONG",
  sizeUsdWad: "1000000000000000000", collateralUsdUsdc: "1000000",
  acceptablePriceWad: "1000000000000000000",
  oracle: { sequence: "25" }, qualification: {
    eligible: true, proofHash: "0x" + "f".repeat(64),
    expiresAt: "2099-01-01T00:00:00.000Z",
  }, expiry: "4070908800",
} as Pretrade;
const live = { tradingEnabled: true, lpDepositsEnabled: true, qualificationInventory: "VERIFIED" };

describe("real-money trading release boundary", () => {
  it("rejects discovered but unqualified markets even with wallet and a price", () => {
    expect(tradeReleaseBlocker({ ...market, perp: { ...market.perp, status: "NOT_REGISTERED" } }, live, plan, address, 5042, 1000)).toContain("not verified");
  });
  it("does not trust a wallet connected on the wrong chain", () => {
    expect(tradeReleaseBlocker(market, live, plan, address, 1, 1000)).toContain("real Arc");
  });
  it("does not authorize tx when the API is in read-only discovery mode", () => {
    expect(tradeReleaseBlocker(market, { ...live, tradingEnabled: false }, plan, address, 5042, 1000)).toContain("not activated");
  });
  it("refuses unverified qualification and wrong-account plans", () => {
    expect(tradeReleaseBlocker(market, { ...live, qualificationInventory: "UNVERIFIED" }, plan, address, 5042, 1000)).toContain("not verified");
    expect(tradeReleaseBlocker(market, live, { ...plan, account: "0x2222222222222222222222222222222222222222" }, address, 5042, 1000)).toContain("account-bound");
  });
  it("requires signed proof and current oracle quote", () => {
    expect(tradeReleaseBlocker(market, live, { ...plan, oracle: {} }, address, 5042, 1000)).toContain("evidence");
    expect(tradeReleaseBlocker(market, live, { ...plan, expiry: "1000" }, address, 5042, 1000)).toContain("expired");
  });
  it("passes only an explicitly qualified current authenticated market", () => {
    expect(tradeReleaseBlocker(market, live, plan, address, 5042, 1000)).toBeNull();
  });
});
