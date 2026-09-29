import type {
  ActivityQualityMetrics,
  AuthorityState,
  DeployerRisk,
  DerivativesCapacityMetrics,
  HolderConcentration,
  LifecycleSnapshot,
  LiquidityState,
  MarketObservation,
  OracleMetrics,
  TokenIdentity,
} from "@arcmemeperps/domain";
import type {
  DeterministicFixtureMarket,
  DeployerHistoryRecord,
  HolderRecord,
  LaunchData,
  LiquidityLock,
  PoolSnapshot,
  PriceSource,
  TokenPermissions,
  TradeRecord,
  TransactionRecord,
} from "@arcmemeperps/chain-adapters";

export interface FixtureCase {
  readonly id: string;
  readonly description: string;
  readonly market: DeterministicFixtureMarket;
  readonly expected: {
    readonly integrityStatus: "QUALIFIED" | "WATCH" | "REJECTED";
    readonly derivativesStatus: "ELIGIBLE" | "WATCH" | "BLOCKED";
    readonly reasonCodes: readonly string[];
  };
}

type ObservationOverrides = {
  readonly token?: Partial<TokenIdentity>;
  readonly lifecycle?: Partial<LifecycleSnapshot>;
  readonly authorities?: Partial<AuthorityState>;
  readonly liquidity?: Partial<LiquidityState>;
  readonly holders?: Partial<HolderConcentration>;
  readonly deployer?: Partial<DeployerRisk>;
  readonly activity?: Partial<ActivityQualityMetrics>;
  readonly oracle?: Partial<OracleMetrics>;
  readonly derivatives?: Partial<DerivativesCapacityMetrics>;
};

const ASSESSED_AT = "2026-09-29T00:00:00.000Z";
const FUTURE_UNLOCK = "2027-01-01T00:00:00.000Z";

const baseToken: TokenIdentity = {
  chain: "BASE",
  tokenAddress: "0x0000000000000000000000000000000000000001",
  symbol: "CLEAN",
  name: "Clean Meme",
  decimals: 18,
  deployer: "0x0000000000000000000000000000000000000002",
  createdAt: "2026-01-01T00:00:00.000Z",
  originPlatform: "UNISWAP_STYLE",
};

const baseObservation: MarketObservation = {
  token: baseToken,
  lifecycle: {
    status: "ESTABLISHED",
    observedAt: ASSESSED_AT,
    confidence: 0.99,
    evidenceHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  authorities: {
    mintAuthorityActive: false,
    freezeAuthorityActive: false,
    dangerousOwnerAdminPrivileges: false,
    upgradeable: false,
    upgradeAuthority: null,
    transferRestricted: false,
    honeypotDetected: false,
  },
  liquidity: {
    totalLiquidityUsd: 2_000_000,
    depth1PctUsd: 250_000,
    depth2PctUsd: 500_000,
    venueCount: 3,
    lpOwnershipConcentrationPct: 12,
    lpLockStatus: "LOCKED",
    earliestLpUnlockAt: FUTURE_UNLOCK,
    liquidityVenues: ["DEX_A", "DEX_B", "DEX_C"],
    suddenCollapsePct24h: 0,
  },
  holders: {
    topHolderPct: 3,
    topFivePct: 14,
    connectedClusterPct: 4,
    bundledLaunchPct: 2,
    individualWalletsUnderFivePct: true,
    holderCount: 50_000,
    organicHolderGrowthPct24h: 5,
  },
  deployer: {
    deployerAddress: baseToken.deployer,
    deployerHoldingsPct: 2,
    knownRisk: false,
    priorRugCount: 0,
    relatedWalletFundingDetected: false,
    walletRotationDetected: false,
  },
  activity: {
    organicVolume24hUsd: 1_000_000,
    realizedVolatility30dPct: 50,
    washTradingDetected: false,
    volumeFarmingDetected: false,
    suspiciousEarlyBuyers: false,
    suspiciousTransactionRepetition: false,
    bundledLaunchDetected: false,
    fundingSourceDiversity: 0.9,
  },
  oracle: {
    sourceCount: 3,
    disagreementPct: 0.5,
    confidenceBps: 9_500,
    stale: false,
    priceUsd: 1.2,
    observedAt: ASSESSED_AT,
    manipulationCostUsd: 1_000_000,
  },
  derivatives: {
    spotLiquidityUsd: 2_000_000,
    liquidityVenueCount: 3,
    depth1PctUsd: 250_000,
    depth2PctUsd: 500_000,
    organicVolume24hUsd: 1_000_000,
    realizedVolatilityPct: 50,
    oracleSourceCount: 3,
    oracleDisagreementPct: 0.5,
    oracleConfidenceBps: 9_500,
    manipulationCostUsd: 1_000_000,
    maximumSafeOpenInterestUsd: 500_000,
    maximumPositionSizeUsd: 100_000,
    maximumLeverage: 5,
    fundingImbalancePct: 2,
    liquidationCapacityUsd: 500_000,
  },
};

function makeObservation(overrides: ObservationOverrides = {}): MarketObservation {
  return {
    ...baseObservation,
    token: { ...baseObservation.token, ...overrides.token },
    lifecycle: { ...baseObservation.lifecycle, ...overrides.lifecycle },
    authorities: { ...baseObservation.authorities, ...overrides.authorities },
    liquidity: { ...baseObservation.liquidity, ...overrides.liquidity },
    holders: { ...baseObservation.holders, ...overrides.holders },
    deployer: { ...baseObservation.deployer, ...overrides.deployer },
    activity: { ...baseObservation.activity, ...overrides.activity },
    oracle: { ...baseObservation.oracle, ...overrides.oracle },
    derivatives: { ...baseObservation.derivatives, ...overrides.derivatives },
  };
}

function defaultsFor(observation: MarketObservation): DeterministicFixtureMarket {
  const holder: HolderRecord = {
    address: "0x0000000000000000000000000000000000000010",
    balancePct: observation.holders.topHolderPct,
    connectedClusterId: "cluster-1",
    firstSeenAt: observation.token.createdAt,
    fundingSource: "funding-1",
  };
  const lock: LiquidityLock = {
    venue: observation.liquidity.liquidityVenues[0] ?? "fixture-dex",
    provider: "fixture-locker",
    lockedAmountUsd: observation.liquidity.totalLiquidityUsd,
    unlockAt: observation.liquidity.earliestLpUnlockAt,
    burned: observation.liquidity.lpLockStatus === "BURNED",
  };
  const pool: PoolSnapshot = {
    venue: observation.liquidity.liquidityVenues[0] ?? "fixture-dex",
    poolAddress: "0x0000000000000000000000000000000000000020",
    tokenReserve: 1_000_000,
    quoteReserveUsd: observation.liquidity.totalLiquidityUsd / 2,
    liquidityUsd: observation.liquidity.totalLiquidityUsd,
    feeBps: 30,
  };
  const sources: PriceSource[] = Array.from(
    { length: observation.oracle.sourceCount },
    (_, index) => ({
      source: `fixture-oracle-${index + 1}`,
      priceUsd: observation.oracle.priceUsd,
      observedAt: observation.oracle.observedAt,
      confidenceBps: observation.oracle.confidenceBps,
    }),
  );
  const permissions: TokenPermissions = {
    mintAuthority: observation.authorities.mintAuthorityActive ? "authority-1" : null,
    freezeAuthority: observation.authorities.freezeAuthorityActive ? "authority-2" : null,
    owner: observation.authorities.dangerousOwnerAdminPrivileges ? "owner-1" : null,
    admin: observation.authorities.dangerousOwnerAdminPrivileges ? "admin-1" : null,
    proxyImplementation: observation.authorities.upgradeable ? "implementation-1" : null,
    transferRestrictions: observation.authorities.transferRestricted ? ["fixture-rule"] : [],
  };
  const launchData: LaunchData = {
    platform: observation.token.originPlatform,
    launchAt: observation.token.createdAt,
    bundleCount: observation.activity.bundledLaunchDetected ? 10 : 1,
    initialBuyerCount: 100,
    initialLiquidityUsd: observation.liquidity.totalLiquidityUsd,
  };
  const trade: TradeRecord = {
    txHash: "fixture-trade-1",
    trader: holder.address,
    side: "BUY",
    amountUsd: 100,
    priceUsd: observation.oracle.priceUsd,
    timestamp: observation.oracle.observedAt,
    relatedTradeId: null,
  };
  const deployerHistory: DeployerHistoryRecord[] = observation.deployer.knownRisk
    ? [
        {
          deployer: observation.deployer.deployerAddress ?? "unknown",
          tokenAddress: observation.token.tokenAddress,
          outcome: "RUG",
          observedAt: ASSESSED_AT,
        },
      ]
    : [];
  const transaction: TransactionRecord = {
    txHash: "fixture-tx-1",
    from: observation.deployer.deployerAddress ?? "fixture-deployer",
    to: observation.token.tokenAddress,
    valueUsd: observation.liquidity.totalLiquidityUsd,
    timestamp: observation.token.createdAt,
    method: "create",
  };
  return {
    observation,
    holders: [holder],
    liquidityLocks: [lock],
    pools: [pool],
    trades: [trade],
    priceSources: sources,
    deployerHistory,
    permissions,
    launchData,
    transactionHistory: [transaction],
  };
}

const fixture = (
  id: string,
  description: string,
  overrides: ObservationOverrides,
  expected: FixtureCase["expected"],
): FixtureCase => {
  const observation = makeObservation(overrides);
  return { id, description, market: defaultsFor(observation), expected };
};

export const FIXTURE_CASES: readonly FixtureCase[] = [
  fixture(
    "clean-mature",
    "Clean mature market",
    {},
    { integrityStatus: "QUALIFIED", derivativesStatus: "ELIGIBLE", reasonCodes: [] },
  ),
  fixture(
    "new-clean",
    "Newly launched clean token",
    {
      token: {
        chain: "SOLANA",
        tokenAddress: "So11111111111111111111111111111111111111112",
        originPlatform: "PUMP_STYLE",
        symbol: "NEW",
      },
      lifecycle: { status: "BONDING" },
      liquidity: { totalLiquidityUsd: 700_000, depth1PctUsd: 80_000, depth2PctUsd: 140_000 },
      activity: { organicVolume24hUsd: 250_000, realizedVolatility30dPct: 100 },
      derivatives: {
        maximumLeverage: 3,
        maximumSafeOpenInterestUsd: 150_000,
        maximumPositionSizeUsd: 20_000,
        liquidationCapacityUsd: 200_000,
      },
    },
    { integrityStatus: "QUALIFIED", derivativesStatus: "ELIGIBLE", reasonCodes: [] },
  ),
  fixture(
    "active-mint-authority",
    "Token with active mint authority",
    { authorities: { mintAuthorityActive: true } },
    {
      integrityStatus: "REJECTED",
      derivativesStatus: "BLOCKED",
      reasonCodes: ["MINT_AUTHORITY_ACTIVE"],
    },
  ),
  fixture(
    "withdrawable-lp",
    "Token with withdrawable LP",
    { liquidity: { lpLockStatus: "WITHDRAWABLE", earliestLpUnlockAt: null } },
    {
      integrityStatus: "REJECTED",
      derivativesStatus: "BLOCKED",
      reasonCodes: ["LIQUIDITY_WITHDRAWABLE"],
    },
  ),
  fixture(
    "cluster-fifteen",
    "Token with 15% connected holder cluster",
    { holders: { connectedClusterPct: 15 } },
    {
      integrityStatus: "REJECTED",
      derivativesStatus: "BLOCKED",
      reasonCodes: ["CONNECTED_CLUSTER_CONCENTRATION"],
    },
  ),
  fixture(
    "cluster-over-five-individual-under-five",
    "Individual wallets under 5% but connected cluster exceeds 5%",
    {
      holders: { topHolderPct: 4.9, connectedClusterPct: 12, individualWalletsUnderFivePct: true },
    },
    {
      integrityStatus: "REJECTED",
      derivativesStatus: "BLOCKED",
      reasonCodes: ["CONNECTED_CLUSTER_CONCENTRATION"],
    },
  ),
  fixture(
    "cluster-six-point-three-individuals-under-five",
    "Four individually small wallets form a 6.3% connected cluster",
    {
      holders: {
        topHolderPct: 2.1,
        connectedClusterPct: 6.3,
        individualWalletsUnderFivePct: true,
      },
    },
    {
      integrityStatus: "REJECTED",
      derivativesStatus: "BLOCKED",
      reasonCodes: ["CONNECTED_CLUSTER_CONCENTRATION"],
    },
  ),
  fixture(
    "bundled-launch",
    "Bundled launch concentration",
    { holders: { bundledLaunchPct: 20 }, activity: { bundledLaunchDetected: true } },
    {
      integrityStatus: "REJECTED",
      derivativesStatus: "BLOCKED",
      reasonCodes: ["BUNDLED_LAUNCH_CONCENTRATION"],
    },
  ),
  fixture(
    "known-risk-deployer",
    "Known-risk deployer",
    { deployer: { knownRisk: true, priorRugCount: 2 } },
    {
      integrityStatus: "REJECTED",
      derivativesStatus: "BLOCKED",
      reasonCodes: ["KNOWN_RISK_DEPLOYER"],
    },
  ),
  fixture(
    "wash-volume",
    "Fake or wash volume",
    { activity: { washTradingDetected: true, volumeFarmingDetected: true } },
    {
      integrityStatus: "REJECTED",
      derivativesStatus: "BLOCKED",
      reasonCodes: ["WASH_TRADING", "VOLUME_FARMING"],
    },
  ),
  fixture(
    "shallow-liquidity",
    "Structurally safe but extremely shallow liquidity",
    {
      liquidity: { totalLiquidityUsd: 20_000, depth1PctUsd: 1_000, depth2PctUsd: 2_000 },
      derivatives: { maximumSafeOpenInterestUsd: 2_000, liquidationCapacityUsd: 2_000 },
    },
    { integrityStatus: "QUALIFIED", derivativesStatus: "WATCH", reasonCodes: [] },
  ),
  fixture(
    "safe-liquid-oracles",
    "Safe liquid market with strong oracle coverage",
    {
      oracle: { sourceCount: 5, disagreementPct: 0.2, confidenceBps: 9_900 },
      derivatives: { oracleSourceCount: 5, oracleDisagreementPct: 0.2, oracleConfidenceBps: 9_900 },
    },
    { integrityStatus: "QUALIFIED", derivativesStatus: "ELIGIBLE", reasonCodes: [] },
  ),
  fixture(
    "liquidity-collapse",
    "Market whose liquidity suddenly collapses",
    {
      liquidity: {
        suddenCollapsePct24h: 60,
        totalLiquidityUsd: 400_000,
        depth1PctUsd: 30_000,
        depth2PctUsd: 60_000,
      },
      derivatives: { maximumSafeOpenInterestUsd: 20_000, liquidationCapacityUsd: 50_000 },
    },
    { integrityStatus: "WATCH", derivativesStatus: "WATCH", reasonCodes: ["LIQUIDITY_COLLAPSE"] },
  ),
  fixture(
    "oracle-disagreement",
    "Oracle disagreement event",
    { oracle: { disagreementPct: 12 }, derivatives: { oracleDisagreementPct: 12 } },
    {
      integrityStatus: "QUALIFIED",
      derivativesStatus: "WATCH",
      reasonCodes: ["ORACLE_DISAGREEMENT"],
    },
  ),
  fixture(
    "oracle-stale",
    "Oracle stale event",
    { oracle: { stale: true } },
    { integrityStatus: "QUALIFIED", derivativesStatus: "BLOCKED", reasonCodes: ["STALE_ORACLE"] },
  ),
];

export const FIXTURE_BY_ID = new Map(FIXTURE_CASES.map((item) => [item.id, item]));
