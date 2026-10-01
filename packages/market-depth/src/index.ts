import { WAD, mulDivDown } from "@arcmemeperps/shared";

export type DepthStatus = "AVAILABLE" | "UNAVAILABLE" | "INVALID";

export interface ConstantProductPool {
  readonly venue: string;
  readonly poolAddress: string;
  readonly baseReserveUsdWad: bigint;
  readonly quoteReserveUsdWad: bigint;
  readonly feeBps: bigint;
}

export interface VenueDepth {
  readonly venue: string;
  readonly poolAddress: string;
  readonly buyDepth1PctUsdWad: bigint;
  readonly sellDepth1PctUsdWad: bigint;
  readonly buyDepth2PctUsdWad: bigint;
  readonly sellDepth2PctUsdWad: bigint;
}

export interface MarketDepth {
  readonly status: DepthStatus;
  readonly observedAt: string;
  readonly buyDepth1PctUsdWad: bigint | null;
  readonly sellDepth1PctUsdWad: bigint | null;
  readonly buyDepth2PctUsdWad: bigint | null;
  readonly sellDepth2PctUsdWad: bigint | null;
  readonly venueBreakdown: readonly VenueDepth[];
  readonly reason?: string;
}

/**
 * READ-only constant-product quote math. This is a quote simulation, not a transaction.
 * `buy` means buying base with quote; `sell` means selling base into quote.
 */
export function quoteConstantProduct(
  reserveIn: bigint,
  reserveOut: bigint,
  amountIn: bigint,
  feeBps: bigint,
): bigint {
  if (reserveIn <= 0n || reserveOut <= 0n || amountIn < 0n || feeBps < 0n || feeBps >= 10_000n) {
    throw new Error("invalid constant-product reserves");
  }
  const amountAfterFee = mulDivDown(amountIn, 10_000n - feeBps, 10_000n);
  return (amountAfterFee * reserveOut) / (reserveIn + amountAfterFee);
}

function depthForMove(
  baseReserve: bigint,
  quoteReserve: bigint,
  moveBps: bigint,
  feeBps: bigint,
  buy: boolean,
): bigint {
  const targetPriceRatio = buy
    ? WAD + mulDivDown(WAD, moveBps, 10_000n)
    : WAD - mulDivDown(WAD, moveBps, 10_000n);
  if (targetPriceRatio <= 0n) throw new Error("invalid depth move");
  const k = baseReserve * quoteReserve;
  const targetBase = buy
    ? isqrt((k * WAD) / targetPriceRatio)
    : isqrt((k * WAD) / targetPriceRatio);
  const baseDelta = buy
    ? baseReserve > targetBase
      ? baseReserve - targetBase
      : 0n
    : targetBase > baseReserve
      ? targetBase - baseReserve
      : 0n;
  return buy
    ? quoteOutForBaseDelta(baseReserve, quoteReserve, baseDelta)
    : quoteConstantProduct(baseReserve, quoteReserve, baseDelta, feeBps);
}

function quoteOutForBaseDelta(
  baseReserve: bigint,
  quoteReserve: bigint,
  baseDelta: bigint,
): bigint {
  if (baseDelta >= baseReserve) return quoteReserve;
  return (baseDelta * quoteReserve) / (baseReserve - baseDelta);
}

export function calculateConstantProductDepth(
  pools: readonly ConstantProductPool[],
  observedAt = new Date().toISOString(),
): MarketDepth {
  if (pools.length === 0) {
    return {
      status: "UNAVAILABLE",
      observedAt,
      buyDepth1PctUsdWad: null,
      sellDepth1PctUsdWad: null,
      buyDepth2PctUsdWad: null,
      sellDepth2PctUsdWad: null,
      venueBreakdown: [],
      reason: "NO_QUOTE_POOLS",
    };
  }
  try {
    const venues = pools.map((pool) => ({
      venue: pool.venue,
      poolAddress: pool.poolAddress,
      buyDepth1PctUsdWad: depthForMove(
        pool.baseReserveUsdWad,
        pool.quoteReserveUsdWad,
        100n,
        pool.feeBps,
        true,
      ),
      sellDepth1PctUsdWad: depthForMove(
        pool.baseReserveUsdWad,
        pool.quoteReserveUsdWad,
        100n,
        pool.feeBps,
        false,
      ),
      buyDepth2PctUsdWad: depthForMove(
        pool.baseReserveUsdWad,
        pool.quoteReserveUsdWad,
        200n,
        pool.feeBps,
        true,
      ),
      sellDepth2PctUsdWad: depthForMove(
        pool.baseReserveUsdWad,
        pool.quoteReserveUsdWad,
        200n,
        pool.feeBps,
        false,
      ),
    }));
    return {
      status: "AVAILABLE",
      observedAt,
      buyDepth1PctUsdWad: venues.reduce((sum, venue) => sum + venue.buyDepth1PctUsdWad, 0n),
      sellDepth1PctUsdWad: venues.reduce((sum, venue) => sum + venue.sellDepth1PctUsdWad, 0n),
      buyDepth2PctUsdWad: venues.reduce((sum, venue) => sum + venue.buyDepth2PctUsdWad, 0n),
      sellDepth2PctUsdWad: venues.reduce((sum, venue) => sum + venue.sellDepth2PctUsdWad, 0n),
      venueBreakdown: venues,
    };
  } catch (error) {
    return {
      status: "INVALID",
      observedAt,
      buyDepth1PctUsdWad: null,
      sellDepth1PctUsdWad: null,
      buyDepth2PctUsdWad: null,
      sellDepth2PctUsdWad: null,
      venueBreakdown: [],
      reason: error instanceof Error ? error.message : "INVALID_POOL_DATA",
    };
  }
}

export interface SolanaDepthAdapter {
  quote(): Promise<MarketDepth>;
}

export class UnavailableSolanaDepthAdapter implements SolanaDepthAdapter {
  quote(): Promise<MarketDepth> {
    return Promise.resolve({
      status: "UNAVAILABLE",
      observedAt: new Date().toISOString(),
      buyDepth1PctUsdWad: null,
      sellDepth1PctUsdWad: null,
      buyDepth2PctUsdWad: null,
      sellDepth2PctUsdWad: null,
      venueBreakdown: [],
      reason: "SOLANA_QUOTE_INFRASTRUCTURE_UNAVAILABLE",
    });
  }
}

export type EvmVenueModel =
  "UNISWAP_V2" | "PANCAKESWAP_V2" | "UNISWAP_V3" | "PANCAKESWAP_V3" | "AERODROME";

export interface ReadOnlyDepthQuoteAdapter {
  readonly venue: string;
  readonly model: EvmVenueModel | "PUMPSWAP" | "RAYDIUM" | "METEORA";
  quote(): Promise<MarketDepth>;
}

/**
 * Quote infrastructure boundary. V2 is implemented by calculateConstantProductDepth;
 * concentrated-liquidity and Solana venues must supply executable read-only quote logic
 * before they can report depth. No TVL-to-depth estimate is permitted here.
 */
export class UnavailableQuoteAdapter implements ReadOnlyDepthQuoteAdapter {
  public constructor(
    public readonly venue: string,
    public readonly model: ReadOnlyDepthQuoteAdapter["model"],
    private readonly reason: string,
  ) {}
  public quote(): Promise<MarketDepth> {
    return Promise.resolve({
      status: "UNAVAILABLE",
      observedAt: new Date().toISOString(),
      buyDepth1PctUsdWad: null,
      sellDepth1PctUsdWad: null,
      buyDepth2PctUsdWad: null,
      sellDepth2PctUsdWad: null,
      venueBreakdown: [],
      reason: this.reason,
    });
  }
}

export async function aggregateReadOnlyVenueDepth(
  adapters: readonly ReadOnlyDepthQuoteAdapter[],
): Promise<MarketDepth> {
  const results = await Promise.all(adapters.map((adapter) => adapter.quote()));
  const available = results.filter((result) => result.status === "AVAILABLE");
  if (available.length !== results.length || available.length === 0) {
    return {
      status: "UNAVAILABLE",
      observedAt: new Date().toISOString(),
      buyDepth1PctUsdWad: null,
      sellDepth1PctUsdWad: null,
      buyDepth2PctUsdWad: null,
      sellDepth2PctUsdWad: null,
      venueBreakdown: [],
      reason:
        available.length === 0
          ? "NO_READ_ONLY_QUOTE_AVAILABLE"
          : "ONE_OR_MORE_VENUE_QUOTES_UNAVAILABLE",
    };
  }
  return {
    status: "AVAILABLE",
    observedAt: new Date().toISOString(),
    buyDepth1PctUsdWad: available.every((item) => item.buyDepth1PctUsdWad !== null)
      ? available.reduce((sum, item) => sum + item.buyDepth1PctUsdWad!, 0n)
      : null,
    sellDepth1PctUsdWad: available.every((item) => item.sellDepth1PctUsdWad !== null)
      ? available.reduce((sum, item) => sum + item.sellDepth1PctUsdWad!, 0n)
      : null,
    buyDepth2PctUsdWad: available.every((item) => item.buyDepth2PctUsdWad !== null)
      ? available.reduce((sum, item) => sum + item.buyDepth2PctUsdWad!, 0n)
      : null,
    sellDepth2PctUsdWad: available.every((item) => item.sellDepth2PctUsdWad !== null)
      ? available.reduce((sum, item) => sum + item.sellDepth2PctUsdWad!, 0n)
      : null,
    venueBreakdown: available.flatMap((item) => item.venueBreakdown),
  };
}

function isqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("square root of negative");
  if (value < 2n) return value;
  let x0 = 1n << BigInt(Math.ceil(value.toString(2).length / 2));
  let x1 = (x0 + value / x0) / 2n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + value / x0) / 2n;
  }
  return x0;
}
