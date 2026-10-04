export type HealthComponent =
  | "CHAIN_RPC"
  | "ARC_RPC"
  | "SOLANA_RPC"
  | "ETH_RPC"
  | "BASE_RPC"
  | "BNB_RPC"
  | "ROBINHOOD_RPC"
  | "INDEXER"
  | "DATABASE"
  | "JOB_WORKER"
  | "MARKET_DATA"
  | "MARKET_DISCOVERY"
  | "HOLDER_DATA"
  | "CLUSTER_DATA"
  | "DEPTH_ENGINE"
  | "RISK_ENGINE"
  | "KEEPER"
  | "ORACLE_REPORTERS"
  | "ORACLE"
  | "VAULT"
  | "INSURANCE"
  | "REALTIME_STREAM";
export type HealthState = "OPERATIONAL" | "DEGRADED" | "STALE" | "UNAVAILABLE" | "CRITICAL";

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
