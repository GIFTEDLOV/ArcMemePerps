import {
  PersistentJobQueue,
  type PersistenceStore,
  type DurableJob,
} from "@arcmemeperps/persistence";

export const REQUIRED_WORK_TYPES = [
  "MARKET_DISCOVERY",
  "MARKET_REFRESH",
  "HOLDER_REFRESH",
  "DEPLOYER_REFRESH",
  "FUNDING_GRAPH",
  "DEPTH_ANALYSIS",
  "WASH_FARM_ANALYSIS",
  "WALLET_INTELLIGENCE",
  "QUALIFICATION_REEVALUATION",
  "RISK_DEGRADATION",
  "NOTIFICATION_GENERATION",
  "COMPETITION_SCORING",
  "RECONCILIATION",
] as const;
export type BackendWorkType = (typeof REQUIRED_WORK_TYPES)[number];

export interface WorkerExecution {
  readonly jobId: string;
  readonly type: string;
  readonly status: "SUCCEEDED" | "FAILED";
  readonly attempts: number;
  readonly durationMs: number;
  readonly error: string | null;
}

export type WorkerHandler = (job: DurableJob) => Promise<void>;

/** Durable, bounded worker dispatcher. Queue replacement does not change worker contracts. */
export class BackendWorkerService {
  private readonly queue: PersistentJobQueue;
  private readonly handlers = new Map<string, WorkerHandler>();
  private readonly executions: WorkerExecution[] = [];
  public constructor(private readonly storage: PersistenceStore) {
    this.queue = new PersistentJobQueue(storage);
  }

  public register(type: BackendWorkType, handler: WorkerHandler): void {
    this.handlers.set(type, handler);
  }

  public registerNoopSafeBoundary(type: BackendWorkType): void {
    this.register(type, (job) => {
      if (job.payload.enabled !== true) throw new Error(`${type}_NOT_CONFIGURED`);
      return Promise.resolve();
    });
  }

  public enqueue(
    type: BackendWorkType,
    dedupeKey: string,
    payload: Readonly<Record<string, unknown>>,
  ): DurableJob {
    return this.queue.enqueue({
      id: `${type}:${dedupeKey}`,
      type,
      dedupeKey: `${type}:${dedupeKey}`,
      payload,
      maxAttempts: 3,
    });
  }

  public async runOne(): Promise<WorkerExecution | null> {
    const job = this.queue.claim();
    if (job === null) return null;
    const started = Date.now();
    const handler = this.handlers.get(job.type);
    if (handler === undefined) {
      const error = `NO_HANDLER:${job.type}`;
      this.queue.fail(job.id, error, null, job.leaseId);
      return this.record({
        jobId: job.id,
        type: job.type,
        status: "FAILED",
        attempts: job.attempts,
        durationMs: Date.now() - started,
        error,
      });
    }
    try {
      await handler(job);
      this.queue.succeed(job.id, new Date().toISOString(), job.leaseId);
      return this.record({
        jobId: job.id,
        type: job.type,
        status: "SUCCEEDED",
        attempts: job.attempts,
        durationMs: Date.now() - started,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "worker failure";
      this.queue.fail(job.id, message, null, job.leaseId);
      return this.record({
        jobId: job.id,
        type: job.type,
        status: "FAILED",
        attempts: job.attempts,
        durationMs: Date.now() - started,
        error: message,
      });
    }
  }

  public metrics(): Readonly<{
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    executions: readonly WorkerExecution[];
  }> {
    const jobs = this.storage.list("jobs").map((record) => record.payload.status);
    return {
      queued: jobs.filter((status) => status === "QUEUED").length,
      running: jobs.filter((status) => status === "RUNNING").length,
      succeeded: jobs.filter((status) => status === "SUCCEEDED").length,
      failed: jobs.filter((status) => status === "FAILED").length,
      executions: [...this.executions],
    };
  }

  private record(execution: WorkerExecution): WorkerExecution {
    this.executions.push(execution);
    if (this.executions.length > 1_000) this.executions.shift();
    return execution;
  }
}
