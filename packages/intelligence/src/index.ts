import type { WalletSnapshot } from "@arcmemeperps/domain";

export type AddressClassification =
  "LP" | "BURN" | "DEX" | "BRIDGE" | "SYSTEM" | "CEX" | "KNOWN_PROTOCOL" | "UNKNOWN";
export type LiquiditySecurityStatus =
  "LOCKED" | "BURNED" | "PROTOCOL_CONTROLLED" | "WITHDRAWABLE" | "UNKNOWN";

export interface LiquidityControlObservation {
  readonly venue: string;
  readonly model: "V2_LP_TOKEN" | "V3_POSITION_NFT" | "SOLANA_PROTOCOL" | "SOLANA_AMM";
  readonly status: LiquiditySecurityStatus;
  readonly controller: string | null;
  readonly unlockAt: string | null;
  readonly evidenceIds: readonly string[];
  readonly reasonCodes: readonly string[];
}

export interface LiquiditySecurityAssessment {
  readonly status: LiquiditySecurityStatus;
  readonly venues: readonly LiquidityControlObservation[];
  readonly unknownVenues: readonly string[];
  readonly reasonCodes: readonly string[];
}

export function assessLiquiditySecurity(
  observations: readonly LiquidityControlObservation[],
): LiquiditySecurityAssessment {
  if (observations.length === 0)
    return {
      status: "UNKNOWN",
      venues: [],
      unknownVenues: [],
      reasonCodes: ["NO_LIQUIDITY_CONTROL_EVIDENCE"],
    };
  const valid = observations.filter((item) => item.evidenceIds.length > 0);
  const unknownVenues = observations
    .filter((item) => item.status === "UNKNOWN" || item.evidenceIds.length === 0)
    .map((item) => item.venue);
  if (observations.some((item) => item.status === "WITHDRAWABLE"))
    return {
      status: "WITHDRAWABLE",
      venues: observations,
      unknownVenues,
      reasonCodes: ["WITHDRAWABLE_LIQUIDITY_PRESENT"],
    };
  if (valid.length !== observations.length)
    return {
      status: "UNKNOWN",
      venues: observations,
      unknownVenues,
      reasonCodes: ["INSUFFICIENT_LIQUIDITY_CONTROL_EVIDENCE"],
    };
  const statuses = new Set(valid.map((item) => item.status));
  if (statuses.size !== 1)
    return {
      status: "UNKNOWN",
      venues: observations,
      unknownVenues,
      reasonCodes: ["MIXED_LIQUIDITY_CONTROL"],
    };
  const status = valid[0]!.status;
  return { status, venues: observations, unknownVenues, reasonCodes: [] };
}

export interface HolderGraphNode {
  readonly address: string;
  readonly shareBps: number;
  readonly classification: AddressClassification;
  readonly clusterId: string | null;
  readonly evidenceIds: readonly string[];
}

export interface HolderGraphAnalysis {
  readonly largestHolderBps: number | null;
  readonly largestNonSystemHolderBps: number | null;
  readonly top10NonSystemBps: number | null;
  readonly largestConnectedClusterBps: number | null;
  readonly clusterCount: number;
  readonly includedUnknownCount: number;
  readonly exclusions: readonly {
    readonly address: string;
    readonly classification: AddressClassification;
    readonly evidenceIds: readonly string[];
  }[];
}

/** Unknown wallets remain in concentration totals. Exclusion requires classification evidence. */
export function analyzeHolderGraph(nodes: readonly HolderGraphNode[]): HolderGraphAnalysis {
  const unique = new Map<string, HolderGraphNode>();
  for (const node of nodes) {
    if (!Number.isInteger(node.shareBps) || node.shareBps < 0 || node.shareBps > 10_000)
      throw new Error("invalid holder share");
    const key = node.address.toLowerCase();
    const old = unique.get(key);
    if (old === undefined || node.shareBps > old.shareBps) unique.set(key, node);
  }
  const all = [...unique.values()];
  const excluded = all.filter(
    (node) => node.classification !== "UNKNOWN" && node.evidenceIds.length > 0,
  );
  const included = all.filter((node) => !excluded.includes(node));
  const sorted = [...included].sort((left, right) => right.shareBps - left.shareBps);
  const clusters = new Map<string, number>();
  for (const node of included)
    if (node.clusterId !== null)
      clusters.set(node.clusterId, (clusters.get(node.clusterId) ?? 0) + node.shareBps);
  return {
    largestHolderBps: sorted[0]?.shareBps ?? null,
    largestNonSystemHolderBps:
      sorted.find((node) => node.classification === "UNKNOWN")?.shareBps ?? null,
    top10NonSystemBps: sorted.slice(0, 10).reduce((sum, node) => sum + node.shareBps, 0),
    largestConnectedClusterBps: clusters.size === 0 ? null : Math.max(...clusters.values()),
    clusterCount: clusters.size,
    includedUnknownCount: included.filter((node) => node.classification === "UNKNOWN").length,
    exclusions: excluded.map((node) => ({
      address: node.address,
      classification: node.classification,
      evidenceIds: node.evidenceIds,
    })),
  };
}

export interface FundingEdge {
  readonly from: string;
  readonly to: string;
  readonly amountUsdc: bigint;
  readonly observedAt: string;
  readonly evidenceIds: readonly string[];
}

export interface FundingGraphEvidence {
  readonly roots: readonly string[];
  readonly maxDepth: number;
  readonly visitedWallets: readonly string[];
  readonly edges: readonly FundingEdge[];
  readonly reasonCodes: readonly string[];
  readonly status: "AVAILABLE" | "INSUFFICIENT_DATA";
}

export function buildFundingGraphEvidence(
  roots: readonly string[],
  edges: readonly FundingEdge[],
  maxDepth = 2,
): FundingGraphEvidence {
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 5)
    throw new Error("funding graph depth must be between 0 and 5");
  const normalizedRoots = [...new Set(roots.map((root) => root.toLowerCase()))];
  const frontier = new Set(normalizedRoots);
  const visited = new Set(normalizedRoots);
  const selected: FundingEdge[] = [];
  for (let depth = 0; depth < maxDepth && frontier.size > 0; depth += 1) {
    const next = new Set<string>();
    for (const edge of edges) {
      const from = edge.from.toLowerCase();
      const to = edge.to.toLowerCase();
      if (!frontier.has(from) || edge.amountUsdc < 0n) continue;
      if (edge.evidenceIds.length === 0) continue;
      selected.push({ ...edge, from, to });
      if (!visited.has(to)) {
        visited.add(to);
        next.add(to);
      }
    }
    frontier.clear();
    for (const wallet of next) frontier.add(wallet);
  }
  return {
    roots: normalizedRoots,
    maxDepth,
    visitedWallets: [...visited].sort(),
    edges: selected,
    reasonCodes: selected.length === 0 ? ["NO_FUNDED_RELATIONSHIP_EVIDENCE"] : [],
    status: edges.length === 0 ? "INSUFFICIENT_DATA" : "AVAILABLE",
  };
}

export interface BuyerObservation {
  readonly wallet: string;
  readonly timestamp: string;
  readonly amountBps: number | null;
  readonly slotOrBlock: string | null;
  readonly fundingSource: string | null;
  readonly walletAgeDays: number | null;
  readonly exitObserved: boolean | null;
  readonly evidenceIds: readonly string[];
}

export interface FirstBuyerAnalysis {
  readonly firstBuyers: readonly BuyerObservation[];
  readonly signals: readonly {
    readonly wallet: string;
    readonly classifications: readonly (
      "EARLY_BUYER" | "SNIPER_SIGNAL" | "BUNDLED_SIGNAL" | "INSIDER_SIGNAL" | "UNKNOWN"
    )[];
    readonly reasonCodes: readonly string[];
  }[];
  readonly status: "AVAILABLE" | "INSUFFICIENT_DATA";
}

export function analyzeFirstBuyers(
  launchAt: string | null,
  buyers: readonly BuyerObservation[],
  firstN = 20,
): FirstBuyerAnalysis {
  if (launchAt === null || buyers.length === 0)
    return { firstBuyers: [], signals: [], status: "INSUFFICIENT_DATA" };
  const launchMs = Date.parse(launchAt);
  const selected = [...buyers]
    .filter((buyer) => buyer.evidenceIds.length > 0)
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
    .slice(0, firstN);
  return {
    firstBuyers: selected,
    signals: selected.map((buyer) => {
      const classifications: (
        "EARLY_BUYER" | "SNIPER_SIGNAL" | "BUNDLED_SIGNAL" | "INSIDER_SIGNAL" | "UNKNOWN"
      )[] = ["EARLY_BUYER"];
      const reasons: string[] = [];
      if (Date.parse(buyer.timestamp) - launchMs <= 30_000) {
        classifications.push("SNIPER_SIGNAL");
        reasons.push("buy_within_30_seconds_of_launch");
      }
      if (
        buyer.slotOrBlock !== null &&
        selected.filter((item) => item.slotOrBlock === buyer.slotOrBlock).length > 1
      ) {
        classifications.push("BUNDLED_SIGNAL");
        reasons.push("same_block_or_slot_buyers");
      }
      if (
        buyer.fundingSource !== null &&
        selected.some(
          (item) => item.fundingSource === buyer.fundingSource && item.wallet !== buyer.wallet,
        )
      ) {
        classifications.push("INSIDER_SIGNAL");
        reasons.push("shared_funding_source");
      }
      return { wallet: buyer.wallet, classifications, reasonCodes: reasons };
    }),
    status: selected.length === 0 ? "INSUFFICIENT_DATA" : "AVAILABLE",
  };
}

export interface DeployerProfile {
  readonly deployer: string;
  readonly tokensCreated: number;
  readonly surviving7d: number;
  readonly surviving30d: number;
  readonly liquidityRemovalIncidents: number;
  readonly mintAdminIncidents: number;
  readonly associatedWallets: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly reasonCodes: readonly string[];
}

export interface DeployerTokenOutcome {
  readonly token: string;
  readonly createdAt: string;
  readonly observedAt: string;
  readonly survived7d: boolean | null;
  readonly survived30d: boolean | null;
  readonly liquidityRemoved: boolean | null;
  readonly mintAdminIncident: boolean | null;
  readonly associatedWallets: readonly string[];
  readonly evidenceIds: readonly string[];
}

export function buildDeployerProfile(
  deployer: string,
  outcomes: readonly DeployerTokenOutcome[],
): DeployerProfile {
  const usable = outcomes.filter((outcome) => outcome.evidenceIds.length > 0);
  return {
    deployer,
    tokensCreated: usable.length,
    surviving7d: usable.filter((item) => item.survived7d === true).length,
    surviving30d: usable.filter((item) => item.survived30d === true).length,
    liquidityRemovalIncidents: usable.filter((item) => item.liquidityRemoved === true).length,
    mintAdminIncidents: usable.filter((item) => item.mintAdminIncident === true).length,
    associatedWallets: [
      ...new Set(
        usable.flatMap((item) => item.associatedWallets.map((wallet) => wallet.toLowerCase())),
      ),
    ].sort(),
    evidenceIds: [...new Set(usable.flatMap((item) => item.evidenceIds))].sort(),
    reasonCodes: usable.length === 0 ? ["INSUFFICIENT_DEPLOYER_HISTORY"] : [],
  };
}

export type WashFarmVerdict = "CLEAR" | "SUSPICIOUS" | "HIGH_RISK" | "INSUFFICIENT_DATA";
export interface WashTrade {
  readonly wallet: string;
  readonly side: "BUY" | "SELL";
  readonly amountUsdWad: bigint;
  readonly timestamp: string;
  readonly fundingSource: string | null;
  readonly evidenceIds: readonly string[];
}
export interface WashFarmAnalysis {
  readonly verdict: WashFarmVerdict;
  readonly features: Readonly<Record<string, string | number>>;
  readonly reasons: readonly string[];
}

export function analyzeWashFarmV2(
  trades: readonly WashTrade[],
  liquidityUsdWad: bigint | null,
  holderGrowthBps: number | null,
): WashFarmAnalysis {
  const usable = trades.filter((trade) => trade.amountUsdWad > 0n && trade.evidenceIds.length > 0);
  if (usable.length < 3)
    return {
      verdict: "INSUFFICIENT_DATA",
      features: { tradeCount: usable.length },
      reasons: ["fewer_than_three_evidenced_trades"],
    };
  const wallets = new Set(usable.map((trade) => trade.wallet.toLowerCase()));
  const sizes = new Map<string, number>();
  for (const trade of usable)
    sizes.set(trade.amountUsdWad.toString(), (sizes.get(trade.amountUsdWad.toString()) ?? 0) + 1);
  const repeatedSizes =
    [...sizes.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0) /
    usable.length;
  const buyVolume = usable
    .filter((trade) => trade.side === "BUY")
    .reduce((sum, trade) => sum + trade.amountUsdWad, 0n);
  const sellVolume = usable
    .filter((trade) => trade.side === "SELL")
    .reduce((sum, trade) => sum + trade.amountUsdWad, 0n);
  const roundTripWallets = [...wallets].filter(
    (wallet) =>
      usable.some((trade) => trade.wallet.toLowerCase() === wallet && trade.side === "BUY") &&
      usable.some((trade) => trade.wallet.toLowerCase() === wallet && trade.side === "SELL"),
  ).length;
  const volume = buyVolume + sellVolume;
  const volumeLiquidity =
    liquidityUsdWad === null || liquidityUsdWad === 0n
      ? null
      : Number((volume * 100n) / liquidityUsdWad) / 100;
  const reasons: string[] = [];
  if (repeatedSizes >= 0.5) reasons.push("repeated_trade_sizes");
  if (wallets.size <= 2) reasons.push("low_unique_trader_count");
  if (roundTripWallets / wallets.size >= 0.5) reasons.push("round_trip_wallet_reuse");
  if (volumeLiquidity !== null && volumeLiquidity > 10)
    reasons.push("volume_to_liquidity_ratio_high");
  if (
    holderGrowthBps !== null &&
    holderGrowthBps < 50 &&
    volumeLiquidity !== null &&
    volumeLiquidity > 5
  )
    reasons.push("volume_without_holder_growth");
  const severe = repeatedSizes >= 0.8 || wallets.size === 1 || roundTripWallets === wallets.size;
  return {
    verdict: severe ? "HIGH_RISK" : reasons.length > 0 ? "SUSPICIOUS" : "CLEAR",
    features: {
      uniqueTraders: wallets.size,
      grossVolumeUsdWad: volume.toString(),
      estimatedNetFlowUsdWad: (buyVolume - sellVolume).toString(),
      repeatedSizeRatio: repeatedSizes,
      roundTripWallets,
      volumeLiquidityRatio: volumeLiquidity ?? "UNAVAILABLE",
    },
    reasons,
  };
}

export interface WalletTrade {
  readonly marketId: string;
  readonly side: "BUY" | "SELL";
  readonly notionalUsdWad: bigint;
  readonly realizedPnlUsdWad: bigint;
  readonly openedAt: string;
  readonly closedAt: string | null;
  readonly evidenceIds: readonly string[];
}
export function buildWalletSnapshot(
  wallet: string,
  trades: readonly WalletTrade[],
  observedAt: string,
): WalletSnapshot {
  const usable = trades.filter((trade) => trade.evidenceIds.length > 0);
  const realized = usable.reduce((sum, trade) => sum + trade.realizedPnlUsdWad, 0n);
  const volume = usable.reduce((sum, trade) => sum + trade.notionalUsdWad, 0n);
  const wins = usable.filter((trade) => trade.realizedPnlUsdWad > 0n).length;
  const losses = usable.filter((trade) => trade.realizedPnlUsdWad < 0n).length;
  const holds = usable
    .filter((trade) => trade.closedAt !== null)
    .map((trade) => Math.max(0, Date.parse(trade.closedAt!) - Date.parse(trade.openedAt)) / 1000);
  return {
    schemaVersion: "wallet-snapshot/v1",
    wallet,
    observedAt,
    realizedPnlUsdWad: realized.toString(),
    unrealizedPnlUsdWad: "0",
    volumeUsdWad: volume.toString(),
    winCount: wins,
    lossCount: losses,
    averageHoldSeconds:
      holds.length === 0
        ? null
        : Math.round(holds.reduce((sum, value) => sum + value, 0) / holds.length),
    drawdownBps: 0,
    marketsTraded: [...new Set(usable.map((trade) => trade.marketId))],
    evidenceIds: [...new Set(usable.flatMap((trade) => trade.evidenceIds))],
  };
}

export interface TrackedWalletEvent {
  readonly wallet: string;
  readonly type:
    | "BUY"
    | "SELL"
    | "POSITION_INCREASE"
    | "POSITION_DECREASE"
    | "FULL_EXIT"
    | "TOKEN_LAUNCH"
    | "LARGE_TRANSFER";
  readonly marketId: string | null;
  readonly observedAt: string;
  readonly evidenceIds: readonly string[];
}
export class TrackedWalletRegistry {
  private readonly wallets = new Set<string>();
  public track(wallet: string): void {
    this.wallets.add(wallet.toLowerCase());
  }
  public untrack(wallet: string): void {
    this.wallets.delete(wallet.toLowerCase());
  }
  public isTracked(wallet: string): boolean {
    return this.wallets.has(wallet.toLowerCase());
  }
  public list(): readonly string[] {
    return [...this.wallets].sort();
  }
}

export interface TrendingInput {
  readonly marketId: string;
  readonly volumeAccelerationBps: number;
  readonly liquidityGrowthBps: number;
  readonly holderGrowthBps: number;
  readonly traderGrowthBps: number;
  readonly walletQualityBps: number;
  readonly graduation: boolean;
  readonly ageHours: number;
  readonly riskDegradationBps: number;
}
export interface TrendingSignal {
  readonly marketId: string;
  readonly scoreBps: number;
  readonly reasonCodes: readonly string[];
  readonly safetyIndependent: true;
}
export function rankTrending(inputs: readonly TrendingInput[]): readonly TrendingSignal[] {
  return inputs
    .map((item) => {
      const score = Math.max(
        0,
        Math.min(
          10_000,
          Math.round(
            item.volumeAccelerationBps * 0.2 +
              item.liquidityGrowthBps * 0.2 +
              item.holderGrowthBps * 0.2 +
              item.traderGrowthBps * 0.15 +
              item.walletQualityBps * 0.15 +
              (item.graduation ? 500 : 0) -
              Math.min(1_000, item.riskDegradationBps),
          ),
        ),
      );
      return {
        marketId: item.marketId,
        scoreBps: score,
        reasonCodes: [
          item.graduation ? "GRADUATION" : "MOMENTUM",
          item.riskDegradationBps > 500 ? "RISK_DEGRADATION_PENALTY" : "RISK_STABLE",
        ],
        safetyIndependent: true as const,
      };
    })
    .sort((left, right) => right.scoreBps - left.scoreBps);
}

export interface CompetitionRuleSet {
  readonly scoring: "RISK_ADJUSTED_RETURN";
  readonly maxDrawdownPenaltyBps: number;
  readonly liquidationPenaltyBps: number;
  readonly minimumTrades: number;
}
export interface CompetitionEntry {
  readonly account: string;
  readonly realizedPnlUsdWad: bigint;
  readonly startingEquityUsdWad: bigint;
  readonly maxDrawdownBps: number;
  readonly liquidations: number;
  readonly tradeCount: number;
  readonly selfOffsetSignals: number;
  readonly snapshotEventIds: readonly string[];
}
export interface CompetitionScoreResult {
  readonly account: string;
  readonly scoreWad: bigint;
  readonly status: "VALID" | "SUSPICIOUS" | "DISQUALIFIED" | "UNDER_REVIEW";
  readonly reasonCodes: readonly string[];
}
export function scoreCompetition(
  entry: CompetitionEntry,
  rules: CompetitionRuleSet,
): CompetitionScoreResult {
  if (entry.startingEquityUsdWad <= 0n)
    return {
      account: entry.account,
      scoreWad: 0n,
      status: "DISQUALIFIED",
      reasonCodes: ["INVALID_STARTING_EQUITY"],
    };
  if (entry.tradeCount < rules.minimumTrades)
    return {
      account: entry.account,
      scoreWad: 0n,
      status: "UNDER_REVIEW",
      reasonCodes: ["MINIMUM_ACTIVITY_NOT_MET"],
    };
  if (entry.snapshotEventIds.length === 0)
    return {
      account: entry.account,
      scoreWad: 0n,
      status: "DISQUALIFIED",
      reasonCodes: ["NO_VERIFIED_EVENTS"],
    };
  const returnWad =
    (entry.realizedPnlUsdWad * 1_000_000_000_000_000_000n) / entry.startingEquityUsdWad;
  const drawdownPenalty =
    (returnWad * BigInt(Math.min(rules.maxDrawdownPenaltyBps, entry.maxDrawdownBps))) / 10_000n;
  const liquidationPenalty =
    (returnWad * BigInt(Math.min(10_000, entry.liquidations * rules.liquidationPenaltyBps))) /
    10_000n;
  const score = returnWad - drawdownPenalty - liquidationPenalty;
  const suspicious = entry.selfOffsetSignals > 0;
  return {
    account: entry.account,
    scoreWad: score,
    status: suspicious ? "UNDER_REVIEW" : "VALID",
    reasonCodes: suspicious ? ["SELF_OFFSET_SIGNAL"] : [],
  };
}
