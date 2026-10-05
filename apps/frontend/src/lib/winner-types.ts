export type Availability = "AVAILABLE" | "PARTIAL" | "STALE" | "UNAVAILABLE" | "CONFLICTED";
export type Chain = "SOLANA" | "BASE" | "BNB" | "ETHEREUM" | "ARC" | "ROBINHOOD";
export type Lifecycle = "NEW" | "BONDING" | "BONDED" | "GRADUATED" | "MIGRATED" | "DEX_LIVE" | "ESTABLISHED" | "DISCOVERED";
export type Integrity = "PENDING" | "WATCH" | "QUALIFIED" | "REJECTED" | "UNKNOWN";
export type PerpState = "NOT_REGISTERED" | "ELIGIBLE" | "LIVE" | "PAUSED" | "CLOSE_ONLY" | "BLOCKED";

export interface Observation {
  provider: string;
  status: Availability;
  observedAt: string | null;
  fetchedAt: string | null;
  blockOrSlot: string | null;
  evidenceHash: string | null;
  reason: string | null;
}

export interface OriginMarket {
  marketId: string;
  chain: Chain;
  tokenAddress: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  originPlatform: string | null;
  lifecycle: { status: Lifecycle; observedAt: string | null; confidenceBps: number | null; evidenceHash: string | null };
  priceUsd: string | null;
  priceChange24hBps: number | null;
  volume24hUsd: string | null;
  transactions24h: number | null;
  originSpotLiquidityUsd: string | null;
  originDepth2PctUsd: string | null;
  holders: number | null;
  top10ConcentrationBps: number | null;
  largestClusterBps: number | null;
  integrity: { status: Integrity; reasonCodes: string[]; observations: Observation[] };
  derivatives: {
    status: PerpState;
    safeOiUsd: string | null;
    safePositionUsd: string | null;
    maxLeverage: string | null;
    oracleQuality: string | null;
    sourceIndependence: number | null;
    reasonCodes: string[];
  };
  perp: {
    status: PerpState;
    deploymentId: string | null;
    marketId: string | null;
    currentOiUsd: string | null;
    capacityUsd: string | null;
    qualificationHash: string | null;
    riskRuleVersion: string | null;
  };
  providerState: { status: Availability; fetchedAt: string | null; reason: string | null };
  freshness: { status: Availability; observedAt: string | null; maxAgeSeconds: number | null };
  history: Array<{ observedAt: string; priceUsd: string }>;
}

export interface MarketPage {
  items: OriginMarket[];
  nextCursor: string | null;
  total?: number | null;
  discoveryCount?: number | null;
  perpCount?: number | null;
}

export interface Health {
  health?: Record<string, string>;
  asOf?: string;
}

export interface Pretrade {
  status: Availability;
  deploymentId: string | null;
  chainId: number;
  marketId: string;
  account?: string | null;
  action?: "OPEN" | "INCREASE" | "DECREASE" | "CLOSE";
  side?: "LONG" | "SHORT";
  collateralUsdUsdc?: string | null;
  sizeUsdWad?: string | null;
  acceptablePriceWad?: string | null;
  oracle?: { sequence?: string | null; priceWad?: string | null; freshness?: string; confidenceBps?: number | null };
  qualification?: { eligible?: boolean; proofHash?: string | null; ruleVersion?: string | null; expiresAt?: string | null };
  risk?: { maxLeverageWad?: string | null; maxPositionWad?: string | null; maxOIWad?: string | null; status?: string };
  fees?: { status: Availability; openRateWad?: string | null; closeRateWad?: string | null; reason?: string };
  funding?: { status: Availability; indexWad?: string | null };
  borrow?: { status: Availability; indexWad?: string | null };
  nonce?: string | null;
  expiry?: string | null;
  planHash?: string | null;
}

export interface WalletState {
  address: `0x${string}` | null;
  chainId: number | null;
  status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "WRONG_NETWORK" | "REJECTED";
  error: string | null;
}

export interface RealtimeEvent {
  id?: string;
  sequence: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface Profile {
  primaryWallet?: string;
  realizedPnlUsd?: string | null;
  unrealizedPnlUsd?: string | null;
  volumeUsd?: string | null;
  feesUsd?: string | null;
  fundingUsd?: string | null;
  winCount?: number | null;
  lossCount?: number | null;
  tradeCount?: number | null;
  marketsTraded?: string[];
  [key: string]: unknown;
}
