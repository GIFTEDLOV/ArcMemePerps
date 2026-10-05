import { createPublicClient, http, type Address } from "viem";
import { calculateConstantProductDepth, type ConstantProductPool, type MarketDepth } from "@arcmemeperps/market-depth";
import { WAD, type EvmNetworkConfig } from "@arcmemeperps/shared";
import { evidenceRecord, unavailableEvidence } from "@arcmemeperps/providers";
import type { DexPairObservation } from "@arcmemeperps/providers";

const V2_POOL_ABI = [
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "token1",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { type: "uint112", name: "reserve0" },
      { type: "uint112", name: "reserve1" },
      { type: "uint32", name: "blockTimestampLast" },
    ],
  },
] as const;

const ERC20_DECIMALS_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

const STABLE_SYMBOLS = new Set([
  "USDC",
  "USDT",
  "DAI",
  "FDUSD",
  "BUSD",
  "USDE",
  "USDB",
  "USD0",
  "USDG",
]);

export interface DirectEvmDepthResult {
  readonly status: "AVAILABLE" | "UNAVAILABLE";
  readonly depth: MarketDepth;
  readonly successfulPoolCount: number;
  readonly attemptedPoolCount: number;
  readonly evidence: readonly ReturnType<typeof evidenceRecord>[];
}

interface DirectPool {
  readonly pool: ConstantProductPool;
  readonly poolAddress: string;
  readonly token0: string;
  readonly token1: string;
  readonly reserve0: bigint;
  readonly reserve1: bigint;
  readonly targetDecimals: number;
  readonly quoteDecimals: number;
  readonly targetPriceUsdWad: bigint;
  readonly blockNumber: bigint;
}

/**
 * Reads only V2-style pool state directly from the chain and feeds the
 * observed reserves into the existing quote/depth math. V3/Slipstream and
 * non-stable quote pairs remain explicitly unavailable until a venue-specific
 * reader can prove their active-range semantics.
 */
export async function readDirectEvmV2Depth(
  network: EvmNetworkConfig,
  rpcUrls: readonly string[],
  tokenAddress: string,
  pairs: readonly DexPairObservation[],
  fetchedAt: string,
): Promise<DirectEvmDepthResult> {
  const candidates = pairs
    .filter((pair) => pair.liquidityUsd !== null && pair.liquidityUsd >= 10_000)
    .slice(0, 6);
  const clients = rpcUrls.map((rpcUrl) =>
    createPublicClient({
      chain: {
        id: network.chainId,
        name: network.name,
        nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      },
      transport: http(rpcUrl),
    }),
  );
  const successful: DirectPool[] = [];
  const errors: string[] = [];
  for (const pair of candidates) {
    let result: DirectPool | null = null;
    for (const client of clients) {
      try {
        result = await readPool(client, tokenAddress, pair);
        break;
      } catch (error) {
        errors.push(`${pair.pairAddress}:${error instanceof Error ? error.message : "READ_FAILED"}`);
      }
    }
    if (result !== null) successful.push(result);
  }

  if (successful.length === 0) {
    return {
      status: "UNAVAILABLE",
      depth: unavailableDepth(fetchedAt, "NO_SUPPORTED_V2_POOL_STATE"),
      successfulPoolCount: 0,
      attemptedPoolCount: candidates.length,
      evidence: [
        unavailableEvidence(
          { chain: network.chain, network: network.name, fetchedAt },
          "canonical-evm-rpc",
          "direct-v2-depth",
          candidates.length === 0
            ? "NO_MEANINGFUL_POOLS_TO_READ"
            : `NO_SUPPORTED_V2_POOL_STATE:${errors.slice(0, 3).join("|")}`,
          "RPC",
        ),
      ],
    };
  }

  const depth = calculateConstantProductDepth(
    successful.map((item) => item.pool),
    fetchedAt,
  );
  return {
    status: "AVAILABLE",
    depth,
    successfulPoolCount: successful.length,
    attemptedPoolCount: candidates.length,
    evidence: successful.map((item) =>
      evidenceRecord({
        evidenceId: `canonical-evm-rpc:direct-v2-depth:${item.poolAddress.toLowerCase()}`,
        kind: "direct-v2-pool-state",
        provider: "canonical-evm-rpc",
        chain: network.chain,
        network: network.name,
        endpointClass: "RPC",
        dataVersion: "token0-token1-getReserves",
        schemaVersion: "1",
        blockNumber: item.blockNumber.toString(),
        observedAt: fetchedAt,
        sourceTimestamp: fetchedAt,
        fetchedAt,
        freshness: "FRESH",
        confidence: 1,
        status: "AVAILABLE",
        value: {
          venue: item.pool.venue,
          poolAddress: item.poolAddress,
          token0: item.token0,
          token1: item.token1,
          reserve0: item.reserve0.toString(),
          reserve1: item.reserve1.toString(),
          targetDecimals: item.targetDecimals,
          quoteDecimals: item.quoteDecimals,
          targetPriceUsdWad: item.targetPriceUsdWad.toString(),
          buyDepth1PctUsdWad: depth.venueBreakdown.find((venue) => venue.poolAddress.toLowerCase() === item.poolAddress.toLowerCase())?.buyDepth1PctUsdWad.toString() ?? null,
          sellDepth1PctUsdWad: depth.venueBreakdown.find((venue) => venue.poolAddress.toLowerCase() === item.poolAddress.toLowerCase())?.sellDepth1PctUsdWad.toString() ?? null,
        },
      }),
    ),
  };
}

async function readPool(
  client: ReturnType<typeof createPublicClient>,
  tokenAddress: string,
  pair: DexPairObservation,
): Promise<DirectPool> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(pair.pairAddress)) throw new Error("POOL_ADDRESS_NOT_EVM");
  const target = tokenAddress.toLowerCase();
  if (pair.baseToken.address.toLowerCase() !== target) {
    throw new Error("TARGET_NOT_PAIR_BASE_TOKEN");
  }
  if (!STABLE_SYMBOLS.has((pair.quoteToken.symbol ?? "").trim().toUpperCase())) {
    throw new Error("QUOTE_IS_NOT_KNOWN_STABLE");
  }
  const poolAddress = pair.pairAddress as Address;
  const [token0, token1, reserves, targetDecimals, quoteDecimals, blockNumber] = await Promise.all([
    client.readContract({ address: poolAddress, abi: V2_POOL_ABI, functionName: "token0" }),
    client.readContract({ address: poolAddress, abi: V2_POOL_ABI, functionName: "token1" }),
    client.readContract({ address: poolAddress, abi: V2_POOL_ABI, functionName: "getReserves" }),
    client.readContract({ address: pair.baseToken.address as Address, abi: ERC20_DECIMALS_ABI, functionName: "decimals" }),
    client.readContract({ address: pair.quoteToken.address as Address, abi: ERC20_DECIMALS_ABI, functionName: "decimals" }),
    client.getBlockNumber(),
  ]);
  const targetIsToken0 = token0.toLowerCase() === target;
  const targetIsToken1 = token1.toLowerCase() === target;
  if (!targetIsToken0 && !targetIsToken1) throw new Error("POOL_TARGET_MISMATCH");
  const reserve0 = reserves[0];
  const reserve1 = reserves[1];
  const targetReserve = targetIsToken0 ? reserve0 : reserve1;
  const quoteReserve = targetIsToken0 ? reserve1 : reserve0;
  if (targetReserve <= 0n || quoteReserve <= 0n) throw new Error("EMPTY_POOL_RESERVES");
  const targetPriceUsdWad = decimalToWad(pair.priceUsdRaw ?? pair.priceUsd?.toString() ?? null);
  if (targetPriceUsdWad === null) throw new Error("PAIR_PRICE_UNAVAILABLE");
  const baseReserveUsdWad = (targetReserve * targetPriceUsdWad) / 10n ** BigInt(Number(targetDecimals));
  const quoteReserveUsdWad = (quoteReserve * WAD) / 10n ** BigInt(Number(quoteDecimals));
  if (baseReserveUsdWad <= 0n || quoteReserveUsdWad <= 0n) throw new Error("USD_RESERVES_UNAVAILABLE");
  const directPriceUsdWad =
    (quoteReserveUsdWad * 10n ** BigInt(Number(targetDecimals))) / targetReserve;
  const priceDifferenceBps =
    (directPriceUsdWad > targetPriceUsdWad
      ? ((directPriceUsdWad - targetPriceUsdWad) * 10_000n) / targetPriceUsdWad
      : ((targetPriceUsdWad - directPriceUsdWad) * 10_000n) / targetPriceUsdWad);
  if (priceDifferenceBps > 1_000n) throw new Error(`DIRECT_AGGREGATOR_PRICE_CONFLICT:${priceDifferenceBps}BPS`);
  return {
    pool: {
      venue: pair.dexId,
      poolAddress: pair.pairAddress,
      baseReserveUsdWad,
      quoteReserveUsdWad,
      feeBps: feeForVenue(pair.dexId),
    },
    poolAddress: pair.pairAddress,
    token0,
    token1,
    reserve0,
    reserve1,
    targetDecimals: Number(targetDecimals),
    quoteDecimals: Number(quoteDecimals),
    targetPriceUsdWad,
    blockNumber,
  };
}

function feeForVenue(dexId: string): bigint {
  const normalized = dexId.toLowerCase();
  if (normalized.includes("pancake")) return 25n;
  if (normalized.includes("aerodrome")) return 30n;
  return 30n;
}

function decimalToWad(value: string | null): bigint | null {
  if (value === null || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  if (whole === undefined) return null;
  const fractionWad = `${fraction}000000000000000000`.slice(0, 18);
  return BigInt(whole) * WAD + BigInt(fractionWad);
}

function unavailableDepth(observedAt: string, reason: string): MarketDepth {
  return {
    status: "UNAVAILABLE",
    observedAt,
    buyDepth1PctUsdWad: null,
    sellDepth1PctUsdWad: null,
    buyDepth2PctUsdWad: null,
    sellDepth2PctUsdWad: null,
    buyDepth5PctUsdWad: null,
    sellDepth5PctUsdWad: null,
    venueBreakdown: [],
    reason,
  };
}
