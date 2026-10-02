import { createPublicClient, http, parseAbiItem, type PublicClient } from "viem";
import { bsc } from "viem/chains";
import {
  canonicalJson,
  keccak256Hex,
  marketIdForToken,
  normalizeTokenAddress,
  type SupportedChain,
} from "@arcmemeperps/shared";
import type { LifecycleStatus, TokenIdentity } from "@arcmemeperps/domain";

export interface DiscoveryEvidence {
  readonly evidenceId: string;
  readonly provider: string;
  readonly chain: SupportedChain;
  readonly tokenAddress: string;
  readonly stage: LifecycleStatus;
  readonly observedAt: string;
  readonly rawHash: `0x${string}`;
}

export interface DiscoveredMarketCandidate {
  readonly token: TokenIdentity;
  readonly evidence: readonly DiscoveryEvidence[];
  readonly status: "AVAILABLE" | "UNAVAILABLE";
  readonly reason: string | null;
}

export interface LaunchpadDiscoveryAdapter {
  readonly platform: string;
  readonly chain: SupportedChain;
  discover(cursor?: string): Promise<readonly DiscoveredMarketCandidate[]>;
  lifecycle(tokenAddress: string): Promise<readonly DiscoveryEvidence[]>;
}

export interface FourMemeTokenRecord {
  readonly tokenAddress: string;
  readonly creator: string | null;
  readonly symbol: string | null;
  readonly name: string | null;
  readonly decimals: number | null;
  readonly createdAt: string | null;
  readonly graduated: boolean;
  readonly poolAddress: string | null;
  readonly blockNumber: string | null;
  readonly transactionHash: `0x${string}` | null;
  readonly observedAt: string;
}

export interface FourMemeDiscoverySource {
  readonly provider: string;
  discoverTokens(cursor?: string): Promise<readonly FourMemeTokenRecord[]>;
  getToken(tokenAddress: string): Promise<FourMemeTokenRecord | null>;
}

export interface FourMemePublicApiOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly pageSize?: number;
}

/**
 * Read-only adapter for the documented Four.meme token-query API. The API is
 * treated as untrusted enrichment; explicit lifecycle fields are required and
 * market-cap/progress values are never used to infer graduation.
 */
export class FourMemePublicApiSource implements FourMemeDiscoverySource {
  public readonly provider = "four-meme-public-api";
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly pageSize: number;

  public constructor(options: FourMemePublicApiOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://four.meme/meme-api/v1").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.pageSize = Math.max(1, Math.min(100, options.pageSize ?? 50));
  }

  public async discoverTokens(cursor?: string): Promise<readonly FourMemeTokenRecord[]> {
    const pageIndex = parsePageCursor(cursor);
    const response = await this.fetchJson("/public/token/search", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        type: "NEW",
        listType: "NOR",
        pageIndex,
        pageSize: this.pageSize,
        status: "ALL",
        sort: "DESC",
      }),
    });
    const records = extractList(response).map((item) => normalizeApiRecord(item));
    return records.filter((record): record is FourMemeTokenRecord => record !== null);
  }

  public async getToken(tokenAddress: string): Promise<FourMemeTokenRecord | null> {
    const normalized = normalizeTokenAddress("BNB", tokenAddress);
    const response = await this.fetchJson(
      `/private/token/get/v2?address=${encodeURIComponent(normalized)}`,
      { method: "GET", headers: { accept: "application/json" } },
    );
    return normalizeApiRecord(extractData(response));
  }

  private async fetchJson(path: string, init: RequestInit): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    if (!response.ok) throw new Error(`FOUR_MEME_HTTP_${response.status}`);
    return (await response.json()) as unknown;
  }
}

export interface FourMemeOnchainOptions {
  readonly rpcUrl?: string;
  readonly client?: PublicClient;
  readonly fromBlock?: bigint;
  readonly lookbackBlocks?: bigint;
}

const FOUR_MEME_TOKEN_MANAGER_2 = "0x5c952063c7fc8610FFDB798152D69F0B9550762b" as const;
const FOUR_MEME_TOKEN_CREATE = parseAbiItem(
  "event TokenCreate(address creator, address token, uint256 requestId, string name, string symbol, uint256 totalSupply, uint256 launchTime, uint256 launchFee)",
);
const FOUR_MEME_LIQUIDITY_ADDED = parseAbiItem(
  "event LiquidityAdded(address base, uint256 offers, address quote, uint256 funds)",
);

/**
 * Read-only BSC event reader for the documented TokenManager2 V2 protocol.
 * The cursor is a block number, so a durable indexer can resume without
 * rescanning the chain. LiquidityAdded proves the protocol transition but does
 * not invent a pool address; DEX-live evidence must come from a pool reader.
 */
export class FourMemeOnchainSource implements FourMemeDiscoverySource {
  public readonly provider = "four-meme-token-manager2-rpc";
  private readonly client: PublicClient;
  private readonly fromBlock: bigint;
  private readonly lookbackBlocks: bigint;

  public constructor(options: FourMemeOnchainOptions) {
    if (options.client !== undefined) {
      this.client = options.client;
    } else if (options.rpcUrl !== undefined) {
      this.client = createPublicClient({ chain: bsc, transport: http(options.rpcUrl) });
    } else {
      throw new Error("Four.meme onchain source requires rpcUrl or client");
    }
    this.fromBlock = options.fromBlock ?? 0n;
    this.lookbackBlocks = options.lookbackBlocks ?? 100_000n;
  }

  public async discoverTokens(cursor?: string): Promise<readonly FourMemeTokenRecord[]> {
    const latest = await this.client.getBlockNumber();
    const start =
      cursor === undefined
        ? latest > this.lookbackBlocks
          ? latest - this.lookbackBlocks
          : this.fromBlock
        : parseBlockCursor(cursor);
    const fromBlock = start < this.fromBlock ? this.fromBlock : start;
    if (fromBlock > latest) return [];
    const [createLogs, liquidityLogs] = await Promise.all([
      this.client.getLogs({
        address: FOUR_MEME_TOKEN_MANAGER_2,
        event: FOUR_MEME_TOKEN_CREATE,
        fromBlock,
        toBlock: latest,
      }),
      this.client.getLogs({
        address: FOUR_MEME_TOKEN_MANAGER_2,
        event: FOUR_MEME_LIQUIDITY_ADDED,
        fromBlock,
        toBlock: latest,
      }),
    ]);
    const graduated = new Set(
      liquidityLogs.flatMap((log) => {
        const args = log.args as { readonly base?: unknown };
        return typeof args.base === "string" ? [args.base.toLowerCase()] : [];
      }),
    );
    const blockTimes = new Map<bigint, string>();
    for (const log of createLogs) {
      if (log.blockNumber !== undefined && !blockTimes.has(log.blockNumber)) {
        const block = await this.client.getBlock({ blockNumber: log.blockNumber });
        blockTimes.set(log.blockNumber, safeTimestamp(block.timestamp));
      }
    }
    return createLogs.flatMap((log) => {
      const args = log.args as {
        readonly creator?: unknown;
        readonly token?: unknown;
        readonly name?: unknown;
        readonly symbol?: unknown;
      };
      if (typeof args.token !== "string" || typeof args.creator !== "string") return [];
      const tokenAddress = normalizeTokenAddress("BNB", args.token);
      const observedAt =
        log.blockNumber === undefined
          ? new Date().toISOString()
          : (blockTimes.get(log.blockNumber) ?? new Date().toISOString());
      return [
        normalizeRecord({
          tokenAddress,
          creator: normalizeTokenAddress("BNB", args.creator),
          symbol: boundedText(args.symbol),
          name: boundedText(args.name),
          decimals: 18,
          createdAt: observedAt,
          graduated: graduated.has(tokenAddress),
          poolAddress: null,
          blockNumber: log.blockNumber?.toString() ?? null,
          transactionHash: log.transactionHash ?? null,
          observedAt,
        }),
      ];
    });
  }

  public async getToken(tokenAddress: string): Promise<FourMemeTokenRecord | null> {
    const normalized = normalizeTokenAddress("BNB", tokenAddress);
    const records = await this.discoverTokens();
    return records.find((record) => record.tokenAddress === normalized) ?? null;
  }
}

/** Converts a verified Four.meme source into canonical token/lifecycle evidence. */
export class FourMemeDiscoveryAdapter implements LaunchpadDiscoveryAdapter {
  public readonly platform = "FOUR_MEME";
  public readonly chain = "BNB" as const;

  public constructor(private readonly source: FourMemeDiscoverySource) {}

  public async discover(cursor?: string): Promise<readonly DiscoveredMarketCandidate[]> {
    const records = await this.source.discoverTokens(cursor);
    return records.flatMap((record) => {
      try {
        return [this.toCandidate(record)];
      } catch {
        return [];
      }
    });
  }

  public async lifecycle(tokenAddress: string): Promise<readonly DiscoveryEvidence[]> {
    const record = await this.source.getToken(normalizeTokenAddress("BNB", tokenAddress));
    if (record === null) return [];
    return this.evidenceFor(record);
  }

  private toCandidate(record: FourMemeTokenRecord): DiscoveredMarketCandidate {
    const tokenAddress = normalizeTokenAddress("BNB", record.tokenAddress);
    const token: TokenIdentity = {
      chain: "BNB",
      tokenAddress,
      symbol: record.symbol,
      name: record.name,
      decimals: record.decimals,
      deployer: record.creator,
      createdAt: record.createdAt,
      originPlatform: "FOUR_MEME_STYLE",
    };
    // Constructing this value validates canonical identity and rejects malformed
    // source addresses before they reach the market registry.
    marketIdForToken("BNB", tokenAddress);
    return { token, evidence: this.evidenceFor(record), status: "AVAILABLE", reason: null };
  }

  private evidenceFor(record: FourMemeTokenRecord): readonly DiscoveryEvidence[] {
    const tokenAddress = normalizeTokenAddress("BNB", record.tokenAddress);
    const base = {
      provider: this.source.provider,
      chain: "BNB" as const,
      tokenAddress,
      observedAt: record.observedAt,
      rawHash: keccak256Hex(
        canonicalJson({
          tokenAddress,
          creator: record.creator,
          symbol: record.symbol,
          name: record.name,
          createdAt: record.createdAt,
          graduated: record.graduated,
          poolAddress: record.poolAddress,
          blockNumber: record.blockNumber,
          transactionHash: record.transactionHash,
        }),
      ),
    };
    const stages: LifecycleStatus[] = ["DISCOVERED"];
    if (!record.graduated) stages.push("BONDING");
    if (record.graduated) stages.push("GRADUATED");
    if (record.poolAddress !== null) stages.push("DEX_LIVE");
    return stages.map((stage, index) => ({
      ...base,
      evidenceId: `${this.source.provider}:${tokenAddress}:${stage}:${index}`,
      stage,
    }));
  }
}

function extractData(input: unknown): unknown {
  if (!isRecord(input)) return null;
  return "data" in input ? input.data : input;
}

function extractList(input: unknown): readonly unknown[] {
  const data = extractData(input);
  if (Array.isArray(data)) return data;
  if (isRecord(data)) {
    for (const key of ["list", "tokens", "records", "rows"]) {
      const value = data[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function normalizeApiRecord(input: unknown): FourMemeTokenRecord | null {
  if (!isRecord(input)) return null;
  const address = firstString(input, ["tokenAddress", "token", "address"]);
  if (address === null) return null;
  try {
    const tokenAddress = normalizeTokenAddress("BNB", address);
    const status = firstString(input, ["lifecycle", "stage", "tokenStatus", "status"]);
    const graduated =
      input.isGraduated === true ||
      input.graduated === true ||
      ["GRADUATED", "DEX_LIVE", "DEX"].includes(status?.toUpperCase() ?? "");
    const observedAt = new Date().toISOString();
    return normalizeRecord({
      tokenAddress,
      creator: normalizeOptionalAddress(
        firstString(input, ["creator", "creatorAddress", "deployer"]),
      ),
      symbol: boundedText(firstString(input, ["symbol", "shortName"])),
      name: boundedText(firstString(input, ["name", "tokenName"])),
      decimals: boundedInteger(input.decimals),
      createdAt: normalizeOptionalTimestamp(
        input.createdAt ?? input.createTime ?? input.launchTime,
      ),
      graduated,
      poolAddress: normalizeOptionalAddress(
        firstString(input, ["poolAddress", "pairAddress", "pancakePair", "liquidityPool"]),
      ),
      blockNumber: firstString(input, ["blockNumber", "creationBlock"]),
      transactionHash: normalizeOptionalHash(
        firstString(input, ["transactionHash", "txHash", "hash"]),
      ),
      observedAt,
    });
  } catch {
    return null;
  }
}

function normalizeRecord(record: FourMemeTokenRecord): FourMemeTokenRecord {
  normalizeTokenAddress("BNB", record.tokenAddress);
  if (record.creator !== null) normalizeTokenAddress("BNB", record.creator);
  if (record.poolAddress !== null) normalizeTokenAddress("BNB", record.poolAddress);
  if (record.symbol !== null && record.symbol.length > 80) throw new Error("symbol too long");
  if (record.name !== null && record.name.length > 160) throw new Error("name too long");
  if (
    record.decimals !== null &&
    (!Number.isSafeInteger(record.decimals) || record.decimals < 0 || record.decimals > 255)
  )
    throw new Error("invalid decimals");
  return record;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(input: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) if (typeof input[key] === "string") return input[key];
  return null;
}

function boundedText(value: unknown): string | null {
  return typeof value === "string" && value.length <= 160 ? value : null;
}

function boundedInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function normalizeOptionalAddress(value: string | null): string | null {
  return value === null ? null : normalizeTokenAddress("BNB", value);
}

function normalizeOptionalHash(value: string | null): `0x${string}` | null {
  return value !== null && /^0x[0-9a-fA-F]{64}$/.test(value) ? (value as `0x${string}`) : null;
}

function normalizeOptionalTimestamp(value: unknown): string | null {
  if (typeof value === "number" || (typeof value === "string" && /^[0-9]+$/.test(value))) {
    const raw = BigInt(value);
    const milliseconds = raw > 100_000_000_000n ? raw : raw * 1_000n;
    if (milliseconds > 0n && milliseconds < 4_102_444_800_000n)
      return new Date(Number(milliseconds)).toISOString();
  }
  if (typeof value === "string" && !/^[0-9]+$/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function safeTimestamp(seconds: bigint): string {
  const milliseconds = seconds * 1_000n;
  if (milliseconds > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("block timestamp overflow");
  return new Date(Number(milliseconds)).toISOString();
}

function parsePageCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 1;
  if (!/^[1-9][0-9]*$/.test(cursor)) throw new Error("invalid Four.meme page cursor");
  return Math.min(Number(cursor), 1_000_000);
}

function parseBlockCursor(cursor: string): bigint {
  if (!/^[0-9]+$/.test(cursor)) throw new Error("invalid Four.meme block cursor");
  return BigInt(cursor);
}

export class UnavailableLaunchpadDiscovery implements LaunchpadDiscoveryAdapter {
  public constructor(
    public readonly platform: string,
    public readonly chain: SupportedChain,
    private readonly reason: string,
  ) {}
  public discover(): Promise<readonly DiscoveredMarketCandidate[]> {
    return Promise.resolve([]);
  }
  public lifecycle(tokenAddress: string): Promise<readonly DiscoveryEvidence[]> {
    void tokenAddress;
    return Promise.reject(new Error(`UNAVAILABLE:${this.platform}:${this.reason}`));
  }
}

/**
 * The generic adapter composes plugins; platform-specific lifecycle rules stay at the edge.
 * It does not infer stages from price, market cap, or a missing provider response.
 */
export class DiscoveryCoordinator {
  public constructor(private readonly adapters: readonly LaunchpadDiscoveryAdapter[]) {}
  public async discoverAll(
    cursorByPlatform: Readonly<Record<string, string | undefined>> = {},
  ): Promise<readonly DiscoveredMarketCandidate[]> {
    const batches = await Promise.all(
      this.adapters.map((adapter) => adapter.discover(cursorByPlatform[adapter.platform])),
    );
    return batches.flat();
  }
}

export const DISCOVERY_PLUGIN_CATALOG = {
  SOLANA: ["PUMP_FUN", "PUMPSWAP", "RAYDIUM", "METEORA"],
  BNB: ["FOUR_MEME", "PANCAKESWAP"],
  BASE: ["FLAUNCH", "UNISWAP", "AERODROME"],
  ETHEREUM: ["DIRECT_ERC20", "UNISWAP"],
  ARC: ["ARC_NATIVE", "UNISWAP_STYLE"],
  ROBINHOOD: ["DOCUMENTED_DEX_ONLY"],
} as const;
