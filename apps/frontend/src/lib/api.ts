import type { Availability, Health, JsonRecord, Market, Pretrade, Profile, RealtimeEvent, WalletSnapshot } from "./types";

const unwrap = <T>(value: unknown): T => {
  const record = value as Record<string, unknown>;
  if (record && typeof record === "object") {
    if ("market" in record) return record.market as T;
    if ("wallet" in record) return record.wallet as T;
    if ("profile" in record) return record.profile as T;
    if ("data" in record) return record.data as T;
    if ("items" in record) return record.items as T;
  }
  return value as T;
};

export class ApiClient {
  constructor(private readonly baseUrl: string) {}
  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) throw new Error(`API_${response.status}`);
    return (await response.json()) as T;
  }
  markets(): Promise<{ items: Market[] }> { return this.get("/markets"); }
  search(q: string): Promise<{ items: Market[] }> { return this.get(`/markets/search?q=${encodeURIComponent(q)}`); }
  market(id: string): Promise<Market> { return this.get<unknown>(`/markets/${id}`).then((value) => unwrap<Market>(value)); }
  resource(id: string, resource: string): Promise<JsonRecord> { return this.get<unknown>(`/markets/${id}/${resource}`).then((value) => unwrap<JsonRecord>(value)); }
  profile(address: string): Promise<Profile> { return this.get<unknown>(`/profile/${address}`).then((value) => unwrap<Profile>(value)); }
  wallet(address: string): Promise<WalletSnapshot> { return this.get<unknown>(`/wallet/${address}`).then((value) => unwrap<WalletSnapshot>(value)); }
  walletActivity(address: string): Promise<{ items: JsonRecord[] }> { return this.get(`/wallet/${address}/activity`); }
  health(): Promise<Health> { return this.get("/protocol/status"); }
  notifications(address: string): Promise<{ items: JsonRecord[] }> { return this.get(`/notifications/${address}`); }
  attention(address: string): Promise<{ items: JsonRecord[] }> { return this.get(`/attention/${address}`); }
  competitions(): Promise<{ items: JsonRecord[] }> { return this.get("/competitions"); }
  competition(id: string): Promise<JsonRecord | null> { return this.get<unknown>(`/competitions/${encodeURIComponent(id)}`).then((value) => unwrap<JsonRecord | null>(value)); }
  competitionLeaderboard(id: string): Promise<{ items: JsonRecord[] }> { return this.get(`/competitions/${encodeURIComponent(id)}/leaderboard`); }
  watchlist(address: string): Promise<JsonRecord> { return this.get<unknown>(`/profile/${address}/watchlist`).then((value) => unwrap<JsonRecord>(value)); }
  pretrade(id: string): Promise<Pretrade> { return this.get<unknown>(`/markets/${id}/pretrade`).then((value) => unwrap<Pretrade>(value)); }
}

export function createRealtime(baseUrl: string, onEvent: (event: RealtimeEvent) => void, onState: (state: Availability | "LIVE") => void): () => void {
  const url = `${baseUrl.replace(/\/api\/v1$/, "")}/api/v1/stream`;
  let source: EventSource | null = new EventSource(url);
  source.onopen = () => onState("LIVE");
  source.onerror = () => onState("STALE");
  source.onmessage = (event) => {
    try { onEvent(JSON.parse(event.data) as RealtimeEvent); } catch { onState("CONFLICTED"); }
  };
  return () => { source?.close(); source = null; };
}
