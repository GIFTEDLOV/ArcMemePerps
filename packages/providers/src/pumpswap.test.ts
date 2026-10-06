import { describe, expect, it } from "vitest";
import {
  PUMPSWAP_PROGRAM_ID,
  PUMPSWAP_POOL_ACCOUNT_DISCRIMINATOR,
  PumpSwapReader,
  PUMPSWAP_BUY_EVENT_DISCRIMINATOR,
  WRAPPED_SOL_MINT,
  assessCanonicalPoolIdentity,
  effectiveQuoteReserves,
  simulatePumpSwapDepth,
  parsePumpSwapTradeEvent,
} from "./pumpswap.js";

const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const ZERO_KEY = "11111111111111111111111111111111";

describe("canonical PumpSwap evidence", () => {
  it("proves the canonical index-0 pool identity but rejects an arbitrary PumpSwap pool", () => {
    const creator = PumpSwapReader.derivePoolAuthority(MINT);
    const poolAddress = PumpSwapReader.deriveCanonicalPool(MINT);
    const canonical = assessCanonicalPoolIdentity(
      {
        accountOwner: PUMPSWAP_PROGRAM_ID,
        index: 0,
        creator,
        baseMint: MINT,
        quoteMint: WRAPPED_SOL_MINT,
      },
      MINT,
      poolAddress,
    );
    expect(canonical).toEqual({ status: "PROVEN", reasons: [] });

    const arbitrary = assessCanonicalPoolIdentity(
      {
        accountOwner: PUMPSWAP_PROGRAM_ID,
        index: 1,
        creator: ZERO_KEY,
        baseMint: MINT,
        quoteMint: WRAPPED_SOL_MINT,
      },
      MINT,
      ZERO_KEY,
    );
    expect(arbitrary.status).toBe("CONFLICTED");
    expect(arbitrary.reasons).toContain("CANONICAL_POOL_INDEX_NOT_ZERO");
    expect(arbitrary.reasons).toContain("CANONICAL_POOL_CREATOR_MISMATCH");
  });

  it("decodes legacy shorter Pool accounts with zero virtual reserves", () => {
    const bytes = poolBytes(245);
    const decoded = PumpSwapReader.decodePoolAccount("pool", {
      context: { slot: 42 },
      value: { owner: PUMPSWAP_PROGRAM_ID, data: [Buffer.from(bytes).toString("base64"), "base64"] },
    });
    expect(decoded.accountDataLength).toBe(245);
    expect(decoded.virtualQuoteReserves).toBe(0n);
    expect(decoded.creatorFeeBps).toBeNull();
  });

  it("reads signed virtual quote reserves and applies them to executable depth", () => {
    const bytes = poolBytes(271);
    writeI128(bytes, 245, 250_000n);
    const decoded = PumpSwapReader.decodePoolAccount("pool", {
      context: { slot: 42 },
      value: { owner: PUMPSWAP_PROGRAM_ID, data: [Buffer.from(bytes).toString("base64"), "base64"] },
    });
    expect(decoded.virtualQuoteReserves).toBe(250_000n);
    expect(effectiveQuoteReserves(1_000_000n, decoded.virtualQuoteReserves)).toBe(1_250_000n);
    const withoutVirtual = simulatePumpSwapDepth(1_000_000n, 1_000_000n, 0n, 25n);
    const withVirtual = simulatePumpSwapDepth(1_000_000n, 1_000_000n, 250_000n, 25n);
    expect(withVirtual.buy1).toBeGreaterThan(withoutVirtual.buy1);
    expect(withVirtual.sell1).toBeGreaterThan(withoutVirtual.sell1);
  });

  it("decodes the official BuyEvent discriminator and fixed fields", () => {
    const bytes = new Uint8Array(184);
    bytes.set(fromHex(PUMPSWAP_BUY_EVENT_DISCRIMINATOR), 0);
    writeU64(bytes, 8, 1_700_000_000n);
    writeU64(bytes, 16, 123n);
    writeU64(bytes, 64, 456n);
    const event = parsePumpSwapTradeEvent(`Program data: ${Buffer.from(bytes).toString("base64")}`, ZERO_KEY);
    expect(event).toMatchObject({ side: "BUY", pool: ZERO_KEY, baseAmount: 123n, quoteAmount: 456n });
    expect(event?.timestamp).toBe(1_700_000_000);
  });
});

function poolBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set(fromHex(PUMPSWAP_POOL_ACCOUNT_DISCRIMINATOR), 0);
  bytes[8] = 7;
  bytes[9] = 0;
  bytes[10] = 0;
  return bytes;
}

function writeI128(bytes: Uint8Array, offset: number, value: bigint): void {
  let remaining = value < 0n ? (1n << 128n) + value : value;
  for (let index = 0; index < 16; index += 1) {
    bytes[offset + index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
}

function writeU64(bytes: Uint8Array, offset: number, value: bigint): void {
  let remaining = value;
  for (let index = 0; index < 8; index += 1) {
    bytes[offset + index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
}

function fromHex(value: string): Uint8Array {
  const output = new Uint8Array(value.length / 2);
  for (let index = 0; index < output.length; index += 1)
    output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return output;
}
