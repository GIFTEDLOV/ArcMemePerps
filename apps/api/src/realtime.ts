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
  readonly type: RealtimeEventType;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, string>>;
}
export type RealtimeSubscriber = (event: RealtimeEvent) => void;

export class RealtimeHub {
  private readonly subscribers = new Set<RealtimeSubscriber>();
  private readonly recent: RealtimeEvent[] = [];
  public constructor(private readonly maxRecent = 500) {}
  public publish(event: RealtimeEvent): void {
    this.recent.push(event);
    while (this.recent.length > this.maxRecent) this.recent.shift();
    for (const subscriber of this.subscribers) subscriber(event);
  }
  public subscribe(subscriber: RealtimeSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }
  public recentEvents(afterId?: string): readonly RealtimeEvent[] {
    if (afterId === undefined) return [...this.recent];
    const index = this.recent.findIndex((event) => event.id === afterId);
    return index < 0 ? [...this.recent] : this.recent.slice(index + 1);
  }
}
