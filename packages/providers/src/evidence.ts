import type {
  EvidenceRecord,
  EvidenceSource,
  EvidenceStatus,
  FreshnessStatus,
} from "@arcmemeperps/domain";
import { canonicalJson, keccak256Hex, type Hex, type SupportedChain } from "@arcmemeperps/shared";
import type { JsonValue } from "./types.js";

export interface EvidenceInput<T extends JsonValue = JsonValue> {
  readonly evidenceId: string;
  readonly kind: string;
  readonly provider: string;
  readonly chain: SupportedChain;
  readonly network: string;
  readonly endpointClass: EvidenceSource["endpointClass"];
  readonly dataVersion: string;
  readonly schemaVersion: string;
  readonly blockNumber?: string | null;
  readonly blockHash?: Hex | null;
  readonly slot?: string | null;
  readonly transaction?: Hex | null;
  readonly signature?: string | null;
  readonly observedAt?: string | null;
  readonly sourceTimestamp?: string | null;
  readonly fetchedAt: string;
  readonly freshness: FreshnessStatus;
  readonly confidence: number;
  readonly status: EvidenceStatus;
  readonly value: T | null;
  readonly unavailableReason?: string | null;
}

export function freshnessFor(
  observedAt: string | null,
  fetchedAt: string,
  maxAgeMs = 5 * 60_000,
): FreshnessStatus {
  if (observedAt === null) return "UNAVAILABLE";
  const observed = Date.parse(observedAt);
  const fetched = Date.parse(fetchedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(fetched)) return "INVALID";
  if (observed > fetched) return "FUTURE_TIMESTAMP";
  return fetched - observed > maxAgeMs ? "STALE" : "FRESH";
}

export function evidenceRecord<T extends JsonValue>(input: EvidenceInput<T>): EvidenceRecord<T> {
  const rawHash = input.value === null ? null : keccak256Hex(canonicalJson(input.value));
  return {
    evidenceId: input.evidenceId,
    kind: input.kind,
    source: {
      provider: input.provider,
      chain: input.chain,
      network: input.network,
      endpointClass: input.endpointClass,
      dataVersion: input.dataVersion,
      schemaVersion: input.schemaVersion,
    },
    position: {
      blockNumber: input.blockNumber ?? null,
      blockHash: input.blockHash ?? null,
      slot: input.slot ?? null,
      transaction: input.transaction ?? null,
      signature: input.signature ?? null,
    },
    observedAt: input.observedAt ?? null,
    sourceTimestamp: input.sourceTimestamp ?? null,
    fetchedAt: input.fetchedAt,
    freshness: input.freshness,
    confidence: input.confidence,
    status: input.status,
    value: input.value,
    rawHash,
    unavailableReason: input.unavailableReason ?? null,
  };
}

export function unavailableEvidence(
  context: Pick<EvidenceInput, "chain" | "network" | "fetchedAt">,
  provider: string,
  kind: string,
  reason: string,
  endpointClass: EvidenceSource["endpointClass"] = "PROVIDER_API",
): EvidenceRecord<null> {
  return evidenceRecord({
    evidenceId: `${provider}:${kind}`,
    kind,
    provider,
    chain: context.chain,
    network: context.network,
    endpointClass,
    dataVersion: "unavailable",
    schemaVersion: "1",
    fetchedAt: context.fetchedAt,
    freshness: "UNAVAILABLE",
    confidence: 0,
    status: "UNAVAILABLE",
    value: null,
    unavailableReason: reason,
  });
}

export function providerErrorEvidence(
  context: Pick<EvidenceInput, "chain" | "network" | "fetchedAt">,
  provider: string,
  kind: string,
  error: string,
  endpointClass: EvidenceSource["endpointClass"] = "PROVIDER_API",
): EvidenceRecord<null> {
  return evidenceRecord({
    evidenceId: `${provider}:${kind}`,
    kind,
    provider,
    chain: context.chain,
    network: context.network,
    endpointClass,
    dataVersion: "error",
    schemaVersion: "1",
    fetchedAt: context.fetchedAt,
    freshness: "INVALID",
    confidence: 0,
    status: "ERROR",
    value: null,
    unavailableReason: error,
  });
}
