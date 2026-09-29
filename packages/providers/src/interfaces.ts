import type {
  ProviderResult,
  JsonValue,
  RpcTokenEvidence,
  DexAggregate,
  GoPlusSecurityObservation,
  BubblemapsObservation,
  SolanaMintEvidence,
} from "./types.js";

export interface RpcProvider {
  readToken(tokenAddress: string, fetchedAt: string): Promise<ProviderResult<RpcTokenEvidence>>;
}

export interface DexMarketDataProvider {
  readToken(tokenAddress: string, fetchedAt: string): Promise<ProviderResult<DexAggregate>>;
}

export interface TokenSecurityProvider {
  readToken(
    tokenAddress: string,
    fetchedAt: string,
  ): Promise<ProviderResult<GoPlusSecurityObservation>>;
}

export interface HolderProvider {
  readToken(
    tokenAddress: string,
    fetchedAt: string,
  ): Promise<ProviderResult<BubblemapsObservation>>;
}

export interface TransferHistoryProvider {
  readToken(tokenAddress: string, fetchedAt: string): Promise<ProviderResult<JsonValue>>;
}

export type ClusterProvider = HolderProvider;

export interface LaunchpadProvider {
  readToken(tokenAddress: string, fetchedAt: string): Promise<ProviderResult<JsonValue>>;
}

export interface PriceProvider {
  readToken(tokenAddress: string, fetchedAt: string): Promise<ProviderResult<DexAggregate>>;
}

export interface SolanaMintProvider {
  readMint(tokenAddress: string, fetchedAt: string): Promise<ProviderResult<SolanaMintEvidence>>;
}
