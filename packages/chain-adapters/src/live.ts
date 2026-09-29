import type {
  ActivityQualityMetrics,
  AuthorityState,
  DeployerRisk,
  EvidenceBundle,
  EvidenceRecord,
  HolderConcentration,
  LifecycleSnapshot,
  LiquidityState,
  MarketIntelligenceRecord,
  OracleMetrics,
  TokenIdentity,
} from "@arcmemeperps/domain";
import { evidenceRootForBundle } from "@arcmemeperps/qualification-proof";
import { marketIdForToken, normalizeTokenAddress, type Hex } from "@arcmemeperps/shared";
import {
  BubblemapsProvider,
  DexScreenerProvider,
  EvmRpcProvider,
  GoPlusProvider,
  HeliusProvider,
  SolanaRpcProvider,
  unavailableEvidence,
  type BubblemapsObservation,
  type DexAggregate,
  type GoPlusSecurityObservation,
  type HeliusAssetObservation,
  type ProviderResult,
  type RpcTokenEvidence,
  type SolanaMintEvidence,
} from "@arcmemeperps/providers";
import type { EvmNetworkConfig, SolanaNetworkConfig } from "@arcmemeperps/shared";
import type {
  ChainAdapter,
  DeployerHistoryRecord,
  DiscoverTokensQuery,
  HolderRecord,
  LaunchData,
  LiquidityLock,
  PoolSnapshot,
  PricePoint,
  PriceSource,
  TokenMetadata,
  TokenPermissions,
  TradeRecord,
  TransactionRecord,
} from "./index.js";

export interface LiveAdapterOptions {
  readonly noEnrichment?: boolean;
  readonly rpcUrl?: string;
  readonly goPlusApiKey?: string;
  readonly heliusApiKey?: string;
  readonly bubbleMapsApiKey?: string;
}

export interface LiveInspectionAdapter extends ChainAdapter {
  inspectToken(
    tokenAddress: string,
    options?: { readonly noEnrichment?: boolean },
  ): Promise<MarketIntelligenceRecord>;
}

export class GenericEvmChainAdapter implements LiveInspectionAdapter {
  public readonly chain: EvmNetworkConfig["chain"];
  private readonly rpc: EvmRpcProvider;
  private readonly dex: DexScreenerProvider;
  private readonly goPlus: GoPlusProvider;
  private readonly bubbles: BubblemapsProvider;
  private readonly options: LiveAdapterOptions;

  public constructor(
    public readonly network: EvmNetworkConfig,
    options: LiveAdapterOptions = {},
  ) {
    this.chain = network.chain;
    this.options = options;
    const rpcUrl = options.rpcUrl ?? network.defaultRpcUrl;
    this.rpc = new EvmRpcProvider(network, rpcUrl);
    this.dex = new DexScreenerProvider(network);
    this.goPlus = new GoPlusProvider(
      network,
      options.goPlusApiKey === undefined ? {} : { apiKey: options.goPlusApiKey },
    );
    this.bubbles = new BubblemapsProvider(
      network,
      options.bubbleMapsApiKey === undefined ? {} : { apiKey: options.bubbleMapsApiKey },
    );
  }

  public async inspectToken(
    tokenAddress: string,
    options: { readonly noEnrichment?: boolean } = {},
  ): Promise<MarketIntelligenceRecord> {
    const normalized = normalizeTokenAddress(this.chain, tokenAddress);
    const fetchedAt = new Date().toISOString();
    const noEnrichment = options.noEnrichment ?? this.options.noEnrichment ?? false;
    const rpc = await this.rpc.readToken(normalized, fetchedAt);
    const dex = await this.dex.readToken(normalized, fetchedAt);
    const goPlus = noEnrichment
      ? unavailableResult(this.chain, this.network.name, "goplus", "NO_ENRICHMENT")
      : await this.goPlus.readToken(normalized, fetchedAt);
    const bubbles = noEnrichment
      ? unavailableResult(this.chain, this.network.name, "bubblemaps", "NO_ENRICHMENT")
      : await this.bubbles.readToken(normalized, fetchedAt);
    return buildEvmRecord(this.network, normalized, fetchedAt, rpc, dex, goPlus, bubbles);
  }

  public discoverTokens(query?: DiscoverTokensQuery): Promise<readonly TokenIdentity[]> {
    void query;
    return Promise.resolve([]);
  }
  public async getTokenMetadata(tokenAddress: string): Promise<TokenMetadata> {
    return (await this.inspectToken(tokenAddress)).token;
  }
  public async getLifecycle(tokenAddress: string): Promise<LifecycleSnapshot> {
    return (await this.inspectToken(tokenAddress)).lifecycle;
  }
  public getHolders(tokenAddress: string): Promise<readonly HolderRecord[]> {
    void tokenAddress;
    return Promise.resolve([]);
  }
  public async getLiquidity(tokenAddress: string): Promise<LiquidityState> {
    return (await this.inspectToken(tokenAddress)).liquidity;
  }
  public getLiquidityLocks(tokenAddress: string): Promise<readonly LiquidityLock[]> {
    void tokenAddress;
    return Promise.resolve([]);
  }
  public async getPools(tokenAddress: string): Promise<readonly PoolSnapshot[]> {
    return (await this.inspectToken(tokenAddress)).liquidity.liquidityVenues.map((venue) => ({
      venue,
      poolAddress: "UNKNOWN",
      tokenReserve: 0,
      quoteReserveUsd: 0,
      liquidityUsd: 0,
      feeBps: 0,
    }));
  }
  public getTrades(tokenAddress: string, since?: string): Promise<readonly TradeRecord[]> {
    void tokenAddress;
    void since;
    return Promise.resolve([]);
  }
  public async getPrice(tokenAddress: string): Promise<PricePoint> {
    const record = await this.inspectToken(tokenAddress);
    return {
      priceUsd: record.oracle.priceUsd,
      observedAt: record.oracle.observedAt,
      confidenceBps: record.oracle.confidenceBps,
      source: "dexscreener",
    };
  }
  public async getPriceSources(tokenAddress: string): Promise<readonly PriceSource[]> {
    const record = await this.inspectToken(tokenAddress);
    return [
      {
        source: "dexscreener",
        priceUsd: record.oracle.priceUsd,
        observedAt: record.oracle.observedAt,
        confidenceBps: record.oracle.confidenceBps,
      },
    ];
  }
  public async getDeployer(tokenAddress: string): Promise<string | null> {
    return (await this.inspectToken(tokenAddress)).deployer.deployerAddress;
  }
  public getDeployerHistory(tokenAddress: string): Promise<readonly DeployerHistoryRecord[]> {
    void tokenAddress;
    return Promise.resolve([]);
  }
  public async getAuthorities(tokenAddress: string): Promise<AuthorityState> {
    return (await this.inspectToken(tokenAddress)).authorities;
  }
  public async getTokenPermissions(tokenAddress: string): Promise<TokenPermissions> {
    const record = await this.inspectToken(tokenAddress);
    return {
      mintAuthority: null,
      freezeAuthority: null,
      owner: null,
      admin: null,
      proxyImplementation: record.authorities.upgradeAuthority,
      transferRestrictions: [],
    };
  }
  public getLaunchData(tokenAddress: string): Promise<LaunchData> {
    void tokenAddress;
    return Promise.resolve({
      platform: "UNKNOWN",
      launchAt: "UNKNOWN",
      bundleCount: 0,
      initialBuyerCount: 0,
      initialLiquidityUsd: 0,
    });
  }
  public getTransactionHistory(
    tokenAddress: string,
    since?: string,
  ): Promise<readonly TransactionRecord[]> {
    void tokenAddress;
    void since;
    return Promise.resolve([]);
  }
}

export class SolanaChainAdapter implements LiveInspectionAdapter {
  public readonly chain = "SOLANA" as const;
  private readonly rpc: SolanaRpcProvider;
  private readonly dex: DexScreenerProvider;
  private readonly goPlus: GoPlusProvider;
  private readonly bubbles: BubblemapsProvider;
  private readonly helius: HeliusProvider;
  private readonly options: LiveAdapterOptions;

  public constructor(
    public readonly network: SolanaNetworkConfig,
    options: LiveAdapterOptions = {},
  ) {
    this.options = options;
    this.rpc = new SolanaRpcProvider(network, options.rpcUrl ?? network.defaultRpcUrl);
    this.dex = new DexScreenerProvider(network);
    this.goPlus = new GoPlusProvider(
      network,
      options.goPlusApiKey === undefined ? {} : { apiKey: options.goPlusApiKey },
    );
    this.bubbles = new BubblemapsProvider(
      network,
      options.bubbleMapsApiKey === undefined ? {} : { apiKey: options.bubbleMapsApiKey },
    );
    this.helius = new HeliusProvider(
      network,
      options.heliusApiKey === undefined ? {} : { apiKey: options.heliusApiKey },
    );
  }

  public async inspectToken(
    tokenAddress: string,
    options: { readonly noEnrichment?: boolean } = {},
  ): Promise<MarketIntelligenceRecord> {
    const normalized = normalizeTokenAddress("SOLANA", tokenAddress);
    const fetchedAt = new Date().toISOString();
    const noEnrichment = options.noEnrichment ?? this.options.noEnrichment ?? false;
    const [rpc, dex] = await Promise.all([
      this.rpc.readMint(normalized, fetchedAt),
      this.dex.readToken(normalized, fetchedAt),
    ]);
    const goPlus = noEnrichment
      ? unavailableResult("SOLANA", this.network.name, "goplus", "NO_ENRICHMENT")
      : await this.goPlus.readToken(normalized, fetchedAt);
    const bubbles = noEnrichment
      ? unavailableResult("SOLANA", this.network.name, "bubblemaps", "NO_ENRICHMENT")
      : await this.bubbles.readToken(normalized, fetchedAt);
    const helius = noEnrichment
      ? unavailableResult("SOLANA", this.network.name, "helius", "NO_ENRICHMENT")
      : await this.helius.readAsset(normalized, fetchedAt);
    return buildSolanaRecord(
      this.network,
      normalized,
      fetchedAt,
      rpc,
      dex,
      goPlus,
      bubbles,
      helius,
    );
  }

  public discoverTokens(query?: DiscoverTokensQuery): Promise<readonly TokenIdentity[]> {
    void query;
    return Promise.resolve([]);
  }
  public async getTokenMetadata(tokenAddress: string): Promise<TokenMetadata> {
    return (await this.inspectToken(tokenAddress)).token;
  }
  public async getLifecycle(tokenAddress: string): Promise<LifecycleSnapshot> {
    return (await this.inspectToken(tokenAddress)).lifecycle;
  }
  public getHolders(tokenAddress: string): Promise<readonly HolderRecord[]> {
    void tokenAddress;
    return Promise.resolve([]);
  }
  public async getLiquidity(tokenAddress: string): Promise<LiquidityState> {
    return (await this.inspectToken(tokenAddress)).liquidity;
  }
  public getLiquidityLocks(tokenAddress: string): Promise<readonly LiquidityLock[]> {
    void tokenAddress;
    return Promise.resolve([]);
  }
  public getPools(tokenAddress: string): Promise<readonly PoolSnapshot[]> {
    void tokenAddress;
    return Promise.resolve([]);
  }
  public getTrades(tokenAddress: string, since?: string): Promise<readonly TradeRecord[]> {
    void tokenAddress;
    void since;
    return Promise.resolve([]);
  }
  public async getPrice(tokenAddress: string): Promise<PricePoint> {
    const record = await this.inspectToken(tokenAddress);
    return {
      priceUsd: record.oracle.priceUsd,
      observedAt: record.oracle.observedAt,
      confidenceBps: record.oracle.confidenceBps,
      source: "dexscreener",
    };
  }
  public async getPriceSources(tokenAddress: string): Promise<readonly PriceSource[]> {
    const record = await this.inspectToken(tokenAddress);
    return [
      {
        source: "dexscreener",
        priceUsd: record.oracle.priceUsd,
        observedAt: record.oracle.observedAt,
        confidenceBps: record.oracle.confidenceBps,
      },
    ];
  }
  public getDeployer(tokenAddress: string): Promise<string | null> {
    void tokenAddress;
    return Promise.resolve(null);
  }
  public getDeployerHistory(tokenAddress: string): Promise<readonly DeployerHistoryRecord[]> {
    void tokenAddress;
    return Promise.resolve([]);
  }
  public async getAuthorities(tokenAddress: string): Promise<AuthorityState> {
    return (await this.inspectToken(tokenAddress)).authorities;
  }
  public async getTokenPermissions(tokenAddress: string): Promise<TokenPermissions> {
    const record = await this.inspectToken(tokenAddress);
    return {
      mintAuthority:
        record.authorities.mintAuthorityActive === null
          ? null
          : record.authorities.mintAuthorityActive
            ? "ACTIVE"
            : null,
      freezeAuthority:
        record.authorities.freezeAuthorityActive === null
          ? null
          : record.authorities.freezeAuthorityActive
            ? "ACTIVE"
            : null,
      owner: null,
      admin: null,
      proxyImplementation: null,
      transferRestrictions: [],
    };
  }
  public getLaunchData(tokenAddress: string): Promise<LaunchData> {
    void tokenAddress;
    return Promise.resolve({
      platform: "UNKNOWN",
      launchAt: "UNKNOWN",
      bundleCount: 0,
      initialBuyerCount: 0,
      initialLiquidityUsd: 0,
    });
  }
  public getTransactionHistory(
    tokenAddress: string,
    since?: string,
  ): Promise<readonly TransactionRecord[]> {
    void tokenAddress;
    void since;
    return Promise.resolve([]);
  }
}

function buildEvmRecord(
  network: EvmNetworkConfig,
  tokenAddress: string,
  fetchedAt: string,
  rpc: ProviderResult<RpcTokenEvidence>,
  dex: ProviderResult<DexAggregate>,
  goPlus: ProviderResult<GoPlusSecurityObservation>,
  bubbles: ProviderResult<BubblemapsObservation>,
): MarketIntelligenceRecord {
  const r = rpc.value;
  const d = dex.value;
  const s = goPlus.value;
  const b = bubbles.value;
  const token: TokenIdentity = {
    chain: network.chain,
    tokenAddress,
    symbol: r?.symbol ?? "UNKNOWN",
    name: r?.name ?? "UNKNOWN",
    decimals: r?.decimals ?? 0,
    deployer: s?.creatorAddress ?? null,
    createdAt: "UNKNOWN",
    originPlatform: d !== null && d.pairs.length > 0 ? "DIRECT_DEX" : "UNKNOWN",
  };
  const lifecycle = lifecycleSnapshot(network.chain, d !== null && d.pairs.length > 0, fetchedAt);
  const authorities = evmAuthorities(r, s);
  const liquidity = liquidityState(d);
  const holders = holderConcentration(b);
  const deployer: DeployerRisk = {
    deployerAddress: s?.creatorAddress ?? null,
    deployerHoldingsPct: 0,
    knownRisk: null,
    priorRugCount: 0,
    relatedWalletFundingDetected: null,
    walletRotationDetected: null,
  };
  const activity: ActivityQualityMetrics = {
    organicVolume24hUsd: d?.volume24hUsd ?? 0,
    realizedVolatility30dPct: 0,
    washTradingDetected: null,
    volumeFarmingDetected: null,
    suspiciousEarlyBuyers: null,
    suspiciousTransactionRepetition: null,
    bundledLaunchDetected: null,
    fundingSourceDiversity: 0,
  };
  const oracle = oracleMetrics(d, fetchedAt);
  const derivatives = derivativesMetrics(liquidity, activity, oracle);
  const evidence = [...rpc.evidence, ...dex.evidence, ...goPlus.evidence, ...bubbles.evidence];
  return makeRecord(
    token,
    lifecycle,
    authorities,
    liquidity,
    holders,
    deployer,
    activity,
    oracle,
    derivatives,
    evidence,
    network.chain,
    network.name,
    r?.blockNumber.toString() ?? null,
    r?.blockHash ?? null,
    null,
    providerAvailability(
      [rpc, dex, goPlus, bubbles],
      ["canonical-evm-rpc", "dexscreener", "goplus", "bubblemaps"],
      fetchedAt,
    ),
  );
}

function buildSolanaRecord(
  network: SolanaNetworkConfig,
  tokenAddress: string,
  fetchedAt: string,
  rpc: ProviderResult<SolanaMintEvidence>,
  dex: ProviderResult<DexAggregate>,
  goPlus: ProviderResult<GoPlusSecurityObservation>,
  bubbles: ProviderResult<BubblemapsObservation>,
  helius: ProviderResult<HeliusAssetObservation>,
): MarketIntelligenceRecord {
  const r = rpc.value;
  const d = dex.value;
  const s = goPlus.value;
  const b = bubbles.value;
  const h = helius.value;
  const token: TokenIdentity = {
    chain: "SOLANA",
    tokenAddress,
    symbol: h?.symbol ?? "UNKNOWN",
    name: h?.name ?? "UNKNOWN",
    decimals: r?.decimals ?? 0,
    deployer: null,
    createdAt: "UNKNOWN",
    originPlatform: "UNKNOWN",
  };
  const lifecycle = lifecycleSnapshot("SOLANA", d !== null && d.pairs.length > 0, fetchedAt);
  const authorities: AuthorityState = {
    mintAuthorityActive: r === null ? null : r.mintAuthority !== null,
    freezeAuthorityActive: r === null ? null : r.freezeAuthority !== null,
    dangerousOwnerAdminPrivileges: null,
    upgradeable: null,
    upgradeAuthority: null,
    transferRestricted: triOr(s?.cannotBuy ?? null, s?.cannotSell ?? null),
    honeypotDetected: s?.isHoneypot ?? null,
  };
  const liquidity = liquidityState(d);
  const holders = holderConcentration(b, r);
  const deployer: DeployerRisk = {
    deployerAddress: null,
    deployerHoldingsPct: 0,
    knownRisk: null,
    priorRugCount: 0,
    relatedWalletFundingDetected: null,
    walletRotationDetected: null,
  };
  const activity: ActivityQualityMetrics = {
    organicVolume24hUsd: d?.volume24hUsd ?? 0,
    realizedVolatility30dPct: 0,
    washTradingDetected: null,
    volumeFarmingDetected: null,
    suspiciousEarlyBuyers: null,
    suspiciousTransactionRepetition: null,
    bundledLaunchDetected: null,
    fundingSourceDiversity: 0,
  };
  const oracle = oracleMetrics(d, fetchedAt);
  const derivatives = derivativesMetrics(liquidity, activity, oracle);
  const evidence = [
    ...rpc.evidence,
    ...dex.evidence,
    ...goPlus.evidence,
    ...bubbles.evidence,
    ...helius.evidence,
  ];
  return makeRecord(
    token,
    lifecycle,
    authorities,
    liquidity,
    holders,
    deployer,
    activity,
    oracle,
    derivatives,
    evidence,
    "SOLANA",
    network.name,
    null,
    null,
    r?.slot.toString() ?? null,
    providerAvailability(
      [rpc, dex, goPlus, bubbles, helius],
      ["canonical-solana-rpc", "dexscreener", "goplus", "bubblemaps", "helius"],
      fetchedAt,
    ),
  );
}

function makeRecord(
  token: TokenIdentity,
  lifecycle: LifecycleSnapshot,
  authorities: AuthorityState,
  liquidity: LiquidityState,
  holders: HolderConcentration,
  deployer: DeployerRisk,
  activity: ActivityQualityMetrics,
  oracle: OracleMetrics,
  derivatives: MarketIntelligenceRecord["derivatives"],
  evidence: readonly EvidenceRecord[],
  chain: MarketIntelligenceRecord["token"]["chain"],
  network: string,
  blockNumber: string | null,
  blockHash: Hex | null,
  slot: string | null,
  providerAvailability: MarketIntelligenceRecord["providerAvailability"],
): MarketIntelligenceRecord {
  const bundle: EvidenceBundle = { schemaVersion: "1", records: evidence };
  const root = evidenceRootForBundle(bundle);
  const unavailable = evidence.filter((item) => item.status !== "AVAILABLE").length;
  return {
    token,
    marketId: marketIdForToken(chain, token.tokenAddress),
    lifecycle,
    authorities,
    liquidity,
    holders,
    deployer,
    activity,
    oracle,
    derivatives,
    evidenceRoot: root,
    evidenceSchemaVersion: "1",
    evidence,
    assessmentPosition: { chain, blockNumber, blockHash, slot },
    providerAvailability,
    dataQuality: {
      status:
        unavailable === 0
          ? "SUFFICIENT"
          : evidence.length === unavailable
            ? "INSUFFICIENT"
            : "PARTIAL",
      reconciliationStatus: "UNAVAILABLE",
      disagreements: [],
    },
  };
}

function lifecycleSnapshot(
  chain: MarketIntelligenceRecord["token"]["chain"],
  hasPair: boolean,
  observedAt: string,
): LifecycleSnapshot {
  return {
    status: hasPair ? "DEX_LIVE" : "DISCOVERED",
    observedAt,
    confidence: hasPair ? 0.8 : 0.4,
    evidenceHash: `0x${"00".repeat(32)}`,
  };
}
function liquidityState(dex: DexAggregate | null): LiquidityState {
  return {
    totalLiquidityUsd: dex?.totalObservedLiquidityUsd ?? 0,
    depth1PctUsd: dex?.depth1PctUsd ?? null,
    depth2PctUsd: dex?.depth2PctUsd ?? null,
    venueCount: dex?.meaningfulPoolCount ?? 0,
    lpOwnershipConcentrationPct: 0,
    lpLockStatus: "UNKNOWN",
    earliestLpUnlockAt: null,
    liquidityVenues: dex?.pairs.map((pair) => pair.dexId) ?? [],
    suddenCollapsePct24h: 0,
  };
}
function evmAuthorities(
  rpc: RpcTokenEvidence | null,
  security: GoPlusSecurityObservation | null,
): AuthorityState {
  return {
    mintAuthorityActive: security?.isMintable ?? null,
    freezeAuthorityActive: null,
    dangerousOwnerAdminPrivileges: null,
    upgradeable: rpc?.proxyDetected ?? security?.isProxy ?? null,
    upgradeAuthority: rpc?.proxyImplementation ?? rpc?.proxyAdminAddress ?? null,
    transferRestricted: triOr(security?.cannotBuy ?? null, security?.cannotSell ?? null),
    honeypotDetected: security?.isHoneypot ?? null,
  };
}
function triOr(left: boolean | null, right: boolean | null): boolean | null {
  if (left === true || right === true) return true;
  if (left === null || right === null) return null;
  return false;
}
function holderConcentration(
  bubbles: BubblemapsObservation | null,
  mint?: SolanaMintEvidence | null,
): HolderConcentration {
  if (bubbles !== null)
    return {
      topHolderPct: bubbles.largestIndividualNonSystemPct,
      topFivePct: 0,
      connectedClusterPct: bubbles.largestConnectedNonSystemClusterPct,
      bundledLaunchPct: 0,
      individualWalletsUnderFivePct: bubbles.largestIndividualNonSystemPct < 5,
      holderCount: bubbles.holders.length,
      organicHolderGrowthPct24h: 0,
    };
  const supply = mint?.supply ?? 0n;
  const top =
    supply === 0n ? 0 : Number(((mint?.largestAccounts[0]?.amount ?? 0n) * 10_000n) / supply) / 100;
  return {
    topHolderPct: top,
    topFivePct: 0,
    connectedClusterPct: 0,
    bundledLaunchPct: 0,
    individualWalletsUnderFivePct: top < 5,
    holderCount: mint?.largestAccounts.length ?? 0,
    organicHolderGrowthPct24h: 0,
  };
}
function oracleMetrics(dex: DexAggregate | null, observedAt: string): OracleMetrics {
  return {
    sourceCount: dex?.priceSourceCount ?? 0,
    disagreementPct: 0,
    confidenceBps: dex?.priceUsd === null || dex?.priceUsd === undefined ? 0 : 5_000,
    stale: null,
    priceUsd: dex?.priceUsd ?? 0,
    observedAt,
    manipulationCostUsd: 0,
  };
}
function derivativesMetrics(
  liquidity: LiquidityState,
  activity: ActivityQualityMetrics,
  oracle: OracleMetrics,
): MarketIntelligenceRecord["derivatives"] {
  return {
    spotLiquidityUsd: liquidity.totalLiquidityUsd,
    liquidityVenueCount: liquidity.venueCount,
    depth1PctUsd: liquidity.depth1PctUsd,
    depth2PctUsd: liquidity.depth2PctUsd,
    organicVolume24hUsd: activity.organicVolume24hUsd,
    realizedVolatilityPct: 0,
    oracleSourceCount: oracle.sourceCount,
    oracleDisagreementPct: oracle.disagreementPct,
    oracleConfidenceBps: oracle.confidenceBps,
    manipulationCostUsd: oracle.manipulationCostUsd,
    maximumSafeOpenInterestUsd: 0,
    maximumPositionSizeUsd: 0,
    maximumLeverage: 1,
    fundingImbalancePct: 0,
    liquidationCapacityUsd: 0,
  };
}
function unavailableResult(
  chain: MarketIntelligenceRecord["token"]["chain"],
  network: string,
  provider: string,
  reason: string,
): ProviderResult<never> {
  return {
    status: "UNAVAILABLE",
    value: null,
    reason,
    error: null,
    evidence: [
      unavailableEvidence(
        { chain, network, fetchedAt: new Date().toISOString() },
        provider,
        provider,
        reason,
      ),
    ],
  };
}
function providerAvailability(
  results: readonly ProviderResult<unknown>[],
  names: readonly string[],
  fetchedAt: string,
): MarketIntelligenceRecord["providerAvailability"] {
  return results.map((result, index) => ({
    provider: names[index]!,
    status: result.status,
    reason: result.reason ?? result.error,
    fetchedAt,
  }));
}
