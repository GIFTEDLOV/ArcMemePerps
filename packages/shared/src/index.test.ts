import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  canonicalMarketKey,
  keccak256Hex,
  marketIdForEvmToken,
  marketIdForSolanaToken,
  marketIdForToken,
  normalizeTokenAddress,
  NETWORK_CONFIGS,
  rpcUrlsForNetwork,
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

  it("rejects malformed EVM addresses and invalid Solana public keys", () => {
    expect(() => marketIdForToken("BASE", "0x1234")).toThrow("invalid EVM token address");
    expect(() => marketIdForToken("SOLANA", "not-a-public-key")).toThrow(
      "invalid Solana public key",
    );
    expect(() => marketIdForToken("SOLANA", "11111111111111111111111111111111")).toThrow(
      "decode to 32 bytes",
    );
  });

  it("uses typed namespace inputs so textual encoding tricks cannot collide", () => {
    const mixedCase = marketIdForEvmToken(8453, "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD");
    const lowerCase = marketIdForEvmToken(8453, "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
    expect(mixedCase).toBe(lowerCase);
    expect(marketIdForToken("BASE", "0x0000000000000000000000000000000000000001")).not.toBe(
      marketIdForSolanaToken("So11111111111111111111111111111111111111112"),
    );
    expect(marketIdForToken("BASE", "0x0000000000000000000000000000000000000001")).not.toBe(
      marketIdForToken("BASE", "0x0000000000000000000000000000000000000002"),
    );
  });

  it("builds an ordered de-duplicated RPC pool from environment configuration", () => {
    expect(
      rpcUrlsForNetwork(NETWORK_CONFIGS.SOLANA, {
        SOLANA_RPC_URL: "https://primary.example",
        SOLANA_RPC_URL_FALLBACKS: "https://secondary.example, https://primary.example",
      }),
    ).toEqual(["https://primary.example", "https://secondary.example"]);
  });
});
