import type { SolanaNetworkConfig } from "@arcmemeperps/shared";
import { HttpJsonClient } from "./http.js";
import { evidenceRecord, providerErrorEvidence, unavailableEvidence } from "./evidence.js";
import type { JsonValue, ProviderResult } from "./types.js";

export interface HeliusAssetObservation {
  readonly raw: JsonValue;
  readonly name: string | null;
  readonly symbol: string | null;
  readonly description: string | null;
  readonly ownerCount: number | null;
}

export interface HeliusProviderOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly client?: HttpJsonClient;
}

export class HeliusProvider {
  public readonly providerName = "helius";
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly client: HttpJsonClient;

  public constructor(
    public readonly network: SolanaNetworkConfig,
    options: HeliusProviderOptions = {},
  ) {
    this.apiKey = options.apiKey?.trim() || null;
    this.baseUrl =
      options.baseUrl ?? process.env.HELIUS_BASE_URL ?? "https://mainnet.helius-rpc.com";
    this.client = options.client ?? new HttpJsonClient({ timeoutMs: 8_000, maxRetries: 2 });
  }

  public async readAsset(
    assetId: string,
    fetchedAt: string,
  ): Promise<ProviderResult<HeliusAssetObservation>> {
    if (this.apiKey === null) {
      return {
        status: "UNAVAILABLE",
        value: null,
        reason: "HELIUS_API_KEY_MISSING",
        error: null,
        evidence: [
          unavailableEvidence(
            { chain: "SOLANA", network: this.network.name, fetchedAt },
            this.providerName,
            "asset-metadata",
            "HELIUS_API_KEY_MISSING",
          ),
        ],
      };
    }
    try {
      const payload = await this.client.post<JsonValue>(
        `${this.baseUrl}/?api-key=${encodeURIComponent(this.apiKey)}`,
        {
          jsonrpc: "2.0",
          id: "arcmemeperps-read",
          method: "getAsset",
          params: { id: assetId },
        },
      );
      const result = isObject(payload) && isObject(payload.result) ? payload.result : null;
      if (result === null) throw new Error("Helius getAsset response missing result");
      const content = isObject(result.content) ? result.content : {};
      const metadata = isObject(content.metadata) ? content.metadata : {};
      const ownership = isObject(result.ownership) ? result.ownership : {};
      const value: HeliusAssetObservation = {
        raw: result,
        name: stringOrNull(metadata.name),
        symbol: stringOrNull(metadata.symbol),
        description: stringOrNull(metadata.description),
        ownerCount: integerOrNull(ownership.owner_count),
      };
      return {
        status: "AVAILABLE",
        value,
        reason: null,
        error: null,
        evidence: [
          evidenceRecord({
            evidenceId: `${this.providerName}:asset-metadata`,
            kind: "solana-asset-metadata",
            provider: this.providerName,
            chain: "SOLANA",
            network: this.network.name,
            endpointClass: "PROVIDER_API",
            dataVersion: "DAS-getAsset",
            schemaVersion: "1",
            fetchedAt,
            freshness: "FRESH",
            confidence: 0.75,
            status: "AVAILABLE",
            value: {
              name: value.name,
              symbol: value.symbol,
              description: value.description,
              ownerCount: value.ownerCount,
            },
          }),
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Helius read failed";
      return {
        status: "ERROR",
        value: null,
        reason: null,
        error: message,
        evidence: [
          providerErrorEvidence(
            { chain: "SOLANA", network: this.network.name, fetchedAt },
            this.providerName,
            "asset-metadata",
            message,
          ),
        ],
      };
    }
  }
}

function isObject(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return (
    value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
  );
}

function stringOrNull(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function integerOrNull(value: JsonValue | undefined): number | null {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
