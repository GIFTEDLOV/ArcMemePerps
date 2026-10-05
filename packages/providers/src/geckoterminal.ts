import type { Hex, SupportedChain, SupportedNetworkConfig } from "@arcmemeperps/shared";
import { canonicalJson, keccak256Hex } from "@arcmemeperps/shared";
import { HttpJsonClient } from "./http.js";
import { evidenceRecord, providerErrorEvidence } from "./evidence.js";
import type { JsonValue, ProviderResult } from "./types.js";

const GECKO_BASE_URL = "https://api.geckoterminal.com/api/v2";
const API_VERSION = "20230203";
let nextPublicRequestAt = 0;

export interface GeckoPoolObservation {
  readonly network: string;
  readonly poolAddress: string;
  readonly dexId: string | null;
  readonly name: string | null;
  readonly baseTokenAddress: string | null;
  readonly quoteTokenAddress: string | null;
  readonly baseTokenSymbol: string | null;
  readonly quoteTokenSymbol: string | null;
  readonly priceUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  readonly buys24h: number | null;
  readonly sells24h: number | null;
  readonly pairCreatedAt: string | null;
  readonly observedAt: string;
}

export interface GeckoTokenObservation {
  readonly network: string;
  readonly tokenAddress: string;
  readonly pools: readonly GeckoPoolObservation[];
  readonly rawResponseHash: Hex;
}

export interface GeckoOhlcvPoint {
  readonly timestamp: string;
  readonly openUsd: number;
  readonly highUsd: number;
  readonly lowUsd: number;
  readonly closeUsd: number;
  readonly volumeUsd: number | null;
  readonly reserveUsd: number | null;
}

export interface GeckoTerminalProviderOptions {
  readonly baseUrl?: string;
  readonly client?: HttpJsonClient;
  /** The public API is rate limited; the default is deliberately conservative. */
  readonly minRequestIntervalMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export class GeckoTerminalProvider {
  public readonly providerName = "geckoterminal";
  private readonly baseUrl: string;
  private readonly client: HttpJsonClient;
  private readonly minRequestIntervalMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private lastRequestAt = 0;

  public constructor(
    public readonly network: SupportedNetworkConfig,
    options: GeckoTerminalProviderOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? GECKO_BASE_URL;
    this.client = options.client ?? new HttpJsonClient({ timeoutMs: 10_000, maxRetries: 2 });
    this.minRequestIntervalMs = options.minRequestIntervalMs ?? 6_100;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  public get geckoNetworkId(): string {
    return networkIdFor(this.network.chain);
  }

  public async readToken(
    tokenAddress: string,
    fetchedAt: string,
    page = 1,
  ): Promise<ProviderResult<GeckoTokenObservation>> {
    const endpoint = `${this.baseUrl}/networks/${this.geckoNetworkId}/tokens/${encodeURIComponent(tokenAddress)}/pools?page=${page}`;
    try {
      const payload = await this.get(endpoint);
      const pools = parsePools(payload, this.geckoNetworkId, fetchedAt);
      const value: GeckoTokenObservation = {
        network: this.geckoNetworkId,
        tokenAddress,
        pools,
        rawResponseHash: keccak256Hex(canonicalJson(payload)),
      };
      return {
        status: "AVAILABLE",
        value,
        reason: pools.length === 0 ? "TOKEN_NOT_FOUND_OR_NO_POOLS" : null,
        error: null,
        evidence: [
          evidenceRecord({
            evidenceId: `${this.providerName}:token-pools:${tokenAddress.toLowerCase()}:page-${page}`,
            kind: "gecko-token-pools",
            provider: this.providerName,
            chain: this.network.chain,
            network: this.network.name,
            endpointClass: "REST_API",
            dataVersion: "api/v2",
            schemaVersion: "20230203",
            fetchedAt,
            observedAt: fetchedAt,
            freshness: "FRESH",
            confidence: pools.length > 0 ? 0.75 : 0.25,
            status: "AVAILABLE",
            value: value as unknown as JsonValue,
          }),
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "GeckoTerminal read failed";
      return {
        status: "ERROR",
        value: null,
        reason: null,
        error: message,
        evidence: [
          providerErrorEvidence(
            { chain: this.network.chain, network: this.network.name, fetchedAt },
            this.providerName,
            "gecko-token-pools",
            message,
          ),
        ],
      };
    }
  }

  public async readNetworkPools(
    fetchedAt: string,
    kind: "pools" | "new_pools" | "trending_pools" = "pools",
    page = 1,
  ): Promise<ProviderResult<readonly GeckoPoolObservation[]>> {
    const endpoint = `${this.baseUrl}/networks/${this.geckoNetworkId}/${kind}?include=base_token,quote_token,dex&page=${page}${kind === "pools" ? "&sort=h24_volume_usd_desc" : ""}`;
    try {
      const payload = await this.get(endpoint);
      const pools = parsePools(payload, this.geckoNetworkId, fetchedAt);
      return {
        status: "AVAILABLE",
        value: pools,
        reason: pools.length === 0 ? "NO_NETWORK_POOLS" : null,
        error: null,
        evidence: [
          evidenceRecord({
            evidenceId: `${this.providerName}:network-pools:${this.geckoNetworkId}:${kind}:page-${page}`,
            kind: "gecko-network-pools",
            provider: this.providerName,
            chain: this.network.chain,
            network: this.network.name,
            endpointClass: "REST_API",
            dataVersion: "api/v2",
            schemaVersion: API_VERSION,
            fetchedAt,
            observedAt: fetchedAt,
            freshness: "FRESH",
            confidence: pools.length > 0 ? 0.7 : 0.2,
            status: "AVAILABLE",
            value: pools as unknown as JsonValue,
          }),
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "GeckoTerminal network-pool read failed";
      return {
        status: "ERROR",
        value: null,
        reason: null,
        error: message,
        evidence: [
          providerErrorEvidence(
            { chain: this.network.chain, network: this.network.name, fetchedAt },
            this.providerName,
            "gecko-network-pools",
            message,
          ),
        ],
      };
    }
  }

  public async readOhlcv(
    poolAddress: string,
    fetchedAt: string,
    timeframe: "minute" | "hour" | "day" = "hour",
    aggregate = 1,
    limit = 100,
  ): Promise<ProviderResult<readonly GeckoOhlcvPoint[]>> {
    const endpoint = `${this.baseUrl}/networks/${this.geckoNetworkId}/pools/${encodeURIComponent(poolAddress)}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}`;
    try {
      const payload = await this.get(endpoint);
      const points = parseOhlcv(payload);
      return {
        status: "AVAILABLE",
        value: points,
        reason: points.length === 0 ? "NO_OHLCV_OBSERVATIONS" : null,
        error: null,
        evidence: [
          evidenceRecord({
            evidenceId: `${this.providerName}:ohlcv:${poolAddress.toLowerCase()}:${timeframe}:${aggregate}`,
            kind: "gecko-pool-ohlcv",
            provider: this.providerName,
            chain: this.network.chain,
            network: this.network.name,
            endpointClass: "REST_API",
            dataVersion: "api/v2",
            schemaVersion: API_VERSION,
            fetchedAt,
            observedAt: points.at(-1)?.timestamp ?? null,
            sourceTimestamp: points.at(-1)?.timestamp ?? null,
            freshness: points.length === 0 ? "UNAVAILABLE" : "FRESH",
            confidence: points.length > 0 ? 0.7 : 0,
            status: "AVAILABLE",
            value: points as unknown as JsonValue,
          }),
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "GeckoTerminal OHLCV read failed";
      return {
        status: "ERROR",
        value: null,
        reason: null,
        error: message,
        evidence: [
          providerErrorEvidence(
            { chain: this.network.chain, network: this.network.name, fetchedAt },
            this.providerName,
            "gecko-pool-ohlcv",
            message,
          ),
        ],
      };
    }
  }

  private async get(endpoint: string): Promise<JsonValue> {
    const now = Date.now();
    const localWait = this.minRequestIntervalMs - (now - this.lastRequestAt);
    const globalWait = nextPublicRequestAt - now;
    const waitFor = Math.max(0, localWait, globalWait);
    if (waitFor > 0) await this.sleep(waitFor);
    this.lastRequestAt = Date.now();
    nextPublicRequestAt = this.lastRequestAt + this.minRequestIntervalMs;
    return this.client.get<JsonValue>(endpoint, {
      accept: `application/json;version=${API_VERSION}`,
    });
  }
}

function networkIdFor(chain: SupportedChain): string {
  switch (chain) {
    case "SOLANA": return "solana";
    case "BNB": return "bsc";
    case "BASE": return "base";
    case "ETHEREUM": return "eth";
    case "ROBINHOOD": return "robinhood";
    case "ARC": return "arc";
  }
}

function parsePools(payload: JsonValue, expectedNetwork: string, observedAt: string): GeckoPoolObservation[] {
  if (!isObject(payload) || !Array.isArray(payload.data)) throw new Error("GeckoTerminal response missing data array");
  const pools: GeckoPoolObservation[] = [];
  const seen = new Set<string>();
  for (const item of payload.data) {
    if (!isObject(item) || item.type !== "pool" || typeof item.id !== "string") continue;
    const [network, ...addressParts] = item.id.split("_");
    if (network !== expectedNetwork) throw new Error("GeckoTerminal returned the wrong network");
    const poolAddress = stringOrNull(addressParts.join("_")) ?? stringOrNull(attribute(item, "address"));
    if (poolAddress === null || seen.has(poolAddress.toLowerCase())) continue;
    const attributes = isObject(item.attributes) ? item.attributes : {};
    const relationships = isObject(item.relationships) ? item.relationships : {};
    const base = relationshipAddress(relationships, "base_token");
    const quote = relationshipAddress(relationships, "quote_token");
    seen.add(poolAddress.toLowerCase());
    pools.push({
      network: expectedNetwork,
      poolAddress,
      dexId: relationshipId(relationships, "dex") ?? stringOrNull(attributes.dex_name) ?? stringOrNull(attributes.dex_id),
      name: stringOrNull(attributes.name),
      baseTokenAddress: base,
      quoteTokenAddress: quote,
      baseTokenSymbol: stringOrNull(attributes.base_token_symbol) ?? symbolFromPoolName(stringOrNull(attributes.name)),
      quoteTokenSymbol: stringOrNull(attributes.quote_token_symbol),
      priceUsd: numberOrNull(attributes.base_token_price_usd),
      liquidityUsd: numberOrNull(attributes.reserve_in_usd),
      volume24hUsd: nestedNumber(attributes.volume_usd, "h24"),
      buys24h: nestedNumber(attributes.transactions, "h24", "buys"),
      sells24h: nestedNumber(attributes.transactions, "h24", "sells"),
      pairCreatedAt: dateOrNull(attributes.pool_created_at),
      observedAt,
    });
  }
  return pools;
}

function parseOhlcv(payload: JsonValue): GeckoOhlcvPoint[] {
  if (!isObject(payload) || !isObject(payload.data)) throw new Error("GeckoTerminal OHLCV response missing data");
  const attributes = isObject(payload.data.attributes) ? payload.data.attributes : {};
  const rows = attributes.ohlcv_list;
  if (!Array.isArray(rows)) throw new Error("GeckoTerminal OHLCV response missing ohlcv_list");
  return rows.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 5) return [];
    const timestamp = numberOrNull(row[0]);
    const openUsd = numberOrNull(row[1]);
    const highUsd = numberOrNull(row[2]);
    const lowUsd = numberOrNull(row[3]);
    const closeUsd = numberOrNull(row[4]);
    if (timestamp === null || openUsd === null || highUsd === null || lowUsd === null || closeUsd === null) return [];
    return [{
      timestamp: new Date(timestamp * 1_000).toISOString(),
      openUsd,
      highUsd,
      lowUsd,
      closeUsd,
      volumeUsd: numberOrNull(row[5]),
      reserveUsd: numberOrNull(row[6]),
    }];
  });
}

function relationshipAddress(
  relationships: { readonly [key: string]: JsonValue },
  key: string,
): string | null {
  const relation = relationships[key];
  if (!isObject(relation) || !isObject(relation.data)) return null;
  const id = relation.data.id;
  if (typeof id !== "string") return null;
  const [, ...addressParts] = id.split("_");
  return addressParts.join("_") || null;
}

function relationshipId(
  relationships: { readonly [key: string]: JsonValue },
  key: string,
): string | null {
  const relation = relationships[key];
  if (!isObject(relation) || !isObject(relation.data) || typeof relation.data.id !== "string") return null;
  return relation.data.id;
}

function symbolFromPoolName(name: string | null): string | null {
  if (name === null) return null;
  const symbol = name.split("/")[0]?.trim();
  return symbol === undefined || symbol.length === 0 ? null : symbol;
}

function attribute(item: { readonly [key: string]: JsonValue }, key: string): JsonValue | undefined {
  return isObject(item.attributes) ? item.attributes[key] : undefined;
}

function isObject(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: JsonValue | undefined): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function nestedNumber(value: JsonValue | undefined, first: string, second?: string): number | null {
  if (!isObject(value)) return null;
  return numberOrNull(second === undefined ? value[first] : isObject(value[first]) ? value[first][second] : undefined);
}

function dateOrNull(value: JsonValue | undefined): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
