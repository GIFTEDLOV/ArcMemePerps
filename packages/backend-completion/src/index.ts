import { z } from "zod";
import type { TokenIdentity } from "@arcmemeperps/domain";
import {
  marketIdForToken,
  keccak256Hex,
  canonicalJson,
  type SupportedChain,
} from "@arcmemeperps/shared";
import {
  type PersistenceStore,
  type DurableJob,
  PersistentJobQueue,
} from "@arcmemeperps/persistence";
import {
  calculateConcentratedLiquidityDepth,
  calculateConstantProductDepth,
  type ConcentratedLiquidityPool,
  type ConstantProductPool,
  type MarketDepth,
} from "@arcmemeperps/market-depth";

export const BACKEND_COMPLETION_SCHEMA = "backend-completion/v1" as const;

const iso = z.string().datetime({ offset: true });
const hexHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export interface DiscoveryCheckpoint {
  readonly sourceId: string;
  readonly chain: SupportedChain;
  readonly cursor: string | null;
  readonly blockNumber: string | null;
  readonly blockHash: string | null;
  readonly slot: string | null;
  readonly finality: "latest" | "confirmed" | "finalized";
  readonly updatedAt: string;
}

export interface DiscoveryCandidate {
  readonly token: TokenIdentity;
  readonly sourceId: string;
  readonly originPlatform: string;
  readonly lifecycle: string;
  readonly observedAt: string;
  readonly blockNumber: string | null;
  readonly blockHash: string | null;
  readonly slot: string | null;
  readonly evidence: readonly Record<string, unknown>[];
}

export interface DiscoveryReader {
  readonly sourceId: string;
  readonly chain: SupportedChain;
  scan(checkpoint: DiscoveryCheckpoint | null): Promise<{
    readonly candidates: readonly DiscoveryCandidate[];
    readonly checkpoint: DiscoveryCheckpoint;
  }>;
}

export interface DiscoveryRunResult {
  readonly discovered: readonly string[];
  readonly duplicate: readonly string[];
  readonly checkpoints: readonly DiscoveryCheckpoint[];
}

/**
 * Durable discovery coordinator. Each source has its own cursor, so a slow or
 * rate-limited venue cannot move another venue's checkpoint. The market ID is
 * derived from the canonical chain identity and is the dedupe key.
 */
export class ContinuousDiscoveryService {
  public constructor(
    private readonly storage: PersistenceStore,
    private readonly readers: readonly DiscoveryReader[],
  ) {}

  public async runOnce(): Promise<DiscoveryRunResult> {
    const discovered: string[] = [];
    const duplicate: string[] = [];
    const checkpoints: DiscoveryCheckpoint[] = [];
    for (const reader of this.readers) {
      const checkpointId = `${reader.chain}:${reader.sourceId}`;
      const previous = this.storage.get("discovery_sources", checkpointId)?.payload as
        DiscoveryCheckpoint | undefined;
      const result = await reader.scan(previous ?? null);
      for (const candidate of result.candidates) {
        if (candidate.token.chain !== reader.chain)
          throw new Error(`DISCOVERY_WRONG_CHAIN:${reader.sourceId}`);
        const marketId = marketIdForToken(candidate.token.chain, candidate.token.tokenAddress);
        const eventId = keccak256Hex(
          canonicalJson({
            sourceId: candidate.sourceId,
            marketId,
            blockNumber: candidate.blockNumber,
            blockHash: candidate.blockHash,
            slot: candidate.slot,
          }),
        );
        if (this.storage.get("discovery_events", eventId) !== null) {
          duplicate.push(marketId);
          continue;
        }
        this.storage.put(
          "markets",
          marketId,
          {
            schemaVersion: BACKEND_COMPLETION_SCHEMA,
            marketId,
            token: candidate.token,
            sourceId: candidate.sourceId,
            originPlatform: candidate.originPlatform,
            lifecycle: candidate.lifecycle,
            firstObservedAt: candidate.observedAt,
          },
          candidate.observedAt,
        );
        this.storage.put(
          "discovery_events",
          eventId,
          { eventId, marketId, ...candidate },
          candidate.observedAt,
        );
        discovered.push(marketId);
      }
      this.storage.put(
        "discovery_sources",
        checkpointId,
        result.checkpoint as unknown as Readonly<Record<string, unknown>>,
        result.checkpoint.updatedAt,
      );
      checkpoints.push(result.checkpoint);
    }
    return { discovered, duplicate, checkpoints };
  }
}

export const PUMP_FUN_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMPSWAP_PROGRAM_ID = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
export const RAYDIUM_CPMM_PROGRAM_ID = "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C";
export const RAYDIUM_CLMM_PROGRAM_ID = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";
export const RAYDIUM_AMM_PROGRAM_ID = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
export const METEORA_DLMM_PROGRAM_ID = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export type SolanaVenue = "PUMP_FUN" | "PUMPSWAP" | "RAYDIUM" | "METEORA";

export interface SolanaVenuePoolState {
  readonly venue: SolanaVenue;
  readonly poolAddress: string;
  readonly tokenMint: string;
  readonly quoteReserveUsdWad: bigint;
  readonly baseReserveUsdWad: bigint;
  readonly feeBps: bigint;
  readonly observedAt: string;
  readonly slot: string;
  readonly poolType: string;
  readonly liquidityControl:
    "BURNED" | "LOCKED" | "PROTOCOL_CONTROLLED" | "WITHDRAWABLE" | "UNKNOWN";
}

export interface SolanaVenueReaderTransport {
  readPools(input: {
    readonly mint: string;
    readonly venue: SolanaVenue;
  }): Promise<readonly SolanaVenuePoolState[]>;
  readLaunch(input: { readonly mint: string }): Promise<Readonly<Record<string, unknown>> | null>;
}

/** Read-only Solana venue boundary. Unsupported account layouts return an empty result. */
export class SolanaVenueReader {
  public constructor(private readonly transport: SolanaVenueReaderTransport) {}

  public async readDepth(mint: string, venue: SolanaVenue): Promise<MarketDepth> {
    const pools = await this.transport.readPools({ mint, venue });
    if (pools.length === 0)
      return {
        status: "UNAVAILABLE",
        observedAt: new Date().toISOString(),
        buyDepth1PctUsdWad: null,
        sellDepth1PctUsdWad: null,
        buyDepth2PctUsdWad: null,
        sellDepth2PctUsdWad: null,
        buyDepth5PctUsdWad: null,
        sellDepth5PctUsdWad: null,
        venueBreakdown: [],
        reason: `NO_SUPPORTED_${venue}_POOL_LAYOUT`,
      };
    return calculateConstantProductDepth(
      pools.map((pool) => ({
        venue: pool.venue,
        poolAddress: pool.poolAddress,
        baseReserveUsdWad: pool.baseReserveUsdWad,
        quoteReserveUsdWad: pool.quoteReserveUsdWad,
        feeBps: pool.feeBps,
      })),
      pools[0]!.observedAt,
    );
  }

  public async lifecycle(mint: string): Promise<{
    readonly status:
      "DISCOVERED" | "PRIMARY_MARKET" | "BONDING" | "GRADUATED" | "DEX_LIVE" | "ESTABLISHED";
    readonly evidence: Readonly<Record<string, unknown>> | null;
  }> {
    const launch = await this.transport.readLaunch({ mint });
    if (launch === null) return { status: "DISCOVERED", evidence: null };
    const state = launch.state;
    if (state === "BONDING") return { status: "BONDING", evidence: launch };
    if (state === "GRADUATED") return { status: "GRADUATED", evidence: launch };
    if (state === "DEX_LIVE") return { status: "DEX_LIVE", evidence: launch };
    return { status: "PRIMARY_MARKET", evidence: launch };
  }
}

export interface EvmPoolState {
  readonly venue: string;
  readonly poolAddress: `0x${string}`;
  readonly poolType: "V2" | "V3" | "SLIPSTREAM";
  readonly token: `0x${string}`;
  readonly quoteToken: `0x${string}`;
  readonly observedAt: string;
  readonly blockNumber: string;
  readonly reserveBaseUsdWad?: bigint;
  readonly reserveQuoteUsdWad?: bigint;
  readonly liquidity?: bigint;
  readonly sqrtPriceX96?: bigint;
  readonly sqrtPriceLowerX96?: bigint;
  readonly sqrtPriceUpperX96?: bigint;
  readonly feeBps: bigint;
}

export interface EvmVenueReaderTransport {
  getPoolStates(input: {
    readonly chain: SupportedChain;
    readonly token: `0x${string}`;
    readonly venues: readonly string[];
    readonly fromBlock?: bigint;
    readonly toBlock?: bigint;
  }): Promise<readonly EvmPoolState[]>;
}

/** Generic EVM factory/pool reader. Venue names are configuration, not business logic. */
export class EvmVenueReader {
  public constructor(
    private readonly chain: SupportedChain,
    private readonly transport: EvmVenueReaderTransport,
    private readonly venues: readonly string[],
  ) {}

  public async read(
    token: `0x${string}`,
    fromBlock?: bigint,
    toBlock?: bigint,
  ): Promise<{
    readonly pools: readonly EvmPoolState[];
    readonly depth: MarketDepth;
  }> {
    const query = {
      chain: this.chain,
      token,
      venues: this.venues,
      ...(fromBlock === undefined ? {} : { fromBlock }),
      ...(toBlock === undefined ? {} : { toBlock }),
    };
    const pools = await this.transport.getPoolStates(query);
    const cp: ConstantProductPool[] = [];
    const cl: ConcentratedLiquidityPool[] = [];
    for (const pool of pools) {
      if (
        pool.poolType === "V2" &&
        pool.reserveBaseUsdWad !== undefined &&
        pool.reserveQuoteUsdWad !== undefined
      ) {
        cp.push({
          venue: pool.venue,
          poolAddress: pool.poolAddress,
          baseReserveUsdWad: pool.reserveBaseUsdWad,
          quoteReserveUsdWad: pool.reserveQuoteUsdWad,
          feeBps: pool.feeBps,
        });
      } else if (
        pool.liquidity !== undefined &&
        pool.sqrtPriceX96 !== undefined &&
        pool.sqrtPriceLowerX96 !== undefined &&
        pool.sqrtPriceUpperX96 !== undefined
      ) {
        cl.push({
          venue: pool.venue,
          poolAddress: pool.poolAddress,
          liquidity: pool.liquidity,
          sqrtPriceX96: pool.sqrtPriceX96,
          sqrtPriceLowerX96: pool.sqrtPriceLowerX96,
          sqrtPriceUpperX96: pool.sqrtPriceUpperX96,
          feeBps: pool.feeBps,
        });
      }
    }
    const depth =
      cp.length > 0
        ? calculateConstantProductDepth(cp, pools[0]?.observedAt)
        : calculateConcentratedLiquidityDepth(cl, pools[0]?.observedAt);
    return { pools, depth };
  }
}

export const COMPLETION_SUPPORTED_NETWORKS: readonly SupportedChain[] = [
  "ARC",
  "SOLANA",
  "ETHEREUM",
  "BASE",
  "BNB",
  "ROBINHOOD",
] as const;

export interface NetworkProviderCandidate<T> {
  readonly id: string;
  readonly priority: number;
  readonly read: () => Promise<{ readonly chain: SupportedChain; readonly value: T }>;
}

export interface NetworkProviderResult<T> {
  readonly status: "OPERATIONAL" | "DEGRADED" | "UNAVAILABLE";
  readonly value: T | null;
  readonly provider: string | null;
  readonly attempted: readonly string[];
  readonly errors: readonly string[];
}

/** Provider-pool boundary with a mandatory chain identity check on every read. */
export class VerifiedNetworkProviderPool<T> {
  public constructor(
    private readonly expectedChain: SupportedChain,
    private readonly candidates: readonly NetworkProviderCandidate<T>[],
    private readonly maxAttempts = candidates.length,
  ) {}
  public async read(): Promise<NetworkProviderResult<T>> {
    const attempted: string[] = [];
    const errors: string[] = [];
    for (const candidate of [...this.candidates]
      .sort((left, right) => left.priority - right.priority)
      .slice(0, this.maxAttempts)) {
      attempted.push(candidate.id);
      try {
        const result = await candidate.read();
        if (result.chain !== this.expectedChain) throw new Error(`WRONG_CHAIN:${result.chain}`);
        return {
          status: attempted.length === 1 ? "OPERATIONAL" : "DEGRADED",
          value: result.value,
          provider: candidate.id,
          attempted,
          errors,
        };
      } catch (error) {
        errors.push(
          `${candidate.id}:${error instanceof Error ? error.message : "PROVIDER_FAILURE"}`,
        );
      }
    }
    return { status: "UNAVAILABLE", value: null, provider: null, attempted, errors };
  }
}

export interface PriceOriginObservation {
  readonly sourceId: string;
  readonly underlyingVenueId: string;
  readonly sourceFamily: string;
  readonly priceUsdWad: bigint;
}
export function independentPriceOrigins(
  observations: readonly PriceOriginObservation[],
): readonly string[] {
  return [...new Set(observations.map((observation) => observation.underlyingVenueId))].sort();
}

export interface FlaunchApiTransport {
  get(path: string): Promise<unknown>;
}

export interface FlaunchTokenRecord {
  readonly tokenAddress: string;
  readonly chain: "BASE" | "ROBINHOOD";
  readonly createdAt: string | null;
  readonly lifecycle: "DISCOVERED" | "DEX_LIVE" | "ESTABLISHED";
  readonly evidence: Readonly<Record<string, unknown>>;
}

/** Public Flaunch REST adapter; malformed or unsupported responses stay unavailable. */
export class FlaunchPublicApiReader {
  public constructor(
    private readonly transport: FlaunchApiTransport,
    private readonly network: "base" | "robinhood" = "base",
  ) {}

  public async listNew(): Promise<readonly FlaunchTokenRecord[]> {
    const raw = await this.transport.get(`/v1/${this.network}/tokens/new`);
    if (!Array.isArray(raw)) throw new Error("FLAUNCH_SCHEMA_INVALID");
    return raw.flatMap((item): FlaunchTokenRecord[] => {
      if (item === null || typeof item !== "object") return [];
      const value = item as Record<string, unknown>;
      const address =
        typeof value.address === "string"
          ? value.address
          : typeof value.tokenAddress === "string"
            ? value.tokenAddress
            : null;
      if (address === null) return [];
      return [
        {
          tokenAddress: address,
          chain: this.network === "base" ? "BASE" : "ROBINHOOD",
          createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
          lifecycle: "DISCOVERED",
          evidence: value,
        },
      ];
    });
  }

  public async token(address: string): Promise<FlaunchTokenRecord | null> {
    const raw = await this.transport.get(
      `/v1/${this.network}/tokens/${encodeURIComponent(address)}`,
    );
    if (raw === null || typeof raw !== "object") return null;
    const value = raw as Record<string, unknown>;
    return {
      tokenAddress: address,
      chain: this.network === "base" ? "BASE" : "ROBINHOOD",
      createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
      lifecycle: "DEX_LIVE",
      evidence: value,
    };
  }
}

export interface LPControlEvidence {
  readonly status: "BURNED" | "LOCKED" | "PROTOCOL_CONTROLLED" | "WITHDRAWABLE" | "UNKNOWN";
  readonly reason: string;
  readonly evidenceIds: readonly string[];
  readonly observedAt: string;
}

export function classifyV2LP(input: {
  readonly totalSupply: bigint;
  readonly holders: readonly {
    readonly address: string;
    readonly balance: bigint;
    readonly classification?: string;
  }[];
  readonly burnAddresses: readonly string[];
  readonly lockers: readonly { readonly address: string; readonly unlockAt: string | null }[];
  readonly observedAt: string;
}): LPControlEvidence {
  const burned = input.holders
    .filter((holder) =>
      input.burnAddresses.some((address) => address.toLowerCase() === holder.address.toLowerCase()),
    )
    .reduce((sum, holder) => sum + holder.balance, 0n);
  if (input.totalSupply > 0n && burned >= input.totalSupply)
    return {
      status: "BURNED",
      reason: "ALL_LP_TOKENS_BURNED",
      evidenceIds: ["lp:total-supply", "lp:burn-holders"],
      observedAt: input.observedAt,
    };
  if (input.lockers.length > 0)
    return {
      status: "LOCKED",
      reason: "LP_LOCKER_OWNERSHIP_OBSERVED",
      evidenceIds: ["lp:locker"],
      observedAt: input.observedAt,
    };
  if (input.totalSupply > 0n && input.holders.length > 0)
    return {
      status: "WITHDRAWABLE",
      reason: "LP_CONTROL_REMAINS_WITH_NON_LOCKER_HOLDER",
      evidenceIds: ["lp:holders"],
      observedAt: input.observedAt,
    };
  return {
    status: "UNKNOWN",
    reason: "LP_CONTROL_EVIDENCE_INCOMPLETE",
    evidenceIds: [],
    observedAt: input.observedAt,
  };
}

export function classifyConcentratedLP(input: {
  readonly positions: readonly {
    readonly tokenId: string;
    readonly owner: string;
    readonly liquidity: bigint;
    readonly controller?: string | null;
  }[];
  readonly protocolOwners: readonly string[];
  readonly lockers: readonly string[];
  readonly observedAt: string;
}): LPControlEvidence {
  if (input.positions.length === 0)
    return {
      status: "UNKNOWN",
      reason: "NO_POSITION_EVIDENCE",
      evidenceIds: [],
      observedAt: input.observedAt,
    };
  if (input.positions.every((position) => input.protocolOwners.includes(position.owner)))
    return {
      status: "PROTOCOL_CONTROLLED",
      reason: "ALL_POSITIONS_PROTOCOL_CONTROLLED",
      evidenceIds: ["cl:positions", "cl:protocol-owner"],
      observedAt: input.observedAt,
    };
  if (
    input.positions.every(
      (position) =>
        input.lockers.includes(position.owner) ||
        (position.controller !== undefined &&
          position.controller !== null &&
          input.lockers.includes(position.controller)),
    )
  )
    return {
      status: "LOCKED",
      reason: "ALL_POSITIONS_CONTROLLED_BY_LOCKER",
      evidenceIds: ["cl:positions", "cl:locker"],
      observedAt: input.observedAt,
    };
  return {
    status: "WITHDRAWABLE",
    reason: "POSITION_CONTROL_NOT_LOCKED",
    evidenceIds: ["cl:positions"],
    observedAt: input.observedAt,
  };
}

export function classifySolanaLiquidity(input: {
  readonly venue: SolanaVenue;
  readonly protocolControlled: boolean;
  readonly burned: boolean;
  readonly locked: boolean;
  readonly observedAt: string;
}): LPControlEvidence {
  if (input.protocolControlled)
    return {
      status: "PROTOCOL_CONTROLLED",
      reason: `${input.venue}_PROTOCOL_CONTROL`,
      evidenceIds: [`${input.venue}:control`],
      observedAt: input.observedAt,
    };
  if (input.burned)
    return {
      status: "BURNED",
      reason: `${input.venue}_BURN_EVIDENCE`,
      evidenceIds: [`${input.venue}:burn`],
      observedAt: input.observedAt,
    };
  if (input.locked)
    return {
      status: "LOCKED",
      reason: `${input.venue}_LOCK_EVIDENCE`,
      evidenceIds: [`${input.venue}:lock`],
      observedAt: input.observedAt,
    };
  return {
    status: "UNKNOWN",
    reason: `${input.venue}_CONTROL_NOT_PROVEN`,
    evidenceIds: [],
    observedAt: input.observedAt,
  };
}

export type HoneypotStatus = "CLEAR" | "RESTRICTED" | "HONEYPOT_SIGNAL" | "UNKNOWN";
export interface HoneypotResult {
  readonly status: HoneypotStatus;
  readonly reasons: readonly string[];
  readonly evidenceIds: readonly string[];
}
export interface HoneypotReadTransport {
  simulateTransfer(input: {
    readonly token: string;
    readonly from: string;
    readonly to: string;
    readonly amount: bigint;
  }): Promise<{ readonly success: boolean; readonly revertReason: string | null }>;
  readRestrictions(token: string): Promise<Readonly<Record<string, unknown>> | null>;
}

export class HoneypotAnalyzer {
  public constructor(private readonly transport: HoneypotReadTransport) {}
  public async analyze(
    token: string,
    from: string,
    destination: string,
    amount: bigint,
  ): Promise<HoneypotResult> {
    const [simulation, restrictions] = await Promise.all([
      this.transport.simulateTransfer({ token, from, to: destination, amount }),
      this.transport.readRestrictions(token),
    ]);
    const reasons: string[] = [];
    if (!simulation.success)
      reasons.push(`SIMULATION_REVERT:${simulation.revertReason ?? "UNKNOWN"}`);
    if (restrictions !== null)
      for (const [key, value] of Object.entries(restrictions))
        if (value === true) reasons.push(`RESTRICTION:${key}`);
    if (reasons.some((reason) => reason.startsWith("SIMULATION_REVERT")))
      return { status: "HONEYPOT_SIGNAL", reasons, evidenceIds: ["honeypot:simulation"] };
    if (reasons.length > 0)
      return { status: "RESTRICTED", reasons, evidenceIds: ["honeypot:restrictions"] };
    return {
      status: restrictions === null ? "UNKNOWN" : "CLEAR",
      reasons: restrictions === null ? ["RESTRICTION_READ_UNAVAILABLE"] : [],
      evidenceIds: restrictions === null ? [] : ["honeypot:simulation", "honeypot:restrictions"],
    };
  }
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly type: "TRANSFER" | "FUNDING" | "BUNDLE" | "TEMPORAL" | "LAUNCH";
  readonly evidenceIds: readonly string[];
  readonly observedAt: string;
}
export interface GraphNode {
  readonly address: string;
  readonly supplyBps: number;
  readonly classification: string;
}
export interface ClusterResult {
  readonly id: string;
  readonly members: readonly string[];
  readonly supplyBps: number;
  readonly evidenceIds: readonly string[];
}

export class ClusterGraph {
  private readonly parent = new Map<string, string>();
  private readonly edges: GraphEdge[] = [];
  public addNode(address: string): void {
    if (!this.parent.has(address.toLowerCase()))
      this.parent.set(address.toLowerCase(), address.toLowerCase());
  }
  public addEdge(edge: GraphEdge): void {
    this.addNode(edge.from);
    this.addNode(edge.to);
    this.union(edge.from.toLowerCase(), edge.to.toLowerCase());
    this.edges.push(edge);
  }
  public clusters(nodes: readonly GraphNode[]): readonly ClusterResult[] {
    const grouped = new Map<string, GraphNode[]>();
    for (const node of nodes) {
      this.addNode(node.address);
      const root = this.find(node.address.toLowerCase());
      const group = grouped.get(root) ?? [];
      group.push(node);
      grouped.set(root, group);
    }
    return [...grouped.entries()]
      .map(([root, members]) => ({
        id: root,
        members: members.map((member) => member.address).sort(),
        supplyBps: members.reduce((sum, member) => sum + member.supplyBps, 0),
        evidenceIds: this.edges
          .filter((edge) =>
            members.some(
              (member) =>
                member.address.toLowerCase() === edge.from.toLowerCase() ||
                member.address.toLowerCase() === edge.to.toLowerCase(),
            ),
          )
          .flatMap((edge) => edge.evidenceIds),
      }))
      .sort((a, b) => b.supplyBps - a.supplyBps);
  }
  private find(address: string): string {
    const parent = this.parent.get(address);
    if (parent === undefined) throw new Error("GRAPH_NODE_MISSING");
    if (parent === address) return address;
    const root = this.find(parent);
    this.parent.set(address, root);
    return root;
  }
  private union(left: string, right: string): void {
    const l = this.find(left);
    const r = this.find(right);
    if (l !== r) this.parent.set(r, l);
  }
}

export interface DeployerRefreshInput {
  readonly deployer: string;
  readonly observedAt: string;
  readonly token: {
    readonly address: string;
    readonly createdAt: string;
    readonly outcome: "ACTIVE" | "ABANDONED" | "UNKNOWN";
  };
  readonly incidents: readonly string[];
  readonly associatedWallets: readonly string[];
}
export class DeployerRefreshService {
  public constructor(private readonly storage: PersistenceStore) {}
  public refresh(input: DeployerRefreshInput): void {
    const id = input.deployer.toLowerCase();
    const previous = this.storage.get("deployer_profiles", id)?.payload ?? {};
    const tokens = Array.isArray(previous.tokens)
      ? previous.tokens.filter(
          (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
        )
      : [];
    const tokenKey = input.token.address.toLowerCase();
    const merged = [...tokens.filter((item) => item.address !== tokenKey), input.token];
    this.storage.put(
      "deployer_profiles",
      id,
      {
        deployer: id,
        tokens: merged,
        tokensCreated: merged.length,
        incidents: [
          ...new Set([
            ...(Array.isArray(previous.incidents)
              ? previous.incidents.filter((value): value is string => typeof value === "string")
              : []),
            ...input.incidents,
          ]),
        ],
        associatedWallets: [
          ...new Set([
            ...(Array.isArray(previous.associatedWallets)
              ? previous.associatedWallets.filter(
                  (value): value is string => typeof value === "string",
                )
              : []),
            ...input.associatedWallets,
          ]),
        ],
        refreshedAt: input.observedAt,
      },
      input.observedAt,
    );
    for (const window of ["1d", "7d", "30d"] as const)
      this.storage.put(
        "deployer_refreshes",
        `${id}:${window}`,
        {
          deployer: id,
          window,
          dueAt: new Date(
            Date.parse(input.observedAt) +
              { "1d": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 }[window],
          ).toISOString(),
        },
        input.observedAt,
      );
  }
}

export const HISTORY_WINDOWS = ["1m", "5m", "15m", "1h", "6h", "24h", "7d", "30d"] as const;
export interface HistoryObservation {
  readonly marketId: string;
  readonly observedAt: string;
  readonly priceUsdWad: bigint;
  readonly liquidityUsdWad: bigint | null;
  readonly volumeUsdWad: bigint | null;
  readonly holderCount: number | null;
  readonly depth1PctUsdWad: bigint | null;
  readonly clusterConcentrationBps: number | null;
  readonly oracleStatus: string;
  readonly riskStatus: string;
}
export class HistoricalSnapshotProjector {
  public constructor(private readonly storage: PersistenceStore) {}
  public record(point: HistoryObservation): void {
    this.storage.put(
      "price_history",
      `${point.marketId}:${point.observedAt}`,
      serializeBigints(point),
      point.observedAt,
    );
    this.storage.put(
      "market_snapshots",
      `${point.marketId}:${point.observedAt}`,
      serializeBigints(point),
      point.observedAt,
    );
  }
  public list(marketId: string): readonly HistoryObservation[] {
    return this.storage
      .list("price_history")
      .filter((record) => record.payload.marketId === marketId)
      .map((record) => deserializeHistory(record.payload))
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  }
  public windows(
    marketId: string,
    to: string,
  ): readonly {
    readonly window: string;
    readonly status: "AVAILABLE" | "INSUFFICIENT_DATA";
    readonly pointCount: number;
    readonly first: HistoryObservation | null;
    readonly latest: HistoryObservation | null;
  }[] {
    const end = Date.parse(to);
    const points = this.list(marketId);
    const durations: Record<string, number> = {
      "1m": 60_000,
      "5m": 300_000,
      "15m": 900_000,
      "1h": 3_600_000,
      "6h": 21_600_000,
      "24h": 86_400_000,
      "7d": 604_800_000,
      "30d": 2_592_000_000,
    };
    return HISTORY_WINDOWS.map((window) => {
      const selected = points.filter(
        (point) =>
          Date.parse(point.observedAt) >= end - durations[window]! &&
          Date.parse(point.observedAt) <= end,
      );
      return {
        window,
        status: selected.length >= 2 ? "AVAILABLE" : "INSUFFICIENT_DATA",
        pointCount: selected.length,
        first: selected[0] ?? null,
        latest: selected.at(-1) ?? null,
      };
    });
  }
}

export type RecoveryStatus =
  "PENDING" | "SUBMITTED" | "CONFIRMED" | "FAILED" | "CANCELLED" | "EXPIRED";
export interface RecoveryAction {
  readonly id: string;
  readonly wallet: string;
  readonly kind: "DEPOSIT" | "WITHDRAWAL" | "ORDER" | "EXECUTION" | "POSITION" | "LIQUIDATION";
  readonly status: RecoveryStatus;
  readonly txHash: string | null;
  readonly orderId: string | null;
  readonly failureReason: string | null;
  readonly recoverableAction: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export class RecoveryStateStore {
  public constructor(private readonly storage: PersistenceStore) {}
  public upsert(action: RecoveryAction): RecoveryAction {
    this.storage.put(
      "recovery_actions",
      action.id,
      action as unknown as Readonly<Record<string, unknown>>,
      action.updatedAt,
    );
    return action;
  }
  public get(id: string): RecoveryAction | null {
    const payload = this.storage.get("recovery_actions", id)?.payload;
    return payload === undefined ? null : (payload as unknown as RecoveryAction);
  }
  public list(wallet?: string): readonly RecoveryAction[] {
    return this.storage
      .list("recovery_actions")
      .map((record) => record.payload as unknown as RecoveryAction)
      .filter(
        (action) => wallet === undefined || action.wallet.toLowerCase() === wallet.toLowerCase(),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

export interface ReportRecord {
  readonly reportId: string;
  readonly marketId: string;
  readonly sequence: bigint;
  readonly expiresAt: string;
  readonly reporter: string;
  readonly signature: string;
  readonly createdAt: string;
}
export class PersistentReporterState {
  public constructor(private readonly storage: PersistenceStore) {}
  public load(marketId: `0x${string}`): bigint {
    const value = this.storage.get("reporter_sequences", marketId)?.payload.sequence;
    return typeof value === "string" ? BigInt(value) : 0n;
  }
  public save(marketId: `0x${string}`, sequence: bigint): void {
    this.storage.put(
      "reporter_sequences",
      marketId,
      { marketId, sequence: sequence.toString() },
      new Date().toISOString(),
    );
  }
  public saveReport(report: ReportRecord): void {
    this.storage.put(
      "reports",
      report.reportId,
      { ...report, sequence: report.sequence.toString() },
      report.createdAt,
    );
  }
}

export class DurableKeeperSupervisor {
  private readonly queue: PersistentJobQueue;
  private running = false;
  public constructor(
    private readonly storage: PersistenceStore,
    private readonly execute: (job: DurableJob) => Promise<void>,
  ) {
    this.queue = new PersistentJobQueue(storage);
  }
  public enqueue(id: string, payload: Readonly<Record<string, unknown>>): DurableJob {
    return this.queue.enqueue({
      id,
      type: "KEEPER_EXECUTION",
      dedupeKey: id,
      payload,
      maxAttempts: 3,
    });
  }
  public async runOnce(): Promise<"IDLE" | "SUCCEEDED" | "FAILED"> {
    if (this.running) return "IDLE";
    const job = this.queue.claim();
    if (job === null) return "IDLE";
    this.running = true;
    try {
      await this.execute(job);
      this.queue.succeed(job.id, new Date().toISOString(), job.leaseId);
      return "SUCCEEDED";
    } catch (error) {
      this.queue.fail(
        job.id,
        error instanceof Error ? error.message : "KEEPER_FAILURE",
        null,
        job.leaseId,
      );
      return "FAILED";
    } finally {
      this.running = false;
    }
  }
  public health(): {
    readonly state: "OPERATIONAL" | "DEGRADED";
    readonly queued: number;
    readonly failed: number;
  } {
    const jobs = this.storage.list("jobs").map((record) => record.payload.status);
    return {
      state: jobs.includes("FAILED") ? "DEGRADED" : "OPERATIONAL",
      queued: jobs.filter((status) => status === "QUEUED").length,
      failed: jobs.filter((status) => status === "FAILED").length,
    };
  }
}

export interface ExecutionGateInput {
  readonly qualificationFresh: boolean;
  readonly marketState: "LIVE" | "PAUSED" | "CLOSE_ONLY" | "BLOCKED";
  readonly riskIncreasing: boolean;
  readonly oracleFresh: boolean;
  readonly oracleConfidenceBps: number;
  readonly requiredConfidenceBps: number;
  readonly oiAfter: bigint;
  readonly maxOI: bigint;
  readonly positionAfter: bigint;
  readonly maxPosition: bigint;
  readonly vaultCapacity: bigint;
  readonly insuranceHealthy: boolean;
  readonly marginSufficient: boolean;
  readonly expiry: string;
  readonly now: string;
}
export interface ExecutionGateResult {
  readonly decision: "ALLOW" | "REFUSE";
  readonly reasons: readonly string[];
}
export function executionGate(input: ExecutionGateInput): ExecutionGateResult {
  const reasons: string[] = [];
  if (input.riskIncreasing && !input.qualificationFresh) reasons.push("QUALIFICATION_STALE");
  if (input.riskIncreasing && input.marketState !== "LIVE")
    reasons.push(`MARKET_${input.marketState}_RISK_INCREASE_BLOCKED`);
  if (input.riskIncreasing && !input.oracleFresh) reasons.push("ORACLE_STALE");
  if (input.riskIncreasing && input.oracleConfidenceBps < input.requiredConfidenceBps)
    reasons.push("ORACLE_CONFIDENCE_INSUFFICIENT");
  if (input.riskIncreasing && input.oiAfter > input.maxOI) reasons.push("MAX_OI");
  if (input.riskIncreasing && input.positionAfter > input.maxPosition) reasons.push("MAX_POSITION");
  if (input.riskIncreasing && input.oiAfter > input.vaultCapacity)
    reasons.push("VAULT_CAPACITY");
  if (input.riskIncreasing && !input.insuranceHealthy) reasons.push("INSURANCE_DEGRADED");
  if (input.riskIncreasing && !input.marginSufficient) reasons.push("MARGIN_INSUFFICIENT");
  if (Date.parse(input.expiry) <= Date.parse(input.now)) reasons.push("ORDER_EXPIRED");
  return { decision: reasons.length === 0 ? "ALLOW" : "REFUSE", reasons };
}

export interface LPNavInput {
  readonly custodyUsdc: bigint;
  readonly pendingTraderLiabilityUsdc: bigint;
  readonly insuranceReserveUsdc: bigint;
  readonly badDebtUsdc: bigint;
  readonly totalShares: bigint;
}
export function conservativeLPNav(input: LPNavInput): {
  readonly navUsdc: bigint;
  readonly sharePriceWad: bigint;
  readonly withdrawableUsdc: bigint;
} {
  const reserved = input.pendingTraderLiabilityUsdc + input.insuranceReserveUsdc;
  const nav =
    input.custodyUsdc > reserved + input.badDebtUsdc
      ? input.custodyUsdc - reserved - input.badDebtUsdc
      : 0n;
  return {
    navUsdc: nav,
    sharePriceWad:
      input.totalShares === 0n
        ? 1_000_000_000_000_000_000n
        : (nav * 1_000_000_000_000_000_000n) / input.totalShares,
    withdrawableUsdc: nav,
  };
}

export interface ADLCandidate {
  readonly account: string;
  readonly positionId: string;
  readonly profitablePnlUsdc: bigint;
  readonly sizeUsdc: bigint;
  readonly leverageWad: bigint;
}
export function deterministicADL(
  candidates: readonly ADLCandidate[],
  requiredUsdc: bigint,
): readonly {
  readonly positionId: string;
  readonly account: string;
  readonly reductionUsdc: bigint;
}[] {
  if (requiredUsdc <= 0n) return [];
  const ordered = [...candidates]
    .filter((candidate) => candidate.sizeUsdc > 0n && candidate.profitablePnlUsdc > 0n)
    .sort((a, b) =>
      b.profitablePnlUsdc === a.profitablePnlUsdc
        ? a.positionId.localeCompare(b.positionId)
        : b.profitablePnlUsdc > a.profitablePnlUsdc
          ? 1
          : -1,
    );
  let remaining = requiredUsdc;
  const result: { positionId: string; account: string; reductionUsdc: bigint }[] = [];
  for (const candidate of ordered) {
    if (remaining === 0n) break;
    const reduction = candidate.sizeUsdc < remaining ? candidate.sizeUsdc : remaining;
    result.push({
      positionId: candidate.positionId,
      account: candidate.account,
      reductionUsdc: reduction,
    });
    remaining -= reduction;
  }
  return result;
}

export interface GovernanceOperation {
  readonly id: string;
  readonly kind:
    | "RISK_INCREASE"
    | "FEE_INCREASE"
    | "REPORTER_CHANGE"
    | "ROLE_CHANGE"
    | "INSURANCE_PARAMETER"
    | "LP_RISK_BUDGET";
  readonly eta: string;
  readonly executed: boolean;
}
export function governanceAllows(operation: GovernanceOperation, now: string): boolean {
  return !operation.executed && Date.parse(now) >= Date.parse(operation.eta);
}

export interface LPWithdrawalRequest {
  readonly id: string;
  readonly account: string;
  readonly shares: bigint;
  readonly requestedAt: string;
  readonly availableAt: string;
  readonly status: "QUEUED" | "CLAIMED" | "CANCELLED";
}

export interface LPShareState {
  readonly totalShares: bigint;
  readonly managedAssets: bigint;
  readonly pendingTraderLiability: bigint;
  readonly insuranceReserve: bigint;
  readonly badDebt: bigint;
}

/**
 * Durable model for the queued public-LP lifecycle. It mirrors the Solidity
 * boundary and deliberately prices shares from reserved-liability-adjusted NAV.
 */
export class PublicLPShareLedger {
  private readonly stateId = "PUBLIC_LP";
  public constructor(
    private readonly storage: PersistenceStore,
    private readonly cooldownMs = 86_400_000,
  ) {}

  public state(): LPShareState {
    const value = this.storage.get("vault_snapshots", this.stateId)?.payload;
    return value === undefined
      ? {
          totalShares: 0n,
          managedAssets: 0n,
          pendingTraderLiability: 0n,
          insuranceReserve: 0n,
          badDebt: 0n,
        }
      : {
          totalShares: persistedBigInt(value, "totalShares"),
          managedAssets: persistedBigInt(value, "managedAssets"),
          pendingTraderLiability: persistedBigInt(value, "pendingTraderLiability"),
          insuranceReserve: persistedBigInt(value, "insuranceReserve"),
          badDebt: persistedBigInt(value, "badDebt"),
        };
  }

  public deposit(account: string, assets: bigint, at: string): bigint {
    if (assets <= 0n) throw new Error("LP_INVALID_DEPOSIT");
    const current = this.state();
    const nav = conservativeLPNav({
      custodyUsdc: current.managedAssets,
      pendingTraderLiabilityUsdc: current.pendingTraderLiability,
      insuranceReserveUsdc: current.insuranceReserve,
      badDebtUsdc: current.badDebt,
      totalShares: current.totalShares,
    }).navUsdc;
    if (current.totalShares > 0n && nav === 0n) throw new Error("LP_ZERO_NAV");
    const shares = current.totalShares === 0n ? assets : (assets * current.totalShares) / nav;
    if (shares <= 0n) throw new Error("LP_DUST_DEPOSIT");
    this.saveState(
      {
        ...current,
        totalShares: current.totalShares + shares,
        managedAssets: current.managedAssets + assets,
      },
      at,
    );
    this.storage.put(
      "lp_withdrawals",
      `shares:${account.toLowerCase()}`,
      { account: account.toLowerCase(), shares: (this.accountShares(account) + shares).toString() },
      at,
    );
    return shares;
  }

  public requestWithdraw(account: string, shares: bigint, at: string): LPWithdrawalRequest {
    if (shares <= 0n || this.accountShares(account) < shares)
      throw new Error("LP_INSUFFICIENT_SHARES");
    const request: LPWithdrawalRequest = {
      id: `${account.toLowerCase()}:${at}`,
      account: account.toLowerCase(),
      shares,
      requestedAt: at,
      availableAt: new Date(Date.parse(at) + this.cooldownMs).toISOString(),
      status: "QUEUED",
    };
    this.storage.put(
      "lp_withdrawals",
      `request:${request.id}`,
      { ...request, shares: shares.toString() },
      at,
    );
    return request;
  }

  public claimWithdraw(requestId: string, at: string): bigint {
    const record = this.storage.get("lp_withdrawals", `request:${requestId}`)?.payload;
    if (record === undefined || record.status !== "QUEUED")
      throw new Error("LP_REQUEST_UNAVAILABLE");
    if (Date.parse(at) < Date.parse(String(record.availableAt))) throw new Error("LP_COOLDOWN");
    const shares = BigInt(String(record.shares));
    const current = this.state();
    const nav = conservativeLPNav({
      custodyUsdc: current.managedAssets,
      pendingTraderLiabilityUsdc: current.pendingTraderLiability,
      insuranceReserveUsdc: current.insuranceReserve,
      badDebtUsdc: current.badDebt,
      totalShares: current.totalShares,
    }).navUsdc;
    const assets = current.totalShares === 0n ? 0n : (shares * nav) / current.totalShares;
    if (assets <= 0n || assets > nav) throw new Error("LP_WITHDRAWAL_LIQUIDITY");
    const account = String(record.account);
    const accountShares = this.accountShares(account);
    if (accountShares < shares) throw new Error("LP_INSUFFICIENT_SHARES");
    this.saveState(
      {
        ...current,
        totalShares: current.totalShares - shares,
        managedAssets: current.managedAssets - assets,
      },
      at,
    );
    this.storage.put(
      "lp_withdrawals",
      `shares:${account}`,
      { account, shares: (accountShares - shares).toString() },
      at,
    );
    this.storage.put(
      "lp_withdrawals",
      `request:${requestId}`,
      { ...record, status: "CLAIMED" },
      at,
    );
    return assets;
  }

  private accountShares(account: string): bigint {
    const value = this.storage.get("lp_withdrawals", `shares:${account.toLowerCase()}`)?.payload
      .shares;
    return typeof value === "string" ? BigInt(value) : 0n;
  }
  private saveState(state: LPShareState, at: string): void {
    this.storage.put(
      "vault_snapshots",
      this.stateId,
      {
        totalShares: state.totalShares.toString(),
        managedAssets: state.managedAssets.toString(),
        pendingTraderLiability: state.pendingTraderLiability.toString(),
        insuranceReserve: state.insuranceReserve.toString(),
        badDebt: state.badDebt.toString(),
      },
      at,
    );
  }
}

export interface ProtocolTradingEvent {
  readonly eventId: string;
  readonly account: string;
  readonly marketId: string;
  readonly realizedPnlUsdc: bigint;
  readonly unrealizedPnlUsdc: bigint;
  readonly volumeUsdc: bigint;
  readonly feesUsdc: bigint;
  readonly fundingPaidUsdc: bigint;
  readonly fundingReceivedUsdc: bigint;
  readonly leverageWad: bigint;
  readonly closed: boolean;
  readonly liquidated: boolean;
  readonly observedAt: string;
}
export interface ProfileTradingStats {
  readonly account: string;
  readonly realizedPnlUsdc: bigint;
  readonly unrealizedPnlUsdc: bigint;
  readonly volumeUsdc: bigint;
  readonly feesUsdc: bigint;
  readonly fundingPaidUsdc: bigint;
  readonly fundingReceivedUsdc: bigint;
  readonly wins: number;
  readonly losses: number;
  readonly winRateBps: number;
  readonly liquidations: number;
  readonly averageLeverageWad: bigint;
  readonly marketsTraded: readonly string[];
}

export class ProfileAnalyticsProjector {
  public constructor(private readonly storage: PersistenceStore) {}
  public rebuild(account: string): ProfileTradingStats {
    const events = this.storage
      .list("protocol_events")
      .map((record) => record.payload as unknown as ProtocolTradingEvent)
      .filter(
        (event) =>
          typeof event.account === "string" &&
          event.account.toLowerCase() === account.toLowerCase(),
      );
    const realized = events.reduce((sum, event) => sum + BigInt(event.realizedPnlUsdc), 0n);
    const wins = events.filter((event) => event.closed && event.realizedPnlUsdc > 0n).length;
    const losses = events.filter((event) => event.closed && event.realizedPnlUsdc < 0n).length;
    const stats: ProfileTradingStats = {
      account: account.toLowerCase(),
      realizedPnlUsdc: realized,
      unrealizedPnlUsdc: events.reduce((sum, event) => sum + BigInt(event.unrealizedPnlUsdc), 0n),
      volumeUsdc: events.reduce((sum, event) => sum + BigInt(event.volumeUsdc), 0n),
      feesUsdc: events.reduce((sum, event) => sum + BigInt(event.feesUsdc), 0n),
      fundingPaidUsdc: events.reduce((sum, event) => sum + BigInt(event.fundingPaidUsdc), 0n),
      fundingReceivedUsdc: events.reduce(
        (sum, event) => sum + BigInt(event.fundingReceivedUsdc),
        0n,
      ),
      wins,
      losses,
      winRateBps: wins + losses === 0 ? 0 : Math.floor((wins * 10_000) / (wins + losses)),
      liquidations: events.filter((event) => event.liquidated).length,
      averageLeverageWad:
        events.length === 0
          ? 0n
          : events.reduce((sum, event) => sum + BigInt(event.leverageWad), 0n) /
            BigInt(events.length),
      marketsTraded: [...new Set(events.map((event) => event.marketId))].sort(),
    };
    this.storage.put(
      "wallet_analytics",
      stats.account,
      {
        schemaVersion: "profile-analytics/v1",
        ...stats,
        realizedPnlUsdc: stats.realizedPnlUsdc.toString(),
        unrealizedPnlUsdc: stats.unrealizedPnlUsdc.toString(),
        volumeUsdc: stats.volumeUsdc.toString(),
        feesUsdc: stats.feesUsdc.toString(),
        fundingPaidUsdc: stats.fundingPaidUsdc.toString(),
        fundingReceivedUsdc: stats.fundingReceivedUsdc.toString(),
        averageLeverageWad: stats.averageLeverageWad.toString(),
      },
      new Date().toISOString(),
    );
    return stats;
  }
}

export class DurableReconciliationEngine {
  public constructor(private readonly storage: PersistenceStore) {}
  public check(
    name: string,
    actual: bigint,
    expected: bigint,
    observedAt: string,
  ): "MATCH" | "CRITICAL" {
    if (actual === expected) return "MATCH";
    this.storage.put(
      "reconciliation_failures",
      `${name}:${observedAt}`,
      { name, actual: actual.toString(), expected: expected.toString(), severity: "CRITICAL" },
      observedAt,
    );
    return "CRITICAL";
  }
}

export interface FaultMutation {
  readonly name: string;
  readonly expectedKilled: boolean;
  readonly reason: string;
}
export function criticalMutationBank(): readonly FaultMutation[] {
  return [
    {
      name: "UNKNOWN_TO_PASS",
      expectedKilled: true,
      reason: "unknown evidence remains fail-closed",
    },
    {
      name: "UNAVAILABLE_TO_ZERO",
      expectedKilled: true,
      reason: "unavailable is not a numeric zero",
    },
    {
      name: "WRONG_CHAIN_ACCEPTED",
      expectedKilled: true,
      reason: "adapter validates configured chain",
    },
    {
      name: "STALE_ORACLE_ACCEPTED",
      expectedKilled: true,
      reason: "freshness is required for risk increase",
    },
    { name: "LP_UNKNOWN_TO_LOCKED", expectedKilled: true, reason: "LP control must be proven" },
    {
      name: "CORRELATED_SOURCES_COUNTED",
      expectedKilled: true,
      reason: "underlying source IDs are deduplicated",
    },
    {
      name: "QUALIFICATION_EXPIRY_DISABLED",
      expectedKilled: true,
      reason: "execution gate checks expiry",
    },
    { name: "RISK_REDUCTION_REVERSED", expectedKilled: true, reason: "emergency path is monotone" },
    {
      name: "OI_BOUNDARY_OFF_BY_ONE",
      expectedKilled: true,
      reason: "caps are checked with exact post-trade values",
    },
    {
      name: "DUPLICATE_KEEPER_EXECUTION",
      expectedKilled: true,
      reason: "durable job dedupe key is canonical",
    },
    {
      name: "PRETRADE_PLAN_MUTATED",
      expectedKilled: true,
      reason: "execution binds the plan hash",
    },
    {
      name: "DUPLICATE_EVENT",
      expectedKilled: true,
      reason: "canonical event IDs are idempotent",
    },
    {
      name: "WRONG_TOKEN_ACCEPTED",
      expectedKilled: true,
      reason: "provider observations bind the canonical token identity",
    },
    {
      name: "FUTURE_TIMESTAMP_ACCEPTED",
      expectedKilled: true,
      reason: "future-dated evidence is rejected",
    },
    {
      name: "SYSTEM_EXCLUSION_WIDENED",
      expectedKilled: true,
      reason: "only explicitly classified system addresses are excluded",
    },
    {
      name: "VENUE_DEPTH_FROM_TVL",
      expectedKilled: true,
      reason: "depth requires directional quote state",
    },
    {
      name: "REPORTER_SEQUENCE_ROLLBACK",
      expectedKilled: true,
      reason: "oracle sequences are monotonic and replay protected",
    },
    {
      name: "LP_NAV_STALE",
      expectedKilled: true,
      reason: "LP NAV reserves current trader liabilities before pricing",
    },
    {
      name: "LP_FIRST_DEPOSITOR_THEFT",
      expectedKilled: true,
      reason: "zero-NAV and share-rounding boundaries fail closed",
    },
    {
      name: "ADL_TARGET_ORDERING_ALTERED",
      expectedKilled: true,
      reason: "ADL candidate ordering is deterministic",
    },
    {
      name: "ADL_OVERREDUCTION",
      expectedKilled: true,
      reason: "ADL reduction is bounded by the episode deficit",
    },
    {
      name: "COMPETITION_SELF_REPORTED_SCORE",
      expectedKilled: true,
      reason: "competition scores rebuild from indexed protocol events",
    },
    {
      name: "COMPETITION_DEPOSIT_GAMING",
      expectedKilled: true,
      reason: "starting-equity and activity rules are deterministic",
    },
    {
      name: "TIMELOCK_BYPASS",
      expectedKilled: true,
      reason: "risk-increasing governance changes require queued execution",
    },
    {
      name: "GOVERNANCE_EMERGENCY_INCREASE",
      expectedKilled: true,
      reason: "emergency controls are monotone risk reductions",
    },
    {
      name: "CUSTODY_DELTA_UNCHECKED",
      expectedKilled: true,
      reason: "collateral state requires exact ERC-20 balance deltas",
    },
  ] as const;
}

function serializeBigints(value: HistoryObservation): Readonly<Record<string, unknown>> {
  return {
    ...value,
    priceUsdWad: value.priceUsdWad.toString(),
    liquidityUsdWad: value.liquidityUsdWad?.toString() ?? null,
    volumeUsdWad: value.volumeUsdWad?.toString() ?? null,
    depth1PctUsdWad: value.depth1PctUsdWad?.toString() ?? null,
  };
}
function deserializeHistory(value: Readonly<Record<string, unknown>>): HistoryObservation {
  const stringValue = (key: string): string | null =>
    typeof value[key] === "string" ? value[key] : null;
  const marketId = stringValue("marketId");
  const observedAt = stringValue("observedAt");
  const price = stringValue("priceUsdWad");
  if (marketId === null || observedAt === null || price === null)
    throw new Error("INVALID_HISTORY_POINT");
  return {
    marketId,
    observedAt,
    priceUsdWad: BigInt(price),
    liquidityUsdWad:
      stringValue("liquidityUsdWad") === null ? null : BigInt(stringValue("liquidityUsdWad")!),
    volumeUsdWad:
      stringValue("volumeUsdWad") === null ? null : BigInt(stringValue("volumeUsdWad")!),
    holderCount: typeof value.holderCount === "number" ? value.holderCount : null,
    depth1PctUsdWad:
      stringValue("depth1PctUsdWad") === null ? null : BigInt(stringValue("depth1PctUsdWad")!),
    clusterConcentrationBps:
      typeof value.clusterConcentrationBps === "number" ? value.clusterConcentrationBps : null,
    oracleStatus: typeof value.oracleStatus === "string" ? value.oracleStatus : "UNAVAILABLE",
    riskStatus: typeof value.riskStatus === "string" ? value.riskStatus : "UNKNOWN",
  };
}

function persistedBigInt(value: Readonly<Record<string, unknown>>, key: string): bigint {
  const item = value[key];
  if (item === undefined) return 0n;
  if (typeof item !== "string" || !/^[0-9]+$/.test(item))
    throw new Error(`INVALID_PERSISTED_BIGINT:${key}`);
  return BigInt(item);
}

export const BackendCompletionEvidenceSchema = z
  .object({
    schemaVersion: z.literal(BACKEND_COMPLETION_SCHEMA),
    sourceId: z.string().min(1),
    chain: z.string().min(1),
    observedAt: iso,
    fetchedAt: iso,
    status: z.enum(["AVAILABLE", "UNAVAILABLE", "ERROR"]),
    value: z.record(z.unknown()),
    evidenceHash: hexHash,
  })
  .strict();
