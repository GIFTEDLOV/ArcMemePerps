import type { EvidenceRecord, EvidenceStatus, FreshnessStatus } from "@arcmemeperps/domain";
import type { Hex, SupportedChain } from "@arcmemeperps/shared";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export interface ProviderContext {
  readonly chain: SupportedChain;
  readonly network: string;
  readonly tokenAddress: string;
  readonly fetchedAt: string;
}

export interface ProviderResult<T> {
  readonly status: EvidenceStatus;
  readonly value: T | null;
  readonly evidence: readonly EvidenceRecord[];
  readonly reason: string | null;
  readonly error: string | null;
}

export interface RpcTokenEvidence {
  readonly chainId: number;
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly blockTimestamp: number;
  readonly bytecodeExists: boolean;
  readonly proxyDetected: boolean | null;
  readonly proxyImplementation: Hex | null;
  readonly proxyAdminAddress: Hex | null;
  readonly name: string | null;
  readonly symbol: string | null;
  readonly decimals: number | null;
  readonly totalSupply: bigint | null;
}

export interface SolanaMintEvidence {
  readonly slot: bigint;
  readonly ownerProgram: string;
  readonly accountExists: boolean;
  readonly tokenProgram: "SPL_TOKEN" | "TOKEN_2022" | "UNKNOWN";
  readonly supply: bigint | null;
  readonly decimals: number | null;
  readonly mintAuthority: string | null;
  readonly freezeAuthority: string | null;
  readonly largestAccounts: readonly { readonly address: string; readonly amount: bigint }[];
}

export interface DexPairObservation {
  readonly chainId: string;
  readonly dexId: string;
  readonly pairAddress: string;
  readonly baseToken: {
    readonly address: string;
    readonly symbol: string | null;
    readonly name: string | null;
  };
  readonly quoteToken: {
    readonly address: string;
    readonly symbol: string | null;
    readonly name: string | null;
  };
  readonly priceUsd: number | null;
  readonly priceUsdRaw?: string | null;
  readonly liquidityUsd: number;
  readonly liquidityUsdRaw?: string;
  readonly baseLiquidity: number | null;
  readonly quoteLiquidity: number | null;
  readonly volume24hUsd: number;
  readonly volume24hUsdRaw?: string;
  readonly buys24h: number;
  readonly sells24h: number;
  readonly priceChange24hPct: number | null;
  readonly fdvUsd: number | null;
  readonly fdvUsdRaw?: string | null;
  readonly marketCapUsd: number | null;
  readonly marketCapUsdRaw?: string | null;
  readonly pairCreatedAt: string | null;
}

export interface DexAggregate {
  readonly pairs: readonly DexPairObservation[];
  readonly totalObservedLiquidityUsd: number;
  readonly totalObservedLiquidityUsdRaw?: string;
  readonly dominantPool: DexPairObservation | null;
  readonly poolConcentrationPct: number;
  readonly meaningfulPoolCount: number;
  readonly liquidityByDex: Readonly<Record<string, number>>;
  readonly volume24hUsd: number;
  readonly volume24hUsdRaw?: string;
  readonly buys24h: number;
  readonly sells24h: number;
  readonly priceUsd: number | null;
  readonly priceSourceCount: number;
  readonly depth1PctUsd: number | null;
  readonly depth2PctUsd: number | null;
}

export interface GoPlusSecurityObservation {
  readonly raw: JsonValue;
  readonly isOpenSource: boolean | null;
  readonly isProxy: boolean | null;
  readonly isMintable: boolean | null;
  readonly cannotBuy: boolean | null;
  readonly cannotSell: boolean | null;
  readonly isHoneypot: boolean | null;
  readonly creatorAddress: string | null;
  readonly holderCount: number | null;
  readonly lpHolderCount: number | null;
}

export type AddressClassification =
  "LP" | "BURN" | "DEX" | "BRIDGE" | "SYSTEM" | "CEX" | "KNOWN_PROTOCOL" | "UNKNOWN";

export interface ClusterHolder {
  readonly address: string;
  readonly sharePct: number;
  readonly classification: AddressClassification;
}

export interface BubblemapsCluster {
  readonly id: string;
  readonly members: readonly ClusterHolder[];
  readonly sharePct: number;
}

export interface BubblemapsObservation {
  readonly holders: readonly ClusterHolder[];
  readonly clusters: readonly BubblemapsCluster[];
  readonly largestIndividualNonSystemPct: number;
  readonly largestConnectedNonSystemClusterPct: number;
  readonly topTenNonSystemPct: number;
}

export interface ReconciliationResult {
  readonly status:
    "CONSISTENT" | "MINOR_DIVERGENCE" | "MATERIAL_DIVERGENCE" | "STALE" | "UNAVAILABLE";
  readonly value: number | null;
  readonly disagreement: {
    readonly field: string;
    readonly status: Exclude<ReconciliationResult["status"], "CONSISTENT" | "UNAVAILABLE">;
    readonly sources: readonly string[];
    readonly values: readonly string[];
    readonly tolerance: string;
    readonly resolution: "BLOCK_AUTOMATIC_QUALIFICATION" | "RETAIN_CONSERVATIVE_VALUE";
  } | null;
}

export function isFreshnessStatus(value: FreshnessStatus): boolean {
  return value === "FRESH";
}
