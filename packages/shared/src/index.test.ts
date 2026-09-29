import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  canonicalMarketKey,
  keccak256Hex,
  marketIdForToken,
  normalizeTokenAddress,
} from "./index.js";

describe("shared canonical identity helpers", () => {
  it("normalizes EVM addresses and preserves Solana base58 casing", () => {
    expect(normalizeTokenAddress("BASE", "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD")).toBe(
      "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    );
    expect(normalizeTokenAddress("SOLANA", "So11111111111111111111111111111111111111112")).toBe(
      "So11111111111111111111111111111111111111112",
    );
  });

  it("uses chain namespace and address in market identity", () => {
    const evm = canonicalMarketKey("BASE", "0x0000000000000000000000000000000000000001");
    const otherChain = canonicalMarketKey("ETHEREUM", "0x0000000000000000000000000000000000000001");
    expect(evm).not.toBe(otherChain);
    expect(keccak256Hex(evm)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(marketIdForToken("BASE", "0x0000000000000000000000000000000000000001")).toMatch(
      /^0x[0-9a-f]{64}$/,
    );
    expect(marketIdForToken("BASE", "0x0000000000000000000000000000000000000001")).not.toBe(
      marketIdForToken("ETHEREUM", "0x0000000000000000000000000000000000000001"),
    );
  });

  it("sorts object keys without changing array order", () => {
    expect(canonicalJson({ z: 1, a: { d: true, c: ["x", "y"] } })).toBe(
      '{"a":{"c":["x","y"],"d":true},"z":1}',
    );
  });
});
