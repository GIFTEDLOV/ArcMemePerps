import type { LifecycleStatus, TokenIdentity } from "@arcmemeperps/domain";
import type { SupportedChain } from "@arcmemeperps/shared";

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
