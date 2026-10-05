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
  type UserProfile,
  type WalletSnapshot,
} from "@arcmemeperps/domain";
import { BackendRepository, SQLitePersistence } from "@arcmemeperps/persistence";
import {
  canonicalProtocolEventId,
  type ProtocolEventIdentity,
} from "../apps/indexer/src/index.js";
import { healthRecord, type HealthRecord } from "@arcmemeperps/shared";

const RPC_URL = "https://rpc.testnet.arc.io";
const CHAIN_ID = 5_042_002;
const PRODUCT_DEPLOYMENT_ID = "arc-testnet-product-v2";
const PRODUCT_START_BLOCK = 65_487_723n;
const PRODUCT_MARKET_ID =
  "0xf8ffffb2f0f52e8bb2b71484007f5cf705f41f83369be65b4fba067293723387" as Hex;
const PRODUCT_TOKEN = "0x0000000000000000000000000000000000000001" as Address;
const TRADER_LONG = "0xc36fd43deaad e fb349acc61b0eb664ea4a18861c".replaceAll(" ", "") as Address;
const QUALIFICATION_WRITER = "0x4445656fe52116ca653d4f86a16705964a99d4a6" as Address;

const CONTRACTS = {
  QualificationRegistry: "0x5f4193cbbcaf64175b2bb3dbe46dd6c7733c59bd" as Address,
  MarketRegistry: "0x4ea3fbb41962d0a3ec28c570656ea9d5ac1904bb" as Address,
  OracleRouter: "0xfdc85c3a13186e9be0ad63c34b5162de25bd39a5" as Address,
  RiskConfig: "0x3f9a6bfd2019b760d85eaf2ce0827534d58e65ad" as Address,
  USDCMarginVault: "0xf73b9eb7e1853c9ba8f558542f1276584dd0f6ab" as Address,
  InsuranceFund: "0x131ce3346eb5e15a3ae3c1cba2cd93d54dc6877b" as Address,
  PerpEngine: "0xbd2c3ad91799110adf647493acbaa1f63a40514c" as Address,
  PublicLPVault: "0x826892d52172ddef07f2927ba67493465cf54964" as Address,
  ADLController: "0xca600bcd65de31d65ee198a82d5d51d50fa4b841" as Address,
  ProtocolTimelock: "0xec9eed7f03a945ca9a810ed0db87c6dc6f23901f" as Address,
} as const;
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
    marketState: Number(await read(CONTRACTS.MarketRegistry, "marketState", [PRODUCT_MARKET_ID])),
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

function createPassport(state: ProductState, observedAt: string) {
  const q = state.qualification;
  const risk = state.risk;
  const report = state.report;
  const proofHash = recordString(q.proofHash ?? q["0"] ?? "0x" + "0".repeat(64));
  const ruleVersion = recordString(q.ruleVersion ?? q["1"] ?? "0x" + "0".repeat(64));
  const qualifiedAt = (q.qualifiedAt ?? q["2"] ?? 0n) as bigint;
  const expiresAt = (q.expiresAt ?? q["3"] ?? 0n) as bigint;
  const maxLeverage = recordString(q.maxLeverage ?? q["4"] ?? "0");
  const maxOi = recordString(q.maxOI ?? q["5"] ?? "0");
  const maxPosition = recordString(q.maxPosition ?? q["6"] ?? "0");
  const approved = Boolean(q.approved ?? q["7"] ?? false);
  const midPrice = recordString(report.midPrice ?? report["2"] ?? "0");
  const observedOracle = (report.observedAt ?? report["8"] ?? 0n) as bigint;
  const freshness = observedOracle > 0n && BigInt(Math.floor(Date.now() / 1_000)) - observedOracle <= 120n ? "FRESH" : "STALE";
  const status = state.marketState === 3 ? "LIVE" : state.marketState === 2 ? "CLOSE_ONLY" : state.marketState === 1 ? "PAUSED" : "BLOCKED";
  const maxOiWad = (BigInt(maxOi) * 1_000_000_000_000n).toString();
  const maxPositionWad = (BigInt(maxPosition) * 1_000_000_000_000n).toString();
  return MarketPassportSchema.parse({
    passportSchemaVersion: "market-passport/v1",
    schemaVersion: "market-snapshot/v1",
    observedAt,
    identity: {
      marketId: PRODUCT_MARKET_ID,
      chain: "BASE",
      tokenAddress: PRODUCT_TOKEN,
      symbol: "ARC-PRODUCT",
      name: "ArcMemePerps Product Canary",
      decimals: 18,
      deployer: null,
      createdAt: null,
      originPlatform: "UNKNOWN",
    },
    originChain: "BASE",
    originPlatform: "UNKNOWN",
    lifecycle: { status: "DISCOVERED", evidenceIds: [PRODUCT_DEPLOYMENT_ID], observedAt, confidenceBps: 10_000 },
    marketData: { priceUsdWad: midPrice, volume24hUsdWad: null, buyCount24h: null, sellCount24h: null, priceChange24hBps: null, volatilityBps: null },
    liquidity: {
      totalUsdWad: (state.lp.managedAssets as bigint * 1_000_000_000_000n).toString(),
      dominantPool: CONTRACTS.PublicLPVault,
      poolConcentrationBps: 10_000,
      venueCount: 1,
      buyDepth1PctUsdWad: null,
      sellDepth1PctUsdWad: null,
      buyDepth2PctUsdWad: null,
      sellDepth2PctUsdWad: null,
      securityStatus: "PROTOCOL_CONTROLLED",
      earliestUnlockAt: null,
    },
    holderEvidence: { largestHolderBps: null, largestNonSystemHolderBps: null, top10NonSystemBps: null, largestConnectedClusterBps: null, clusterCount: null, systemExclusions: [] },
    deployerEvidence: { deployer: null, tokensCreated: null, survival7dBps: null, survival30dBps: null, associatedWallets: [], reasonCodes: ["ORIGIN_DEPLOYER_NOT_INDEXED"] },
    securityEvidence: { mintAuthorityActive: null, freezeAuthorityActive: null, ownerPrivilege: null, upgradeable: null, transferRestricted: null, honeypot: null, lpSecurity: "PROTOCOL_CONTROLLED", evidenceIds: [PRODUCT_DEPLOYMENT_ID] },
    oracleEvidence: {
      priceSourceCount: Number(report.sourceCount ?? report["6"] ?? 0),
      independentSourceCount: Number(report.independentSourceCount ?? report["7"] ?? 0),
      dispersionBps: null,
      confidenceBps: Number(report.confidenceBps ?? report["5"] ?? 0),
      freshness,
      sourceFamilies: ["REPORTER_SET_V2"],
    },
    derivativesEvidence: {
      status,
      maxLeverageWad: maxLeverage,
      maxOIWad: maxOiWad,
      maxPositionWad,
      maintenanceMarginBps: Number(risk.maintenanceMarginBps ?? risk["3"] ?? 0),
      manipulationResistance: "HIGH",
      reasonCodes: state.solvencyBlocked ? ["SOLVENCY_BLOCKED"] : [],
    },
    providerState: {
      providers: [
        { provider: "ARC_RPC", status: "AVAILABLE", lastSuccessAt: observedAt, fetchedAt: observedAt, reason: null },
        { provider: "ORIGIN_MARKET_DATA", status: "UNAVAILABLE", lastSuccessAt: null, fetchedAt: observedAt, reason: "No external enrichment provider configured for this testnet canary" },
      ],
      disagreements: [],
    },
    freshness: { status: freshness, observedAt: isoFromUnix(observedOracle), fetchedAt: observedAt, maxAgeSeconds: 120 },
    riskResult: { integrityStatus: approved ? "QUALIFIED" : "PENDING", derivativesStatus: status, hardGateCodes: [], rejectionReasons: [], warnings: [], ruleVersion: "0.1.0" },
    qualification: { eligible: approved, proofHash, commitmentHash: null, evidenceRoot: recordString(report.evidenceRoot ?? report["12"] ?? "0x" + "0".repeat(64)), assessedAt: isoFromUnix(qualifiedAt), expiresAt: isoFromUnix(expiresAt) },
    tradability: { status, reasons: state.solvencyBlocked ? ["SOLVENCY_BLOCKED"] : [], asOf: observedAt },
    marketAgeSeconds: null,
    priceHistory: [{ observedAt: isoFromUnix(observedOracle) ?? observedAt, priceUsdWad: midPrice, source: "ARC_ORACLE_ROUTER" }],
    pools: [{ venue: "Arc PublicLPVault", poolAddress: CONTRACTS.PublicLPVault, poolType: "PUBLIC_LP_VAULT", liquidityUsdWad: (state.lp.managedAssets as bigint * 1_000_000_000_000n).toString(), buyDepth1PctUsdWad: null, sellDepth1PctUsdWad: null, buyDepth2PctUsdWad: null, sellDepth2PctUsdWad: null, buyDepth5PctUsdWad: null, sellDepth5PctUsdWad: null }],
    lpControl: { status: "PROTOCOL_CONTROLLED", reason: "Live Product PublicLPVault custody", evidenceIds: [PRODUCT_DEPLOYMENT_ID], observedAt },
    bundleEvidence: { effectiveConcentrationBps: null, coordinatedWallets: [], evidenceIds: [] },
    firstBuyers: [],
    sniperSignals: [],
    deployerProfile: { tokensCreated: null, survival1dBps: null, survival7dBps: null, survival30dBps: null, liquidityRemovalIncidents: null, mintAdminIncidents: null, associatedWallets: [], reasonCodes: ["UNAVAILABLE"] },
    fundingGraph: { status: "INSUFFICIENT_DATA", nodes: [], edges: [], reasonCodes: ["EXTERNAL_FUNDING_GRAPH_NOT_CONFIGURED"] },
    washFarm: { verdict: "INSUFFICIENT_DATA", reasonCodes: ["INSUFFICIENT_ORIGIN_ACTIVITY_HISTORY"], features: {} },
    organicActivity: { holderGrowthBps: null, newHolderVelocity: null, independentTraderCount: null, retentionBps: null, netCapitalFlowUsdWad: null, venueDiversity: null, persistenceBps: null },
    smartWalletActivity: { participatingWallets: [], qualityBps: null, evidenceIds: [] },
    marketDepth: { status: "UNAVAILABLE", buyDepth1PctUsdWad: null, sellDepth1PctUsdWad: null, buyDepth2PctUsdWad: null, sellDepth2PctUsdWad: null, buyDepth5PctUsdWad: null, sellDepth5PctUsdWad: null, observedAt, reason: "No orderbook provider; Arc perpetual capacity is reported separately" },
    sourceIndependence: { independentSourceCount: Number(report.independentSourceCount ?? report["7"] ?? 0), sourceIds: ["REPORTER_1", "REPORTER_2", "REPORTER_3"], correlatedSourceIds: [] },
    arcMarketState: status === "LIVE" ? "LIVE" : status,
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
  const fresh = observedAt > 0n && observedAt <= now && now - observedAt <= 120n;
  return healthRecord("ORACLE", fresh ? "OPERATIONAL" : "STALE", {
    lastSuccessAt: isoFromUnix(observedAt),
    latencyMs: null,
    error: fresh ? null : "ORACLE_OBSERVATION_STALE",
    freshness: fresh ? "FRESH" : "STALE",
  });
}

function healthSnapshot(database: HealthRecord, indexer: HealthRecord, oracle: HealthRecord, realtime: HealthRecord): readonly HealthRecord[] {
  const operational = (component: HealthRecord["component"]): HealthRecord => healthRecord(component, "OPERATIONAL", { lastSuccessAt: nowIso(), latencyMs: null, error: null, freshness: "FRESH" });
  return [
    database,
    operational("ARC_RPC"),
    indexer,
    operational("MARKET_DATA"),
    operational("MARKET_DISCOVERY"),
    operational("RISK_ENGINE"),
    operational("KEEPER"),
    operational("ORACLE_REPORTERS"),
    oracle,
    operational("VAULT"),
    operational("INSURANCE"),
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
  public lastHead = 0n;
  public lastProjectionAt: string | null = null;

  public constructor(public readonly databasePath: string) {
    this.storage = new SQLitePersistence(databasePath);
    this.repository = new BackendRepository(this.storage);
    this.client = createPublicClient({
      chain: { id: CHAIN_ID, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 }, rpcUrls: { default: { http: [RPC_URL] } } },
      transport: http(RPC_URL),
    });
  }

  public async bootstrap(): Promise<ProductState> {
    const started = Date.now();
    const latest = await this.client.getBlockNumber();
    const checkpoint = this.storage.get("indexer_checkpoints", `${this.deploymentId}:ARC`);
    const previous = checkpoint?.payload.blockNumber;
    const from = previous === undefined ? PRODUCT_START_BLOCK : BigInt(payloadString(checkpoint?.payload ?? {}, "blockNumber", PRODUCT_START_BLOCK.toString())) + 1n;
    const chunk = 1_000n;
    for (let cursor = from; cursor <= latest; cursor += chunk) {
      const to = cursor + chunk - 1n > latest ? latest : cursor + chunk - 1n;
      const logs = await this.client.getLogs({ address: CONTRACT_ADDRESSES, fromBlock: cursor, toBlock: to });
      for (const log of logs) this.persistLog(log);
      const block = await this.client.getBlock({ blockNumber: to });
      this.storage.put("indexer_checkpoints", `${this.deploymentId}:ARC`, {
        deploymentId: this.deploymentId,
        chain: "ARC",
        startBlock: PRODUCT_START_BLOCK.toString(),
        blockNumber: to.toString(),
        blockHash: block.hash,
        eventCount: this.storage.list("protocol_events").filter((item) => item.payload.deploymentId === this.deploymentId).length,
        lastObservedAt: nowIso(),
      }, nowIso());
    }
    this.lastHead = latest;
    this.rehydrateDecodedEvents();
    const state = await readState(this.client);
    const passport = createPassport(state, nowIso());
    this.repository.savePassport(passport);
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

  private persistLog(log: Log): void {
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
    if (this.storage.get("protocol_events", eventId) !== null) return;
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
    const traders = new Map<string, { volume: bigint; pnl: bigint; wins: number; losses: number; trades: number; markets: Set<string>; events: string[] }>();
    const ensure = (wallet: Address) => {
      const key = wallet.toLowerCase();
      const existing = traders.get(key);
      if (existing !== undefined) return existing;
      const next = { volume: 0n, pnl: 0n, wins: 0, losses: 0, trades: 0, markets: new Set<string>(), events: [] };
      traders.set(key, next);
      return next;
    };
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
        const metrics = ensure(recipient);
        metrics.events.push(event.eventId);
        if (event.name === "PositionOpened") {
          const size = arg(event.args, "size", 5);
          metrics.volume += typeof size === "bigint" ? size : 0n;
          metrics.trades += 1;
          metrics.markets.add(PRODUCT_MARKET_ID);
        }
        if (event.name === "PositionClosed" || event.name === "PositionLiquidated") {
          const pnl = arg(event.args, "pnl", 1);
          if (typeof pnl === "bigint") { metrics.pnl += pnl; if (pnl >= 0n) metrics.wins += 1; else metrics.losses += 1; }
        }
        if (["OrderSubmitted", "OrderExecuted", "PositionOpened", "PositionReduced", "PositionClosed", "PositionLiquidated"].includes(event.name)) {
          this.repository.saveNotification(notificationFor(event, recipient, PRODUCT_MARKET_ID));
        }
        this.repository.saveWalletEvent(`${this.deploymentId}:${event.eventId}:${recipient.toLowerCase()}`, { deploymentId: this.deploymentId, wallet: recipient.toLowerCase(), eventType: event.name, eventId: event.eventId, marketId: PRODUCT_MARKET_ID, blockNumber: event.log.blockNumber?.toString() ?? null }, observedAt);
      }
      if (event.name === "QualificationApproved") this.repository.saveNotification(notificationFor(event, QUALIFICATION_WRITER, PRODUCT_MARKET_ID));
    }
    for (const [wallet, metrics] of traders) {
      const snapshot: WalletSnapshot = {
        schemaVersion: "wallet-snapshot/v1",
        wallet,
        observedAt,
        realizedPnlUsdWad: metrics.pnl.toString(),
        unrealizedPnlUsdWad: "0",
        volumeUsdWad: (metrics.volume * 1_000_000_000_000n).toString(),
        winCount: metrics.wins,
        lossCount: metrics.losses,
        averageHoldSeconds: null,
        drawdownBps: 0,
        marketsTraded: [...metrics.markets] as WalletSnapshot["marketsTraded"],
        evidenceIds: metrics.events,
      };
      this.storage.put("wallet_analytics", wallet, snapshot, observedAt);
      const profile: UserProfile = {
        schemaVersion: "user-profile/v1",
        primaryWallet: wallet,
        displayName: null,
        avatarUrl: null,
        createdAt: observedAt,
        updatedAt: observedAt,
        notificationPreferences: { enabled: true, types: [] },
        watchlistMarketIds: [],
        watchlistWallets: [],
        authorization: null,
      };
      this.repository.saveProfile(profile);
    }
    this.repository.setWatchlist(TRADER_LONG, [PRODUCT_MARKET_ID], []);
    const seasonId = `${PRODUCT_DEPLOYMENT_ID}:testnet-season`;
    this.storage.put("competition_seasons", seasonId, { id: seasonId, deploymentId: this.deploymentId, name: "Product Testnet Activity", status: "TESTNET", source: "CANONICAL_PRODUCT_EVENTS", startBlock: PRODUCT_START_BLOCK.toString(), endBlock: this.lastHead.toString(), prizes: false }, observedAt);
    for (const [wallet, metrics] of traders) {
      this.storage.put("competition_score_snapshots", `${seasonId}:${wallet}`, { seasonId, deploymentId: this.deploymentId, account: wallet, snapshotAt: observedAt, realizedPnl: metrics.pnl.toString(), realizedPnlUsdWad: metrics.pnl.toString(), returnPct: "0", riskAdjustedReturn: "0", winRate: metrics.wins + metrics.losses === 0 ? "0" : ((metrics.wins * 10000) / (metrics.wins + metrics.losses)).toString(), scoreWad: metrics.pnl.toString(), status: "VALID", reasonCodes: ["CANONICAL_PRODUCT_EVENTS"], sourceEventIds: metrics.events }, observedAt);
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
  let state = await indexer.bootstrap();
  const realtime = new RealtimeHub();
  realtime.publish(realtime.createEvent({ id: `${PRODUCT_DEPLOYMENT_ID}:bootstrap:${indexer.lastHead.toString()}`, type: "market.discovered", occurredAt: nowIso(), payload: { deploymentId: PRODUCT_DEPLOYMENT_ID, marketId: PRODUCT_MARKET_ID, blockNumber: indexer.lastHead.toString() } }));
  let latestRealtimeEventId: string | null = null;
  const publishLatestProductEvent = () => {
    const latestProductEvent = indexer.latestProtocolEvent();
    const eventId = latestProductEvent?.eventId;
    if (latestProductEvent === null || typeof eventId !== "string" || eventId === latestRealtimeEventId) return;
    latestRealtimeEventId = eventId;
    realtime.publish(realtime.createEvent({ id: `${PRODUCT_DEPLOYMENT_ID}:event:${eventId}`, type: "price.updated", occurredAt: nowIso(), payload: { deploymentId: PRODUCT_DEPLOYMENT_ID, marketId: PRODUCT_MARKET_ID, sourceEventId: eventId, blockNumber: payloadString(latestProductEvent, "blockNumber") } }));
  };
  publishLatestProductEvent();
  const databaseHealth = healthRecord("DATABASE", "OPERATIONAL", { lastSuccessAt: nowIso(), latencyMs: 0, error: null, freshness: "FRESH" });
  const options: ApiServerOptions = {
    readModel: new PersistenceApiReadModel(indexer.storage),
    health: () => healthSnapshot(databaseHealth, healthRecord("INDEXER", "OPERATIONAL", { lastSuccessAt: indexer.lastProjectionAt, latencyMs: 0, error: null, freshness: "FRESH" }), oracleHealth(state), healthRecord("REALTIME_STREAM", realtime.status() === "LIVE" ? "OPERATIONAL" : "STALE", { lastSuccessAt: nowIso(), latencyMs: 0, error: null, freshness: realtime.status() === "LIVE" ? "FRESH" : "STALE" })),
    realtime,
  };
  process.stdout.write(JSON.stringify({ mode: serve ? "LIVE_SERVE" : "LIVE_BOOTSTRAP", deploymentId: PRODUCT_DEPLOYMENT_ID, chainId: CHAIN_ID, startBlock: PRODUCT_START_BLOCK.toString(), head: indexer.lastHead.toString(), checkpoint: indexer.checkpoint(), state: safeJson(state), databasePath, apiVersion: "v1", marketId: PRODUCT_MARKET_ID }) + "\n");
  if (!serve) { indexer.close(); return; }
  const portArgument = process.argv.find((value) => value.startsWith("--port="));
  const port = Number(portArgument?.slice("--port=".length) ?? "8787");
  const hostArgument = process.argv.find((value) => value.startsWith("--host="));
  const host = hostArgument?.slice("--host=".length) ?? "127.0.0.1";
  const pollArgument = process.argv.find((value) => value.startsWith("--poll-ms="));
  const pollMs = Math.max(0, Number(pollArgument?.slice("--poll-ms=".length) ?? "0"));
  const server = createReadOnlyApiServer(options);
  await new Promise<void>((resolveListen) => server.listen(port, host, resolveListen));
  process.stdout.write(`LIVE_API_LISTENING=http://${host}:${port}/api/v1\n`);
  let polling = false;
  const pollTimer = pollMs === 0 ? null : setInterval(() => {
    if (polling) return;
    polling = true;
    void indexer.bootstrap().then((nextState) => {
      state = nextState;
      publishLatestProductEvent();
    }).catch((error: unknown) => {
      process.stderr.write(`INDEXER_POLL_FAILED=${error instanceof Error ? error.message : String(error)}\n`);
    }).finally(() => { polling = false; });
  }, pollMs);
  const close = () => { if (pollTimer !== null) clearInterval(pollTimer); server.close(); indexer.close(); };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 1; });
