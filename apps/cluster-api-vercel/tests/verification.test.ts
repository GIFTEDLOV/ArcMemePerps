import { describe, expect, it } from "vitest";
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  toBytes,
  toFunctionSelector,
  toHex,
  type Hex,
} from "viem";
import {
  marketIdForEvmToken,
  marketIdForSolanaToken,
  solanaPublicKeyBytes,
} from "@arcmemeperps/shared";
import {
  canonicalOriginMatches,
  decodeVerificationRead,
  encodeVerificationRead,
  verificationAbi,
  verifyArcMarket,
} from "./verification.js";

const ZERO_MARKET = `0x${"00".repeat(32)}` as Hex;

describe("Arc read-only verification ABI and identity", () => {
  it("uses the Solidity selectors for critical typed getter calls", () => {
    expect(encodeVerificationRead("isReportUsable", [ZERO_MARKET]).slice(0, 10)).toBe("0x2333654c");
    expect(encodeVerificationRead("getUsablePrice", [ZERO_MARKET]).slice(0, 10)).toBe("0x00b94229");
    expect(encodeVerificationRead("getReport", [ZERO_MARKET]).slice(0, 10)).toBe("0x171c4f11");
    expect(encodeVerificationRead("actualCustodyUsdc").slice(0, 10)).toBe("0xe177f4de");
    expect(encodeVerificationRead("expectedCustodyUsdc").slice(0, 10)).toBe("0xa1baae40");
    expect(encodeVerificationRead("withdrawableLiquidity").slice(0, 10)).toBe("0x8fff9ce7");
    expect(encodeVerificationRead("protocolBadDebt").slice(0, 10)).toBe("0x5b81aa69");
    expect(encodeVerificationRead("insuranceCoveredBadDebt").slice(0, 10)).toBe("0x20d279fb");
    expect(
      verificationAbi.some((item) => item.type === "function" && item.name === "getUsablePrice"),
    ).toBe(true);
    expect(toFunctionSelector("isReportUsable(bytes32)")).toBe("0x2333654c");
  });

  it("decodes getUsablePrice as a three-value tuple, never a boolean", () => {
    const encoded = encodeAbiParameters(parseAbiParameters("uint256, uint64, uint256"), [
      123_450_000n,
      1_800_000_000n,
      175n,
    ]);
    const decoded = decodeVerificationRead("getUsablePrice", encoded);
    expect(decoded).toEqual([123_450_000n, 1_800_000_000n, 175n]);
    expect(typeof decoded).not.toBe("boolean");
  });

  it("decodes the OracleReport tuple fields with the deployed field order", () => {
    const report = {
      marketId: ZERO_MARKET,
      arcChainId: 5042n,
      midPrice: 100_000_000n,
      minPrice: 99_000_000n,
      maxPrice: 101_000_000n,
      confidenceBps: 100n,
      sourceCount: 3n,
      independentSourceCount: 2n,
      observedAt: 1_800_000_001n,
      validFrom: 1_800_000_001n,
      expiresAt: 1_800_000_300n,
      sequence: 7n,
      evidenceRoot: `0x${"11".repeat(32)}` as Hex,
      reporterSetVersion: `0x${"22".repeat(32)}` as Hex,
    };
    const tupleType = {
      type: "tuple",
      components: [
        { name: "marketId", type: "bytes32" },
        { name: "arcChainId", type: "uint256" },
        { name: "midPrice", type: "uint256" },
        { name: "minPrice", type: "uint256" },
        { name: "maxPrice", type: "uint256" },
        { name: "confidenceBps", type: "uint256" },
        { name: "sourceCount", type: "uint256" },
        { name: "independentSourceCount", type: "uint256" },
        { name: "observedAt", type: "uint64" },
        { name: "validFrom", type: "uint64" },
        { name: "expiresAt", type: "uint64" },
        { name: "sequence", type: "uint64" },
        { name: "evidenceRoot", type: "bytes32" },
        { name: "reporterSetVersion", type: "bytes32" },
      ],
    } as const;
    const encoded = encodeAbiParameters([tupleType], [report]);
    const decoded = decodeVerificationRead("getReport", encoded);
    const decodedReport =
      Array.isArray(decoded) && decoded.length === 1
        ? (decoded[0] as Record<string, unknown>)
        : (decoded as Record<string, unknown>);
    expect(decodedReport.marketId).toBe(ZERO_MARKET);
    expect(decodedReport.arcChainId).toBe(5042n);
    expect(decodedReport.independentSourceCount).toBe(2n);
    expect(decodedReport.reporterSetVersion).toBe(report.reporterSetVersion);
  });

  it("binds EVM and case-sensitive Solana records to the exact canonical origin tuple", () => {
    const evmAddress = "0x0000000000000000000000000000000000005042";
    const evmId = marketIdForEvmToken(8453, evmAddress);
    expect(
      canonicalOriginMatches("BASE", evmAddress, evmId, {
        marketId: evmId,
        originChain: toHex(8453n, { size: 32 }),
        originToken: evmAddress,
      }),
    ).toBe(true);
    expect(
      canonicalOriginMatches("BASE", evmAddress, evmId, {
        marketId: evmId,
        originChain: toHex(1n, { size: 32 }),
        originToken: evmAddress,
      }),
    ).toBe(false);

    const solanaAddress = "So11111111111111111111111111111111111111112";
    const solanaId = marketIdForSolanaToken(solanaAddress);
    expect(
      canonicalOriginMatches("SOLANA", solanaAddress, solanaId, {
        marketId: solanaId,
        originChain: keccak256(toBytes("SOLANA")),
        originToken: solanaPublicKeyBytes(solanaAddress),
      }),
    ).toBe(true);
    expect(
      canonicalOriginMatches("SOLANA", solanaAddress.toLowerCase(), solanaId, {
        marketId: solanaId,
        originChain: keccak256(toBytes("SOLANA")),
        originToken: solanaPublicKeyBytes(solanaAddress),
      }),
    ).toBe(false);
  });

  it("returns UNKNOWN when independent RPC quorum is absent or fails", async () => {
    const noQuorum = await verifyArcMarket("BASE", "0x0000000000000000000000000000000000005042", {
      sources: [],
    });
    expect(noQuorum.status).toBe(503);
    expect(await noQuorum.json()).toMatchObject({
      status: "UNKNOWN",
      tradingEnabled: false,
    });

    const brokenRpc = await verifyArcMarket("BASE", "0x0000000000000000000000000000000000005042", {
      sources: [
        { name: "one.example", url: "https://one.example" },
        { name: "two.example", url: "https://two.example" },
      ],
      rpcMethod: async () => {
        throw new Error("RPC_TIMEOUT");
      },
    });
    expect(brokenRpc.status).toBe(503);
    expect(await brokenRpc.json()).toMatchObject({
      status: "UNKNOWN",
      releaseGate: "BLOCKED",
    });
  });

  it("fails closed when providers disagree on network or pinned block hash", async () => {
    const sources = [
      { name: "one.example", url: "https://one.example" },
      { name: "two.example", url: "https://two.example" },
    ];
    const wrongChain = await verifyArcMarket("BASE", "0x0000000000000000000000000000000000005042", {
      sources,
      rpcMethod: async (url, method) =>
        method === "eth_chainId" ? (url.includes("one") ? "0x13b2" : "0x1") : "0x10",
    });
    expect(wrongChain.status).toBe(503);
    expect(await wrongChain.json()).toMatchObject({
      status: "UNKNOWN",
      verificationMethod: "DUAL_RPC_PINNED_BLOCK_REQUIRED",
    });

    const blockFork = await verifyArcMarket("BASE", "0x0000000000000000000000000000000000005042", {
      sources,
      rpcMethod: async (url, method) => {
        if (method === "eth_chainId") return "0x13b2";
        if (method === "eth_blockNumber") return "0x10";
        if (method === "eth_getBlockByNumber")
          return {
            hash: url.includes("one") ? `0x${"11".repeat(32)}` : `0x${"22".repeat(32)}`,
            timestamp: "0x1",
          };
        return "0x";
      },
    });
    expect(blockFork.status).toBe(503);
    expect(await blockFork.json()).toMatchObject({
      status: "UNKNOWN",
      verificationMethod: "DUAL_RPC_PINNED_BLOCK_REQUIRED",
    });
  });

  it("rejects malformed identities before any RPC access", async () => {
    const badChain = await verifyArcMarket(
      "UNKNOWN",
      "0x0000000000000000000000000000000000000001",
      {
        rpcMethod: async () => {
          throw new Error("must not be called");
        },
      },
    );
    expect(badChain.status).toBe(400);
    await expect(badChain.json()).resolves.toMatchObject({ error: "CHAIN_AND_TOKEN_REQUIRED" });

    const badToken = await verifyArcMarket("BASE", "not-a-token", {
      rpcMethod: async () => {
        throw new Error("must not be called");
      },
    });
    expect(badToken.status).toBe(400);
  });
});
