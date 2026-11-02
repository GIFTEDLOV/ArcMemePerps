import type { Health, MarketPage, OriginMarket, Pretrade, Profile, RealtimeEvent } from "./winner-types";

function unwrap<T>(value: unknown): T {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("items" in record) return record.items as T;
    if ("market" in record) return record.market as T;
    if ("data" in record) return record.data as T;
    if ("profile" in record) return record.profile as T;
  }
  return value as T;
}

export interface IndexedArcWallet {
  schemaVersion: "v1";
  wallet: {
    address: string;
    positions: Array<{
      positionId: string;
      openingArguments: Record<string, unknown> | null;
      eventDerivedSize: string;
      lastEvent: string;
      verificationState: string;
    }>;
    activity: Array<{
      contract: string;
      eventName: string;
      marketId: string | null;
      positionId: string | null;
      transactionHash: string;
      blockNumber: string;
      arguments: Record<string, unknown> | null;
    }>;
  };
  state: "RECEIPT_EVENT_PROJECTION_NOT_ONCHAIN_BALANCE_PARITY";
  readOnly: true;
  complete: false;
  coverage: { status: string; throughBlock: string | null; gaps: number };
}

export class WinnerApi {
  public constructor(private readonly baseUrl: string) {}

  public async get<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { Accept: "application/json", ...(init?.headers ?? {}) } });
    if (!response.ok) throw new Error(`API_${response.status}`);
    return (await response.json()) as T;
  }

  public markets(params: Record<string, string | number | undefined> = {}): Promise<MarketPage> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "ALL" && value !== "") query.set(key, String(value)); });
    return this.get<MarketPage>(`/markets${query.toString() ? `?${query}` : ""}`);
  }
  public search(query: string, chain?: string): Promise<MarketPage> {
    const params = new URLSearchParams({ q: query });
    if (chain && chain !== "ALL") params.set("chain", chain);
    return this.get<MarketPage>(`/markets/search?${params}`);
  }
  public market(id: string): Promise<OriginMarket> { return this.get<unknown>(`/markets/${encodeURIComponent(id)}`).then(unwrap<OriginMarket>); }
  public resource(id: string, resource: string): Promise<unknown> { return this.get<unknown>(`/markets/${encodeURIComponent(id)}/${resource}`).then(unwrap<unknown>); }
  public pretrade(id: string, account?: string): Promise<Pretrade> {
    const suffix = account ? `?account=${encodeURIComponent(account)}` : "";
    return this.get<unknown>(`/markets/${encodeURIComponent(id)}/pretrade${suffix}`).then(unwrap<Pretrade>);
  }
  public health(): Promise<Health> { return this.get("/protocol/status"); }
  public profile(address: string): Promise<Profile> { return this.get<unknown>(`/profile/${address}`).then(unwrap<Profile>); }
  public portfolio(address: string): Promise<IndexedArcWallet> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address))
      return Promise.reject(new Error("INVALID_ARC_ADDRESS"));
    return this.get<IndexedArcWallet>(`/wallet/${encodeURIComponent(address)}`, { cache: "no-store" });
  }
  public activity(address: string): Promise<unknown> { return this.get(`/wallet/${address}/activity`); }
  public notifications(address: string): Promise<{ items: Array<Record<string, unknown>> }> { return this.get(`/notifications/${address}`); }
  public attention(address: string): Promise<{ items: Array<Record<string, unknown>> }> { return this.get(`/attention/${address}`); }
}

// Arc streams use explicit SSE event names, not default message events.
// Consumers must subscribe to protocol.event AND protocol.reorg to receive
// canonical receipts and invalidate any orphaned-chain projections.
export const ARC_INDEX_SSE_TYPES = ["protocol.event", "protocol.reorg"] as const;

export function decodeArcIndexEvent(
  raw: string,
): RealtimeEvent | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const event = value as Record<string, unknown>;
    if (
      (event.type !== "protocol.event" && event.type !== "protocol.reorg") ||
      typeof event.sequence !== "string" ||
      !/^[1-9][0-9]{0,18}$/.test(event.sequence) ||
      typeof event.occurredAt !== "string" ||
      !event.payload || typeof event.payload !== "object" ||
      Array.isArray(event.payload)
    ) return null;
    return event as unknown as RealtimeEvent;
  } catch {
    return null;
  }
}

export function subscribeRealtime(baseUrl: string, onEvent: (event: RealtimeEvent) => void, onState: (state: "LIVE" | "RECONNECTING" | "STALE" | "OFFLINE") => void): () => void {
  const origin = baseUrl.endsWith("/api/v1") ? baseUrl.slice(0, -7) : baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const streamUrl = `${origin}/api/v1/stream`;
  let source: EventSource | null = null;
  let lastSequence = 0n;
  let lastReorgSequence = 0n;
  let reconnectTimer: number | null = null;
  let stopped = false;
  const handleEvent = (message: MessageEvent<string>) => {
    const event = decodeArcIndexEvent(message.data);
    if (!event) {
      onState("STALE");
      return;
    }
    // Event and reorg IDs are separate PostgreSQL sequences. Both must
    // replay independently or a smaller reorg ID will be silently skipped.
    const sequence = BigInt(event.sequence);
    if (event.type === "protocol.event") {
      if (sequence <= lastSequence) return;
      lastSequence = sequence;
    } else {
      if (sequence <= lastReorgSequence) return;
      lastReorgSequence = sequence;
    }
    onState("LIVE");
    onEvent(event);
  };
  const connect = () => {
    if (stopped) return;
    onState("RECONNECTING");
    const url = new URL(streamUrl, window.location.href);
    if (lastSequence > 0n) url.searchParams.set("after", lastSequence.toString());
    if (lastReorgSequence > 0n) url.searchParams.set("reorgAfter", lastReorgSequence.toString());
    source = new EventSource(url.toString());
    // A successful SSE handshake/heartbeat alone does not prove indexed
    // executions are flowing. Only receipt-backed data marks the tape LIVE.
    source.onopen = () => onState("STALE");
    source.onmessage = handleEvent;
    for (const name of ARC_INDEX_SSE_TYPES) {
      source.addEventListener(name, handleEvent as EventListener);
    }
    source.onerror = () => {
      source?.close();
      source = null;
      onState("STALE");
      if (!stopped) reconnectTimer = window.setTimeout(connect, 2_000);
    };
  };
  connect();
  return () => {
    stopped = true;
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    source?.close();
    source = null;
    onState("OFFLINE");
  };
}
