export type RealtimeEventType =
  | "market.discovered"
  | "market.lifecycle.changed"
  | "market.risk.changed"
  | "market.qualified"
  | "market.blocked"
  | "price.updated"
  | "wallet.activity"
  | "protocol.order"
  | "protocol.position"
  | "protocol.liquidation"
  | "notification";
export interface RealtimeEvent {
  readonly id: string;
  readonly sequence: bigint;
  readonly schemaVersion: "realtime-event/v1";
  readonly type: RealtimeEventType;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, string>>;
}
export type RealtimeSubscriber = (event: RealtimeEvent) => void;
export type RealtimeStatus = "LIVE" | "DEGRADED" | "STALE" | "OFFLINE";

export class RealtimeHub {
  private readonly subscribers = new Set<RealtimeSubscriber>();
  private readonly recent: RealtimeEvent[] = [];
  private readonly seenIds = new Set<string>();
  private nextSequence = 1n;
  private lastPublishedAt: string | null = null;
  public constructor(private readonly maxRecent = 500) {}
  public publish(event: RealtimeEvent): void {
    if (this.seenIds.has(event.id)) return;
    if (event.sequence !== this.nextSequence) throw new Error("REALTIME_SEQUENCE_MISMATCH");
    this.seenIds.add(event.id);
    this.nextSequence += 1n;
    this.lastPublishedAt = event.occurredAt;
    this.recent.push(event);
    while (this.recent.length > this.maxRecent) {
      const removed = this.recent.shift();
      if (removed !== undefined) this.seenIds.delete(removed.id);
    }
    for (const subscriber of this.subscribers) subscriber(event);
  }
  public createEvent(input: Omit<RealtimeEvent, "sequence" | "schemaVersion">): RealtimeEvent {
    return { ...input, sequence: this.nextSequence, schemaVersion: "realtime-event/v1" };
  }
  public subscribe(subscriber: RealtimeSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }
  public recentEvents(afterSequence?: string): readonly RealtimeEvent[] {
    if (afterSequence === undefined) return [...this.recent];
    const sequence = BigInt(afterSequence);
    return this.recent.filter((event) => event.sequence > sequence);
  }

  public status(now = new Date().toISOString(), freshnessBoundarySeconds = 30): RealtimeStatus {
    if (this.lastPublishedAt === null) return "OFFLINE";
    const age = Date.parse(now) - Date.parse(this.lastPublishedAt);
    if (!Number.isFinite(age) || age < 0) return "DEGRADED";
    if (age <= freshnessBoundarySeconds * 1_000) return "LIVE";
    if (age <= freshnessBoundarySeconds * 10 * 1_000) return "STALE";
    return "OFFLINE";
  }
}
