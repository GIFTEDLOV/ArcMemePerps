import type { Hex, SolanaNetworkConfig } from "@arcmemeperps/shared";
import { canonicalJson, keccak256Hex } from "@arcmemeperps/shared";
import { HttpJsonClient } from "./http.js";
import { evidenceRecord, providerErrorEvidence } from "./evidence.js";
import type { JsonValue, ProviderResult } from "./types.js";

const RUGCHECK_BASE_URL = "https://api.rugcheck.xyz";
let nextPublicRequestAt = 0;

export interface RugCheckTopHolder {
  readonly address: string;
  readonly percentage: number | null;
  readonly amount: string | null;
}

export interface RugCheckObservation {
  readonly mint: string;
  readonly creator: string | null;
  readonly mintAuthority: string | null;
  readonly freezeAuthority: string | null;
  readonly tokenProgram: string | null;
  readonly score: number | null;
  readonly topHolders: readonly RugCheckTopHolder[];
  readonly risks: readonly { readonly name: string | null; readonly level: string | null }[];
  readonly insiderGraphAvailable: boolean;
  readonly rawResponseHash: Hex;
}

export interface RugCheckProviderOptions {
  readonly baseUrl?: string;
  readonly client?: HttpJsonClient;
  readonly minRequestIntervalMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

/** Public GET-only RugCheck enrichment. RPC remains authoritative for chain facts. */
export class RugCheckProvider {
  public readonly providerName = "rugcheck";
  private readonly baseUrl: string;
  private readonly client: HttpJsonClient;
  private readonly minRequestIntervalMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  public constructor(
    public readonly network: SolanaNetworkConfig,
    options: RugCheckProviderOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? RUGCHECK_BASE_URL;
    this.client = options.client ?? new HttpJsonClient({ timeoutMs: 15_000, maxRetries: 1 });
    this.minRequestIntervalMs = options.minRequestIntervalMs ?? 750;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  public async readToken(mint: string, fetchedAt: string): Promise<ProviderResult<RugCheckObservation>> {
    const reportEndpoint = `${this.baseUrl}/v1/tokens/${encodeURIComponent(mint)}/report`;
    const graphEndpoint = `${this.baseUrl}/v1/tokens/${encodeURIComponent(mint)}/insiders/graph`;
    try {
      const report = await this.get(reportEndpoint);
      let graph: JsonValue | null = null;
      let graphError: string | null = null;
      try {
        graph = await this.get(graphEndpoint);
      } catch (error) {
        graphError = error instanceof Error ? error.message : "INSIDER_GRAPH_UNAVAILABLE";
      }
      const value = parseReport(mint, report, graph !== null);
      const evidence = [
        evidenceRecord({
          evidenceId: `${this.providerName}:report:${mint}`,
          kind: "rugcheck-token-report",
          provider: this.providerName,
          chain: "SOLANA",
          network: this.network.name,
          endpointClass: "REST_API",
          dataVersion: "v1",
          schemaVersion: "swagger-1.0",
          fetchedAt,
          observedAt: fetchedAt,
          freshness: "FRESH",
          confidence: 0.6,
          status: "AVAILABLE",
          value: report,
        }),
        evidenceRecord({
          evidenceId: `${this.providerName}:insiders-graph:${mint}`,
          kind: "rugcheck-insider-graph",
          provider: this.providerName,
          chain: "SOLANA",
          network: this.network.name,
          endpointClass: "REST_API",
          dataVersion: "v1",
          schemaVersion: "swagger-1.0",
          fetchedAt,
          observedAt: fetchedAt,
          freshness: graph === null ? "UNAVAILABLE" : "FRESH",
          confidence: graph === null ? 0 : 0.5,
          status: graph === null ? "UNAVAILABLE" : "AVAILABLE",
          value: graph,
          unavailableReason: graphError,
        }),
      ];
      return { status: "AVAILABLE", value, reason: graphError, error: null, evidence };
    } catch (error) {
      const message = error instanceof Error ? error.message : "RugCheck report failed";
      return {
        status: "ERROR",
        value: null,
        reason: null,
        error: message,
        evidence: [
          providerErrorEvidence(
            { chain: "SOLANA", network: this.network.name, fetchedAt },
            this.providerName,
            "rugcheck-token-report",
            message,
          ),
        ],
      };
    }
  }

  private async get(endpoint: string): Promise<JsonValue> {
    const now = Date.now();
    const waitFor = Math.max(0, nextPublicRequestAt - now, this.minRequestIntervalMs - (now - nextPublicRequestAt + this.minRequestIntervalMs));
    if (waitFor > 0) await this.sleep(waitFor);
    nextPublicRequestAt = Date.now() + this.minRequestIntervalMs;
    return this.client.get<JsonValue>(endpoint, { accept: "application/json" });
  }
}

function parseReport(mint: string, payload: JsonValue, graphAvailable: boolean): RugCheckObservation {
  if (!isObject(payload)) throw new Error("RugCheck report is not an object");
  const token = isObject(payload.token) ? payload.token : {};
  const risks = Array.isArray(payload.risks) ? payload.risks.flatMap((item) => {
    if (!isObject(item)) return [];
    return [{ name: stringOrNull(item.name), level: stringOrNull(item.level) }];
  }) : [];
  const holders = Array.isArray(payload.topHolders) ? payload.topHolders.flatMap((item) => {
    if (!isObject(item)) return [];
    const address = stringOrNull(item.address);
    if (address === null) return [];
    return [{ address, percentage: numberOrNull(item.pct ?? item.percentage), amount: stringOrNull(item.amount) }];
  }) : [];
  return {
    mint,
    creator: stringOrNull(payload.creator) ?? stringOrNull(token.creator),
    mintAuthority: stringOrNull(payload.mintAuthority) ?? stringOrNull(token.mintAuthority),
    freezeAuthority: stringOrNull(payload.freezeAuthority) ?? stringOrNull(token.freezeAuthority),
    tokenProgram: stringOrNull(payload.tokenProgram) ?? stringOrNull(token.tokenProgram),
    score: numberOrNull(payload.score),
    topHolders: holders,
    risks,
    insiderGraphAvailable: graphAvailable,
    rawResponseHash: keccak256Hex(canonicalJson(payload)),
  };
}

function isObject(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: JsonValue | undefined): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
