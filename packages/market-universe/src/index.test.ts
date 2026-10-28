import { describe, expect, it } from "vitest";
import { mapDexMarket } from "./index.js";

describe("market universe identity and truth rules", () => {
  it("keeps identical symbols on different chains distinct", () => {
    const base = mapDexMarket({ chainId: "base", tokenAddress: "0x0000000000000000000000000000000000000001" }, [{ chainId: "base", dexId: "aerodrome", baseToken: { address: "0x0000000000000000000000000000000000000001", symbol: "MEME", name: "Base Meme" }, priceUsd: "0.0001", liquidity: { usd: 100 } }], "2026-01-01T00:00:00.000Z");
    const bnb = mapDexMarket({ chainId: "bsc", tokenAddress: "0x0000000000000000000000000000000000000001" }, [{ chainId: "bsc", dexId: "pancakeswap", baseToken: { address: "0x0000000000000000000000000000000000000001", symbol: "MEME", name: "BNB Meme" }, priceUsd: "0.0002", liquidity: { usd: 200 } }], "2026-01-01T00:00:00.000Z");
    expect(base?.marketId).not.toBe(bnb?.marketId);
    expect(base?.symbol).toBe("MEME");
    expect(bnb?.symbol).toBe("MEME");
  });

  it("preserves unavailable evidence instead of turning it into zero", () => {
    const market = mapDexMarket({ chainId: "solana", tokenAddress: "So11111111111111111111111111111111111111112" }, [], "2026-01-01T00:00:00.000Z");
    expect(market?.priceUsd).toBeNull();
    expect(market?.originSpotLiquidityUsd).toBeNull();
    expect(market?.holders).toBeNull();
    expect(market?.providerState.status).toBe("PARTIAL");
    expect(market?.integrity.status).toBe("PENDING");
  });

  it("does not attach a same-address pair from a different chain", () => {
    const market = mapDexMarket(
      { chainId: "base", tokenAddress: "0x0000000000000000000000000000000000000001" },
      [{ chainId: "ethereum", baseToken: { address: "0x0000000000000000000000000000000000000001", symbol: "OTHER" }, priceUsd: "9.99" }],
      "2026-01-01T00:00:00.000Z",
    );
    expect(market?.priceUsd).toBeNull();
    expect(market?.providerState.status).toBe("PARTIAL");
  });

  it("uses observed pair fields and does not imply Arc perp registration", () => {
    const market = mapDexMarket({ chainId: "solana", tokenAddress: "39hidrKSdmHiQ5gSoifbdj5ZKmsUWXJsw6k6MA7Upump" }, [{ chainId: "solana", dexId: "pumpswap", url: "https://dexscreener.com/solana/pair", baseToken: { address: "39hidrKSdmHiQ5gSoifbdj5ZKmsUWXJsw6k6MA7Upump", symbol: "REAL", name: "Real Token" }, priceUsd: "0.000002622", priceChange: { h24: -94.82 }, volume: { h24: 220327.18 }, txns: { h24: { buys: 100, sells: 200 } }, liquidity: { usd: 2658.38 } }], "2026-01-01T00:00:00.000Z");
    expect(market?.priceUsd).toBe("0.000002622");
    expect(market?.priceChange24hBps).toBe(-9482);
    expect(market?.transactions24h).toBe(300);
    expect(market?.perp.status).toBe("NOT_REGISTERED");
    expect(market?.derivatives.safeOiUsd).toBeNull();
  });
});
