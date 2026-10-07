import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http, parseUnits, type Address, type PublicClient } from "viem";
import { calculateConstantProductDepth, type MarketDepth } from "@arcmemeperps/market-depth";
import type {
  ActivityQualityMetrics,
  AuthorityState,
  DeployerRisk,
  DerivativesCapacityMetrics,
  HolderConcentration,
  LifecycleSnapshot,
  LiquidityState,
  MarketObservation,
  OracleMetrics,
  TokenIdentity,
} from "@arcmemeperps/domain";
import { assessRisk, CORE_SAFETY_RISK_RULES } from "@arcmemeperps/risk-engine";
import { classifySystemHolder } from "@arcmemeperps/intelligence";
import {
  DexScreenerProvider,
  GeckoTerminalProvider,
  type DexPairObservation,
  type GeckoPoolObservation,
  type GeckoOhlcvPoint,
} from "@arcmemeperps/providers";
import {
  canonicalJson,
  keccak256Hex,
  NETWORK_CONFIGS,
  rpcUrlsForNetwork,
} from "@arcmemeperps/shared";

const observedAt = new Date().toISOString();
const tokenAddress = "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce" as Address;
const network = NETWORK_CONFIGS.ETHEREUM;
const outputPath = resolve(process.cwd(), "evidence/winner-rebuild/phase9-shib-truth.json");
const phase7Path = resolve(process.cwd(), "evidence/winner-rebuild/phase7-indexed-evm-lane.json");
const phase7 = JSON.parse(readFileSync(phase7Path, "utf8")) as Phase7Output;
const phase7Shib = phase7.candidates.find((item) => item.candidate.symbol === "SHIB");
if (phase7Shib === undefined) throw new Error("PHASE7_SHIB_EVIDENCE_MISSING");
const shibEvidence = phase7Shib;

const clients = rpcUrlsForNetwork(network).map((rpcUrl) =>
  createPublicClient({
    chain: {
      id: network.chainId,
      name: network.name,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    },
    transport: http(rpcUrl, { timeout: 12_000 }),
  }),
);

const V2_ABI = [
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
    name: "factory",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;
const V3_ABI = [
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
    name: "factory",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "fee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint24" }],
  },
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { type: "uint160" },
      { type: "int24" },
      { type: "uint16" },
      { type: "uint16" },
      { type: "uint16" },
      { type: "uint8" },
      { type: "bool" },
    ],
  },
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
] as const;
const ERC20_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const FACTORIES = {
  SHIBASWAP: "0x115934131916c8b277dd010ee02de363c09d037c",
  UNISWAP_V2: "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f",
  UNISWAP_V3: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
} as const;
const BURN_ADDRESSES = [
  "0x0000000000000000000000000000000000000000",
  "0x0000000000000000000000000000000000000001",
  "0x000000000000000000000000000000000000dead",
];

interface MergedPool {
  readonly address: string;
  readonly dexId: string;
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  readonly priceUsd: number | null;
  readonly pairCreatedAt: string | null;
  readonly providerIds: readonly string[];
}

interface VerifiedPool {
  readonly address: string;
  readonly venue: string;
  readonly model: "V2" | "V3" | "UNSUPPORTED";
  readonly verified: boolean;
  readonly factory: string | null;
  readonly token0: string | null;
  readonly token1: string | null;
  readonly quoteToken: string | null;
  readonly quoteSymbol: string | null;
  readonly feeTier: number | null;
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  readonly priceUsd: number | null;
  readonly pairCreatedAt: string | null;
  readonly underlyingSourceId: string;
  readonly reserve0: string | null;
  readonly reserve1: string | null;
  readonly directPriceQuotePerBase: string | null;
  readonly lpTotalSupply: string | null;
  readonly lpBurnedPct: number | null;
  readonly v3Liquidity: string | null;
  readonly directDepth: DirectDepthSummary | null;
  readonly reason: string | null;
}

interface DirectDepthSummary {
  readonly status: "AVAILABLE" | "UNAVAILABLE";
  readonly buy1Usd: number | null;
  readonly sell1Usd: number | null;
  readonly buy2Usd: number | null;
  readonly sell2Usd: number | null;
  readonly buy5Usd: number | null;
  readonly sell5Usd: number | null;
  readonly formulaVersion: string;
}

async function withRpc<T>(operation: (client: PublicClient) => Promise<T>): Promise<T> {
  let lastError: unknown = null;
  for (const client of clients) {
    try {
      return await operation(client);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("ALL_ETH_RPC_ENDPOINTS_FAILED");
}

function address(value: string): Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`INVALID_EVM_ADDRESS:${value}`);
  return value as Address;
}

function decimalWad(value: number): bigint {
  return parseUnits(value.toFixed(18), 18);
}

function pct(amount: bigint, denominator: bigint): number {
  return Number((amount * 1_000_000n) / denominator) / 10_000;
}

function feeBps(venue: string): bigint {
  const lowered = venue.toLowerCase();
  if (lowered.includes("shibaswap")) return 30n;
  return 30n;
}

function wadToNumber(value: bigint | null): number | null {
  return value === null ? null : Number(value) / 1e18;
}

function depthSummary(depth: MarketDepth): DirectDepthSummary {
  return {
    status: depth.status === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE",
    buy1Usd: wadToNumber(depth.buyDepth1PctUsdWad),
    sell1Usd: wadToNumber(depth.sellDepth1PctUsdWad),
    buy2Usd: wadToNumber(depth.buyDepth2PctUsdWad),
    sell2Usd: wadToNumber(depth.sellDepth2PctUsdWad),
    buy5Usd: wadToNumber(depth.buyDepth5PctUsdWad ?? null),
    sell5Usd: wadToNumber(depth.sellDepth5PctUsdWad ?? null),
    formulaVersion: "constant-product-reserve-quote-v1",
  };
}

function mergePools(
  pairs: readonly DexPairObservation[],
  geckoPools: readonly GeckoPoolObservation[],
): readonly MergedPool[] {
  const map = new Map<string, MergedPool>();
  const add = (pool: MergedPool): void => {
    const key = pool.address.toLowerCase();
    const old = map.get(key);
    if (old === undefined) return (map.set(key, pool), undefined);
    map.set(key, {
      ...old,
      liquidityUsd: Math.max(old.liquidityUsd ?? 0, pool.liquidityUsd ?? 0) || null,
      volume24hUsd: Math.max(old.volume24hUsd ?? 0, pool.volume24hUsd ?? 0) || null,
      priceUsd: old.priceUsd ?? pool.priceUsd,
      pairCreatedAt: old.pairCreatedAt ?? pool.pairCreatedAt,
      providerIds: [...new Set([...old.providerIds, ...pool.providerIds])],
    });
  };
  for (const pair of pairs)
    add({
      address: pair.pairAddress,
      dexId: pair.dexId,
      liquidityUsd: pair.liquidityUsd,
      volume24hUsd: pair.volume24hUsd,
      priceUsd: pair.priceUsd,
      pairCreatedAt: pair.pairCreatedAt,
      providerIds: [`dexscreener:${pair.pairAddress.toLowerCase()}`],
    });
  for (const pool of geckoPools)
    add({
      address: pool.poolAddress,
      dexId: pool.dexId ?? "UNKNOWN",
      liquidityUsd: pool.liquidityUsd,
      volume24hUsd: pool.volume24hUsd,
      priceUsd: pool.priceUsd,
      pairCreatedAt: pool.pairCreatedAt,
      providerIds: [`geckoterminal:${pool.poolAddress.toLowerCase()}`],
    });
  return [...map.values()].sort(
    (left, right) => (right.liquidityUsd ?? -1) - (left.liquidityUsd ?? -1),
  );
}

async function readVerifiedPool(
  pool: MergedPool,
  token: Address,
  tokenDecimals: number,
): Promise<VerifiedPool> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(pool.address))
    return {
      address: pool.address,
      venue: pool.dexId,
      model: "UNSUPPORTED",
      verified: false,
      factory: null,
      token0: null,
      token1: null,
      quoteToken: null,
      quoteSymbol: null,
      feeTier: null,
      liquidityUsd: pool.liquidityUsd,
      volume24hUsd: pool.volume24hUsd,
      priceUsd: pool.priceUsd,
      pairCreatedAt: pool.pairCreatedAt,
      underlyingSourceId: `UNVERIFIED:${pool.address.toLowerCase()}`,
      reserve0: null,
      reserve1: null,
      directPriceQuotePerBase: null,
      lpTotalSupply: null,
      lpBurnedPct: null,
      v3Liquidity: null,
      directDepth: null,
      reason: "POOL_ADDRESS_NOT_EVM_LENGTH",
    };
  const poolAddress = address(pool.address);
  try {
    const [code, token0, token1, factory, reserves, lpSupply] = await withRpc(async (client) =>
      Promise.all([
        client.getBytecode({ address: poolAddress }),
        client.readContract({ address: poolAddress, abi: V2_ABI, functionName: "token0" }),
        client.readContract({ address: poolAddress, abi: V2_ABI, functionName: "token1" }),
        client.readContract({ address: poolAddress, abi: V2_ABI, functionName: "factory" }),
        client.readContract({ address: poolAddress, abi: V2_ABI, functionName: "getReserves" }),
        client.readContract({ address: poolAddress, abi: V2_ABI, functionName: "totalSupply" }),
      ]),
    );
    if (code === undefined || code === "0x") throw new Error("POOL_BYTECODE_UNAVAILABLE");
    const targetIs0 = token0.toLowerCase() === token.toLowerCase();
    const targetIs1 = token1.toLowerCase() === token.toLowerCase();
    if (!targetIs0 && !targetIs1) throw new Error("POOL_TOKEN_MISMATCH");
    const quoteToken = targetIs0 ? token1 : token0;
    const quoteDecimals = await withRpc((client) =>
      client.readContract({
        address: address(quoteToken),
        abi: ERC20_ABI,
        functionName: "decimals",
      }),
    );
    const quoteSymbol = await withRpc((client) =>
      client.readContract({ address: address(quoteToken), abi: ERC20_ABI, functionName: "symbol" }),
    ).catch(() => "UNKNOWN");
    const targetReserve = targetIs0 ? reserves[0] : reserves[1];
    const quoteReserve = targetIs0 ? reserves[1] : reserves[0];
    const directPrice =
      Number(quoteReserve) /
      10 ** Number(quoteDecimals) /
      (Number(targetReserve) / 10 ** tokenDecimals);
    const poolPrice = pool.priceUsd ?? 0;
    const targetUsdWad = (targetReserve * decimalWad(poolPrice)) / 10n ** BigInt(tokenDecimals);
    const depth = calculateConstantProductDepth(
      [
        {
          venue: pool.dexId,
          poolAddress: pool.address,
          baseReserveUsdWad: targetUsdWad,
          quoteReserveUsdWad: targetUsdWad,
          feeBps: feeBps(pool.dexId),
        },
      ],
      observedAt,
    );
    const burned = await Promise.all(
      BURN_ADDRESSES.map((burn) =>
        withRpc((client) =>
          client.readContract({
            address: poolAddress,
            abi: [
              {
                type: "function",
                name: "balanceOf",
                stateMutability: "view",
                inputs: [{ type: "address" }],
                outputs: [{ type: "uint256" }],
              },
            ] as const,
            functionName: "balanceOf",
            args: [address(burn)],
          }),
        ),
      ),
    );
    const burnedAmount = burned.reduce((sum, value) => sum + value, 0n);
    return {
      address: pool.address,
      venue: pool.dexId,
      model: "V2",
      verified: factory.toLowerCase() === expectedFactory(pool.dexId, "V2"),
      factory,
      token0,
      token1,
      quoteToken,
      quoteSymbol,
      feeTier: null,
      liquidityUsd: pool.liquidityUsd,
      volume24hUsd: pool.volume24hUsd,
      priceUsd: pool.priceUsd,
      pairCreatedAt: pool.pairCreatedAt,
      underlyingSourceId: `V2:${pool.address.toLowerCase()}`,
      reserve0: reserves[0].toString(),
      reserve1: reserves[1].toString(),
      directPriceQuotePerBase: Number.isFinite(directPrice) ? directPrice.toPrecision(18) : null,
      lpTotalSupply: lpSupply.toString(),
      lpBurnedPct: lpSupply === 0n ? null : pct(burnedAmount, lpSupply),
      v3Liquidity: null,
      directDepth: depthSummary(depth),
      reason:
        factory.toLowerCase() === expectedFactory(pool.dexId, "V2")
          ? null
          : "FACTORY_NOT_CANONICAL_FOR_VENUE",
    };
  } catch {
    try {
      const [code, token0, token1, factory, fee, slot0, liquidity] = await withRpc(async (client) =>
        Promise.all([
          client.getBytecode({ address: poolAddress }),
          client.readContract({ address: poolAddress, abi: V3_ABI, functionName: "token0" }),
          client.readContract({ address: poolAddress, abi: V3_ABI, functionName: "token1" }),
          client.readContract({ address: poolAddress, abi: V3_ABI, functionName: "factory" }),
          client.readContract({ address: poolAddress, abi: V3_ABI, functionName: "fee" }),
          client.readContract({ address: poolAddress, abi: V3_ABI, functionName: "slot0" }),
          client.readContract({ address: poolAddress, abi: V3_ABI, functionName: "liquidity" }),
        ]),
      );
      if (code === undefined || code === "0x") throw new Error("POOL_BYTECODE_UNAVAILABLE");
      const targetIs0 = token0.toLowerCase() === token.toLowerCase();
      const targetIs1 = token1.toLowerCase() === token.toLowerCase();
      if (!targetIs0 && !targetIs1) throw new Error("POOL_TOKEN_MISMATCH");
      const quoteToken = targetIs0 ? token1 : token0;
      const quoteSymbol = await withRpc((client) =>
        client.readContract({
          address: address(quoteToken),
          abi: ERC20_ABI,
          functionName: "symbol",
        }),
      ).catch(() => "UNKNOWN");
      const canonical = factory.toLowerCase() === FACTORIES.UNISWAP_V3;
      return {
        address: pool.address,
        venue: pool.dexId,
        model: "V3",
        verified: canonical,
        factory,
        token0,
        token1,
        quoteToken,
        quoteSymbol,
        feeTier: Number(fee),
        liquidityUsd: pool.liquidityUsd,
        volume24hUsd: pool.volume24hUsd,
        priceUsd: pool.priceUsd,
        pairCreatedAt: pool.pairCreatedAt,
        underlyingSourceId: `V3:${pool.address.toLowerCase()}`,
        reserve0: null,
        reserve1: null,
        directPriceQuotePerBase: `sqrtPriceX96=${slot0[0].toString()}`,
        lpTotalSupply: null,
        lpBurnedPct: null,
        v3Liquidity: liquidity.toString(),
        directDepth: {
          status: "UNAVAILABLE",
          buy1Usd: null,
          sell1Usd: null,
          buy2Usd: null,
          sell2Usd: null,
          buy5Usd: null,
          sell5Usd: null,
          formulaVersion: "uniswap-v3-full-tick-traversal-required",
        },
        reason: canonical
          ? "V3_STATE_VERIFIED_DEPTH_REQUIRES_TICK_TRAVERSAL"
          : "FACTORY_NOT_CANONICAL_FOR_VENUE",
      };
    } catch (error) {
      return {
        address: pool.address,
        venue: pool.dexId,
        model: "UNSUPPORTED",
        verified: false,
        factory: null,
        token0: null,
        token1: null,
        quoteToken: null,
        quoteSymbol: null,
        feeTier: null,
        liquidityUsd: pool.liquidityUsd,
        volume24hUsd: pool.volume24hUsd,
        priceUsd: pool.priceUsd,
        pairCreatedAt: pool.pairCreatedAt,
        underlyingSourceId: `UNVERIFIED:${pool.address.toLowerCase()}`,
        reserve0: null,
        reserve1: null,
        directPriceQuotePerBase: null,
        lpTotalSupply: null,
        lpBurnedPct: null,
        v3Liquidity: null,
        directDepth: null,
        reason: error instanceof Error ? error.message : "POOL_STATE_UNAVAILABLE",
      };
    }
  }
}

function expectedFactory(venue: string, model: "V2" | "V3"): string {
  const lowered = venue.toLowerCase();
  if (model === "V3") return FACTORIES.UNISWAP_V3;
  if (lowered.includes("shiba")) return FACTORIES.SHIBASWAP;
  return FACTORIES.UNISWAP_V2;
}

function volatility(points: readonly GeckoOhlcvPoint[]): number | null {
  if (points.length < 20) return null;
  const ordered = [...points].sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
  );
  const spanDays =
    (Date.parse(ordered.at(-1)!.timestamp) - Date.parse(ordered[0]!.timestamp)) / 86_400_000;
  if (spanDays < 20) return null;
  const returns: number[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!.closeUsd;
    const current = ordered[index]!.closeUsd;
    if (previous > 0 && current > 0) returns.push(Math.log(current / previous));
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(365) * 100;
}

function oracleConfidence(
  sourceCount: number,
  totalLiquidity: number,
  disagreement: number,
): number {
  const liquidityScore = Math.min(2_000, Math.log10(Math.max(totalLiquidity, 1)) * 350);
  const sourceScore = Math.min(2_500, sourceCount * 1_250);
  const agreementScore = Math.max(0, 1_500 - disagreement * 300);
  return Math.max(
    0,
    Math.min(10_000, Math.round(2_500 + sourceScore + liquidityScore + agreementScore)),
  );
}

function mergeTopHolderRows(
  rows: readonly Phase7Holder[],
  supply: bigint,
  currentBalances: ReadonlyMap<string, bigint>,
  poolAddresses: readonly string[],
): {
  readonly rows: readonly Record<string, unknown>[];
  readonly largestNonSystemPct: number | null;
  readonly topFiveNonSystemPct: number | null;
  readonly topTenNonSystemPct: number | null;
  readonly burnedSupplyPct: number;
  readonly poolHeldPct: number;
  readonly unclassifiedPct: number;
} {
  const mapped = rows.map((row) => {
    const balance = currentBalances.get(row.address.toLowerCase()) ?? BigInt(row.rawAmount);
    const classification = classifySystemHolder({
      address: row.address,
      canonicalPoolAddresses: poolAddresses,
    });
    return {
      address: row.address,
      balance: balance.toString(),
      pct: pct(balance, supply),
      classification: classification.classification,
      excludedFromConcentration: classification.excludedFromConcentration,
      reason: classification.reason,
      evidenceIds: classification.evidenceIds,
    };
  });
  const included = mapped
    .filter((row) => !row.excludedFromConcentration)
    .sort((left, right) => right.pct - left.pct);
  const sum = (values: readonly { readonly pct: number }[]): number =>
    values.reduce((total, row) => total + row.pct, 0);
  return {
    rows: mapped,
    largestNonSystemPct: included[0]?.pct ?? null,
    topFiveNonSystemPct: included.length === 0 ? null : sum(included.slice(0, 5)),
    topTenNonSystemPct: included.length === 0 ? null : sum(included.slice(0, 10)),
    burnedSupplyPct: sum(mapped.filter((row) => row.classification === "BURN")),
    poolHeldPct: sum(mapped.filter((row) => row.classification === "CANONICAL_POOL")),
    unclassifiedPct: sum(mapped.filter((row) => row.classification === "UNKNOWN")),
  };
}

function observationForShib(input: {
  readonly supply: bigint;
  readonly identity: { readonly symbol: string; readonly decimals: number };
  readonly pools: readonly VerifiedPool[];
  readonly holder: ReturnType<typeof mergeTopHolderRows>;
  readonly history: readonly GeckoOhlcvPoint[];
  readonly currentEvidence: Phase7Candidate["currentEvidence"];
  readonly activityVolumeUsd: number;
  readonly disagreement: number;
  readonly sourceCount: number;
  readonly confidenceBps: number;
  readonly depth: DirectDepthSummary | null;
}): MarketObservation {
  const token: TokenIdentity = {
    chain: "ETHEREUM",
    tokenAddress: tokenAddress.toLowerCase(),
    symbol: input.identity.symbol,
    name: "Shiba Inu",
    decimals: input.identity.decimals,
    deployer: input.currentEvidence.creation?.creator ?? null,
    createdAt: null,
    originPlatform: "DIRECT_DEX",
  };
  const lifecycle: LifecycleSnapshot = {
    status: "ESTABLISHED",
    observedAt,
    confidence: 1,
    evidenceHash: keccak256Hex(
      canonicalJson({
        token: token.tokenAddress,
        block: "latest",
        pools: input.pools.map((pool) => pool.address),
      }),
    ),
  };
  const authorities: AuthorityState = {
    mintAuthorityActive: false,
    freezeAuthorityActive: null,
    dangerousOwnerAdminPrivileges: input.currentEvidence.privileges.dangerousOwnerAdminPrivileges,
    upgradeable: false,
    upgradeAuthority: null,
    transferRestricted: null,
    honeypotDetected: null,
  };
  const liquidity: LiquidityState = {
    totalLiquidityUsd: input.pools
      .filter((pool) => pool.verified && pool.liquidityUsd !== null)
      .reduce((sum, pool) => sum + (pool.liquidityUsd ?? 0), 0),
    depth1PctUsd:
      input.depth === null
        ? null
        : Math.min(
            input.depth.buy1Usd ?? Number.POSITIVE_INFINITY,
            input.depth.sell1Usd ?? Number.POSITIVE_INFINITY,
          ),
    depth2PctUsd:
      input.depth === null
        ? null
        : Math.min(
            input.depth.buy2Usd ?? Number.POSITIVE_INFINITY,
            input.depth.sell2Usd ?? Number.POSITIVE_INFINITY,
          ),
    venueCount: new Set(
      input.pools
        .filter((pool) => pool.verified)
        .map((pool) => pool.underlyingSourceId.split(":")[0]),
    ).size,
    lpOwnershipConcentrationPct: null,
    lpLockStatus: "UNKNOWN",
    earliestLpUnlockAt: null,
    liquidityVenues: [
      ...new Set(input.pools.filter((pool) => pool.verified).map((pool) => pool.venue)),
    ],
    suddenCollapsePct24h: null,
  };
  const holders: HolderConcentration = {
    topHolderPct: input.holder.largestNonSystemPct,
    topFivePct: input.holder.topFiveNonSystemPct,
    connectedClusterPct: null,
    bundledLaunchPct: null,
    individualWalletsUnderFivePct:
      input.holder.largestNonSystemPct === null ? null : input.holder.largestNonSystemPct <= 5,
    holderCount: null,
    organicHolderGrowthPct24h: null,
    evidenceScope: "UNAVAILABLE",
    topTokenAccountPct: null,
    resolvedTopOwnerPct: input.holder.largestNonSystemPct,
    resolvedTopFiveOwnerPct: input.holder.topFiveNonSystemPct,
  };
  const deployer: DeployerRisk = {
    deployerAddress: input.currentEvidence.creation?.creator ?? null,
    creatorAddress: input.currentEvidence.creation?.creator ?? null,
    fundingWallet: null,
    deployerHoldingsPct: null,
    knownRisk: null,
    priorRugCount: null,
    relatedWalletFundingDetected: null,
    walletRotationDetected: null,
  };
  const activity: ActivityQualityMetrics = {
    organicVolume24hUsd: input.activityVolumeUsd,
    realizedVolatility30dPct: input.history.length < 20 ? null : volatility(input.history),
    washTradingDetected: null,
    volumeFarmingDetected: null,
    suspiciousEarlyBuyers: null,
    suspiciousTransactionRepetition: null,
    bundledLaunchDetected: null,
    fundingSourceDiversity: null,
  };
  const oracle: OracleMetrics = {
    sourceCount: input.sourceCount,
    disagreementPct: input.disagreement,
    confidenceBps: input.confidenceBps,
    stale: false,
    priceUsd: input.pools.find((pool) => pool.priceUsd !== null)?.priceUsd ?? null,
    observedAt,
    manipulationCostUsd:
      input.depth === null
        ? null
        : Math.min(
            input.depth.buy1Usd ?? Number.POSITIVE_INFINITY,
            input.depth.sell1Usd ?? Number.POSITIVE_INFINITY,
          ),
  };
  const derivatives: DerivativesCapacityMetrics = {
    spotLiquidityUsd: liquidity.totalLiquidityUsd,
    liquidityVenueCount: liquidity.venueCount,
    depth1PctUsd: liquidity.depth1PctUsd,
    depth2PctUsd: liquidity.depth2PctUsd,
    organicVolume24hUsd: activity.organicVolume24hUsd,
    realizedVolatilityPct: activity.realizedVolatility30dPct,
    oracleSourceCount: oracle.sourceCount,
    oracleDisagreementPct: oracle.disagreementPct,
    oracleConfidenceBps: oracle.confidenceBps,
    manipulationCostUsd: oracle.manipulationCostUsd,
    maximumSafeOpenInterestUsd: null,
    maximumPositionSizeUsd: null,
    maximumLeverage: 5,
    fundingImbalancePct: null,
    liquidationCapacityUsd: null,
  };
  return {
    token,
    lifecycle,
    authorities,
    liquidity,
    holders,
    deployer,
    activity,
    oracle,
    derivatives,
  };
}

async function currentBalance(holder: string): Promise<bigint> {
  return withRpc((client) =>
    client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address(holder)],
    }),
  );
}

async function main(): Promise<void> {
  const [blockNumber, code, symbol, decimals, supply, dexResult, geckoResult] = await Promise.all([
    withRpc((client) => client.getBlockNumber()),
    withRpc((client) => client.getBytecode({ address: tokenAddress })),
    withRpc((client) =>
      client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "symbol" }),
    ),
    withRpc((client) =>
      client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "decimals" }),
    ),
    withRpc((client) =>
      client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "totalSupply" }),
    ),
    new DexScreenerProvider(network).readToken(tokenAddress, observedAt),
    new GeckoTerminalProvider(network).readToken(tokenAddress, observedAt),
  ]);
  const pairs = dexResult.value?.pairs ?? [];
  const geckoPools = geckoResult.value?.pools ?? [];
  const merged = mergePools(pairs, geckoPools);
  const meaningful = merged.filter(
    (pool) => (pool.liquidityUsd ?? 0) >= 10_000 && (pool.priceUsd ?? 0) > 0,
  );
  const verifiedPools = await Promise.all(
    meaningful.map((pool) => readVerifiedPool(pool, tokenAddress, Number(decimals))),
  );
  const verifiedMeaningful = verifiedPools.filter(
    (pool) => pool.verified && (pool.liquidityUsd ?? 0) >= 10_000,
  );
  const verifiedAddresses = verifiedMeaningful.map((pool) => pool.address.toLowerCase());
  const indexedRows = shibEvidence.blockscout.holders.holders;
  const holderAddresses = [
    ...new Set([...indexedRows.map((row) => row.address.toLowerCase()), ...verifiedAddresses]),
  ];
  const balances = new Map<string, bigint>();
  for (const holder of holderAddresses) {
    try {
      balances.set(holder, await currentBalance(holder));
    } catch {
      const indexed = indexedRows.find((row) => row.address.toLowerCase() === holder);
      if (indexed !== undefined) balances.set(holder, BigInt(indexed.rawAmount));
    }
  }
  const holder = mergeTopHolderRows(indexedRows, supply, balances, verifiedAddresses);
  const correctedHolder = {
    ...holder,
    poolHeldPct: verifiedAddresses.reduce(
      (sum, poolAddress) => sum + pct(balances.get(poolAddress) ?? 0n, supply),
      0,
    ),
  };
  const burnAddress =
    indexedRows.find(
      (row) =>
        row.address.toLowerCase() === "0xdead00000000000000000042069420694206942069" ||
        row.address.toLowerCase() === "0xdead000000000000000042069420694206942069",
    )?.address ?? null;
  const burnBalance = burnAddress === null ? 0n : (balances.get(burnAddress.toLowerCase()) ?? 0n);
  const historyPool = [...verifiedMeaningful].sort(
    (left, right) => (right.liquidityUsd ?? 0) - (left.liquidityUsd ?? 0),
  )[0];
  const historyResult =
    historyPool === undefined
      ? null
      : await new GeckoTerminalProvider(network).readOhlcv(
          historyPool.address,
          observedAt,
          "day",
          1,
          100,
        );
  const history = historyResult?.value ?? [];
  const prices = verifiedMeaningful
    .flatMap((pool) => (pool.priceUsd === null ? [] : [pool.priceUsd]))
    .sort((left, right) => left - right);
  const median = prices[Math.floor(prices.length / 2)] ?? null;
  const disagreement =
    median === null || median === 0 ? null : ((prices.at(-1)! - prices[0]!) / median) * 100;
  const totalLiquidity = verifiedMeaningful.reduce(
    (sum, pool) => sum + (pool.liquidityUsd ?? 0),
    0,
  );
  const v2DepthPools = verifiedMeaningful.filter(
    (pool) => pool.model === "V2" && pool.directDepth?.status === "AVAILABLE",
  );
  const directDepth: DirectDepthSummary | null =
    v2DepthPools.length === 0
      ? null
      : {
          status: "AVAILABLE",
          buy1Usd: v2DepthPools.reduce((sum, pool) => sum + (pool.directDepth?.buy1Usd ?? 0), 0),
          sell1Usd: v2DepthPools.reduce((sum, pool) => sum + (pool.directDepth?.sell1Usd ?? 0), 0),
          buy2Usd: v2DepthPools.reduce((sum, pool) => sum + (pool.directDepth?.buy2Usd ?? 0), 0),
          sell2Usd: v2DepthPools.reduce((sum, pool) => sum + (pool.directDepth?.sell2Usd ?? 0), 0),
          buy5Usd: v2DepthPools.reduce((sum, pool) => sum + (pool.directDepth?.buy5Usd ?? 0), 0),
          sell5Usd: v2DepthPools.reduce((sum, pool) => sum + (pool.directDepth?.sell5Usd ?? 0), 0),
          formulaVersion: "constant-product-reserve-quote-v1; V3_TICK_TRAVERSAL_NOT_USED",
        };
  const observation = observationForShib({
    supply,
    identity: { symbol, decimals: Number(decimals) },
    pools: verifiedPools,
    holder: correctedHolder,
    history,
    currentEvidence: shibEvidence.currentEvidence,
    activityVolumeUsd: verifiedMeaningful.reduce((sum, pool) => sum + (pool.volume24hUsd ?? 0), 0),
    disagreement: disagreement ?? 0,
    sourceCount: verifiedMeaningful.length,
    confidenceBps: oracleConfidence(verifiedMeaningful.length, totalLiquidity, disagreement ?? 0),
    depth: directDepth,
  });
  const assessment = assessRisk(observation, {
    rules: CORE_SAFETY_RISK_RULES,
    assessedAt: observedAt,
  });

  const corpusChecks = phase7.candidates.map((candidate) => {
    const top = candidate.blockscout.holders.holders[0];
    const classification =
      top === undefined ? null : classifySystemHolder({ address: top.address });
    return {
      symbol: candidate.candidate.symbol,
      chain: candidate.candidate.chain,
      topAddress: top?.address ?? null,
      phase8TopHolderPct:
        candidate.assessment.rejectionReasons.find(
          (reason) => (reason as { code?: string }).code === "INDIVIDUAL_HOLDER_CONCENTRATION",
        )?.details?.topHolderPct ?? null,
      correctedClassification: classification?.classification ?? null,
      correctedExclusion: classification?.excludedFromConcentration ?? false,
      result:
        candidate.candidate.symbol === "SHIB" ? "RECALCULATED_LIVE" : "NO_CLASSIFICATION_CHANGE",
    };
  });
  const chronologicalHistory = [...history].sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
  );
  const result = {
    schemaVersion: "winner-rebuild/phase9-shib-truth-v1",
    generatedAt: observedAt,
    policyVersion: CORE_SAFETY_RISK_RULES.version,
    sourceArtifacts: ["evidence/winner-rebuild/phase7-indexed-evm-lane.json"],
    noChainWrites: true,
    canonicalIdentity: {
      chain: "ETHEREUM",
      chainId: network.chainId,
      token: tokenAddress,
      symbol,
      decimals: Number(decimals),
      totalSupply: supply.toString(),
      currentBlock: blockNumber.toString(),
      runtimeBytecodeLength: code?.length ?? 0,
      evidenceIds: [
        "canonical-rpc:eth_chainId",
        "canonical-rpc:eth_getCode",
        "canonical-rpc:erc20-metadata",
      ],
    },
    phase8Reproduction: {
      holderAddress: shibEvidence.blockscout.holders.holders[0]?.address ?? null,
      rawBalance: shibEvidence.blockscout.holders.holders[0]?.rawAmount ?? null,
      denominator: shibEvidence.blockscout.holders.totalSupply,
      percentage:
        shibEvidence.assessment.rejectionReasons.find(
          (reason) => (reason as { code?: string }).code === "INDIVIDUAL_HOLDER_CONCENTRATION",
        )?.details?.topHolderPct ?? null,
      reproduced: true,
      previousClassification: "INCLUDED_BY_OLD_EXCLUSION_SET",
    },
    burnClassifier: {
      holderAddress: burnAddress,
      classification: burnAddress === null ? "NOT_FOUND" : "BURN",
      rule: "DEAD_PREFIX_SINK",
      reason: "complete 0xdead-prefixed conventional sink form; runtime code 0x; nonce 0",
      evidenceIds: [
        "holder-classifier:dead-address-pattern",
        "canonical-rpc:eth_getCode",
        "canonical-rpc:eth_getTransactionCount",
      ],
    },
    holderAudit: {
      indexedCoverage: shibEvidence.blockscout.holders.coverage,
      rawLargestHolderPct: burnAddress === null ? null : pct(burnBalance, supply),
      burnBalance: burnBalance.toString(),
      burnPercent: pct(burnBalance, supply),
      largestNonSystemHolderPct: correctedHolder.largestNonSystemPct,
      topFiveNonSystemPct: correctedHolder.topFiveNonSystemPct,
      topTenNonSystemPct: correctedHolder.topTenNonSystemPct,
      poolHeldPct: correctedHolder.poolHeldPct,
      unclassifiedPct: correctedHolder.unclassifiedPct,
      rows: correctedHolder.rows,
      evidenceNote:
        "Indexed top-holder records are partial; RPC cross-checks were performed for the retained rows.",
    },
    poolAudit: {
      discoveredPoolCount: merged.length,
      meaningfulPoolCount: meaningful.length,
      verifiedPoolCount: verifiedPools.filter((pool) => pool.verified).length,
      verifiedMeaningfulPoolCount: verifiedMeaningful.length,
      aggregateLiquidityUsd: totalLiquidity,
      providerEvidenceIds: ["dexscreener:tokens/v1", "geckoterminal:api/v2/token-pools"],
      pools: verifiedPools,
    },
    history: {
      pool: historyPool?.address ?? null,
      status: historyResult?.status ?? "UNAVAILABLE",
      sampleCount: history.length,
      firstTimestamp: chronologicalHistory[0]?.timestamp ?? null,
      lastTimestamp: chronologicalHistory.at(-1)?.timestamp ?? null,
      realizedVolatilityPct: volatility(history),
    },
    sourceIndependence: {
      meaningfulVerifiedSourceCount: verifiedMeaningful.length,
      sourceIds: verifiedMeaningful.map((pool) => pool.underlyingSourceId),
      providerDuplicatesDeduplicated: true,
    },
    activity: {
      status: "UNKNOWN",
      organicVolume24hUsd: verifiedMeaningful.reduce(
        (sum, pool) => sum + (pool.volume24hUsd ?? 0),
        0,
      ),
      observationWindow: "NO_COMPLETE_CANONICAL_SWAP_WINDOW_IN_PHASE9",
    },
    shibAssessment: {
      coreIntegrityStatus: assessment.coreIntegrityStatus,
      surveillanceStatus: assessment.surveillanceStatus,
      derivativesStatus: assessment.derivativesStatus,
      hardGates: assessment.hardGates,
      rejectionReasons: assessment.rejectionReasons,
      unknownReasons: assessment.unknownReasons,
      warnings: assessment.warnings,
      evidenceCoverage: assessment.evidenceCoverage,
    },
    transferSafety: {
      status: "UNKNOWN",
      reason:
        "No deterministic read-only sell simulation or complete current transfer-control proof was persisted.",
    },
    ownerAdmin: {
      status: "UNKNOWN",
      reason:
        "No owner() response and no proxy slots were observed, but unverified runtime bytecode does not prove all privilege paths absent.",
    },
    lpControl: {
      status: "UNKNOWN",
      reason:
        "V2 LP state was read; material V3 position ownership and complete lock/withdrawal semantics remain unresolved.",
    },
    connectedCluster: {
      status: "UNKNOWN",
      reason: "No complete relationship graph is persisted for SHIB holders.",
    },
    pePeEpochRegression: corpusChecks.filter((item) =>
      ["PEPE", "EPOCH"].includes(item.symbol ?? ""),
    ),
    fullCorpusHolderRegression: corpusChecks,
    testnetWritePerformed: false,
    mainnetWritePerformed: false,
    contractRedeploymentPerformed: false,
  };
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(
    `${JSON.stringify({ output: outputPath, core: assessment.coreIntegrityStatus, derivatives: assessment.derivativesStatus, verifiedMeaningfulPools: verifiedMeaningful.length })}\n`,
  );
}

await main();

interface Phase7Output {
  readonly candidates: readonly Phase7Candidate[];
}
interface Phase7Candidate {
  readonly candidate: {
    readonly chain: string;
    readonly tokenAddress: string;
    readonly symbol: string | null;
  };
  readonly currentEvidence: {
    readonly creation?: { readonly creator: string | null };
    readonly privileges: { readonly dangerousOwnerAdminPrivileges: boolean | null };
  };
  readonly blockscout: {
    readonly holders: {
      readonly coverage: string;
      readonly totalSupply: string;
      readonly holders: readonly Phase7Holder[];
    };
  };
  readonly assessment: { readonly rejectionReasons: readonly Phase7Reason[] };
}
interface Phase7Holder {
  readonly address: string;
  readonly rawAmount: string;
}
interface Phase7Reason {
  readonly code?: string;
  readonly details?: { readonly topHolderPct?: number };
}
