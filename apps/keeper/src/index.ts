import type { HealthRecord } from "@arcmemeperps/shared";

export interface ExecutableOrder {
  readonly orderId: string;
  readonly marketId: string;
  readonly expiry: string;
  readonly nonce: string;
}
export interface KeeperOracleReport {
  readonly marketId: string;
  readonly sequence: string;
  readonly expiresAt: string;
  readonly valid: boolean;
}
export interface KeeperExecutionPort {
  execute(order: ExecutableOrder, report: KeeperOracleReport): Promise<string>;
}
export interface KeeperStateStore {
  hasExecuted(orderId: string): Promise<boolean>;
  markExecuted(orderId: string, txHash: string): Promise<void>;
}
export interface KeeperNoncePort {
  serialize<T>(chain: string, work: () => Promise<T>): Promise<T>;
}
export interface KeeperReadPort {
  discoverExecutableOrders(): Promise<readonly ExecutableOrder[]>;
  readOrderStatus(orderId: string): Promise<"PENDING" | "EXECUTED" | "CANCELLED" | "EXPIRED">;
}
export interface KeeperReportPort {
  reportFor(marketId: string): Promise<KeeperOracleReport>;
}

export class KeeperService {
  private readonly consumed = new Set<string>();
  private stopped = false;
  private lastSuccessAt: string | null = null;
  private lastError: string | null = null;
  private readonly state: KeeperStateStore | null;
  private readonly nonces: KeeperNoncePort | null;
  public constructor(
    private readonly reads: KeeperReadPort,
    private readonly reports: KeeperReportPort,
    private readonly execution: KeeperExecutionPort,
    options: { readonly state?: KeeperStateStore; readonly nonces?: KeeperNoncePort } = {},
  ) {
    this.state = options.state ?? null;
    this.nonces = options.nonces ?? null;
  }

  public async executeCycle(now = new Date()): Promise<
    readonly {
      readonly orderId: string;
      readonly status: "EXECUTED" | "SKIPPED" | "FAILED";
      readonly reason?: string;
      readonly txHash?: string;
    }[]
  > {
    if (this.stopped) return [];
    const results: {
      orderId: string;
      status: "EXECUTED" | "SKIPPED" | "FAILED";
      reason?: string;
      txHash?: string;
    }[] = [];
    for (const order of await this.reads.discoverExecutableOrders()) {
      if (
        this.consumed.has(order.orderId) ||
        (this.state !== null && (await this.state.hasExecuted(order.orderId)))
      ) {
        results.push({ orderId: order.orderId, status: "SKIPPED", reason: "IDEMPOTENCY" });
        continue;
      }
      if (Date.parse(order.expiry) <= now.getTime()) {
        results.push({ orderId: order.orderId, status: "SKIPPED", reason: "EXPIRED" });
        continue;
      }
      const status = await this.reads.readOrderStatus(order.orderId);
      if (status !== "PENDING") {
        results.push({ orderId: order.orderId, status: "SKIPPED", reason: status });
        continue;
      }
      const report = await this.reports.reportFor(order.marketId);
      if (
        !report.valid ||
        report.marketId !== order.marketId ||
        Date.parse(report.expiresAt) <= now.getTime()
      ) {
        results.push({
          orderId: order.orderId,
          status: "SKIPPED",
          reason: "INVALID_ORACLE_REPORT",
        });
        continue;
      }
      try {
        const execute = () => this.execution.execute(order, report);
        const txHash = await (this.nonces === null
          ? execute()
          : this.nonces.serialize("ARC", execute));
        this.consumed.add(order.orderId);
        if (this.state !== null) await this.state.markExecuted(order.orderId, txHash);
        this.lastSuccessAt = new Date().toISOString();
        this.lastError = null;
        results.push({ orderId: order.orderId, status: "EXECUTED", txHash });
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : "EXECUTION_FAILED";
        results.push({
          orderId: order.orderId,
          status: "FAILED",
          reason: error instanceof Error ? error.message : "EXECUTION_FAILED",
        });
      }
    }
    return results;
  }

  public stop(): void {
    this.stopped = true;
  }
  public health(): HealthRecord {
    return {
      component: "KEEPER",
      state: this.stopped ? "DEGRADED" : "OPERATIONAL",
      lastSuccessAt: this.lastSuccessAt,
      latencyMs: null,
      error: this.lastError,
      freshness: this.lastSuccessAt === null ? "UNAVAILABLE" : "FRESH",
    };
  }
}
