import type {
  ActivityQualityMetrics,
  AuthorityState,
  DeployerRisk,
  HolderConcentration,
  LifecycleSnapshot,
  LiquidityState,
  MarketObservation,
  OracleMetrics,
  TokenIdentity,
} from "@arcmemeperps/domain";
import type { SupportedChain } from "@arcmemeperps/shared";

export interface DiscoverTokensQuery {
  readonly cursor?: string;
  readonly limit?: number;
  readonly since?: string;
}

export type TokenMetadata = TokenIdentity;

export interface HolderRecord {
  readonly address: string;
  readonly balancePct: number;
  readonly connectedClusterId: string | null;
  readonly firstSeenAt: string;
  readonly fundingSource: string | null;
}

export interface LiquidityLock {
  readonly venue: string;
  readonly provider: string;
  readonly lockedAmountUsd: number;
  readonly unlockAt: string | null;
  readonly burned: boolean;
}

export interface PoolSnapshot {
  readonly venue: string;
  readonly poolAddress: string;
  readonly tokenReserve: number;
  readonly quoteReserveUsd: number;
  readonly liquidityUsd: number;
  readonly feeBps: number;
}

export interface TradeRecord {
  readonly txHash: string;
  readonly trader: string;
  readonly side: "BUY" | "SELL";
  readonly amountUsd: number;
  readonly priceUsd: number;
  readonly timestamp: string;
  readonly relatedTradeId: string | null;
}

export interface PricePoint {
  readonly priceUsd: number;
  readonly observedAt: string;
  readonly confidenceBps: number;
  readonly source: string;
}

export interface PriceSource {
  readonly source: string;
  /** Underlying price origin, used to prevent correlated providers counting twice. */
  readonly sourceFamily?: string;
  readonly underlyingVenueId?: string | null;
  readonly priceUsd: number;
  readonly observedAt: string;
  readonly confidenceBps: number;
}

export interface DeployerHistoryRecord {
  readonly deployer: string;
  readonly tokenAddress: string;
  readonly outcome: "ACTIVE" | "ABANDONED" | "RUG" | "UNKNOWN";
  readonly observedAt: string;
}

export interface TokenPermissions {
  readonly mintAuthority: string | null;
  readonly freezeAuthority: string | null;
  readonly owner: string | null;
  readonly admin: string | null;
  readonly proxyImplementation: string | null;
  readonly transferRestrictions: readonly string[];
}

export interface LaunchData {
  readonly platform: string;
  readonly launchAt: string;
  readonly bundleCount: number;
  readonly initialBuyerCount: number;
  readonly initialLiquidityUsd: number;
}

export interface TransactionRecord {
  readonly txHash: string;
  readonly from: string;
  readonly to: string | null;
  readonly valueUsd: number;
  readonly timestamp: string;
  readonly method: string | null;
}

export interface ChainAdapter {
  readonly chain: SupportedChain;
  discoverTokens(query?: DiscoverTokensQuery): Promise<readonly TokenIdentity[]>;
  getTokenMetadata(tokenAddress: string): Promise<TokenMetadata>;
  getLifecycle(tokenAddress: string): Promise<LifecycleSnapshot>;
  getHolders(tokenAddress: string): Promise<readonly HolderRecord[]>;
  getLiquidity(tokenAddress: string): Promise<LiquidityState>;
  getLiquidityLocks(tokenAddress: string): Promise<readonly LiquidityLock[]>;
  getPools(tokenAddress: string): Promise<readonly PoolSnapshot[]>;
  getTrades(tokenAddress: string, since?: string): Promise<readonly TradeRecord[]>;
  getPrice(tokenAddress: string): Promise<PricePoint>;
  getPriceSources(tokenAddress: string): Promise<readonly PriceSource[]>;
  getDeployer(tokenAddress: string): Promise<string | null>;
  getDeployerHistory(tokenAddress: string): Promise<readonly DeployerHistoryRecord[]>;
  getAuthorities(tokenAddress: string): Promise<AuthorityState>;
  getTokenPermissions(tokenAddress: string): Promise<TokenPermissions>;
  getLaunchData(tokenAddress: string): Promise<LaunchData>;
  getTransactionHistory(
    tokenAddress: string,
    since?: string,
  ): Promise<readonly TransactionRecord[]>;
}

export interface DeterministicFixtureMarket {
  readonly observation: MarketObservation;
  readonly holders: readonly HolderRecord[];
  readonly liquidityLocks: readonly LiquidityLock[];
  readonly pools: readonly PoolSnapshot[];
  readonly trades: readonly TradeRecord[];
  readonly priceSources: readonly PriceSource[];
  readonly deployerHistory: readonly DeployerHistoryRecord[];
  readonly permissions: TokenPermissions;
  readonly launchData: LaunchData;
  readonly transactionHistory: readonly TransactionRecord[];
}

/**
 * A provider-free adapter used by unit tests and replayable qualification runs.
 * Production adapters will implement the same interface and remain outside the risk engine.
 */
export class DeterministicFixtureAdapter implements ChainAdapter {
  public readonly chain: SupportedChain;
  private readonly market: DeterministicFixtureMarket;

  public constructor(market: DeterministicFixtureMarket) {
    this.chain = market.observation.token.chain;
    this.market = market;
  }

  public discoverTokens(query?: DiscoverTokensQuery): Promise<readonly TokenIdentity[]> {
    void query;
    return Promise.resolve([this.market.observation.token]);
  }

  public getTokenMetadata(tokenAddress: string): Promise<TokenMetadata> {
    this.assertKnownToken(tokenAddress);
    return Promise.resolve(this.market.observation.token);
  }

  public getLifecycle(tokenAddress: string): Promise<LifecycleSnapshot> {
    this.assertKnownToken(tokenAddress);
    return Promise.resolve(this.market.observation.lifecycle);
  }

  public getHolders(tokenAddress: string): Promise<readonly HolderRecord[]> {
    this.assertKnownToken(tokenAddress);
    return Promise.resolve(this.market.holders);
  }

  public getLiquidity(tokenAddress: string): Promise<LiquidityState> {
    this.assertKnownToken(tokenAddress);
    return Promise.resolve(this.market.observation.liquidity);
  }

  public getLiquidityLocks(tokenAddress: string): Promise<readonly LiquidityLock[]> {
    this.assertKnownToken(tokenAddress);
    return Promise.resolve(this.market.liquidityLocks);
  }

  public getPools(tokenAddress: string): Promise<readonly PoolSnapshot[]> {
    this.assertKnownToken(tokenAddress);
    return Promise.resolve(this.market.pools);
  }

  public getTrades(tokenAddress: string, since?: string): Promise<readonly TradeRecord[]> {
    this.assertKnownToken(tokenAddress);
    void since;
    return Promise.resolve(this.market.trades);
  }

  public getPrice(tokenAddress: string): Promise<PricePoint> {
    this.assertKnownToken(tokenAddress);
    const { oracle } = this.market.observation;
    return Promise.resolve({
      priceUsd: oracle.priceUsd,
      observedAt: oracle.observedAt,
      confidenceBps: oracle.confidenceBps,
      source: this.market.priceSources[0]?.source ?? "fixture",
    });
  }

  public getPriceSources(tokenAddress: string): Promise<readonly PriceSource[]> {
    this.assertKnownToken(tokenAddress);
    return Promise.resolve(this.market.priceSources);
  }

  public getDeployer(tokenAddress: string): Promise<string | null> {
    this.assertKnownToken(tokenAddress);
    return Promise.resolve(this.market.observation.deployer.deployerAddress);
  }

  public getDeployerHistory(tokenAddress: string): Promise<readonly DeployerHistoryRecord[]> {
    this.assertKnownToken(tokenAddress);
    return Promise.resolve(this.market.deployerHistory);
  }

  public getAuthorities(tokenAddress: string): Promise<AuthorityState> {
    this.assertKnownToken(tokenAddress);
    return Promise.resolve(this.market.observation.authorities);
  }

  public getTokenPermissions(tokenAddress: string): Promise<TokenPermissions> {
    this.assertKnownToken(tokenAddress);
    return Promise.resolve(this.market.permissions);
  }

  public getLaunchData(tokenAddress: string): Promise<LaunchData> {
    this.assertKnownToken(tokenAddress);
    return Promise.resolve(this.market.launchData);
  }

  public getTransactionHistory(
    tokenAddress: string,
    since?: string,
  ): Promise<readonly TransactionRecord[]> {
    this.assertKnownToken(tokenAddress);
    void since;
    return Promise.resolve(this.market.transactionHistory);
  }

  private assertKnownToken(tokenAddress: string): void {
    if (tokenAddress !== this.market.observation.token.tokenAddress) {
      throw new Error(`fixture token not found: ${tokenAddress}`);
    }
  }
}

export interface AdapterObservation {
  readonly token: TokenIdentity;
  readonly lifecycle: LifecycleSnapshot;
  readonly authorities: AuthorityState;
  readonly liquidity: LiquidityState;
  readonly holders: HolderConcentration;
  readonly deployer: DeployerRisk;
  readonly activity: ActivityQualityMetrics;
  readonly oracle: OracleMetrics;
}

export * from "./live.js";
export * from "./discovery.js";
