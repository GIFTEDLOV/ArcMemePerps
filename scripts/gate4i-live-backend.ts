import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  decodeEventLog,
  http,
  parseAbi,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { createReadOnlyApiServer, type ApiServerOptions } from "../apps/api/src/server.js";
import { PersistenceApiReadModel } from "../apps/api/src/read-model.js";
import { RealtimeHub } from "../apps/api/src/realtime.js";
import {
  MarketPassportSchema,
  type NotificationEvent,
} from "@arcmemeperps/domain";
import { BackendRepository, SQLitePersistence } from "@arcmemeperps/persistence";
import {
  SUPPORTED_EVM_CHAIN_IDS,
  deploymentLifecycle,
  healthRecord,
  loadArcDeploymentConfig,
  marketIdForToken,
  type ArcDeploymentConfig,
  type HealthRecord,
  type SupportedChain,
} from "@arcmemeperps/shared";
import {
  canonicalProtocolEventId,
  type ProtocolEventIdentity,
} from "../apps/indexer/src/index.js";
import { PRODUCT_ADDRESSES, PRODUCT_RELEASE } from "./product-release-config.js";

const RPC_URL = PRODUCT_RELEASE.rpcUrl;
const CHAIN_ID = PRODUCT_RELEASE.chainId;
const PRODUCT_DEPLOYMENT_ID = PRODUCT_RELEASE.deploymentId;
const PRODUCT_START_BLOCK = PRODUCT_RELEASE.startBlock;
const PRODUCT_MARKET_ID = PRODUCT_RELEASE.marketId;
const CONTRACTS = PRODUCT_ADDRESSES;
const CONTRACT_ADDRESSES = Object.values(CONTRACTS);

const EVENTS = parseAbi([
  "event PositionOpened(uint256 indexed positionId,address indexed trader,bytes32 indexed marketId,bool isLong,uint256 collateral,uint256 size,uint256 entryPrice)",
  "event PositionIncreased(uint256 indexed positionId,uint256 collateralAdded,uint256 sizeAdded)",
  "event PositionReduced(uint256 indexed positionId,uint256 collateralReleased,uint256 sizeReduced)",
  "event PositionClosed(uint256 indexed positionId,int256 pnl,uint256 badDebt)",
  "event PositionLiquidated(uint256 indexed positionId,int256 pnl,uint256 badDebt)",
  "event OrderSubmitted(bytes32 indexed orderId,address indexed account,bytes32 indexed marketId,uint256 nonce)",
  "event OrderCancelled(bytes32 indexed orderId,address indexed account)",
  "event OrderExecuted(bytes32 indexed orderId,uint256 executionPrice,uint64 oracleSequence)",
  "event MarketAccrualUpdated(bytes32 indexed marketId,int256 fundingIndexWad,uint256 borrowIndexWad,uint64 timestamp)",
  "event BadDebtCoverageApplied(uint256 badDebt,uint256 covered,uint256 uncovered)",
  "event PartialSettlementOutcome(uint256 indexed positionId,uint256 payout,uint256 badDebt)",
  "event TerminalInsolvencyStateEntered()",
  "event CollateralDeposited(address indexed trader,uint256 amount)",
  "event CollateralWithdrawn(address indexed trader,uint256 amount)",
  "event CollateralLocked(address indexed trader,uint256 amount)",
  "event CollateralUnlocked(address indexed trader,uint256 amount)",
  "event PositionSettled(address indexed trader,uint256 collateral,int256 pnl,uint256 badDebt)",
  "event PartialPositionSettled(address indexed trader,uint256 collateral,int256 pnlUsdWad,uint256 fee,uint256 payout)",
  "event FeeAccrued(uint256 amount)",
  "event InsuranceCoverageReceived(uint256 amount)",
  "event Deposited(address indexed account,uint256 assets,uint256 shares)",
  "event WithdrawalRequested(address indexed account,uint256 shares,uint64 availableAt)",
  "event Withdrawn(address indexed account,uint256 assets,uint256 shares)",
  "event PublicLPActivationSet(bool active,address indexed actor)",
  "event MarketRegistered(bytes32 indexed marketId,bytes32 indexed originChain,bytes originToken)",
  "event MarketStateUpdated(bytes32 indexed marketId,uint8 state)",
  "event QualificationApproved(bytes32 indexed marketId,bytes32 indexed proofHash,bytes32 indexed ruleVersion,uint256 maxLeverage,uint256 maxOI,uint256 maxPosition,uint64 expiresAt)",
  "event QualificationRevoked(bytes32 indexed marketId,bytes32 indexed proofHash)",
  "event ReportUpdated(bytes32 indexed marketId,uint64 indexed sequence)",
  "event PriceUpdated(bytes32 indexed marketId,uint256 price,uint64 observedAt,uint256 confidenceBps)",
  "event RiskLimitsReduced(bytes32 indexed marketId,(uint256 maxLeverage,uint256 maxOI,uint256 maxPosition,uint256 maintenanceMarginBps,uint256 liquidationPenaltyBps,uint8 status) config)",
  "event MarketRequalified(bytes32 indexed marketId,bytes32 indexed proofHash,(uint256 maxLeverage,uint256 maxOI,uint256 maxPosition,uint256 maintenanceMarginBps,uint256 liquidationPenaltyBps,uint8 status) config)",
]);

const STATE_ABI = parseAbi([
  "function getQualification(bytes32) view returns (bytes32 proofHash,bytes32 ruleVersion,uint64 qualifiedAt,uint64 expiresAt,uint256 maxLeverage,uint256 maxOI,uint256 maxPosition,bool approved)",
  "function getConfig(bytes32) view returns (uint256 maxLeverage,uint256 maxOI,uint256 maxPosition,uint256 maintenanceMarginBps,uint256 liquidationPenaltyBps,uint8 status)",
  "function getReport(bytes32) view returns (bytes32 marketId,uint256 arcChainId,uint256 midPrice,uint256 minPrice,uint256 maxPrice,uint256 confidenceBps,uint256 sourceCount,uint256 independentSourceCount,uint64 observedAt,uint64 validFrom,uint64 expiresAt,uint64 sequence,bytes32 evidenceRoot,bytes32 reporterSetVersion)",
  "function getMarket(bytes32) view returns ((bytes32 marketId,bytes32 originChain,bytes originToken,bytes32 lifecycle,uint8 state,bool exists))",
  "function marketState(bytes32) view returns (uint8)",
  "function totalOpenInterest(bytes32) view returns (uint256)",
  "function longOpenInterest(bytes32) view returns (uint256)",
  "function shortOpenInterest(bytes32) view returns (uint256)",
  "function marketAccrual(bytes32) view returns (int256 fundingIndexWad,uint256 borrowIndexWad,uint64 lastUpdatedAt)",
  "function solvencyBlocked() view returns (bool)",
  "function protocolBadDebt() view returns (uint256)",
  "function totalFreeCollateral() view returns (uint256)",
  "function totalLockedCollateral() view returns (uint256)",
  "function actualCustodyUsdc() view returns (uint256)",
  "function totalAccountedAssets() view returns (uint256)",
  "function accruedFees() view returns (uint256)",
  "function pendingNegativePnl() view returns (uint256)",
  "function availableCapital() view returns (uint256)",
  "function uncoveredBadDebt() view returns (uint256)",
  "function publicLpActive() view returns (bool)",
  "function totalShares() view returns (uint256)",
  "function managedAssets() view returns (uint256)",
  "function navAssets() view returns (uint256)",
  "function sharePriceWad() view returns (uint256)",
  "function shareBalance(address) view returns (uint256)",
]);

type ProductState = {
  readonly qualification: Record<string, unknown>;
  readonly risk: Record<string, unknown>;
  readonly report: Record<string, unknown>;
  readonly registryMarket: Record<string, unknown>;
  readonly marketState: number;
  readonly oi: bigint;
  readonly longOi: bigint;
  readonly shortOi: bigint;
  readonly accrual: Record<string, unknown>;
  readonly solvencyBlocked: boolean;
  readonly badDebt: bigint;
  readonly vault: Record<string, bigint>;
  readonly insurance: Record<string, bigint>;
  readonly lp: Record<string, bigint | boolean>;
};

type DecodedEvent = {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly log: Log;
  readonly eventId: Hex;
};

function safeJson(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(safeJson);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, safeJson(child)]));
  return value;
}

function isoFromUnix(value: bigint | number): string | null {
  const numberValue = typeof value === "bigint" ? value : BigInt(value);
  return numberValue === 0n ? null : new Date(Number(numberValue) * 1_000).toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

async function retryRpc<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolveWait) => setTimeout(resolveWait, 500 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function recordString(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

function payloadString(payload: Readonly<Record<string, unknown>>, key: string, fallback = ""): string {
  const value = payload[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function arg(args: Record<string, unknown>, name: string, index: number): unknown {
  return args[name] ?? Object.values(args)[index];
}

async function readState(client: ReturnType<typeof createPublicClient>): Promise<ProductState> {
  const read = async (address: Address, functionName: string, args: readonly unknown[] = []) =>
    client.readContract({
      address,
      abi: STATE_ABI,
      functionName: functionName as never,
      args: args,
    }) as Promise<unknown>;
  const tuple = (value: unknown): Record<string, unknown> => {
    if (value !== null && typeof value === "object" && !Array.isArray(value))
      return value as Record<string, unknown>;
    if (!Array.isArray(value)) return {};
    return Object.fromEntries(value.map((item, index) => [String(index), item]));
  };
  const qualification = tuple(await read(CONTRACTS.QualificationRegistry, "getQualification", [PRODUCT_MARKET_ID]));
  const risk = tuple(await read(CONTRACTS.RiskConfig, "getConfig", [PRODUCT_MARKET_ID]));
  const report = tuple(await read(CONTRACTS.OracleRouter, "getReport", [PRODUCT_MARKET_ID]));
  const registryMarket = tuple(await read(CONTRACTS.MarketRegistry, "getMarket", [PRODUCT_MARKET_ID]));
  const registryMarketId = recordString(registryMarket.marketId ?? registryMarket["0"]);
  const marketExists = Boolean(registryMarket.exists ?? registryMarket["5"] ?? false);
  if (!marketExists || registryMarketId.toLowerCase() !== PRODUCT_MARKET_ID.toLowerCase()) {
    throw new Error("PRODUCT_MARKET_ID is not registered at the configured MarketRegistry");
  }
  const registryMarketState = Number(registryMarket.state ?? registryMarket["4"] ?? 0);
  const marketState = Number(await read(CONTRACTS.MarketRegistry, "marketState", [PRODUCT_MARKET_ID]));
  if (registryMarketState !== marketState) throw new Error("MarketRegistry state reads disagree");
  const accrual = tuple(await read(CONTRACTS.PerpEngine, "marketAccrual", [PRODUCT_MARKET_ID]));
  const vaultEntries = await Promise.all(
    [
      "totalFreeCollateral",
      "totalLockedCollateral",
      "actualCustodyUsdc",
      "totalAccountedAssets",
      "accruedFees",
      "pendingNegativePnl",
    ].map(async (name) => [name, (await read(CONTRACTS.USDCMarginVault, name)) as bigint] as const),
  );
  const insuranceEntries = await Promise.all(
    ["availableCapital", "uncoveredBadDebt"].map(
      async (name) => [name, (await read(CONTRACTS.InsuranceFund, name)) as bigint] as const,
    ),
  );
  const lpEntries = await Promise.all(
    ["totalShares", "managedAssets", "navAssets", "sharePriceWad"].map(
      async (name) => [name, (await read(CONTRACTS.PublicLPVault, name)) as bigint] as const,
    ),
  );
  return {
    qualification,
    risk,
    report,
    registryMarket,
    marketState,
    oi: (await read(CONTRACTS.PerpEngine, "totalOpenInterest", [PRODUCT_MARKET_ID])) as bigint,
    longOi: (await read(CONTRACTS.PerpEngine, "longOpenInterest", [PRODUCT_MARKET_ID])) as bigint,
    shortOi: (await read(CONTRACTS.PerpEngine, "shortOpenInterest", [PRODUCT_MARKET_ID])) as bigint,
    accrual,
    solvencyBlocked: (await read(CONTRACTS.PerpEngine, "solvencyBlocked")) as boolean,
    badDebt: (await read(CONTRACTS.USDCMarginVault, "protocolBadDebt")) as bigint,
    vault: Object.fromEntries(vaultEntries),
    insurance: Object.fromEntries(insuranceEntries),
    lp: { ...Object.fromEntries(lpEntries), publicLpActive: (await read(CONTRACTS.PublicLPVault, "publicLpActive")) as boolean },
  };
}

function decodeLog(log: Log, eventId: Hex): DecodedEvent | null {
  try {
    const decoded = decodeEventLog({ abi: EVENTS, data: log.data, topics: log.topics, strict: false });
    return {
      name: decoded.eventName,
      args: (decoded.args ?? {}) as Record<string, unknown>,
      log,
      eventId,
    };
  } catch {
    return null;
  }
}

function registeredOrigin(market: Record<string, unknown>): {
  readonly chain: SupportedChain;
  readonly tokenAddress: Address;
  readonly lifecycleHash: string;
} {
  const originChain = recordString(market.originChain ?? market["1"]);
  const originToken = recordString(market.originToken ?? market["2"]);
  const chainId = Number(BigInt(originChain));
  const chain = Object.entries(SUPPORTED_EVM_CHAIN_IDS).find(([, id]) => id === chainId)?.[0] as
    | SupportedChain
    | undefined;
  if (chain === undefined || !/^0x[0-9a-fA-F]{40}$/.test(originToken)) {
    throw new Error("REGISTERED_MARKET_ORIGIN_UNSUPPORTED");
  }
  const tokenAddress = originToken as Address;
  const marketId = recordString(market.marketId ?? market["0"]);
  if (marketIdForToken(chain, tokenAddress).toLowerCase() !== marketId.toLowerCase()) {
    throw new Error("REGISTERED_MARKET_IDENTITY_MISMATCH");
  }
  return {
    chain,
    tokenAddress,
    lifecycleHash: recordString(market.lifecycle ?? market["3"]),
  };
}

function createPassport(state: ProductState, observedAt: string) {
  const q = state.qualification;
  const risk = state.risk;
  const report = state.report;
  const origin = registeredOrigin(state.registryMarket);
  const zeroHash = `0x${"0".repeat(64)}`;
  const proofValue = recordString(q.proofHash ?? q["0"] ?? zeroHash);
  const ruleVersion = recordString(q.ruleVersion ?? q["1"] ?? zeroHash);
  const evidenceValue = recordString(report.evidenceRoot ?? report["12"] ?? zeroHash);
  const proofHash = proofValue.toLowerCase() === zeroHash ? null : proofValue;
  const evidenceRoot = evidenceValue.toLowerCase() === zeroHash ? null : evidenceValue;
  const qualifiedAt = (q.qualifiedAt ?? q["2"] ?? 0n) as bigint;
  const expiresAt = (q.expiresAt ?? q["3"] ?? 0n) as bigint;
  const maxLeverage = recordString(q.maxLeverage ?? q["4"] ?? "0");
  const maxOi = recordString(q.maxOI ?? q["5"] ?? "0");
  const maxPosition = recordString(q.maxPosition ?? q["6"] ?? "0");
  const approved = Boolean(q.approved ?? q["7"] ?? false);
  const nowSeconds = BigInt(Math.floor(Date.now() / 1_000));
  const qualified = approved && (expiresAt === 0n || expiresAt > nowSeconds);
  const midPriceValue = recordString(report.midPrice ?? report["2"] ?? "0");
  const midPrice = BigInt(midPriceValue) > 0n ? midPriceValue : null;
  const observedOracle = (report.observedAt ?? report["8"] ?? 0n) as bigint;
  const oracleAge = nowSeconds - observedOracle;
  const freshness = observedOracle === 0n
    ? "UNAVAILABLE"
    : oracleAge < 0n
      ? "FUTURE_TIMESTAMP"
      : oracleAge <= 120n
        ? "FRESH"
        : "STALE";
  const freshnessState = freshness === "FRESH" ? "FRESH" : freshness === "FUTURE_TIMESTAMP" ? "FUTURE_TIMESTAMP" : freshness === "UNAVAILABLE" ? "UNAVAILABLE" : "STALE";
  const registryStatus = state.marketState === 3 ? "LIVE" : state.marketState === 2 ? "CLOSE_ONLY" : state.marketState === 1 ? "PAUSED" : "BLOCKED";
  const reasons: string[] = [];
  if (!qualified) reasons.push("QUALIFICATION_UNAVAILABLE_OR_EXPIRED");
  if (freshness !== "FRESH") reasons.push(freshness === "STALE" ? "ORACLE_STALE" : freshness === "FUTURE_TIMESTAMP" ? "ORACLE_FUTURE_TIMESTAMP" : "ORACLE_UNAVAILABLE");
  if (state.solvencyBlocked) reasons.push("SOLVENCY_BLOCKED");
  const status = reasons.length > 0 ? "BLOCKED" : registryStatus;
  const maxOiWad = (BigInt(maxOi) * 1_000_000_000_000n).toString();
  const maxPositionWad = (BigInt(maxPosition) * 1_000_000_000_000n).toString();
  const observedOracleIso = isoFromUnix(observedOracle);
  return MarketPassportSchema.parse({
    passportSchemaVersion: "market-passport/v1",
    schemaVersion: "market-snapshot/v1",
    observedAt,
    identity: {
      marketId: PRODUCT_MARKET_ID,
      chain: origin.chain,
      tokenAddress: origin.tokenAddress,
      symbol: null,
      name: null,
      decimals: null,
      deployer: null,
      createdAt: null,
      originPlatform: "UNKNOWN",
    },
    originChain: origin.chain,
    originPlatform: "UNKNOWN",
    lifecycle: { status: "DISCOVERED", evidenceIds: [`ONCHAIN_LIFECYCLE:${origin.lifecycleHash}`], observedAt, confidenceBps: 0 },
    marketData: { priceUsdWad: midPrice, volume24hUsdWad: null, buyCount24h: null, sellCount24h: null, priceChange24hBps: null, volatilityBps: null },
    liquidity: {
      totalUsdWad: null,
      dominantPool: null,
      poolConcentrationBps: null,
      venueCount: null,
      buyDepth1PctUsdWad: null,
      sellDepth1PctUsdWad: null,
      buyDepth2PctUsdWad: null,
      sellDepth2PctUsdWad: null,
      securityStatus: "UNKNOWN",
      earliestUnlockAt: null,
    },
    holderEvidence: { largestHolderBps: null, largestNonSystemHolderBps: null, top10NonSystemBps: null, largestConnectedClusterBps: null, clusterCount: null, systemExclusions: [] },
    deployerEvidence: { deployer: null, tokensCreated: null, survival7dBps: null, survival30dBps: null, associatedWallets: [], reasonCodes: ["ORIGIN_DEPLOYER_NOT_INDEXED"] },
    securityEvidence: { mintAuthorityActive: null, freezeAuthorityActive: null, ownerPrivilege: null, upgradeable: null, transferRestricted: null, honeypot: null, lpSecurity: "UNKNOWN", evidenceIds: [] },
    oracleEvidence: {
      priceSourceCount: Number(report.sourceCount ?? report["6"] ?? 0),
      independentSourceCount: Number(report.independentSourceCount ?? report["7"] ?? 0),
      dispersionBps: null,
      confidenceBps: Number(report.confidenceBps ?? report["5"] ?? 0),
      freshness,
      sourceFamilies: ["ARC_ORACLE_ROUTER"],
    },
    derivativesEvidence: {
      status,
      maxLeverageWad: maxLeverage,
      maxOIWad: maxOiWad,
      maxPositionWad,
      maintenanceMarginBps: Number(risk.maintenanceMarginBps ?? risk["3"] ?? 0),
      manipulationResistance: "UNAVAILABLE",
      reasonCodes: reasons,
    },
    providerState: {
      providers: [
        { provider: "ARC_RPC", status: "AVAILABLE", lastSuccessAt: observedAt, fetchedAt: observedAt, reason: null },
        { provider: "ORIGIN_MARKET_DATA", status: "UNAVAILABLE", lastSuccessAt: null, fetchedAt: observedAt, reason: "No origin-chain enrichment provider is configured" },
      ],
      disagreements: [],
    },
    freshness: { status: freshnessState, observedAt: observedOracleIso, fetchedAt: observedAt, maxAgeSeconds: 120 },
    riskResult: { integrityStatus: qualified ? "QUALIFIED" : "PENDING", derivativesStatus: status, hardGateCodes: reasons, rejectionReasons: [], warnings: [], ruleVersion },
    qualification: { eligible: qualified, proofHash, commitmentHash: null, evidenceRoot, assessedAt: isoFromUnix(qualifiedAt), expiresAt: isoFromUnix(expiresAt) },
    tradability: { status, reasons, asOf: observedAt },
    marketAgeSeconds: null,
    priceHistory: midPrice === null || observedOracleIso === null ? [] : [{ observedAt: observedOracleIso, priceUsdWad: midPrice, source: "ARC_ORACLE_ROUTER" }],
    pools: [],
    lpControl: { status: "UNKNOWN", reason: "Origin-chain liquidity control is not configured", evidenceIds: [], observedAt },
    bundleEvidence: { effectiveConcentrationBps: null, coordinatedWallets: [], evidenceIds: [] },
    firstBuyers: [],
    sniperSignals: [],
    deployerProfile: { tokensCreated: null, survival1dBps: null, survival7dBps: null, survival30dBps: null, liquidityRemovalIncidents: null, mintAdminIncidents: null, associatedWallets: [], reasonCodes: ["UNAVAILABLE"] },
    fundingGraph: { status: "INSUFFICIENT_DATA", nodes: [], edges: [], reasonCodes: ["EXTERNAL_FUNDING_GRAPH_NOT_CONFIGURED"] },
    washFarm: { verdict: "INSUFFICIENT_DATA", reasonCodes: ["INSUFFICIENT_ORIGIN_ACTIVITY_HISTORY"], features: {} },
    organicActivity: { holderGrowthBps: null, newHolderVelocity: null, independentTraderCount: null, retentionBps: null, netCapitalFlowUsdWad: null, venueDiversity: null, persistenceBps: null },
    smartWalletActivity: { participatingWallets: [], qualityBps: null, evidenceIds: [] },
    marketDepth: { status: "UNAVAILABLE", buyDepth1PctUsdWad: null, sellDepth1PctUsdWad: null, buyDepth2PctUsdWad: null, sellDepth2PctUsdWad: null, buyDepth5PctUsdWad: null, sellDepth5PctUsdWad: null, observedAt, reason: "No orderbook provider is configured" },
    sourceIndependence: { independentSourceCount: Number(report.independentSourceCount ?? report["7"] ?? 0), sourceIds: [], correlatedSourceIds: [] },
    arcMarketState: status,
    providerHealth: [{ component: "ARC_RPC", state: "OPERATIONAL", lastSuccessAt: observedAt, latencyMs: null, error: null }, { component: "ORIGIN_ENRICHMENT", state: "UNAVAILABLE", lastSuccessAt: null, latencyMs: null, error: "not configured" }],
    riskRuleVersion: ruleVersion,
  });
}

function notificationFor(event: DecodedEvent, recipient: Address, marketId: Hex | null): NotificationEvent {
  const createdAt = nowIso();
  const typeMap: Record<string, NotificationEvent["type"]> = {
    OrderSubmitted: "ORDER_SUBMITTED",
    OrderExecuted: "ORDER_EXECUTED",
    OrderCancelled: "ORDER_FAILED",
    PositionOpened: "POSITION_OPENED",
    PositionIncreased: "POSITION_INCREASED",
    PositionReduced: "POSITION_REDUCED",
    PositionClosed: "POSITION_CLOSED",
    PositionLiquidated: "POSITION_LIQUIDATED",
  };
  const type = typeMap[event.name] ?? "MARKET_QUALIFIED";
  return {
    schemaVersion: "notification-event/v1",
    id: `product:${event.eventId}:${recipient.toLowerCase()}`,
    recipient,
    type,
    marketId,
    eventId: event.eventId,
    sourceEventId: event.eventId,
    occurredAt: createdAt,
    createdAt,
    readAt: null,
    payload: { deploymentId: PRODUCT_DEPLOYMENT_ID, eventType: event.name },
  };
}

function oracleHealth(state: ProductState): HealthRecord {
  const observedAt = BigInt(recordString(state.report.observedAt ?? state.report["8"] ?? "0"));
  const now = BigInt(Math.floor(Date.now() / 1_000));
  const age = now - observedAt;
  const fresh = observedAt > 0n && age >= 0n && age <= 120n;
  const future = age < 0n;
  return healthRecord("ORACLE", fresh ? "OPERATIONAL" : "STALE", {
    lastSuccessAt: isoFromUnix(observedAt),
    latencyMs: null,
    error: fresh ? null : future ? "ORACLE_OBSERVATION_IN_FUTURE" : "ORACLE_OBSERVATION_STALE",
    freshness: fresh ? "FRESH" : "STALE",
  });
}

function apiDeploymentConfig(): ArcDeploymentConfig {
  return loadArcDeploymentConfig({
    ...process.env,
    ARCMEMEPERPS_DEPLOYMENT_NETWORK: "TESTNET",
    TESTNET_DEPLOYMENT_ID: PRODUCT_DEPLOYMENT_ID,
    TESTNET_MARKET_REGISTRY: CONTRACTS.MarketRegistry,
    TESTNET_QUALIFICATION_REGISTRY: CONTRACTS.QualificationRegistry,
    TESTNET_ORACLE_ROUTER: CONTRACTS.OracleRouter,
    TESTNET_RISK_CONFIG: CONTRACTS.RiskConfig,
    TESTNET_USDC_MARGIN_VAULT: CONTRACTS.USDCMarginVault,
    TESTNET_PERP_ENGINE: CONTRACTS.PerpEngine,
    TESTNET_INSURANCE_FUND: CONTRACTS.InsuranceFund,
    TESTNET_PUBLIC_LP_VAULT: CONTRACTS.PublicLPVault,
    TESTNET_ADL_CONTROLLER: CONTRACTS.ADLController,
    TESTNET_PROTOCOL_TIMELOCK: CONTRACTS.ProtocolTimelock,
    ARC_TESTNET_RPC_URL: RPC_URL,
  });
}

function healthSnapshot(
  database: HealthRecord,
  rpc: HealthRecord,
  indexer: HealthRecord,
  oracle: HealthRecord,
  realtime: HealthRecord,
  chainReadsAvailable: boolean,
): readonly HealthRecord[] {
  const operational = (component: HealthRecord["component"]): HealthRecord => healthRecord(component, "OPERATIONAL", { lastSuccessAt: nowIso(), latencyMs: null, error: null, freshness: "FRESH" });
  const unavailable = (component: HealthRecord["component"], error: string): HealthRecord => healthRecord(component, "UNAVAILABLE", { lastSuccessAt: null, latencyMs: null, error, freshness: "UNAVAILABLE" });
  return [
    database,
    rpc,
    indexer,
    unavailable("MARKET_DATA", "ORIGIN_MARKET_DATA_PROVIDER_NOT_CONFIGURED"),
    unavailable("MARKET_DISCOVERY", "ORIGIN_MARKET_DISCOVERY_PROVIDER_NOT_CONFIGURED"),
    unavailable("RISK_ENGINE", "OFFCHAIN_RISK_ENGINE_NOT_CONFIGURED"),
    unavailable("KEEPER", "KEEPER_HEALTH_NOT_EXPOSED_BY_READ_ONLY_API"),
    unavailable("ORACLE_REPORTERS", "REPORTER_HEALTH_NOT_EXPOSED_BY_READ_ONLY_API"),
    oracle,
    chainReadsAvailable ? operational("VAULT") : unavailable("VAULT", "CHAIN_READS_NOT_READY"),
    chainReadsAvailable ? operational("INSURANCE") : unavailable("INSURANCE", "CHAIN_READS_NOT_READY"),
    realtime,
  ];
}

export class ProductLiveIndexer {
  public readonly storage: SQLitePersistence;
  public readonly repository: BackendRepository;
  public readonly client;
  public readonly deploymentId = PRODUCT_DEPLOYMENT_ID;
  private readonly decoded: DecodedEvent[] = [];
  private readonly positionTraders = new Map<string, Address>();
  private readonly orderTraders = new Map<string, Address>();
  private deploymentVerified = false;
  public lastHead = 0n;
  public lastProjectionAt: string | null = null;

  public constructor(public readonly databasePath: string) {
    this.storage = new SQLitePersistence(databasePath);
    this.repository = new BackendRepository(this.storage);
    this.client = createPublicClient({
      chain: { id: CHAIN_ID, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } },
      transport: http(RPC_URL),
    });
  }

  private async verifyDeployment(): Promise<void> {
    if (this.deploymentVerified) return;
    const chainId = await this.client.getChainId();
    if (chainId !== CHAIN_ID) throw new Error(`Configured RPC returned chain ${chainId}; expected Arc Testnet ${CHAIN_ID}`);
    const deployedCode = await Promise.all(
      Object.entries(CONTRACTS).map(async ([name, address]) => ({
        name,
        code: await this.client.getCode({ address }),
      })),
    );
    const missing = deployedCode.filter(({ code }) => code === undefined || code === "0x").map(({ name }) => name);
    if (missing.length > 0) throw new Error(`Product deployment contracts have no code: ${missing.join(", ")}`);
    this.deploymentVerified = true;
  }

  public async bootstrap(onStateObserved?: (state: ProductState) => void): Promise<ProductState> {
    const started = Date.now();
    await this.verifyDeployment();
    const latest = await this.client.getBlockNumber();
    this.lastHead = latest;
    const checkpoint = this.storage.get("indexer_checkpoints", `${this.deploymentId}:ARC`);
    const previous = checkpoint?.payload.blockNumber;
    if (previous !== undefined) {
      const checkpointBlock = BigInt(String(previous));
      if (checkpointBlock > latest) throw new Error("INDEXER_CHECKPOINT_AHEAD_OF_RPC_HEAD");
      const expectedHash = payloadString(checkpoint?.payload ?? {}, "blockHash");
      if (expectedHash !== "") {
        const canonicalBlock = await retryRpc(() => this.client.getBlock({ blockNumber: checkpointBlock }));
        if (canonicalBlock.hash?.toLowerCase() !== expectedHash.toLowerCase()) {
          throw new Error("INDEXER_CHECKPOINT_REORG_DETECTED");
        }
      }
    }
    const from = previous === undefined ? PRODUCT_START_BLOCK : BigInt(payloadString(checkpoint?.payload ?? {}, "blockNumber", PRODUCT_START_BLOCK.toString())) + 1n;
    let state = await readState(this.client);
    this.repository.savePassport(createPassport(state, nowIso()));
    onStateObserved?.(state);
    const chunk = 1_000n;
    const pageEnd = from + 20_000n - 1n;
    let eventCount = Number(payloadString(checkpoint?.payload ?? {}, "eventCount", "0"));
    for (let cursor = from; cursor <= latest && cursor <= pageEnd; cursor += chunk) {
      const to = cursor + chunk - 1n > latest ? latest : cursor + chunk - 1n > pageEnd ? pageEnd : cursor + chunk - 1n;
      const logs = await retryRpc(() => this.client.getLogs({ address: CONTRACT_ADDRESSES, fromBlock: cursor, toBlock: to }));
      for (const log of logs) if (this.persistLog(log)) eventCount += 1;
      const block = await retryRpc(() => this.client.getBlock({ blockNumber: to }));
      this.storage.put("indexer_checkpoints", `${this.deploymentId}:ARC`, {
        deploymentId: this.deploymentId,
        chain: "ARC",
        startBlock: PRODUCT_START_BLOCK.toString(),
        blockNumber: to.toString(),
        blockHash: block.hash,
        eventCount,
        lastObservedAt: nowIso(),
      }, nowIso());
    }
    this.rehydrateDecodedEvents();
    state = await readState(this.client);
    const passport = createPassport(state, nowIso());
    this.repository.savePassport(passport);
    onStateObserved?.(state);
    this.buildProjections(state);
    this.storage.put("reconciliation_snapshots", `${this.deploymentId}:latest`, {
      deploymentId: this.deploymentId,
      chainId: CHAIN_ID,
      blockNumber: latest.toString(),
      marketId: PRODUCT_MARKET_ID,
      totalOpenInterest: state.oi.toString(),
      longOpenInterest: state.longOi.toString(),
      shortOpenInterest: state.shortOi.toString(),
      badDebt: state.badDebt.toString(),
      solvencyBlocked: state.solvencyBlocked,
      lpAssets: String(state.lp.managedAssets),
      lpShares: String(state.lp.totalShares),
      observedAt: nowIso(),
    }, nowIso());
    this.lastProjectionAt = nowIso();
    this.storage.put("health_records", `${this.deploymentId}:indexer`, {
      deploymentId: this.deploymentId,
      component: "INDEXER",
      state: "OPERATIONAL",
      blockNumber: latest.toString(),
      durationMs: Date.now() - started,
      observedAt: this.lastProjectionAt,
    }, this.lastProjectionAt);
    return state;
  }

  private persistLog(log: Log): boolean {
    const identity: ProtocolEventIdentity = {
      chain: "ARC",
      transactionHash: log.transactionHash ?? null,
      signature: null,
      blockNumber: log.blockNumber?.toString() ?? null,
      slot: null,
      logIndex: log.logIndex === undefined ? null : Number(log.logIndex),
      emitter: log.address,
      topic0: log.topics[0] ?? null,
    };
    const eventId = canonicalProtocolEventId(identity);
    if (this.storage.get("protocol_events", eventId) !== null) return false;
    this.storage.put("protocol_events", eventId, {
      deploymentId: this.deploymentId,
      eventId,
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber?.toString() ?? null,
      blockHash: log.blockHash,
      logIndex: log.logIndex?.toString() ?? null,
      emitter: log.address,
      topic0: log.topics[0] ?? null,
      topics: log.topics,
      data: log.data,
    }, nowIso());
    const decoded = decodeLog(log, eventId);
    if (decoded !== null) {
      this.decoded.push(decoded);
      const positionId = arg(decoded.args, "positionId", 0);
      const orderId = arg(decoded.args, "orderId", 0);
      const trader = arg(decoded.args, "trader", 1);
      const account = arg(decoded.args, "account", 1);
      if (typeof positionId === "bigint" && typeof trader === "string") this.positionTraders.set(positionId.toString(), trader as Address);
      if (typeof orderId === "string" && typeof account === "string") this.orderTraders.set(orderId.toLowerCase(), account as Address);
    }
    return true;
  }

  private rehydrateDecodedEvents(): void {
    this.decoded.length = 0;
    this.positionTraders.clear();
    this.orderTraders.clear();
    const records = this.storage
      .list("protocol_events")
      .filter((record) => record.payload.deploymentId === this.deploymentId)
      .sort((left, right) => {
        const blockDelta = Number(payloadString(left.payload, "blockNumber", "0")) - Number(payloadString(right.payload, "blockNumber", "0"));
        if (blockDelta !== 0) return blockDelta;
        return Number(payloadString(left.payload, "logIndex", "0")) - Number(payloadString(right.payload, "logIndex", "0"));
      });
    for (const record of records) {
      const payload = record.payload;
      const log = {
        address: String(payload.emitter) as Address,
        topics: (payload.topics as Hex[]) ?? [],
        data: String(payload.data) as Hex,
        blockNumber: BigInt(payloadString(payload, "blockNumber", "0")),
        blockHash: String(payload.blockHash) as Hex,
        transactionHash: String(payload.transactionHash) as Hex,
        logIndex: BigInt(payloadString(payload, "logIndex", "0")),
      } as unknown as Log;
      const decoded = decodeLog(log, record.id as Hex);
      if (decoded !== null) {
        this.decoded.push(decoded);
        const positionId = arg(decoded.args, "positionId", 0);
        const orderId = arg(decoded.args, "orderId", 0);
        const trader = arg(decoded.args, "trader", 1);
        const account = arg(decoded.args, "account", 1);
        if (typeof positionId === "bigint" && typeof trader === "string") this.positionTraders.set(positionId.toString(), trader as Address);
        if (typeof orderId === "string" && typeof account === "string") this.orderTraders.set(orderId.toLowerCase(), account as Address);
      }
    }
  }

  private buildProjections(state: ProductState): void {
    const observedAt = nowIso();
    const legacyTrader = "0xc36fd43deaadefb349acc61b0eb664ea4a18861c";
    const legacyQualificationRecipient = "0x4445656fe52116ca653d4f86a16705964a99d4a6";
    const legacySeasonId = `${PRODUCT_DEPLOYMENT_ID}:testnet-season`;
    this.storage.delete("profiles", legacyTrader);
    this.storage.delete("watchlists", legacyTrader);
    for (const notification of this.storage.list("notifications")) {
      if (notification.payload.recipient === legacyQualificationRecipient && notification.payload.type === "MARKET_QUALIFIED") {
        this.storage.delete("notifications", notification.id);
      }
    }
    this.storage.delete("competition_seasons", legacySeasonId);
    for (const entity of ["competition_entries", "competition_score_snapshots"] as const) {
      for (const record of this.storage.list(entity)) {
        if (record.id.startsWith(`${legacySeasonId}:`) || record.payload.seasonId === legacySeasonId) {
          this.storage.delete(entity, record.id);
        }
      }
    }
    const productTraders = new Set<string>();
    for (const event of this.decoded) {
      const traderArg = arg(event.args, "trader", 1);
      const accountArg = arg(event.args, "account", 1);
      let recipient: Address | null = typeof traderArg === "string" ? traderArg as Address : typeof accountArg === "string" ? accountArg as Address : null;
      const positionId = arg(event.args, "positionId", 0);
      if (recipient === null && typeof positionId === "bigint") recipient = this.positionTraders.get(positionId.toString()) ?? null;
      if (event.name === "OrderExecuted") {
        const orderId = arg(event.args, "orderId", 0);
        if (typeof orderId === "string") recipient = this.orderTraders.get(orderId.toLowerCase()) ?? null;
      }
      if (recipient !== null) {
        productTraders.add(recipient.toLowerCase());
        if (["OrderSubmitted", "OrderExecuted", "PositionOpened", "PositionReduced", "PositionClosed", "PositionLiquidated"].includes(event.name)) {
          this.repository.saveNotification(notificationFor(event, recipient, PRODUCT_MARKET_ID));
        }
        this.repository.saveWalletEvent(`${this.deploymentId}:${event.eventId}:${recipient.toLowerCase()}`, { deploymentId: this.deploymentId, wallet: recipient.toLowerCase(), eventType: event.name, eventId: event.eventId, marketId: PRODUCT_MARKET_ID, blockNumber: event.log.blockNumber?.toString() ?? null }, observedAt);
      }
    }
    for (const wallet of productTraders) {
      const analytics = this.storage.get("wallet_analytics", wallet)?.payload;
      const marketsTraded = analytics?.marketsTraded;
      if (Array.isArray(marketsTraded) && marketsTraded.includes(PRODUCT_MARKET_ID)) {
        this.storage.delete("wallet_analytics", wallet);
      }
      const profile = this.storage.get("profiles", wallet)?.payload;
      if (
        profile?.schemaVersion === "user-profile/v1" &&
        profile.displayName === null &&
        profile.avatarUrl === null &&
        profile.authorization === null &&
        Array.isArray(profile.watchlistMarketIds) && profile.watchlistMarketIds.length === 0 &&
        Array.isArray(profile.watchlistWallets) && profile.watchlistWallets.length === 0
      ) {
        this.storage.delete("profiles", wallet);
      }
    }
    this.storage.put("risk_changes", `${this.deploymentId}:latest`, { deploymentId: this.deploymentId, marketId: PRODUCT_MARKET_ID, maxLeverage: recordString(state.risk.maxLeverage ?? state.risk["0"] ?? "0"), maxOI: recordString(state.risk.maxOI ?? state.risk["1"] ?? "0"), maxPosition: recordString(state.risk.maxPosition ?? state.risk["2"] ?? "0"), status: recordString(state.risk.status ?? state.risk["5"] ?? "0"), observedAt }, observedAt);
  }

  public checkpoint(): Record<string, unknown> | null {
    return this.storage.get("indexer_checkpoints", `${this.deploymentId}:ARC`)?.payload ?? null;
  }

  public latestProtocolEvent(): Record<string, unknown> | null {
    const latest = this.storage
      .list("protocol_events")
      .filter((record) => record.payload.deploymentId === this.deploymentId)
      .sort((left, right) => {
        const blockDelta = Number(payloadString(right.payload, "blockNumber", "0")) - Number(payloadString(left.payload, "blockNumber", "0"));
        if (blockDelta !== 0) return blockDelta;
        return Number(payloadString(right.payload, "logIndex", "0")) - Number(payloadString(left.payload, "logIndex", "0"));
      })[0];
    return latest?.payload ?? null;
  }

  public close(): void { this.storage.close(); }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const serve = args.has("--serve");
  const dbArgument = process.argv.find((value) => value.startsWith("--db="));
  const databasePath = resolve(dbArgument?.slice("--db=".length) ?? "evidence/gate4i/product-live.sqlite");
  await mkdir(dirname(databasePath), { recursive: true });
  const indexer = new ProductLiveIndexer(databasePath);
  const realtime = new RealtimeHub();
  let state: ProductState | null = null;
  let lastIndexError: string | null = null;
  let lastRpcSuccessAt: string | null = null;
  let lastPublishedSnapshotBlock = "";
  let latestRealtimeEventId: string | null = null;
  const publishMarketSnapshot = (snapshot: ProductState) => {
    const blockNumber = indexer.lastHead.toString();
    if (lastPublishedSnapshotBlock === blockNumber) return;
    lastPublishedSnapshotBlock = blockNumber;
    realtime.publish(realtime.createEvent({ id: `${PRODUCT_DEPLOYMENT_ID}:snapshot:${blockNumber}`, type: "market.snapshot", occurredAt: nowIso(), payload: { deploymentId: PRODUCT_DEPLOYMENT_ID, marketId: PRODUCT_MARKET_ID, blockNumber, marketState: snapshot.marketState } }));
  };
  const publishLatestProductEvent = () => {
    const latestProductEvent = indexer.latestProtocolEvent();
    const eventId = latestProductEvent?.eventId;
    if (latestProductEvent === null || typeof eventId !== "string" || eventId === latestRealtimeEventId) return;
    latestRealtimeEventId = eventId;
    realtime.publish(realtime.createEvent({ id: `${PRODUCT_DEPLOYMENT_ID}:event:${eventId}`, type: "protocol.event", occurredAt: nowIso(), payload: { deploymentId: PRODUCT_DEPLOYMENT_ID, marketId: PRODUCT_MARKET_ID, sourceEventId: eventId, blockNumber: payloadString(latestProductEvent, "blockNumber"), transactionHash: payloadString(latestProductEvent, "transactionHash"), topic0: payloadString(latestProductEvent, "topic0") } }));
  };
  const databaseHealth = healthRecord("DATABASE", "OPERATIONAL", { lastSuccessAt: nowIso(), latencyMs: 0, error: null, freshness: "FRESH" });
  const deploymentConfig = apiDeploymentConfig();
  let polling = false;
  const indexerHealth = (): HealthRecord => {
    if (lastIndexError !== null) {
      return healthRecord("INDEXER", state === null ? "UNAVAILABLE" : "DEGRADED", {
        lastSuccessAt: indexer.lastProjectionAt,
        latencyMs: null,
        error: lastIndexError,
        freshness: state === null ? "UNAVAILABLE" : "STALE",
      });
    }
    if (state === null) return healthRecord("INDEXER", "UNAVAILABLE", { lastSuccessAt: null, latencyMs: null, error: "INITIAL_CHAIN_READ_PENDING", freshness: "UNAVAILABLE" });
    const checkpointBlock = BigInt(payloadString(indexer.checkpoint() ?? {}, "blockNumber", "0"));
    const backfillPending = checkpointBlock < indexer.lastHead;
    return healthRecord("INDEXER", backfillPending ? "DEGRADED" : "OPERATIONAL", {
      lastSuccessAt: indexer.lastProjectionAt,
      latencyMs: null,
      error: backfillPending ? "HISTORICAL_EVENT_BACKFILL_PENDING" : null,
      freshness: backfillPending ? "STALE" : "FRESH",
    });
  };
  const options: ApiServerOptions = {
    readModel: new PersistenceApiReadModel(indexer.storage),
    health: () => healthSnapshot(
      databaseHealth,
      lastRpcSuccessAt === null
        ? healthRecord("ARC_RPC", "UNAVAILABLE", { lastSuccessAt: null, latencyMs: null, error: lastIndexError ?? "INITIAL_CHAIN_READ_PENDING", freshness: "UNAVAILABLE" })
        : healthRecord("ARC_RPC", lastIndexError === null ? "OPERATIONAL" : "DEGRADED", { lastSuccessAt: lastRpcSuccessAt, latencyMs: null, error: lastIndexError, freshness: lastIndexError === null ? "FRESH" : "STALE" }),
      indexerHealth(),
      state === null
        ? healthRecord("ORACLE", "UNAVAILABLE", { lastSuccessAt: null, latencyMs: null, error: "CHAIN_READS_NOT_READY", freshness: "UNAVAILABLE" })
        : oracleHealth(state),
      healthRecord("REALTIME_STREAM", "OPERATIONAL", { lastSuccessAt: nowIso(), latencyMs: null, error: null, freshness: "FRESH" }),
      state !== null,
    ),
    realtime,
    runtime: () => ({
      config: {
        ...deploymentConfig,
        lifecycle: deploymentLifecycle({
          deploymentStatus: state === null ? "PENDING" : "DEPLOYED",
          registeredPerpCount: state === null ? 0 : 1,
          livePerpCount: state?.marketState === 3 ? 1 : 0,
        }),
      },
      discoveryCount: state === null ? 0 : 1,
      currentlyObservedCount: state === null ? 0 : 1,
      staleRetainedCount: state !== null && oracleHealth(state).state !== "OPERATIONAL" ? 1 : 0,
      registeredPerpCount: state === null ? 0 : 1,
      livePerpCount: state?.marketState === 3 ? 1 : 0,
    }),
  };
  const runIndexCycle = async (): Promise<void> => {
    if (polling) return;
    polling = true;
    try {
      const nextState = await indexer.bootstrap((observedState) => {
        state = observedState;
        lastRpcSuccessAt = nowIso();
        publishMarketSnapshot(observedState);
      });
      state = nextState;
      lastIndexError = null;
      lastRpcSuccessAt = nowIso();
      publishMarketSnapshot(nextState);
      publishLatestProductEvent();
      process.stdout.write(JSON.stringify({ mode: serve ? "LIVE_SERVE" : "LIVE_BOOTSTRAP", deploymentId: PRODUCT_DEPLOYMENT_ID, chainId: CHAIN_ID, startBlock: PRODUCT_START_BLOCK.toString(), head: indexer.lastHead.toString(), checkpoint: indexer.checkpoint(), databasePath, apiVersion: "v1", marketId: PRODUCT_MARKET_ID }) + "\n");
    } catch (error) {
      lastIndexError = error instanceof Error ? error.message : String(error);
      process.stderr.write(`INDEXER_CYCLE_FAILED=${lastIndexError}\n`);
    } finally {
      polling = false;
    }
  };
  if (!serve) {
    await runIndexCycle();
    indexer.close();
    if (lastIndexError !== null) process.exitCode = 1;
    return;
  }
  const portArgument = process.argv.find((value) => value.startsWith("--port="));
  const port = Number(portArgument?.slice("--port=".length) ?? "8787");
  const hostArgument = process.argv.find((value) => value.startsWith("--host="));
  const host = hostArgument?.slice("--host=".length) ?? "127.0.0.1";
  const pollArgument = process.argv.find((value) => value.startsWith("--poll-ms="));
  const pollMs = Math.max(0, Number(pollArgument?.slice("--poll-ms=".length) ?? "0"));
  const server = createReadOnlyApiServer(options);
  await new Promise<void>((resolveListen) => server.listen(port, host, resolveListen));
  process.stdout.write(`LIVE_API_LISTENING=http://${host}:${port}/api/v1\n`);
  void runIndexCycle();
  const pollTimer = pollMs === 0 ? null : setInterval(() => { void runIndexCycle(); }, pollMs);
  const close = () => { if (pollTimer !== null) clearInterval(pollTimer); server.close(); indexer.close(); };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 1; });
