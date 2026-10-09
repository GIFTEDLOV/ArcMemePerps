import { DatabaseSync } from "node:sqlite";

export interface CanonicalDiscoverySource {
  readonly observedAt: string;
  readonly markets: readonly Record<string, unknown>[];
}

interface DiscoveryRow {
  readonly id: string;
  readonly payload_json: string;
  readonly observed_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read the durable canonical discovery universe without mutating its source DB. */
export function loadCanonicalDiscovery(filename: string): CanonicalDiscoverySource {
  const database = new DatabaseSync(filename, { readOnly: true });
  try {
    const rows = database
      .prepare("SELECT id, payload_json, observed_at FROM market_universe ORDER BY id")
      .all() as unknown as readonly DiscoveryRow[];
    if (rows.length === 0) throw new Error("CANONICAL_DISCOVERY_UNIVERSE_EMPTY");

    const markets = rows.map((row) => {
      let payload: unknown;
      try {
        payload = JSON.parse(row.payload_json) as unknown;
      } catch {
        throw new Error(`CANONICAL_DISCOVERY_PAYLOAD_INVALID:${row.id}`);
      }
      if (!isRecord(payload) || payload.marketId !== row.id) {
        throw new Error(`CANONICAL_DISCOVERY_ID_MISMATCH:${row.id}`);
      }
      return payload;
    });
    const observedAt = rows.reduce(
      (latest, row) => (row.observed_at > latest ? row.observed_at : latest),
      "",
    );
    if (observedAt === "") throw new Error("CANONICAL_DISCOVERY_OBSERVATION_TIME_MISSING");
    return { observedAt, markets };
  } finally {
    database.close();
  }
}
