export type Availability = "AVAILABLE" | "PARTIAL" | "STALE" | "UNAVAILABLE" | "CONFLICTED";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = Record<string, any>;

export interface Market {
  schemaVersion?: string;
  observedAt?: string;
  identity: {
    marketId: string;
    chain: string;
    tokenAddress: string;
    symbol: string | null;
    name: string | null;
  };
  originChain?: string;
  lifecycle?: { status?: string; observedAt?: string };
  marketData?: { priceUsdWad?: string | null; volume24hUsdWad?: string | null; priceChange24hBps?: number | null };
  liquidity?: { totalUsdWad?: string | null; dominantPool?: string | null; securityStatus?: string | null };
  oracleEvidence?: { priceSourceCount?: number | null; independentSourceCount?: number | null; confidenceBps?: number | null; freshness?: string };
  derivativesEvidence?: { status?: string; maxLeverageWad?: string; maxOIWad?: string; maxPositionWad?: string; maintenanceMarginBps?: number; manipulationResistance?: string };
  providerState?: { providers?: Array<{ provider: string; status: Availability; reason?: string | null }> };
  freshness?: { status?: Availability; observedAt?: string; fetchedAt?: string; maxAgeSeconds?: number };
  riskResult?: { integrityStatus?: string; derivativesStatus?: string; warnings?: string[]; rejectionReasons?: string[] };
  qualification?: { eligible?: boolean; proofHash?: string | null; evidenceRoot?: string | null; expiresAt?: string | null };
  tradability?: { status?: string; reasons?: string[] };
  arcMarketState?: string;
  priceHistory?: Array<{ observedAt: string; priceUsdWad: string }>;
  [key: string]: any;
}

export interface Profile {
  primaryWallet?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  notificationPreferences?: { enabled?: boolean };
  watchlistMarketIds?: string[];
  [key: string]: any;
}

export interface WalletSnapshot {
  wallet?: string;
  observedAt?: string;
  realizedPnlUsdWad?: string | null;
  unrealizedPnlUsdWad?: string | null;
  volumeUsdWad?: string | null;
  winCount?: number | null;
  lossCount?: number | null;
  drawdownBps?: number | null;
  marketsTraded?: string[];
  [key: string]: any;
}

export interface Health {
  health?: Record<string, string>;
  asOf?: string;
}

export interface Pretrade {
  status?: Availability;
  marketId?: string;
  oracle?: Market["oracleEvidence"];
  qualification?: Market["qualification"];
  risk?: Market["derivativesEvidence"] & { status?: string; reasonCodes?: string[] };
  fees?: { status?: Availability; reason?: string };
  nonce?: { required?: boolean; source?: string };
  expiry?: { required?: boolean; minimumSeconds?: number };
  signer?: { backendSigns?: boolean; userWalletSigns?: boolean };
}

export interface RealtimeEvent {
  sequence: string;
  type: string;
  occurredAt: string;
  payload: Record<string, string>;
}
