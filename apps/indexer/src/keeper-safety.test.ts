import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Static release invariants for the money-moving keeper entrypoint and
// scheduled workflow. A future refactor must not silently reintroduce
// automatic broadcasts, blind liquidations, or forged keeper credentials.
const daemon = readFileSync(
  new URL("../../../scripts/mainnet-keeper-daemon.ts", import.meta.url), "utf8",
);
const watchdog = readFileSync(
  new URL("../../../.github/workflows/keeper-watchdog.yml", import.meta.url), "utf8",
);

describe("CLUSTER mainnet keeper release boundary", () => {
  it("runs scheduled monitoring without signed transactions", () => {
    expect(watchdog).toContain("contents: read");
    expect(watchdog).toContain("pnpm keeper:once --dry-run");
    expect(watchdog).toContain('github.event_name');
    expect(watchdog).toContain('workflow_dispatch');
    expect(watchdog).toContain('CLUSTER_KEEPER_LIVE_APPROVED');
    expect(watchdog).not.toContain("git-auto-commit-action");
    expect(watchdog).not.toContain("pnpm keeper:once\n");
  });
  it("requires separate production and keeper approvals for live signing", () => {
    expect(daemon).toContain('process.env.CLUSTER_KEEPER_LIVE_APPROVED !== "true"');
    expect(daemon).toContain('process.env.CLUSTER_MAINNET_TRADING_ENABLED !== "true"');
    expect(daemon).toContain("MAINNET_KEEPER_RELEASE_NOT_APPROVED");
    expect(daemon).toContain("MAINNET_KEEPER_SIGNER_REQUIRED");
    expect(daemon).toContain('!args.includes("--live")');
  });
  it("does not turn absent provider liquidity into an asserted rug", () => {
    expect(daemon).toContain("market.originSpotLiquidityUsd == null");
    expect(daemon).toContain("if (!Number.isFinite(liq) || liq < 0) continue");
    expect(daemon).not.toContain('Number(market.originSpotLiquidityUsd || "0")');
    expect(daemon).toContain("requires review");
  });
  it("simulates liquidation before any keeper write transaction", () => {
    const simulation = daemon.indexOf("await publicClient.simulateContract(");
    const broadcast = daemon.indexOf("await walletClient.writeContract(");
    expect(simulation).toBeGreaterThan(0);
    expect(broadcast).toBeGreaterThan(simulation);
    expect(daemon).toContain('diagnostics.isAuthorizedKeeper !== true');
  });
});
