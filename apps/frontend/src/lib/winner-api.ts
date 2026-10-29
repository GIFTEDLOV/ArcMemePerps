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
  public search(query: string, chain?: string, options: { lifecycle?: string; limit?: number; cursor?: string } = {}): Promise<MarketPage> {
    const params = new URLSearchParams({ q: query });
    if (chain && chain !== "ALL") params.set("chain", chain);
    if (options.lifecycle && options.lifecycle !== "ALL") params.set("lifecycle", options.lifecycle);
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.cursor !== undefined) params.set("cursor", options.cursor);
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
  public portfolio(address: string): Promise<unknown> { return this.get(`/wallet/${address}`); }
  public activity(address: string): Promise<unknown> { return this.get(`/wallet/${address}/activity`); }
  public notifications(address: string): Promise<{ items: Array<Record<string, unknown>> }> { return this.get(`/notifications/${address}`); }
  public attention(address: string): Promise<{ items: Array<Record<string, unknown>> }> { return this.get(`/attention/${address}`); }
}

export function subscribeRealtime(baseUrl: string, onEvent: (event: RealtimeEvent) => void, onState: (state: "CONNECTED" | "RECONNECTING" | "STALE" | "OFFLINE") => void): () => void {
  const streamUrl = `${baseUrl.replace(/\/api\/v1$/, "")}/api/v1/stream`;
  let source: EventSource | null = null;
  let lastSequence = 0n;
  let reconnectTimer: number | null = null;
  let stopped = false;
  const connect = () => {
    if (stopped) return;
    onState("RECONNECTING");
    source = new EventSource(lastSequence > 0n ? `${streamUrl}?after=${lastSequence.toString()}` : streamUrl);
    source.onopen = () => onState("CONNECTED");
    const handleMessage = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as RealtimeEvent;
        const sequence = BigInt(event.sequence);
        if (sequence <= lastSequence) return;
        lastSequence = sequence;
        onEvent(event);
      } catch { onState("STALE"); }
    };
    source.onmessage = handleMessage;
    for (const type of ["market.discovered", "market.snapshot", "protocol.event"]) {
      source.addEventListener(type, handleMessage as EventListener);
    }
    source.onerror = () => {
      source?.close();
      source = null;
      onState("STALE");
      if (!stopped) reconnectTimer = window.setTimeout(connect, 2_000);
    };
  };
  connect();
  return () => { stopped = true; if (reconnectTimer !== null) window.clearTimeout(reconnectTimer); source?.close(); source = null; onState("OFFLINE"); };
}
