import { describe, expect, it } from "vitest";
import {
  analyzeSolanaLiquidityControl,
  analyzeV2LpControl,
  analyzeV3PositionControl,
} from "./lp-security.js";

describe("venue-specific liquidity control", () => {
  it("does not call missing LP proof locked", () => {
    expect(
      analyzeV2LpControl({
        venue: "uniswap",
        lpTokenSupply: null,
        burnedLpTokens: null,
        holderAddress: null,
        locker: null,
        unlockAt: null,
        now: "2026-01-01T00:00:00.000Z",
        evidenceIds: [],
      }).status,
    ).toBe("UNKNOWN");
  });
  it("recognizes burned V2 liquidity only from supply evidence", () => {
    expect(
      analyzeV2LpControl({
        venue: "uniswap",
        lpTokenSupply: 100n,
        burnedLpTokens: 100n,
        holderAddress: "0x0",
        locker: null,
        unlockAt: null,
        now: "2026-01-01T00:00:00.000Z",
        evidenceIds: ["lp"],
      }).status,
    ).toBe("BURNED");
  });
  it("recognizes a time-bounded V3 lock", () => {
    expect(
      analyzeV3PositionControl({
        venue: "uniswap-v3",
        positionNftId: "1",
        nftOwner: "0xlocker",
        liquidity: 10n,
        locker: "0xlocker",
        unlockAt: "2026-02-01T00:00:00.000Z",
        now: "2026-01-01T00:00:00.000Z",
        evidenceIds: ["nft"],
      }).status,
    ).toBe("LOCKED");
  });
  it("uses protocol-owned Solana semantics explicitly", () => {
    expect(
      analyzeSolanaLiquidityControl({
        venue: "pumpswap",
        protocolOwned: true,
        controller: "protocol",
        withdrawable: null,
        evidenceIds: ["pool"],
      }).status,
    ).toBe("PROTOCOL_CONTROLLED");
  });
});
