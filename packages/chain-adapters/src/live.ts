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
  GeckoTerminalProvider,
  HeliusProvider,
  SolanaRpcProvider,
  RugCheckProvider,
  ProviderPool,
  unavailableEvidence,
  type BubblemapsObservation,
  type DexAggregate,
  type GoPlusSecurityObservation,
  type GeckoTokenObservation,
  type GeckoOhlcvPoint,
  type HeliusAssetObservation,
  type ProviderResult,
  type RpcTokenEvidence,
  type SolanaMintEvidence,
  type RugCheckObservation,
} from "@arcmemeperps/providers";
import type { EvmNetworkConfig, SolanaNetworkConfig, SupportedChain } from "@arcmemeperps/shared";
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
import { readDirectEvmV2Depth, type DirectEvmDepthResult } from "./direct-evm-depth.js";

export interface LiveAdapterOptions {
  readonly noEnrichment?: boolean;
  readonly rpcUrl?: string;
  readonly rpcUrls?: readonly string[];
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

export class CapabilityUnavailableError extends Error {
  public constructor(
    public readonly chain: string,
    public readonly capability: string,
  ) {
    super(`UNAVAILABLE:${chain}:${capability}`);
    this.name = "CapabilityUnavailableError";
  }
}

export class GenericEvmChainAdapter implements LiveInspectionAdapter {
  public readonly chain: EvmNetworkConfig["chain"];
  private readonly rpcUrls: readonly string[];
  private readonly rpcPool: ProviderPool<ProviderResult<RpcTokenEvidence>, RpcReadContext>;
  private readonly dex: DexScreenerProvider;
  private readonly goPlus: GoPlusProvider;
  private readonly bubbles: BubblemapsProvider;
  private readonly gecko: GeckoTerminalProvider;
  private readonly options: LiveAdapterOptions;

  public constructor(
    public readonly network: EvmNetworkConfig,
    options: LiveAdapterOptions = {},
  ) {
    this.chain = network.chain;
    this.options = options;
    const rpcUrl = options.rpcUrl ?? network.defaultRpcUrl;
    this.rpcUrls =
      options.rpcUrls === undefined || options.rpcUrls.length === 0
        ? [rpcUrl]
        : [...options.rpcUrls];
    this.rpcPool = new ProviderPool(
      this.rpcUrls.map((url, index) => ({
        id: `evm-rpc-${index + 1}`,
        priority: index,
        read: async (context: RpcReadContext) => {
          const result = await new EvmRpcProvider(network, url).readToken(
            context.tokenAddress,
            context.fetchedAt,
          );
          if (result.status !== "AVAILABLE")
            throw new Error(result.error ?? result.reason ?? "RPC_UNAVAILABLE");
          return result;
        },
      })),
      { maxAttempts: this.rpcUrls.length },
    );
    this.dex = new DexScreenerProvider(network);
    this.goPlus = new GoPlusProvider(
      network,
      options.goPlusApiKey === undefined ? {} : { apiKey: options.goPlusApiKey },
    );
    this.bubbles = new BubblemapsProvider(
      network,
      options.bubbleMapsApiKey === undefined ? {} : { apiKey: options.bubbleMapsApiKey },
    );
    this.gecko = new GeckoTerminalProvider(network);
  }

  public async inspectToken(
    tokenAddress: string,
    options: { readonly noEnrichment?: boolean } = {},
  ): Promise<MarketIntelligenceRecord> {
    const normalized = normalizeTokenAddress(this.chain, tokenAddress);
    const fetchedAt = new Date().toISOString();
    const noEnrichment = options.noEnrichment ?? this.options.noEnrichment ?? false;
    const rpc = await readRpcPool(
      this.rpcPool,
      { tokenAddress: normalized, fetchedAt },
      this.chain,
      this.network.name,
    );
    const [dex, gecko] = await Promise.all([
      this.dex.readToken(normalized, fetchedAt),
      this.gecko.readToken(normalized, fetchedAt),
    ]);
    const directDepth = await readDirectEvmV2Depth(
      this.network,
      this.rpcUrls,
      normalized,
      dex.value?.pairs ?? [],
      fetchedAt,
    );
    const history = await readGeckoHistory(this.gecko, gecko.value, dex.value, fetchedAt);
    const goPlus = noEnrichment
      ? unavailableResult(this.chain, this.network.name, "goplus", "NO_ENRICHMENT")
      : await this.goPlus.readToken(normalized, fetchedAt);
    const bubbles = noEnrichment
      ? unavailableResult(this.chain, this.network.name, "bubblemaps", "NO_ENRICHMENT")
      : await this.bubbles.readToken(normalized, fetchedAt);
    return buildEvmRecord(this.network, normalized, fetchedAt, rpc, dex, gecko, history, directDepth, goPlus, bubbles);
  }

  public discoverTokens(query?: DiscoverTokensQuery): Promise<readonly TokenIdentity[]> {
    void query;
    throw new CapabilityUnavailableError(this.chain, "discovery");
  }
  public async getTokenMetadata(tokenAddress: string): Promise<TokenMetadata> {
    return (await this.inspectToken(tokenAddress)).token;
  }
  public async getLifecycle(tokenAddress: string): Promise<LifecycleSnapshot> {
    return (await this.inspectToken(tokenAddress)).lifecycle;
  }
  public getHolders(tokenAddress: string): Promise<readonly HolderRecord[]> {
    void tokenAddress;
    throw new CapabilityUnavailableError(this.chain, "holders");
  }
  public async getLiquidity(tokenAddress: string): Promise<LiquidityState> {
    return (await this.inspectToken(tokenAddress)).liquidity;
  }
  public getLiquidityLocks(tokenAddress: string): Promise<readonly LiquidityLock[]> {
    void tokenAddress;
    throw new CapabilityUnavailableError(this.chain, "liquidity-lock-security");
  }
  public getPools(tokenAddress: string): Promise<readonly PoolSnapshot[]> {
    const normalized = normalizeTokenAddress(this.chain, tokenAddress);
    return this.dex.readToken(normalized, new Date().toISOString()).then((result) => {
      if (result.value === null) throw new CapabilityUnavailableError(this.chain, "pool-reserves");
      return result.value.pairs.map((pair) => ({
        venue: pair.dexId,
        poolAddress: pair.pairAddress,
        tokenReserve: pair.baseLiquidity,
        quoteReserveUsd: pair.quoteLiquidity,
        liquidityUsd: pair.liquidityUsd,
        feeBps: null,
      }));
    });
  }
  public getTrades(tokenAddress: string, since?: string): Promise<readonly TradeRecord[]> {
    void tokenAddress;
    void since;
    throw new CapabilityUnavailableError(this.chain, "trades");
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
        sourceFamily: "DEXSCREENER_AGGREGATION",
        underlyingVenueId: null,
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
    throw new CapabilityUnavailableError(this.chain, "deployer-history");
  }
  public async getAuthorities(tokenAddress: string): Promise<AuthorityState> {
    return (await this.inspectToken(tokenAddress)).authorities;
  }
  public getTokenPermissions(tokenAddress: string): Promise<TokenPermissions> {
    return this.inspectToken(tokenAddress).then((record) => ({
      mintAuthority: record.authorities.mintAuthorityActive === true ? "ACTIVE" : null,
      freezeAuthority: record.authorities.freezeAuthorityActive === true ? "ACTIVE" : null,
      owner: record.authorities.dangerousOwnerAdminPrivileges === true ? "UNKNOWN" : null,
      admin: record.authorities.upgradeAuthority,
      proxyImplementation: record.authorities.upgradeAuthority,
      transferRestrictions:
        record.authorities.transferRestricted === true ? ["PROVIDER_SIGNAL"] : [],
    }));
  }
  public getLaunchData(tokenAddress: string): Promise<LaunchData> {
    void tokenAddress;
    throw new CapabilityUnavailableError(this.chain, "launch-data");
  }
  public getTransactionHistory(
    tokenAddress: string,
    since?: string,
  ): Promise<readonly TransactionRecord[]> {
    void tokenAddress;
    void since;
    throw new CapabilityUnavailableError(this.chain, "transaction-history");
  }
}

export class SolanaChainAdapter implements LiveInspectionAdapter {
  public readonly chain = "SOLANA" as const;
  private readonly rpcUrls: readonly string[];
  private readonly rpcPool: ProviderPool<ProviderResult<SolanaMintEvidence>, RpcReadContext>;
  private readonly dex: DexScreenerProvider;
  private readonly goPlus: GoPlusProvider;
  private readonly bubbles: BubblemapsProvider;
  private readonly helius: HeliusProvider;
  private readonly rugCheck: RugCheckProvider;
  private readonly gecko: GeckoTerminalProvider;
  private readonly options: LiveAdapterOptions;

  public constructor(
    public readonly network: SolanaNetworkConfig,
    options: LiveAdapterOptions = {},
  ) {
    this.options = options;
    this.rpcUrls =
      options.rpcUrls === undefined || options.rpcUrls.length === 0
        ? [options.rpcUrl ?? network.defaultRpcUrl]
        : [...options.rpcUrls];
    this.rpcPool = new ProviderPool(
      this.rpcUrls.map((url, index) => ({
        id: `solana-rpc-${index + 1}`,
        priority: index,
        read: async (context: RpcReadContext) => {
          const result = await new SolanaRpcProvider(network, url).readMint(
            context.tokenAddress,
            context.fetchedAt,
          );
          if (result.status !== "AVAILABLE")
            throw new Error(result.error ?? result.reason ?? "RPC_UNAVAILABLE");
          return result;
        },
      })),
      { maxAttempts: this.rpcUrls.length },
    );
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
    this.rugCheck = new RugCheckProvider(network);
    this.gecko = new GeckoTerminalProvider(network);
  }

  public async inspectToken(
    tokenAddress: string,
    options: { readonly noEnrichment?: boolean } = {},
  ): Promise<MarketIntelligenceRecord> {
    const normalized = normalizeTokenAddress("SOLANA", tokenAddress);
    const fetchedAt = new Date().toISOString();
    const noEnrichment = options.noEnrichment ?? this.options.noEnrichment ?? false;
  const [rpc, dex, gecko] = await Promise.all([
      readRpcPool(
        this.rpcPool,
        { tokenAddress: normalized, fetchedAt },
        "SOLANA",
        this.network.name,
      ),
      this.dex.readToken(normalized, fetchedAt),
      this.gecko.readToken(normalized, fetchedAt),
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
    const rugCheck = noEnrichment
      ? unavailableResult("SOLANA", this.network.name, "rugcheck", "NO_ENRICHMENT")
      : await this.rugCheck.readToken(normalized, fetchedAt);
    const history = await readGeckoHistory(this.gecko, gecko.value, dex.value, fetchedAt);
    return buildSolanaRecord(
      this.network,
      normalized,
      fetchedAt,
      rpc,
      dex,
      gecko,
      goPlus,
      bubbles,
      helius,
      rugCheck,
      history,
    );
  }

  public discoverTokens(query?: DiscoverTokensQuery): Promise<readonly TokenIdentity[]> {
    void query;
    throw new CapabilityUnavailableError(this.chain, "discovery");
  }
  public async getTokenMetadata(tokenAddress: string): Promise<TokenMetadata> {
    return (await this.inspectToken(tokenAddress)).token;
  }
  public async getLifecycle(tokenAddress: string): Promise<LifecycleSnapshot> {
    return (await this.inspectToken(tokenAddress)).lifecycle;
  }
  public getHolders(tokenAddress: string): Promise<readonly HolderRecord[]> {
    void tokenAddress;
    throw new CapabilityUnavailableError(this.chain, "holders");
  }
  public async getLiquidity(tokenAddress: string): Promise<LiquidityState> {
    return (await this.inspectToken(tokenAddress)).liquidity;
  }
  public getLiquidityLocks(tokenAddress: string): Promise<readonly LiquidityLock[]> {
    void tokenAddress;
    throw new CapabilityUnavailableError(this.chain, "liquidity-lock-security");
  }
  public getPools(tokenAddress: string): Promise<readonly PoolSnapshot[]> {
    const normalized = normalizeTokenAddress("SOLANA", tokenAddress);
    return this.dex.readToken(normalized, new Date().toISOString()).then((result) => {
      if (result.value === null) throw new CapabilityUnavailableError(this.chain, "pool-reserves");
      return result.value.pairs.map((pair) => ({
        venue: pair.dexId,
        poolAddress: pair.pairAddress,
        tokenReserve: pair.baseLiquidity,
        quoteReserveUsd: pair.quoteLiquidity,
        liquidityUsd: pair.liquidityUsd,
        feeBps: null,
      }));
    });
  }
  public getTrades(tokenAddress: string, since?: string): Promise<readonly TradeRecord[]> {
    void tokenAddress;
    void since;
    throw new CapabilityUnavailableError(this.chain, "trades");
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
    throw new CapabilityUnavailableError(this.chain, "deployer");
  }
  public getDeployerHistory(tokenAddress: string): Promise<readonly DeployerHistoryRecord[]> {
    void tokenAddress;
    throw new CapabilityUnavailableError(this.chain, "deployer-history");
  }
  public async getAuthorities(tokenAddress: string): Promise<AuthorityState> {
    return (await this.inspectToken(tokenAddress)).authorities;
  }
  public getTokenPermissions(tokenAddress: string): Promise<TokenPermissions> {
    return this.inspectToken(tokenAddress).then((record) => ({
      mintAuthority: record.authorities.mintAuthorityActive === true ? "ACTIVE" : null,
      freezeAuthority: record.authorities.freezeAuthorityActive === true ? "ACTIVE" : null,
      owner: null,
      admin: null,
      proxyImplementation: null,
      transferRestrictions:
        record.authorities.transferRestricted === true ? ["PROVIDER_SIGNAL"] : [],
    }));
  }
  public getLaunchData(tokenAddress: string): Promise<LaunchData> {
    void tokenAddress;
    throw new CapabilityUnavailableError(this.chain, "launch-data");
  }
  public getTransactionHistory(
    tokenAddress: string,
    since?: string,
  ): Promise<readonly TransactionRecord[]> {
    void tokenAddress;
    void since;
    throw new CapabilityUnavailableError(this.chain, "transaction-history");
  }
}

interface RpcReadContext {
  readonly tokenAddress: string;
  readonly fetchedAt: string;
}

async function readRpcPool<T, TContext>(
  pool: ProviderPool<ProviderResult<T>, TContext>,
  context: TContext,
  chain: SupportedChain,
  network: string,
): Promise<ProviderResult<T>> {
  const outcome = await pool.read(context);
  if (outcome.value !== null) return outcome.value;
  return unavailableResult(
    chain,
    network,
    "canonical-rpc-pool",
    `RPC_POOL_UNAVAILABLE:${outcome.errors.map((item) => `${item.provider}=${item.message}`).join("|")}`,
  );
}

function buildEvmRecord(
  network: EvmNetworkConfig,
  tokenAddress: string,
  fetchedAt: string,
  rpc: ProviderResult<RpcTokenEvidence>,
  dex: ProviderResult<DexAggregate>,
  gecko: ProviderResult<GeckoTokenObservation>,
  history: ProviderResult<readonly GeckoOhlcvPoint[]>,
  directDepth: DirectEvmDepthResult,
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
    symbol: r?.symbol ?? null,
    name: r?.name ?? null,
    decimals: r?.decimals ?? null,
    deployer: s?.creatorAddress ?? null,
    createdAt: null,
    originPlatform: d !== null && d.pairs.length > 0 ? "DIRECT_DEX" : "UNKNOWN",
  };
  const lifecycle = lifecycleSnapshot(network.chain, d !== null && d.pairs.length > 0, fetchedAt);
  const authorities = evmAuthorities(r, s);
  const liquidity = liquidityState(d, gecko.value, directDepth);
  const holders = holderConcentration(b);
  const deployer: DeployerRisk = {
    deployerAddress: s?.creatorAddress ?? null,
    deployerHoldingsPct: null,
    knownRisk: null,
    priorRugCount: null,
    relatedWalletFundingDetected: null,
    walletRotationDetected: null,
  };
  const activity: ActivityQualityMetrics = {
    organicVolume24hUsd: null,
    realizedVolatility30dPct: realizedVolatilityFromHistory(history.value),
    washTradingDetected: null,
    volumeFarmingDetected: null,
    suspiciousEarlyBuyers: null,
    suspiciousTransactionRepetition: null,
    bundledLaunchDetected: null,
    fundingSourceDiversity: null,
  };
  const oracle = oracleMetrics(d, gecko.value, fetchedAt);
  const derivatives = derivativesMetrics(liquidity, activity, oracle);
  const evidence = [...rpc.evidence, ...dex.evidence, ...gecko.evidence, ...history.evidence, ...directDepth.evidence, ...goPlus.evidence, ...bubbles.evidence];
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
    r?.blockNumber?.toString() ?? null,
    r?.blockHash ?? null,
    null,
    historyPoints(history.value, historyEvidencePool(history.evidence), "day"),
    providerAvailability(
      [rpc, dex, gecko, history, goPlus, bubbles],
      ["canonical-evm-rpc", "dexscreener", "geckoterminal", "geckoterminal-ohlcv", "goplus", "bubblemaps"],
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
  gecko: ProviderResult<GeckoTokenObservation>,
  goPlus: ProviderResult<GoPlusSecurityObservation>,
  bubbles: ProviderResult<BubblemapsObservation>,
  helius: ProviderResult<HeliusAssetObservation>,
  rugCheck: ProviderResult<RugCheckObservation>,
  history: ProviderResult<readonly GeckoOhlcvPoint[]>,
): MarketIntelligenceRecord {
  const r = rpc.value;
  const d = dex.value;
  const s = goPlus.value;
  const b = bubbles.value;
  const h = helius.value;
  const token: TokenIdentity = {
    chain: "SOLANA",
    tokenAddress,
    symbol: h?.symbol ?? null,
    name: h?.name ?? null,
    decimals: r?.decimals ?? null,
    deployer: null,
    createdAt: null,
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
  const liquidity = liquidityState(d, gecko.value);
  const holders = holderConcentration(b, r);
  const deployer: DeployerRisk = {
    deployerAddress: null,
    deployerHoldingsPct: null,
    knownRisk: null,
    priorRugCount: null,
    relatedWalletFundingDetected: null,
    walletRotationDetected: null,
  };
  const activity: ActivityQualityMetrics = {
    organicVolume24hUsd: null,
    realizedVolatility30dPct: realizedVolatilityFromHistory(history.value),
    washTradingDetected: null,
    volumeFarmingDetected: null,
    suspiciousEarlyBuyers: null,
    suspiciousTransactionRepetition: null,
    bundledLaunchDetected: null,
    fundingSourceDiversity: null,
  };
  const oracle = oracleMetrics(d, gecko.value, fetchedAt);
  const derivatives = derivativesMetrics(liquidity, activity, oracle);
  const evidence = [
    ...rpc.evidence,
    ...dex.evidence,
    ...gecko.evidence,
    ...goPlus.evidence,
    ...bubbles.evidence,
    ...helius.evidence,
    ...rugCheck.evidence,
    ...history.evidence,
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
    historyPoints(history.value, historyEvidencePool(history.evidence), "day"),
    providerAvailability(
      [rpc, dex, gecko, history, goPlus, bubbles, helius, rugCheck],
      ["canonical-solana-rpc", "dexscreener", "geckoterminal", "geckoterminal-ohlcv", "goplus", "bubblemaps", "helius", "rugcheck"],
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
  history: MarketIntelligenceRecord["history"],
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
    history,
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
interface CombinedPool {
  readonly poolAddress: string;
  readonly venue: string | null;
  readonly priceUsd: number | null;
  readonly liquidityUsd: number | null;
}

function combinedPools(
  dex: DexAggregate | null,
  gecko: GeckoTokenObservation | null,
): readonly CombinedPool[] {
  const pools = new Map<string, CombinedPool>();
  for (const pair of dex?.pairs ?? []) {
    pools.set(pair.pairAddress.toLowerCase(), {
      poolAddress: pair.pairAddress,
      venue: pair.dexId,
      priceUsd: pair.priceUsd,
      liquidityUsd: pair.liquidityUsd,
    });
  }
  for (const pool of gecko?.pools ?? []) {
    const key = pool.poolAddress.toLowerCase();
    if (pools.has(key)) continue;
    pools.set(key, {
      poolAddress: pool.poolAddress,
      venue: pool.dexId,
      priceUsd: pool.priceUsd,
      liquidityUsd: pool.liquidityUsd,
    });
  }
  return [...pools.values()];
}

function liquidityState(
  dex: DexAggregate | null,
  gecko: GeckoTokenObservation | null,
  directDepth: DirectEvmDepthResult | null = null,
): LiquidityState {
  const pools = combinedPools(dex, gecko);
  const knownLiquidity = pools.flatMap((pool) => pool.liquidityUsd === null ? [] : [pool.liquidityUsd]);
  const venues = [...new Set(pools.flatMap((pool) => pool.venue === null ? [] : [pool.venue]))];
  return {
    totalLiquidityUsd: dex === null && gecko === null ? null : knownLiquidity.reduce((sum, value) => sum + value, 0),
    depth1PctUsd: conservativeDepthUsd(directDepth?.depth.buyDepth1PctUsdWad ?? null, directDepth?.depth.sellDepth1PctUsdWad ?? null),
    depth2PctUsd: conservativeDepthUsd(directDepth?.depth.buyDepth2PctUsdWad ?? null, directDepth?.depth.sellDepth2PctUsdWad ?? null),
    venueCount: dex === null && gecko === null ? null : venues.length,
    lpOwnershipConcentrationPct: null,
    lpLockStatus: "UNKNOWN",
    earliestLpUnlockAt: null,
    liquidityVenues: venues,
    suddenCollapsePct24h: null,
  };
}

function conservativeDepthUsd(buy: bigint | null, sell: bigint | null): number | null {
  if (buy === null || sell === null) return null;
  return Number((buy < sell ? buy : sell)) / 1e18;
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
  mint: SolanaMintEvidence | null = null,
): HolderConcentration {
  if (bubbles !== null)
    return {
      topHolderPct: bubbles.largestIndividualNonSystemPct,
      topFivePct: null,
      connectedClusterPct: bubbles.largestConnectedNonSystemClusterPct,
      bundledLaunchPct: null,
      individualWalletsUnderFivePct: bubbles.largestIndividualNonSystemPct < 5,
      holderCount: bubbles.holders.length,
      organicHolderGrowthPct24h: null,
      evidenceScope: "RESOLVED_TOP_OWNERS",
      topTokenAccountPct: null,
      resolvedTopOwnerPct: bubbles.largestIndividualNonSystemPct,
      resolvedTopFiveOwnerPct: null,
    };
  const supply = mint?.supply ?? null;
  const tokenAccountPercent =
    supply === null || supply === 0n || mint === null || mint.largestAccounts.length === 0
      ? null
      : Number((mint.largestAccounts[0]!.amount * 10_000n) / supply) / 100;
  const owners = new Map<string, bigint>();
  for (const account of mint?.largestAccounts ?? []) {
    if (account.owner === null) continue;
    owners.set(account.owner, (owners.get(account.owner) ?? 0n) + account.amount);
  }
  const ownerPercentages =
    supply === null || supply === 0n
      ? []
      : [...owners.values()].map((amount) => Number((amount * 10_000n) / supply) / 100).sort((a, b) => b - a);
  const resolvedTopOwnerPct = ownerPercentages[0] ?? null;
  const resolvedTopFiveOwnerPct = ownerPercentages.length === 0 ? null : ownerPercentages.slice(0, 5).reduce((sum, value) => sum + value, 0);
  return {
    topHolderPct: resolvedTopOwnerPct,
    topFivePct: resolvedTopFiveOwnerPct,
    connectedClusterPct: null,
    bundledLaunchPct: null,
    individualWalletsUnderFivePct:
      resolvedTopOwnerPct === null ? null : resolvedTopOwnerPct < 5,
    holderCount: owners.size === 0 ? null : owners.size,
    organicHolderGrowthPct24h: null,
    evidenceScope: owners.size === 0 ? "TOP_TOKEN_ACCOUNTS" : "RESOLVED_TOP_OWNERS",
    topTokenAccountPct: tokenAccountPercent,
    resolvedTopOwnerPct,
    resolvedTopFiveOwnerPct,
  };
}
function oracleMetrics(
  dex: DexAggregate | null,
  gecko: GeckoTokenObservation | null,
  observedAt: string,
): OracleMetrics {
  const pools = combinedPools(dex, gecko).filter(
    (pool): pool is CombinedPool & { readonly priceUsd: number } =>
      pool.priceUsd !== null && pool.priceUsd > 0,
  );
  // Dust pools remain evidence but must not manufacture oracle independence
  // or overwhelm a meaningful price with an economically irrelevant quote.
  const meaningfulPools = pools.filter(
    (pool) => pool.liquidityUsd !== null && pool.liquidityUsd >= 10_000,
  );
  if (meaningfulPools.length === 0) {
    return {
      sourceCount: null,
      disagreementPct: null,
      confidenceBps: null,
      stale: null,
      priceUsd: null,
      observedAt,
      manipulationCostUsd: null,
    };
  }
  const prices = meaningfulPools.map((pool) => pool.priceUsd).sort((a, b) => a - b);
  const minimum = prices[0]!;
  const maximum = prices.at(-1)!;
  const median = prices[Math.floor(prices.length / 2)]!;
  const disagreementPct = ((maximum - minimum) / median) * 100;
  const sourceCount = meaningfulPools.length;
  const venueCount = new Set(meaningfulPools.flatMap((pool) => pool.venue === null ? [] : [pool.venue])).size;
  const totalLiquidity = meaningfulPools.reduce((sum, pool) => sum + (pool.liquidityUsd ?? 0), 0);
  const liquidityScore = Math.min(2_000, Math.log10(Math.max(totalLiquidity, 1)) * 350);
  const sourceScore = Math.min(2_500, sourceCount * 1_250);
  const venueScore = Math.min(1_500, venueCount * 750);
  const agreementScore = Math.max(0, 1_500 - disagreementPct * 300);
  const confidenceBps = Math.max(0, Math.min(10_000, Math.round(2_500 + sourceScore + venueScore + liquidityScore + agreementScore)));
  return {
    sourceCount,
    disagreementPct,
    confidenceBps,
    stale: false,
    priceUsd: median,
    observedAt,
    manipulationCostUsd: null,
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
    realizedVolatilityPct: null,
    oracleSourceCount: oracle.sourceCount,
    oracleDisagreementPct: oracle.disagreementPct,
    oracleConfidenceBps: oracle.confidenceBps,
    manipulationCostUsd: oracle.manipulationCostUsd,
    maximumSafeOpenInterestUsd: null,
    maximumPositionSizeUsd: null,
    maximumLeverage: null,
    fundingImbalancePct: null,
    liquidationCapacityUsd: null,
  };
}

async function readGeckoHistory(
  provider: GeckoTerminalProvider,
  gecko: GeckoTokenObservation | null,
  dex: DexAggregate | null,
  fetchedAt: string,
): Promise<ProviderResult<readonly GeckoOhlcvPoint[]>> {
  const pool = selectedHistoryPool(gecko, dex);
  if (pool === null) {
    return unavailableResult(provider.network.chain, provider.network.name, "geckoterminal-ohlcv", "NO_SUPPORTED_POOL");
  }
  return provider.readOhlcv(pool, fetchedAt, "day", 1, 100);
}

function selectedHistoryPool(
  gecko: GeckoTokenObservation | null,
  dex: DexAggregate | null,
): string | null {
  const candidates = [
    ...(gecko?.pools ?? []).map((pool) => ({ address: pool.poolAddress, liquidity: pool.liquidityUsd ?? -1 })),
    ...(dex?.pairs ?? []).map((pair) => ({ address: pair.pairAddress, liquidity: pair.liquidityUsd ?? -1 })),
  ].sort((left, right) => right.liquidity - left.liquidity);
  return candidates[0]?.address ?? null;
}

function historyEvidencePool(evidence: readonly EvidenceRecord[]): string | null {
  const id = evidence.find((item) => item.kind === "gecko-pool-ohlcv")?.evidenceId ?? null;
  if (id === null) return null;
  const parts = id.split(":");
  return parts.length >= 3 ? parts[2] ?? null : null;
}

function historyPoints(
  points: readonly GeckoOhlcvPoint[] | null,
  poolAddress: string | null,
  timeframe: string,
): MarketIntelligenceRecord["history"] {
  if (points === null || poolAddress === null) return [];
  return points.map((point) => ({ ...point, observedAt: point.timestamp, provider: "geckoterminal", poolAddress, timeframe }));
}

function realizedVolatilityFromHistory(points: readonly GeckoOhlcvPoint[] | null): number | null {
  if (points === null || points.length < 20) return null;
  const ordered = [...points].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  const first = Date.parse(ordered[0]!.timestamp);
  const last = Date.parse(ordered.at(-1)!.timestamp);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last - first < 20 * 86_400_000) return null;
  const returns: number[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!.closeUsd;
    const current = ordered[index]!.closeUsd;
    if (previous <= 0 || current <= 0) continue;
    returns.push(Math.log(current / previous));
  }
  if (returns.length < 20) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(365) * 100;
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
