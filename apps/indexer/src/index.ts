import type { TokenIdentity } from "@arcmemeperps/domain";
import type { ChainAdapter, DiscoverTokensQuery } from "@arcmemeperps/chain-adapters";

export interface IndexerCheckpoint {
  readonly chain: ChainAdapter["chain"];
  readonly cursor: string | null;
  readonly lastObservedAt: string | null;
}

export interface DiscoveryBatch {
  readonly tokens: readonly TokenIdentity[];
  readonly checkpoint: IndexerCheckpoint;
}

/** Provider-neutral discovery coordinator. Persistence and scheduling are Gate 2 concerns. */
export class DiscoveryIndexer {
  public constructor(private readonly adapter: ChainAdapter) {}

  public async discover(query: DiscoverTokensQuery = {}): Promise<DiscoveryBatch> {
    const tokens = await this.adapter.discoverTokens(query);
    return {
      tokens,
      checkpoint: {
        chain: this.adapter.chain,
        cursor: query.cursor ?? null,
        lastObservedAt: tokens.length > 0 ? new Date(0).toISOString() : null,
      },
    };
  }
}

export const indexerBuildState = {
  liveProviders: false,
  persistence: "not installed in Gate 1",
  networkWrites: false,
} as const;
