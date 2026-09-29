import type { SupportedNetworkConfig } from "@arcmemeperps/shared";
import { HttpJsonClient } from "./http.js";
import { evidenceRecord, providerErrorEvidence, unavailableEvidence } from "./evidence.js";
import type {
  AddressClassification,
  BubblemapsCluster,
  BubblemapsObservation,
  ClusterHolder,
  JsonValue,
  ProviderResult,
} from "./types.js";

export interface BubblemapsProviderOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly client?: HttpJsonClient;
}

export class BubblemapsProvider {
  public readonly providerName = "bubblemaps";
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly client: HttpJsonClient;

  public constructor(
    public readonly network: SupportedNetworkConfig,
    options: BubblemapsProviderOptions = {},
  ) {
    this.apiKey = options.apiKey?.trim() || null;
    this.baseUrl =
      options.baseUrl ?? process.env.BUBBLEMAPS_BASE_URL ?? "https://api.bubblemaps.io";
    this.client = options.client ?? new HttpJsonClient({ timeoutMs: 8_000, maxRetries: 2 });
  }

  public async readToken(
    tokenAddress: string,
    fetchedAt: string,
  ): Promise<ProviderResult<BubblemapsObservation>> {
    if (this.apiKey === null) {
      return {
        status: "UNAVAILABLE",
        value: null,
        reason: "BUBBLEMAPS_API_KEY_MISSING",
        error: null,
        evidence: [
          unavailableEvidence(
            { chain: this.network.chain, network: this.network.name, fetchedAt },
            this.providerName,
            "holder-clusters",
            "BUBBLEMAPS_API_KEY_MISSING",
          ),
        ],
      };
    }
    const endpoint = `${this.baseUrl}/v0/tokens/map/${this.network.bubbleMapsChainId}/${encodeURIComponent(tokenAddress)}?limit=250&return_nodes=true&return_relationships=true&return_clusters=true`;
    try {
      const payload = await this.client.get<JsonValue>(endpoint, { "X-ApiKey": this.apiKey });
      const value = parseMap(payload, tokenAddress);
      return {
        status: "AVAILABLE",
        value,
        reason: null,
        error: null,
        evidence: [
          evidenceRecord({
            evidenceId: `${this.providerName}:holder-clusters`,
            kind: "holder-clusters",
            provider: this.providerName,
            chain: this.network.chain,
            network: this.network.name,
            endpointClass: "PROVIDER_API",
            dataVersion: "v0-tokens-map",
            schemaVersion: "1",
            fetchedAt,
            freshness: "FRESH",
            confidence: 0.75,
            status: "AVAILABLE",
            value: value as unknown as JsonValue,
          }),
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bubblemaps read failed";
      return {
        status: "ERROR",
        value: null,
        reason: null,
        error: message,
        evidence: [
          providerErrorEvidence(
            { chain: this.network.chain, network: this.network.name, fetchedAt },
            this.providerName,
            "holder-clusters",
            message,
          ),
        ],
      };
    }
  }
}

function parseMap(payload: JsonValue, expectedToken: string): BubblemapsObservation {
  if (!isObject(payload)) throw new Error("Bubblemaps response must be an object");
  const returnedToken = typeof payload.token_address === "string" ? payload.token_address : null;
  if (returnedToken !== null && returnedToken.toLowerCase() !== expectedToken.toLowerCase()) {
    throw new Error("Bubblemaps returned the wrong token");
  }
  const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  const clustersRaw = Array.isArray(payload.clusters) ? payload.clusters : [];
  const holdersByAddress = new Map<string, ClusterHolder>();
  for (const node of nodes.map(parseHolder)) {
    const key = node.address.toLowerCase();
    const existing = holdersByAddress.get(key);
    if (existing === undefined || node.sharePct > existing.sharePct)
      holdersByAddress.set(key, node);
  }
  const holders = [...holdersByAddress.values()];
  const clusters = clustersRaw.map((cluster, index) => parseCluster(cluster, index, holders));
  const nonSystem = holders.filter((holder) => holder.classification === "UNKNOWN");
  const sorted = [...nonSystem].sort((a, b) => b.sharePct - a.sharePct);
  return {
    holders,
    clusters,
    largestIndividualNonSystemPct: sorted[0]?.sharePct ?? 0,
    largestConnectedNonSystemClusterPct: Math.max(
      0,
      ...clusters.map((cluster) => cluster.sharePct),
    ),
    topTenNonSystemPct: sorted.slice(0, 10).reduce((sum, holder) => sum + holder.sharePct, 0),
  };
}

function parseHolder(value: JsonValue): ClusterHolder {
  if (!isObject(value)) throw new Error("Bubblemaps node must be an object");
  const address =
    typeof value.address === "string"
      ? value.address
      : typeof value.id === "string"
        ? value.id
        : null;
  if (address === null) throw new Error("Bubblemaps node is missing an address");
  const share = value.share ?? value.percentage;
  const shareNumber =
    typeof share === "number" ? share : typeof share === "string" ? Number(share) : Number.NaN;
  if (!Number.isFinite(shareNumber) || shareNumber < 0 || shareNumber > 100)
    throw new Error("Bubblemaps holder share is invalid");
  return {
    address,
    sharePct: shareNumber <= 1 ? shareNumber * 100 : shareNumber,
    classification: classifyAddress(value),
  };
}

function parseCluster(
  value: JsonValue,
  index: number,
  holders: readonly ClusterHolder[],
): BubblemapsCluster {
  if (!isObject(value)) throw new Error("Bubblemaps cluster must be an object");
  const membersRaw = Array.isArray(value.nodes)
    ? value.nodes
    : Array.isArray(value.members)
      ? value.members
      : [];
  const members = membersRaw.map((member) => {
    const address =
      typeof member === "string"
        ? member
        : isObject(member) && typeof member.address === "string"
          ? member.address
          : null;
    if (address === null) throw new Error("Bubblemaps cluster member is invalid");
    return (
      holders.find((holder) => holder.address.toLowerCase() === address.toLowerCase()) ?? {
        address,
        sharePct: 0,
        classification: "UNKNOWN" as const,
      }
    );
  });
  const shareValue = value.share ?? value.percentage;
  const parsedShare =
    typeof shareValue === "number"
      ? shareValue
      : typeof shareValue === "string"
        ? Number(shareValue)
        : Number.NaN;
  const memberShare = members
    .filter((member) => member.classification === "UNKNOWN")
    .reduce((sum, member) => sum + member.sharePct, 0);
  const sharePct =
    memberShare > 0
      ? memberShare
      : Number.isFinite(parsedShare)
        ? parsedShare <= 1
          ? parsedShare * 100
          : parsedShare
        : 0;
  return { id: typeof value.id === "string" ? value.id : `cluster-${index}`, members, sharePct };
}

function classifyAddress(value: { readonly [key: string]: JsonValue }): AddressClassification {
  const label = typeof value.label === "string" ? value.label.toLowerCase() : "";
  if (value.is_lp === true || label.includes("lp")) return "LP";
  if (value.is_burn === true || label.includes("burn")) return "BURN";
  if (value.is_dex === true || label.includes("dex")) return "DEX";
  if (value.is_bridge === true || label.includes("bridge")) return "BRIDGE";
  if (value.is_system === true || label.includes("system")) return "SYSTEM";
  if (value.is_cex === true || label.includes("cex")) return "CEX";
  if (value.is_protocol === true || label.includes("protocol")) return "KNOWN_PROTOCOL";
  return "UNKNOWN";
}

function isObject(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
