export type HealthComponent =
  | "CHAIN_RPC"
  | "INDEXER"
  | "DATABASE"
  | "MARKET_DATA"
  | "HOLDER_DATA"
  | "CLUSTER_DATA"
  | "KEEPER"
  | "ORACLE_REPORTERS"
  | "ARC_RPC";
export type HealthState = "OPERATIONAL" | "DEGRADED" | "UNAVAILABLE";

export interface HealthRecord {
  readonly component: HealthComponent;
  readonly state: HealthState;
  readonly lastSuccessAt: string | null;
  readonly latencyMs: number | null;
  readonly error: string | null;
  readonly freshness: "FRESH" | "STALE" | "UNAVAILABLE";
}

export function healthRecord(
  component: HealthComponent,
  state: HealthState,
  input: Omit<HealthRecord, "component" | "state">,
): HealthRecord {
  return { component, state, ...input };
}
