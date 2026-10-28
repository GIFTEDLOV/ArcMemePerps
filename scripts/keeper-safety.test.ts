import { describe, expect, it } from "vitest";
import { applyPositionIndexPage, classifyLiquidationError, shouldExecuteMainnetKeeper } from "./keeper-safety";

describe("mainnet keeper execution gate", () => {
  it("stays read-only without both explicit gates", () => {
    expect(shouldExecuteMainnetKeeper([], "true")).toBe(false);
    expect(shouldExecuteMainnetKeeper(["--execute"], undefined)).toBe(false);
    expect(shouldExecuteMainnetKeeper(["--execute"], "false")).toBe(false);
  });

  it("keeps dry-run read-only even when execute and the environment flag are present", () => {
    expect(shouldExecuteMainnetKeeper(["--execute", "--dry-run"], "true")).toBe(false);
  });

  it("enables writes only with --execute and the exact opt-in environment value", () => {
    expect(shouldExecuteMainnetKeeper(["--execute"], "true")).toBe(true);
  });
});

describe("keeper simulation health classification", () => {
  it("treats only the explicit NotLiquidatable revert as a healthy open position", () => {
    expect(classifyLiquidationError(new Error("NotLiquidatable()"))).toMatchObject({ category: "NOT_LIQUIDATABLE", isHealthy: true });
    expect(classifyLiquidationError(new Error("AccountUnhealthy()"))).toMatchObject({ category: "UNKNOWN_REVERT", isHealthy: false });
    expect(classifyLiquidationError(new Error("PositionHealthy()"))).toMatchObject({ category: "UNKNOWN_REVERT", isHealthy: false });
  });

  it("keeps RPC, authorization, and unknown failures unhealthy", () => {
    expect(classifyLiquidationError(new Error("UnauthorizedKeeper()"))).toMatchObject({ category: "UNAUTHORIZED_KEEPER", isHealthy: false });
    expect(classifyLiquidationError(new Error("fetch failed"))).toMatchObject({ category: "RPC_NETWORK_ERROR", isHealthy: false });
    expect(classifyLiquidationError(new Error("unexpected revert"))).toMatchObject({ category: "UNKNOWN_REVERT", isHealthy: false });
  });
});

describe("keeper paginated position index", () => {
  it("reconciles only positions touched in the current event page", () => {
    expect(applyPositionIndexPage(
      ["2", "5"],
      ["3", "5"],
      new Map([["3", true], ["5", false]]),
    )).toEqual(["2", "3"]);
  });

  it("fails closed when a touched event cannot be confirmed from on-chain state", () => {
    expect(() => applyPositionIndexPage(["2"], ["3"], new Map())).toThrow(/not reconciled/);
  });
});
