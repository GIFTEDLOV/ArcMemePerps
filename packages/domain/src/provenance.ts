import type { ChainId, Hex, SupportedChain } from "@arcmemeperps/shared";

export const FRESHNESS_STATUSES = [
  "FRESH",
  "STALE",
  "FUTURE_TIMESTAMP",
  "UNAVAILABLE",
  "INVALID",
] as const;
export type FreshnessStatus = (typeof FRESHNESS_STATUSES)[number];

export const EVIDENCE_STATUSES = ["AVAILABLE", "UNAVAILABLE", "ERROR"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const ENDPOINT_CLASSES = [
  "RPC",
  "REST_API",
  "INDEXER_API",
  "PROVIDER_API",
  "FIXTURE",
] as const;
export type EndpointClass = (typeof ENDPOINT_CLASSES)[number];

export interface EvidenceSource {
  readonly provider: string;
  readonly chain: SupportedChain;
  readonly network: string;
  readonly endpointClass: EndpointClass;
  readonly dataVersion: string;
  readonly schemaVersion: string;
}

export interface EvidencePosition {
  readonly blockNumber: string | null;
  readonly blockHash: Hex | null;
  readonly slot: string | null;
  readonly transaction: Hex | null;
  readonly signature: string | null;
}

export interface EvidenceRecord<T = unknown> {
  readonly evidenceId: string;
  readonly kind: string;
  readonly source: EvidenceSource;
  readonly position: EvidencePosition;
  readonly observedAt: string | null;
  readonly sourceTimestamp: string | null;
  readonly fetchedAt: string;
  readonly freshness: FreshnessStatus;
  readonly confidence: number;
  readonly status: EvidenceStatus;
  readonly value: T | null;
  readonly rawHash: Hex | null;
  readonly unavailableReason: string | null;
}

export interface EvidenceBundle {
  readonly schemaVersion: string;
  readonly records: readonly EvidenceRecord[];
}

export interface EvidenceRoot {
  readonly algorithm: "keccak256-merkle-v1";
  readonly schemaVersion: string;
  readonly root: Hex;
  readonly recordCount: number;
  readonly leafCount: number;
}

export interface AssessmentPosition {
  readonly chain: ChainId;
  readonly blockNumber: string | null;
  readonly blockHash: Hex | null;
  readonly slot: string | null;
}

export interface ProviderAvailability {
  readonly provider: string;
  readonly status: EvidenceStatus;
  readonly reason: string | null;
  readonly fetchedAt: string;
}

export type DataReconciliationStatus =
  "CONSISTENT" | "MINOR_DIVERGENCE" | "MATERIAL_DIVERGENCE" | "STALE" | "UNAVAILABLE";

export interface DataDisagreement {
  readonly field: string;
  readonly status: Exclude<DataReconciliationStatus, "CONSISTENT" | "UNAVAILABLE">;
  readonly sources: readonly string[];
  readonly values: readonly string[];
  readonly tolerance: string;
  readonly resolution: "BLOCK_AUTOMATIC_QUALIFICATION" | "RETAIN_CONSERVATIVE_VALUE";
}
