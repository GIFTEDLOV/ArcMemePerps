import type { SupportedNetworkConfig } from "@arcmemeperps/shared";
import { HttpJsonClient } from "./http.js";
import { evidenceRecord, providerErrorEvidence } from "./evidence.js";
import type { DexAggregate, DexPairObservation, JsonValue, ProviderResult } from "./types.js";

const DEXSCREENER_BASE_URL = "https://api.dexscreener.com";

export class DexScreenerProvider {
  public readonly providerName = "dexscreener";
  private readonly client: HttpJsonClient;

  public constructor(
    public readonly network: SupportedNetworkConfig,
    client?: HttpJsonClient,
  ) {
    this.client = client ?? new HttpJsonClient({ timeoutMs: 8_000, maxRetries: 2 });
  }

  public async readToken(
    tokenAddress: string,
    fetchedAt: string,
  ): Promise<ProviderResult<DexAggregate>> {
    const endpoint = `${DEXSCREENER_BASE_URL}/tokens/v1/${this.network.dexScreenerChainId}/${encodeURIComponent(tokenAddress)}`;
    try {
      const payload = await this.client.get<JsonValue>(endpoint);
      const pairs = parsePairs(payload, this.network.dexScreenerChainId, tokenAddress);
      const aggregate = aggregatePairs(pairs);
      return {
        status: "AVAILABLE",
        value: aggregate,
        reason: null,
        error: null,
        evidence: [
          evidenceRecord({
            evidenceId: `${this.providerName}:pairs`,
            kind: "dex-market-pairs",
            provider: this.providerName,
            chain: this.network.chain,
            network: this.network.name,
            endpointClass: "REST_API",
            dataVersion: "tokens/v1",
            schemaVersion: "1",
            fetchedAt,
            freshness: "FRESH",
            confidence: 0.8,
            status: "AVAILABLE",
            value: aggregate as unknown as JsonValue,
          }),
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "DexScreener read failed";
      return {
        status: "ERROR",
        value: null,
        reason: null,
        error: message,
        evidence: [
          providerErrorEvidence(
            { chain: this.network.chain, network: this.network.name, fetchedAt },
            this.providerName,
            "dex-market-pairs",
            message,
            "REST_API",
          ),
        ],
      };
    }
  }
}

function parsePairs(
  payload: JsonValue,
  expectedChain: string,
  tokenAddress: string,
): DexPairObservation[] {
  if (!Array.isArray(payload)) throw new Error("DexScreener response must be an array");
  const expected = tokenAddress.toLowerCase();
  const seen = new Set<string>();
  const pairs: DexPairObservation[] = [];
  for (const item of payload) {
    if (!isObject(item)) throw new Error("DexScreener pair must be an object");
    if (stringField(item, "chainId") !== expectedChain)
      throw new Error("DexScreener returned the wrong chain");
    const pairAddress = stringField(item, "pairAddress");
    if (seen.has(pairAddress.toLowerCase())) continue;
    const base = objectField(item, "baseToken");
    const quote = objectField(item, "quoteToken");
    const baseAddress = stringField(base, "address");
    const quoteAddress = stringField(quote, "address");
    if (baseAddress.toLowerCase() !== expected && quoteAddress.toLowerCase() !== expected) {
      throw new Error("DexScreener returned a pair without the requested token");
    }
    seen.add(pairAddress.toLowerCase());
    pairs.push({
      chainId: expectedChain,
      dexId: stringField(item, "dexId"),
      pairAddress,
      baseToken: {
        address: baseAddress,
        symbol: nullableString(base.symbol),
        name: nullableString(base.name),
      },
      quoteToken: {
        address: quoteAddress,
        symbol: nullableString(quote.symbol),
        name: nullableString(quote.name),
      },
      priceUsd: optionalNonNegative(item.priceUsd),
      liquidityUsd: nonNegative(objectField(item, "liquidity").usd, "liquidity.usd", true),
      baseLiquidity: optionalNonNegative(objectField(item, "liquidity").base),
      quoteLiquidity: optionalNonNegative(objectField(item, "liquidity").quote),
      volume24hUsd: nonNegative(objectField(item, "volume").h24, "volume.h24", false),
      buys24h: nonNegative(
        objectField(objectField(item, "txns"), "h24").buys,
        "txns.h24.buys",
        false,
      ),
      sells24h: nonNegative(
        objectField(objectField(item, "txns"), "h24").sells,
        "txns.h24.sells",
        false,
      ),
      priceChange24hPct: optionalNumber(objectField(item, "priceChange").h24),
      fdvUsd: optionalNonNegative(item.fdv),
      marketCapUsd: optionalNonNegative(item.marketCap),
      pairCreatedAt:
        item.pairCreatedAt === undefined
          ? null
          : new Date(nonNegative(item.pairCreatedAt, "pairCreatedAt", false)).toISOString(),
    });
  }
  return pairs;
}

function aggregatePairs(pairs: readonly DexPairObservation[]): DexAggregate {
  const total = pairs.reduce((sum, pair) => sum + pair.liquidityUsd, 0);
  const dominantPool = pairs.reduce<DexPairObservation | null>(
    (dominant, pair) =>
      dominant === null || pair.liquidityUsd > dominant.liquidityUsd ? pair : dominant,
    null,
  );
  const liquidityByDex: Record<string, number> = {};
  for (const pair of pairs)
    liquidityByDex[pair.dexId] = (liquidityByDex[pair.dexId] ?? 0) + pair.liquidityUsd;
  return {
    pairs,
    totalObservedLiquidityUsd: total,
    dominantPool,
    poolConcentrationPct:
      total === 0 || dominantPool === null ? 0 : (dominantPool.liquidityUsd / total) * 100,
    meaningfulPoolCount: pairs.filter((pair) => pair.liquidityUsd > 0).length,
    liquidityByDex,
    volume24hUsd: pairs.reduce((sum, pair) => sum + pair.volume24hUsd, 0),
    buys24h: pairs.reduce((sum, pair) => sum + pair.buys24h, 0),
    sells24h: pairs.reduce((sum, pair) => sum + pair.sells24h, 0),
    priceUsd: dominantPool?.priceUsd ?? null,
    priceSourceCount: new Set(
      pairs
        .filter((pair) => pair.priceUsd !== null)
        .map((pair) => `${pair.dexId}:${pair.pairAddress}`),
    ).size,
    depth1PctUsd: null,
    depth2PctUsd: null,
  };
}

function isObject(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function objectField(
  object: { readonly [key: string]: JsonValue },
  key: string,
): { readonly [key: string]: JsonValue } {
  const value = object[key];
  if (!isObject(value)) throw new Error(`DexScreener field ${key} must be an object`);
  return value;
}

function stringField(object: { readonly [key: string]: JsonValue }, key: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`DexScreener field ${key} must be a non-empty string`);
  return value;
}

function nullableString(value: JsonValue | undefined): string | null {
  return value === undefined || value === null ? null : typeof value === "string" ? value : null;
}

function optionalNumber(value: JsonValue | undefined): number | null {
  if (value === undefined || value === null) return null;
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error("DexScreener numeric field is invalid");
  return parsed;
}

function optionalNonNegative(value: JsonValue | undefined): number | null {
  const parsed = optionalNumber(value);
  if (parsed === null) return null;
  if (parsed < 0) throw new Error("DexScreener numeric field cannot be negative");
  return parsed;
}

function nonNegative(value: JsonValue | undefined, field: string, allowMissing: boolean): number {
  if (value === undefined && allowMissing) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(`DexScreener field ${field} is invalid`);
  return value;
}
