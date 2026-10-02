import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  MarketPassportSchema,
  NotificationEventSchema,
  UserProfileSchema,
  type MarketPassport,
  type NotificationEvent,
  type UserProfile,
} from "@arcmemeperps/domain";

export const PERSISTENCE_SCHEMA_VERSION = 3;
export const PERSISTED_ENTITIES = [
  "markets",
  "tokens",
  "market_snapshots",
  "price_history",
  "pools",
  "liquidity_snapshots",
  "depth_snapshots",
  "provider_observations",
  "evidence",
  "holders",
  "holder_snapshots",
  "clusters",
  "funding_graph_edges",
  "first_buyers",
  "deployer_profiles",
  "qualifications",
  "wallet_analytics",
  "tracked_wallets",
  "wallet_events",
  "risk_changes",
  "protocol_events",
  "orders",
  "positions",
  "liquidations",
  "vault_snapshots",
  "notifications",
  "profiles",
  "watchlists",
  "competition_seasons",
  "competition_entries",
  "competition_score_snapshots",
  "indexer_checkpoints",
  "jobs",
  "health_records",
  "reconciliation_snapshots",
  "reporter_sequences",
  "discovery_events",
  "discovery_sources",
  "deployer_refreshes",
  "reports",
  "recovery_actions",
  "lp_withdrawals",
  "adl_episodes",
  "reconciliation_failures",
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

export interface PersistenceTransaction extends PersistenceStore {
  transaction<T>(work: () => T): T;
  health(): PersistenceHealth;
}

export interface PersistenceHealth {
  readonly status: "OPERATIONAL" | "DEGRADED" | "UNAVAILABLE";
  readonly schemaVersion: number;
  readonly checkedAt: string;
  readonly latencyMs: number;
  readonly error: string | null;
}

/** Minimal driver contract so PostgreSQL remains optional at install time. */
export interface PostgresQueryClient {
  query<T extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: readonly T[] }>;
}

export interface AsyncPersistenceStore {
  put(
    entity: PersistedEntity,
    id: string,
    payload: Readonly<Record<string, unknown>>,
    observedAt: string,
  ): Promise<void>;
  get(entity: PersistedEntity, id: string): Promise<PersistenceEnvelope | null>;
  list(entity: PersistedEntity): Promise<readonly PersistenceEnvelope[]>;
  delete(entity: PersistedEntity, id: string): Promise<void>;
  migrate(): Promise<void>;
  health(): Promise<PersistenceHealth>;
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

  public transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  public health(): PersistenceHealth {
    const started = Date.now();
    try {
      const row = this.db
        .prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1")
        .get() as { version: number } | undefined;
      this.db.prepare("SELECT 1").get();
      return {
        status: "OPERATIONAL",
        schemaVersion: row?.version ?? 0,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        error: null,
      };
    } catch (error) {
      return {
        status: "UNAVAILABLE",
        schemaVersion: 0,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "database health check failed",
      };
    }
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

/**
 * PostgreSQL-compatible durable adapter. The repository deliberately does not
 * bundle a driver: production supplies a parameterized `pg`/Postgres client.
 * JSONB preserves the same canonical Zod boundary used by SQLite.
 */
export class PostgresPersistence implements AsyncPersistenceStore {
  public constructor(private readonly client: PostgresQueryClient) {}

  public async migrate(): Promise<void> {
    await this.client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL)",
    );
    for (const entity of PERSISTED_ENTITIES) {
      await this.client.query(
        `CREATE TABLE IF NOT EXISTS ${entity} (id TEXT PRIMARY KEY, payload_json JSONB NOT NULL, observed_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL)`,
      );
    }
    const current = await this.client.query<{ version: number }>(
      "SELECT version FROM schema_migrations WHERE version = $1",
      [PERSISTENCE_SCHEMA_VERSION],
    );
    if (current.rows.length === 0)
      await this.client.query(
        "INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW())",
        [PERSISTENCE_SCHEMA_VERSION],
      );
  }

  public async put(
    entity: PersistedEntity,
    id: string,
    payload: Readonly<Record<string, unknown>>,
    observedAt: string,
  ): Promise<void> {
    await this.client.query(
      `INSERT INTO ${entity} (id, payload_json, observed_at, updated_at) VALUES ($1, $2::jsonb, $3::timestamptz, NOW())
       ON CONFLICT (id) DO UPDATE SET payload_json=EXCLUDED.payload_json, observed_at=EXCLUDED.observed_at, updated_at=NOW()`,
      [id, JSON.stringify(payload), observedAt],
    );
  }

  public async get(entity: PersistedEntity, id: string): Promise<PersistenceEnvelope | null> {
    const result = await this.client.query<{
      id: string;
      payload_json: Readonly<Record<string, unknown>>;
      observed_at: string;
      updated_at: string;
    }>(`SELECT id, payload_json, observed_at, updated_at FROM ${entity} WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          id: row.id,
          payload: row.payload_json,
          observedAt: new Date(row.observed_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
        };
  }

  public async list(entity: PersistedEntity): Promise<readonly PersistenceEnvelope[]> {
    const result = await this.client.query<{
      id: string;
      payload_json: Readonly<Record<string, unknown>>;
      observed_at: string;
      updated_at: string;
    }>(`SELECT id, payload_json, observed_at, updated_at FROM ${entity} ORDER BY id`);
    return result.rows.map((row) => ({
      id: row.id,
      payload: row.payload_json,
      observedAt: new Date(row.observed_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }

  public async delete(entity: PersistedEntity, id: string): Promise<void> {
    await this.client.query(`DELETE FROM ${entity} WHERE id = $1`, [id]);
  }

  public async health(): Promise<PersistenceHealth> {
    const started = Date.now();
    try {
      const result = await this.client.query<{ version: number }>(
        "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
      );
      await this.client.query("SELECT 1");
      return {
        status: "OPERATIONAL",
        schemaVersion: result.rows[0]?.version ?? 0,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        error: null,
      };
    } catch (error) {
      return {
        status: "UNAVAILABLE",
        schemaVersion: 0,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "database health check failed",
      };
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

export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface DurableJob {
  readonly id: string;
  readonly type: string;
  readonly dedupeKey: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly status: JobStatus;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly availableAt: string;
  readonly lockedAt: string | null;
  readonly leaseId: string | null;
  readonly completedAt: string | null;
  readonly lastError: string | null;
}

/**
 * Durable local job queue. A production queue can implement the same interface;
 * workers never depend on an in-memory queue or unbounded retries.
 */
export class PersistentJobQueue {
  public constructor(
    private readonly storage: PersistenceStore,
    private readonly leaseMs = 60_000,
  ) {}

  public enqueue(input: {
    readonly id: string;
    readonly type: string;
    readonly dedupeKey: string;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly maxAttempts?: number;
    readonly availableAt?: string;
  }): DurableJob {
    if (isTransactionalStore(this.storage)) {
      return this.storage.transaction(() => this.enqueueUnsafe(input));
    }
    return this.enqueueUnsafe(input);
  }

  private enqueueUnsafe(input: {
    readonly id: string;
    readonly type: string;
    readonly dedupeKey: string;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly maxAttempts?: number;
    readonly availableAt?: string;
  }): DurableJob {
    const existing = this.storage
      .list("jobs")
      .find((record) => record.payload.dedupeKey === input.dedupeKey);
    if (existing !== undefined) return decodeJob(existing.payload);
    const job: DurableJob = {
      id: input.id,
      type: input.type,
      dedupeKey: input.dedupeKey,
      payload: input.payload,
      status: "QUEUED",
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      availableAt: input.availableAt ?? new Date().toISOString(),
      lockedAt: null,
      leaseId: null,
      completedAt: null,
      lastError: null,
    };
    this.storage.put(
      "jobs",
      job.id,
      job as unknown as Readonly<Record<string, unknown>>,
      job.availableAt,
    );
    return job;
  }

  public claim(now = new Date().toISOString()): DurableJob | null {
    if (isTransactionalStore(this.storage)) {
      return this.storage.transaction(() => this.claimUnsafe(now));
    }
    return this.claimUnsafe(now);
  }

  private claimUnsafe(now: string): DurableJob | null {
    const nowMs = Date.parse(now);
    const candidate = this.storage
      .list("jobs")
      .map((record) => decodeJob(record.payload))
      .filter(
        (job) =>
          ((job.status === "QUEUED" && job.availableAt <= now) ||
            (job.status === "RUNNING" &&
              job.lockedAt !== null &&
              Number.isFinite(nowMs) &&
              Number.isFinite(Date.parse(job.lockedAt)) &&
              nowMs - Date.parse(job.lockedAt) >= this.leaseMs)) &&
          job.attempts < job.maxAttempts,
      )
      .sort((left, right) => left.availableAt.localeCompare(right.availableAt))[0];
    if (candidate === undefined) return null;
    const claimed: DurableJob = {
      ...candidate,
      status: "RUNNING",
      attempts: candidate.attempts + 1,
      lockedAt: now,
      leaseId: randomUUID(),
    };
    this.storage.put(
      "jobs",
      claimed.id,
      claimed as unknown as Readonly<Record<string, unknown>>,
      now,
    );
    return claimed;
  }

  public succeed(
    id: string,
    completedAt = new Date().toISOString(),
    leaseId: string | null = null,
  ): void {
    const job = this.get(id);
    if (job === null) throw new Error(`job not found: ${id}`);
    if (job.status !== "RUNNING" || job.leaseId !== leaseId) throw new Error("JOB_LEASE_LOST");
    this.storage.put(
      "jobs",
      id,
      { ...job, status: "SUCCEEDED", completedAt, lockedAt: null, leaseId: null },
      completedAt,
    );
  }

  public fail(id: string, error: string, retryAt: string | null, leaseId: string | null = null): void {
    const job = this.get(id);
    if (job === null) throw new Error(`job not found: ${id}`);
    if (job.status !== "RUNNING" || job.leaseId !== leaseId) throw new Error("JOB_LEASE_LOST");
    const terminal = retryAt === null || job.attempts >= job.maxAttempts;
    const failed: DurableJob = {
      ...job,
      status: terminal ? "FAILED" : "QUEUED",
      availableAt: retryAt ?? job.availableAt,
      lockedAt: null,
      leaseId: null,
      lastError: error,
    };
    this.storage.put(
      "jobs",
      id,
      failed as unknown as Readonly<Record<string, unknown>>,
      new Date().toISOString(),
    );
  }

  public get(id: string): DurableJob | null {
    const record = this.storage.get("jobs", id);
    return record === null ? null : decodeJob(record.payload);
  }
}

/** Typed repository used by API, workers, and projections. It is the only
 * production boundary allowed to serialize canonical domain records. */
export class BackendRepository {
  public constructor(private readonly storage: PersistenceStore) {}

  public savePassport(passport: MarketPassport): void {
    const canonical = MarketPassportSchema.parse(passport);
    const payload = canonical as unknown as Readonly<Record<string, unknown>>;
    this.storage.put("markets", canonical.identity.marketId, payload, canonical.observedAt);
    this.storage.put(
      "market_snapshots",
      `${canonical.identity.marketId}:${canonical.observedAt}`,
      payload,
      canonical.observedAt,
    );
  }

  public getPassport(marketId: string): MarketPassport | null {
    const record = this.storage.get("markets", marketId);
    return record === null ? null : MarketPassportSchema.parse(record.payload);
  }

  public listPassports(
    options: {
      readonly chain?: string;
      readonly lifecycle?: string;
      readonly qualification?: string;
      readonly limit?: number;
      readonly offset?: number;
    } = {},
  ): readonly MarketPassport[] {
    return this.storage
      .list("markets")
      .map((record) => MarketPassportSchema.parse(record.payload))
      .filter(
        (passport) => options.chain === undefined || passport.identity.chain === options.chain,
      )
      .filter(
        (passport) =>
          options.lifecycle === undefined || passport.lifecycle.status === options.lifecycle,
      )
      .filter(
        (passport) =>
          options.qualification === undefined ||
          passport.riskResult.integrityStatus === options.qualification,
      )
      .sort((left, right) => right.observedAt.localeCompare(left.observedAt));
  }

  public searchPassports(query: string, chain?: string): readonly MarketPassport[] {
    const normalized = normalizeSearchQuery(query);
    const exact = this.listPassports()
      .filter(
        (passport) =>
          chain === undefined || chain.length === 0 || passport.identity.chain === chain,
      )
      .filter((passport) =>
        [
          passport.identity.marketId,
          passport.identity.tokenAddress,
          passport.identity.symbol,
          passport.identity.name,
        ].some((value) => value?.toLowerCase() === normalized),
      );
    if (exact.length > 0)
      return exact.sort(
        (left, right) => searchRank(left, normalized) - searchRank(right, normalized),
      );
    return this.listPassports()
      .filter((passport) => {
        const identity = passport.identity;
        const matchesChain = chain === undefined || chain.length === 0 || identity.chain === chain;
        const matchesQuery =
          normalized.length === 0 ||
          identity.marketId.toLowerCase().includes(normalized) ||
          identity.tokenAddress.toLowerCase().includes(normalized) ||
          identity.symbol?.toLowerCase().includes(normalized) === true ||
          identity.name?.toLowerCase().includes(normalized) === true;
        return matchesChain && matchesQuery;
      })
      .sort((left, right) => searchRank(left, normalized) - searchRank(right, normalized));
  }

  public saveNotification(event: NotificationEvent): void {
    const canonical = NotificationEventSchema.parse(event);
    this.storage.put("notifications", canonical.id, canonical, canonical.createdAt);
  }

  public listNotifications(recipient: string): readonly NotificationEvent[] {
    return this.storage
      .list("notifications")
      .map((record) => NotificationEventSchema.parse(record.payload))
      .filter((event) => event.recipient.toLowerCase() === recipient.toLowerCase())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  public markNotificationRead(id: string, readAt = new Date().toISOString()): NotificationEvent {
    const record = this.storage.get("notifications", id);
    if (record === null) throw new Error(`notification not found: ${id}`);
    const event = NotificationEventSchema.parse(record.payload);
    const updated = NotificationEventSchema.parse({ ...event, readAt });
    this.storage.put("notifications", id, updated, updated.createdAt);
    return updated;
  }

  public saveProfile(profile: UserProfile): void {
    const canonical = UserProfileSchema.parse(profile);
    this.storage.put(
      "profiles",
      canonical.primaryWallet.toLowerCase(),
      canonical,
      canonical.updatedAt,
    );
  }

  public getProfile(address: string): UserProfile | null {
    const record = this.storage.get("profiles", address.toLowerCase());
    return record === null ? null : UserProfileSchema.parse(record.payload);
  }

  public setWatchlist(
    address: string,
    marketIds: readonly string[],
    wallets: readonly string[],
  ): void {
    this.storage.put(
      "watchlists",
      address.toLowerCase(),
      { address: address.toLowerCase(), marketIds, wallets },
      new Date().toISOString(),
    );
  }

  public getWatchlist(address: string): Readonly<Record<string, unknown>> | null {
    return this.storage.get("watchlists", address.toLowerCase())?.payload ?? null;
  }

  public saveWalletEvent(
    id: string,
    payload: Readonly<Record<string, unknown>>,
    observedAt: string,
  ): void {
    this.storage.put("wallet_events", id, payload, observedAt);
  }
}

function normalizeSearchQuery(query: string): string {
  const normalized = query.normalize("NFKC").trim().toLowerCase();
  if (normalized.length > 128) throw new Error("SEARCH_QUERY_TOO_LONG");
  return normalized;
}

function decodeJob(payload: Readonly<Record<string, unknown>>): DurableJob {
  const status = payload.status;
  if (
    typeof payload.id !== "string" ||
    typeof payload.type !== "string" ||
    typeof payload.dedupeKey !== "string" ||
    (status !== "QUEUED" &&
      status !== "RUNNING" &&
      status !== "SUCCEEDED" &&
      status !== "FAILED") ||
    typeof payload.attempts !== "number" ||
    typeof payload.maxAttempts !== "number" ||
    typeof payload.availableAt !== "string"
  )
    throw new Error("invalid durable job payload");
  return {
    ...(payload as unknown as DurableJob),
    lockedAt: typeof payload.lockedAt === "string" ? payload.lockedAt : null,
    leaseId: typeof payload.leaseId === "string" ? payload.leaseId : null,
    completedAt: typeof payload.completedAt === "string" ? payload.completedAt : null,
    lastError: typeof payload.lastError === "string" ? payload.lastError : null,
  };
}

function isTransactionalStore(storage: PersistenceStore): storage is PersistenceTransaction {
  return "transaction" in storage && typeof storage.transaction === "function";
}

function searchRank(passport: MarketPassport, query: string): number {
  const identity = passport.identity;
  if (identity.marketId.toLowerCase() === query || identity.tokenAddress.toLowerCase() === query)
    return 0;
  if (identity.symbol?.toLowerCase() === query || identity.name?.toLowerCase() === query) return 1;
  if (
    identity.symbol?.toLowerCase().startsWith(query) ||
    identity.name?.toLowerCase().startsWith(query)
  )
    return 2;
  return 3;
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
