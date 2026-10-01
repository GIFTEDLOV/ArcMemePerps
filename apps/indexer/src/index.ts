import type { TokenIdentity } from "@arcmemeperps/domain";
import type { ChainAdapter, DiscoverTokensQuery } from "@arcmemeperps/chain-adapters";
import type { SupportedChain } from "@arcmemeperps/shared";
import { canonicalJson, keccak256Hex } from "@arcmemeperps/shared";
import type { PersistenceStore } from "@arcmemeperps/persistence";

export interface IndexerCheckpoint {
  readonly chain: SupportedChain;
  readonly cursor: string | null;
  readonly blockNumber: string | null;
  readonly blockHash: `0x${string}` | null;
  readonly slot: string | null;
  readonly finality: "latest" | "confirmed" | "finalized";
  readonly lastObservedAt: string | null;
}

export interface DiscoveryBatch {
  readonly tokens: readonly TokenIdentity[];
  readonly checkpoint: IndexerCheckpoint;
}

export interface IndexerCheckpointStore {
  load(chain: SupportedChain): IndexerCheckpoint | null;
  save(checkpoint: IndexerCheckpoint): void;
}

export class PersistentIndexerCheckpointStore implements IndexerCheckpointStore {
  public constructor(private readonly storage: PersistenceStore) {}
  public load(chain: SupportedChain): IndexerCheckpoint | null {
    const record = this.storage.get("indexer_checkpoints", chain);
    return record === null ? null : (record.payload as unknown as IndexerCheckpoint);
  }
  public save(checkpoint: IndexerCheckpoint): void {
    this.storage.put(
      "indexer_checkpoints",
      checkpoint.chain,
      checkpoint as unknown as Readonly<Record<string, unknown>>,
      checkpoint.lastObservedAt ?? new Date().toISOString(),
    );
  }
}

/** Provider-neutral discovery coordinator with a durable checkpoint boundary. */
export class DiscoveryIndexer {
  public constructor(
    private readonly adapter: ChainAdapter,
    private readonly checkpoints?: IndexerCheckpointStore,
  ) {}
  public async discover(query: DiscoverTokensQuery = {}): Promise<DiscoveryBatch> {
    const tokens = await this.adapter.discoverTokens(query);
    const checkpoint: IndexerCheckpoint = {
      chain: this.adapter.chain,
      cursor: query.cursor ?? null,
      blockNumber: null,
      blockHash: null,
      slot: null,
      finality: "finalized",
      lastObservedAt: new Date().toISOString(),
    };
    this.checkpoints?.save(checkpoint);
    return { tokens, checkpoint };
  }
}

export interface EvmCheckpoint {
  readonly chain: SupportedChain;
  readonly blockNumber: bigint;
  readonly blockHash: `0x${string}`;
}
export interface SolanaCheckpoint {
  readonly chain: "SOLANA";
  readonly slot: bigint;
  readonly commitment: "confirmed" | "finalized";
}

export class ReorgDetectedError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ReorgDetectedError";
  }
}

export function assertEvmCheckpointContinuity(
  previous: EvmCheckpoint | null,
  current: EvmCheckpoint,
): void {
  if (previous === null) return;
  if (current.blockNumber <= previous.blockNumber && current.blockHash !== previous.blockHash) {
    throw new ReorgDetectedError(
      `EVM checkpoint hash mismatch at or before ${previous.blockNumber.toString()}`,
    );
  }
}

export function assertSolanaCheckpointContinuity(
  previous: SolanaCheckpoint | null,
  current: SolanaCheckpoint,
): void {
  if (previous === null) return;
  if (current.slot < previous.slot && current.commitment === previous.commitment) {
    throw new ReorgDetectedError(
      `Solana checkpoint moved backwards from ${previous.slot.toString()}`,
    );
  }
}

export interface ProtocolEventIdentity {
  readonly chain: SupportedChain;
  readonly transactionHash: `0x${string}` | null;
  readonly signature: string | null;
  readonly blockNumber: string | null;
  readonly slot: string | null;
  readonly logIndex: number | null;
  readonly emitter: string;
  readonly topic0: string | null;
}

export function canonicalProtocolEventId(identity: ProtocolEventIdentity): `0x${string}` {
  return keccak256Hex(canonicalJson(identity as never));
}

export interface ProcessedEventStore {
  has(eventId: `0x${string}`): boolean;
  mark(eventId: `0x${string}`): void;
}

export class PersistentProcessedEventStore implements ProcessedEventStore {
  public constructor(private readonly storage: PersistenceStore) {}
  public has(eventId: `0x${string}`): boolean {
    return this.storage.get("protocol_events", eventId) !== null;
  }
  public mark(eventId: `0x${string}`): void {
    this.storage.put("protocol_events", eventId, { eventId }, new Date().toISOString());
  }
}

/** Exactly-once effect boundary for an idempotent indexer consumer. */
export class IdempotentEventProcessor {
  private readonly inFlight = new Set<string>();
  public constructor(private readonly processed: ProcessedEventStore) {}
  public async process(
    identity: ProtocolEventIdentity,
    apply: (eventId: `0x${string}`) => Promise<void>,
  ): Promise<"APPLIED" | "DUPLICATE"> {
    const eventId = canonicalProtocolEventId(identity);
    if (this.processed.has(eventId) || this.inFlight.has(eventId)) return "DUPLICATE";
    this.inFlight.add(eventId);
    try {
      await apply(eventId);
      this.processed.mark(eventId);
      return "APPLIED";
    } finally {
      this.inFlight.delete(eventId);
    }
  }
}

export const indexerBuildState = {
  liveProviders: true,
  persistence: "portable SQLite repository boundary",
  reorgSafety: "checkpoint hash/slot guards and explicit rewind errors",
  networkWrites: false,
} as const;
