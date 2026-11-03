import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const keeper = readFileSync(new URL("scripts/mainnet-keeper-daemon.ts", root), "utf8");
const deploy = readFileSync(new URL("scripts/deploy-mainnet-suite.ts", root), "utf8");

describe("Arc native USDC denomination", () => {
  it("treats the native gas asset as USDC with 18 decimal EVM accounting", () => {
    for (const source of [keeper, deploy]) {
      expect(source).toContain('nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }');
      expect(source).not.toContain('nativeCurrency: { name: "Arc", symbol: "ARC", decimals: 18 }');
      expect(source).toContain("formatEther");
    }
  });

  it("does not report native USDC balances as separate ARC tokens", () => {
    expect(keeper).toContain("keeperBalanceUsdc");
    expect(keeper).toContain("nativeBalanceUsdc");
    expect(keeper).not.toContain("keeperBalanceArc");
    expect(deploy).toContain("Native Gas Balance:");
    expect(deploy).toContain(" USDC");
  });
});
