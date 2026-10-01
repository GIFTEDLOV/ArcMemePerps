export type ProviderPoolStatus = "OPERATIONAL" | "DEGRADED" | "UNAVAILABLE";

export interface ProviderPoolCandidate<T, TContext = void> {
  readonly id: string;
  readonly priority: number;
  readonly read: (context: TContext) => Promise<T>;
}

export interface ProviderPoolOptions {
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly failureThreshold?: number;
  readonly cooldownMs?: number;
  readonly backoffMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export interface ProviderPoolRead<T> {
  readonly status: ProviderPoolStatus;
  readonly value: T | null;
  readonly provider: string | null;
  readonly attempted: readonly string[];
  readonly errors: readonly { readonly provider: string; readonly message: string }[];
}

interface ProviderHealth {
  failures: number;
  openedAt: number | null;
  lastSuccessAt: number | null;
}

/**
 * Bounded provider failover. It never merges contradictory security facts and never
 * returns a fabricated value when every provider is unavailable.
 */
export class ProviderPool<T, TContext = void> {
  private readonly health = new Map<string, ProviderHealth>();
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly backoffMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  public constructor(
    private readonly candidates: readonly ProviderPoolCandidate<T, TContext>[],
    options: ProviderPoolOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? candidates.length);
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 3);
    this.cooldownMs = Math.max(0, options.cooldownMs ?? 30_000);
    this.backoffMs = Math.max(0, options.backoffMs ?? 100);
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  public async read(context?: TContext): Promise<ProviderPoolRead<T>> {
    const now = Date.now();
    const candidates = [...this.candidates].sort((left, right) => left.priority - right.priority);
    const attempted: string[] = [];
    const errors: { provider: string; message: string }[] = [];
    for (const candidate of candidates.slice(0, this.maxAttempts)) {
      const state = this.health.get(candidate.id) ?? {
        failures: 0,
        openedAt: null,
        lastSuccessAt: null,
      };
      if (state.openedAt !== null && now - state.openedAt < this.cooldownMs) continue;
      if (state.openedAt !== null) state.openedAt = null;
      this.health.set(candidate.id, state);
      attempted.push(candidate.id);
      try {
        const value = await withTimeout(candidate.read(context as TContext), this.timeoutMs);
        state.failures = 0;
        state.lastSuccessAt = Date.now();
        return {
          status: attempted.length === 1 ? "OPERATIONAL" : "DEGRADED",
          value,
          provider: candidate.id,
          attempted,
          errors,
        };
      } catch (error) {
        state.failures += 1;
        if (state.failures >= this.failureThreshold) state.openedAt = Date.now();
        errors.push({
          provider: candidate.id,
          message: error instanceof Error ? error.message : "provider failure",
        });
        if (candidate !== candidates.at(-1)) {
          const attempt = attempted.length;
          await this.sleep(this.backoffMs * 2 ** Math.max(0, attempt - 1));
        }
      }
    }
    return { status: "UNAVAILABLE", value: null, provider: null, attempted, errors };
  }

  public healthSnapshot(): readonly {
    readonly provider: string;
    readonly failures: number;
    readonly lastSuccessAt: string | null;
    readonly circuit: "CLOSED" | "OPEN";
  }[] {
    return [...this.health.entries()].map(([provider, state]) => ({
      provider,
      failures: state.failures,
      lastSuccessAt:
        state.lastSuccessAt === null ? null : new Date(state.lastSuccessAt).toISOString(),
      circuit: state.openedAt === null ? "CLOSED" : "OPEN",
    }));
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("provider timeout")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timer]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
