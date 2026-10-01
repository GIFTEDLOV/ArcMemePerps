import { DatabaseSync } from "node:sqlite";

export const PERSISTENCE_SCHEMA_VERSION = 1;
export const PERSISTED_ENTITIES = [
  "markets",
  "market_snapshots",
  "provider_observations",
  "evidence",
  "qualifications",
  "wallet_analytics",
  "tracked_wallets",
  "protocol_events",
  "orders",
  "positions",
  "notifications",
  "profiles",
  "competition_seasons",
  "competition_entries",
  "competition_score_snapshots",
  "indexer_checkpoints",
] as const;
export type PersistedEntity = (typeof PERSISTED_ENTITIES)[number];

export interface PersistenceEnvelope {
  readonly id: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly observedAt: string;
  readonly updatedAt: string;
}

export interface PersistenceStore {
  put(
    entity: PersistedEntity,
    id: string,
    payload: Readonly<Record<string, unknown>>,
    observedAt: string,
  ): void;
  get(entity: PersistedEntity, id: string): PersistenceEnvelope | null;
  list(entity: PersistedEntity): readonly PersistenceEnvelope[];
  delete(entity: PersistedEntity, id: string): void;
  close(): void;
}

/** SQLite-compatible schema. Canonical domain schemas validate payloads at process boundaries. */
export const PERSISTENCE_MIGRATIONS: readonly string[] = [
  "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);",
  ...PERSISTED_ENTITIES.map(
    (entity) =>
      `CREATE TABLE IF NOT EXISTS ${entity} (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, observed_at TEXT NOT NULL, updated_at TEXT NOT NULL);`,
  ),
];

export class SQLitePersistence implements PersistenceStore {
  private readonly db: DatabaseSync;

  public constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  public put(
    entity: PersistedEntity,
    id: string,
    payload: Readonly<Record<string, unknown>>,
    observedAt: string,
  ): void {
    const statement = this.db.prepare(
      `INSERT INTO ${entity} (id, payload_json, observed_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json, observed_at=excluded.observed_at, updated_at=excluded.updated_at`,
    );
    statement.run(id, JSON.stringify(payload), observedAt, new Date().toISOString());
  }

  public get(entity: PersistedEntity, id: string): PersistenceEnvelope | null {
    const row = this.db
      .prepare(`SELECT id, payload_json, observed_at, updated_at FROM ${entity} WHERE id = ?`)
      .get(id) as
      { id: string; payload_json: string; observed_at: string; updated_at: string } | undefined;
    return row === undefined ? null : decodeRow(row);
  }

  public list(entity: PersistedEntity): readonly PersistenceEnvelope[] {
    const rows = this.db
      .prepare(`SELECT id, payload_json, observed_at, updated_at FROM ${entity} ORDER BY id`)
      .all() as unknown as readonly {
      id: string;
      payload_json: string;
      observed_at: string;
      updated_at: string;
    }[];
    return rows.map(decodeRow);
  }

  public delete(entity: PersistedEntity, id: string): void {
    this.db.prepare(`DELETE FROM ${entity} WHERE id = ?`).run(id);
  }
  public close(): void {
    this.db.close();
  }

  private migrate(): void {
    for (const migration of PERSISTENCE_MIGRATIONS) this.db.exec(migration);
    const applied = this.db
      .prepare("SELECT version FROM schema_migrations WHERE version = ?")
      .get(PERSISTENCE_SCHEMA_VERSION);
    if (applied === undefined) {
      this.db
        .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(PERSISTENCE_SCHEMA_VERSION, new Date().toISOString());
    }
  }
}

/** Explicitly test-only. Production code must choose a durable adapter. */
export class InMemoryPersistence implements PersistenceStore {
  private readonly records = new Map<PersistedEntity, Map<string, PersistenceEnvelope>>();

  public put(
    entity: PersistedEntity,
    id: string,
    payload: Readonly<Record<string, unknown>>,
    observedAt: string,
  ): void {
    const table = this.records.get(entity) ?? new Map<string, PersistenceEnvelope>();
    table.set(id, { id, payload, observedAt, updatedAt: new Date().toISOString() });
    this.records.set(entity, table);
  }
  public get(entity: PersistedEntity, id: string): PersistenceEnvelope | null {
    return this.records.get(entity)?.get(id) ?? null;
  }
  public list(entity: PersistedEntity): readonly PersistenceEnvelope[] {
    return [...(this.records.get(entity)?.values() ?? [])].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
  }
  public delete(entity: PersistedEntity, id: string): void {
    this.records.get(entity)?.delete(id);
  }
  public close(): void {
    this.records.clear();
  }
}

function decodeRow(row: {
  readonly id: string;
  readonly payload_json: string;
  readonly observed_at: string;
  readonly updated_at: string;
}): PersistenceEnvelope {
  const payload = JSON.parse(row.payload_json) as unknown;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("persisted payload must be an object");
  return {
    id: row.id,
    payload: payload as Readonly<Record<string, unknown>>,
    observedAt: row.observed_at,
    updatedAt: row.updated_at,
  };
}
