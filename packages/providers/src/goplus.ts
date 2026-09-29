import type { SupportedNetworkConfig } from "@arcmemeperps/shared";
import { HttpJsonClient } from "./http.js";
import { evidenceRecord, providerErrorEvidence, unavailableEvidence } from "./evidence.js";
import type { GoPlusSecurityObservation, JsonValue, ProviderResult } from "./types.js";

export interface GoPlusProviderOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly client?: HttpJsonClient;
}

export class GoPlusProvider {
  public readonly providerName = "goplus";
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly client: HttpJsonClient;

  public constructor(
    public readonly network: SupportedNetworkConfig,
    options: GoPlusProviderOptions = {},
  ) {
    this.apiKey = options.apiKey?.trim() || null;
    this.baseUrl = options.baseUrl ?? process.env.GO_PLUS_BASE_URL ?? "https://api.gopluslabs.io";
    this.client = options.client ?? new HttpJsonClient({ timeoutMs: 8_000, maxRetries: 2 });
  }

  public async readToken(
    tokenAddress: string,
    fetchedAt: string,
  ): Promise<ProviderResult<GoPlusSecurityObservation>> {
    if (this.apiKey === null) {
      return {
        status: "UNAVAILABLE",
        value: null,
        reason: "GOPLUS_API_KEY_MISSING",
        error: null,
        evidence: [
          unavailableEvidence(
            { chain: this.network.chain, network: this.network.name, fetchedAt },
            this.providerName,
            "token-security",
            "GOPLUS_API_KEY_MISSING",
          ),
        ],
      };
    }
    const endpoint =
      this.network.kind === "EVM"
        ? `${this.baseUrl}/api/v1/token_security/${this.network.goPlusChainId}?contract_addresses=${encodeURIComponent(tokenAddress)}`
        : `${this.baseUrl}/api/v1/solana/token_security?contract_addresses=${encodeURIComponent(tokenAddress)}`;
    try {
      const payload = await this.client.get<JsonValue>(endpoint, {
        Authorization: `Bearer ${this.apiKey}`,
      });
      const raw = parseResult(payload, tokenAddress);
      const value = normalizeSecurity(raw);
      return {
        status: "AVAILABLE",
        value,
        reason: null,
        error: null,
        evidence: [
          evidenceRecord({
            evidenceId: `${this.providerName}:token-security`,
            kind: "token-security",
            provider: this.providerName,
            chain: this.network.chain,
            network: this.network.name,
            endpointClass: "PROVIDER_API",
            dataVersion: "token_security",
            schemaVersion: "1",
            fetchedAt,
            freshness: "FRESH",
            confidence: 0.7,
            status: "AVAILABLE",
            value: value as unknown as JsonValue,
          }),
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "GoPlus read failed";
      return {
        status: "ERROR",
        value: null,
        reason: null,
        error: message,
        evidence: [
          providerErrorEvidence(
            { chain: this.network.chain, network: this.network.name, fetchedAt },
            this.providerName,
            "token-security",
            message,
          ),
        ],
      };
    }
  }
}

function parseResult(
  payload: JsonValue,
  tokenAddress: string,
): { readonly [key: string]: JsonValue } {
  if (!isObject(payload) || !isObject(payload.result))
    throw new Error("GoPlus response missing result object");
  const result = payload.result;
  if ("is_open_source" in result || "is_proxy" in result || "creator_address" in result)
    return result;
  const matchingKey = Object.keys(result).find(
    (key) => key.toLowerCase() === tokenAddress.toLowerCase(),
  );
  const direct = matchingKey === undefined ? undefined : result[matchingKey];
  if (isObject(direct)) return direct;
  throw new Error("GoPlus response token key does not match the requested token");
}

function normalizeSecurity(raw: { readonly [key: string]: JsonValue }): GoPlusSecurityObservation {
  return {
    raw,
    isOpenSource: parseBool(raw.is_open_source),
    isProxy: parseBool(raw.is_proxy),
    isMintable: parseBool(raw.is_mintable ?? raw.is_mintable_spl),
    cannotBuy: parseBool(raw.cannot_buy),
    cannotSell: parseBool(raw.cannot_sell),
    isHoneypot: parseBool(raw.is_honeypot),
    creatorAddress: typeof raw.creator_address === "string" ? raw.creator_address : null,
    holderCount: parseInteger(raw.holder_count),
    lpHolderCount: Array.isArray(raw.lp_holders) ? raw.lp_holders.length : null,
  };
}

function parseBool(value: JsonValue | undefined): boolean | null {
  if (value === undefined || value === null) return null;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return null;
}

function parseInteger(value: JsonValue | undefined): number | null {
  if (value === undefined || value === null) return null;
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function isObject(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return (
    value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
  );
}
