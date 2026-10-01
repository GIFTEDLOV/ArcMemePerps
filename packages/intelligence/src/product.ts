import { recoverMessageAddress } from "viem";
import {
  NotificationEventSchema,
  type NotificationEvent,
  type UserProfile,
} from "@arcmemeperps/domain";
import { canonicalJson, keccak256Hex, type Hex } from "@arcmemeperps/shared";

export interface ProfileAuthorization {
  readonly wallet: string;
  readonly nonce: string;
  readonly action: "PROFILE_UPDATE" | "WATCHLIST_UPDATE";
  readonly payloadHash: Hex;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly signature: Hex;
}

export function profileAuthorizationMessage(
  input: Omit<ProfileAuthorization, "signature">,
): string {
  return canonicalJson({
    domain: "ArcMemePerps",
    version: "1",
    wallet: input.wallet.toLowerCase(),
    nonce: input.nonce,
    action: input.action,
    payloadHash: input.payloadHash,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });
}

export async function verifyProfileAuthorization(
  input: ProfileAuthorization,
  now = new Date(),
): Promise<boolean> {
  if (Date.parse(input.expiresAt) <= now.getTime() || Date.parse(input.issuedAt) > now.getTime())
    return false;
  try {
    const recovered = await recoverMessageAddress({
      message: profileAuthorizationMessage(input),
      signature: input.signature,
    });
    return recovered.toLowerCase() === input.wallet.toLowerCase();
  } catch {
    return false;
  }
}

export interface ProfileMutation {
  readonly profile: UserProfile;
  readonly authorization: ProfileAuthorization;
}

export async function authorizeProfileMutation(
  mutation: ProfileMutation,
  now = new Date(),
): Promise<UserProfile> {
  const payloadHash = keccak256Hex(canonicalJson(mutation.profile as never));
  if (payloadHash.toLowerCase() !== mutation.authorization.payloadHash.toLowerCase())
    throw new Error("PROFILE_PAYLOAD_HASH_MISMATCH");
  if (!(await verifyProfileAuthorization(mutation.authorization, now)))
    throw new Error("PROFILE_SIGNATURE_INVALID");
  if (mutation.profile.primaryWallet.toLowerCase() !== mutation.authorization.wallet.toLowerCase())
    throw new Error("PROFILE_WALLET_MISMATCH");
  return {
    ...mutation.profile,
    authorization: {
      method: "WALLET_SIGNATURE",
      authorizationHash: payloadHash,
      authorizedAt: now.toISOString(),
    },
  };
}

export interface VerifiedWalletTrade {
  readonly eventId: string;
  readonly wallet: string;
  readonly marketId: Hex;
  readonly side: "LONG" | "SHORT";
  readonly action: "OPEN" | "INCREASE" | "DECREASE" | "CLOSE" | "LIQUIDATION";
  readonly sizeUsdWad: bigint;
  readonly realizedPnlUsdWad: bigint;
  readonly feeUsdWad: bigint;
  readonly fundingPaidUsdWad: bigint;
  readonly fundingReceivedUsdWad: bigint;
  readonly leverageWad: bigint;
  readonly openedAt: string;
  readonly closedAt: string | null;
}

export interface CompleteWalletIntelligence {
  readonly wallet: string;
  readonly realizedPnlUsdWad: bigint;
  readonly unrealizedPnlUsdWad: bigint;
  readonly roiBps: bigint;
  readonly volumeUsdWad: bigint;
  readonly feesUsdWad: bigint;
  readonly fundingPaidUsdWad: bigint;
  readonly fundingReceivedUsdWad: bigint;
  readonly wins: number;
  readonly losses: number;
  readonly winRateBps: number;
  readonly averageHoldSeconds: number | null;
  readonly maxDrawdownBps: number;
  readonly liquidations: number;
  readonly marketsTraded: readonly Hex[];
  readonly longVolumeUsdWad: bigint;
  readonly shortVolumeUsdWad: bigint;
  readonly evidenceEventIds: readonly string[];
}

export function buildWalletIntelligence(
  wallet: string,
  trades: readonly VerifiedWalletTrade[],
  startingEquityUsdWad: bigint,
  currentUnrealizedPnlUsdWad = 0n,
): CompleteWalletIntelligence {
  if (startingEquityUsdWad <= 0n) throw new Error("STARTING_EQUITY_REQUIRED");
  const realized = trades.reduce((sum, trade) => sum + trade.realizedPnlUsdWad, 0n);
  const volume = trades.reduce((sum, trade) => sum + trade.sizeUsdWad, 0n);
  const fees = trades.reduce((sum, trade) => sum + trade.feeUsdWad, 0n);
  const paid = trades.reduce((sum, trade) => sum + trade.fundingPaidUsdWad, 0n);
  const received = trades.reduce((sum, trade) => sum + trade.fundingReceivedUsdWad, 0n);
  const wins = trades.filter((trade) => trade.realizedPnlUsdWad > 0n).length;
  const losses = trades.filter((trade) => trade.realizedPnlUsdWad < 0n).length;
  const holds = trades.flatMap((trade) =>
    trade.closedAt === null
      ? []
      : [Math.max(0, (Date.parse(trade.closedAt) - Date.parse(trade.openedAt)) / 1_000)],
  );
  const drawdown = calculateDrawdownBps(trades, startingEquityUsdWad);
  return {
    wallet,
    realizedPnlUsdWad: realized,
    unrealizedPnlUsdWad: currentUnrealizedPnlUsdWad,
    roiBps: (realized * 10_000n) / startingEquityUsdWad,
    volumeUsdWad: volume,
    feesUsdWad: fees,
    fundingPaidUsdWad: paid,
    fundingReceivedUsdWad: received,
    wins,
    losses,
    winRateBps: wins + losses === 0 ? 0 : Math.floor((wins * 10_000) / (wins + losses)),
    averageHoldSeconds:
      holds.length === 0
        ? null
        : Math.round(holds.reduce((sum, item) => sum + item, 0) / holds.length),
    maxDrawdownBps: drawdown,
    liquidations: trades.filter((trade) => trade.action === "LIQUIDATION").length,
    marketsTraded: [...new Set(trades.map((trade) => trade.marketId))],
    longVolumeUsdWad: trades
      .filter((trade) => trade.side === "LONG")
      .reduce((sum, trade) => sum + trade.sizeUsdWad, 0n),
    shortVolumeUsdWad: trades
      .filter((trade) => trade.side === "SHORT")
      .reduce((sum, trade) => sum + trade.sizeUsdWad, 0n),
    evidenceEventIds: trades.map((trade) => trade.eventId),
  };
}

export interface WatchlistState {
  readonly wallet: string;
  readonly marketIds: readonly Hex[];
  readonly wallets: readonly string[];
  readonly updatedAt: string;
}

export function updateWatchlist(
  current: WatchlistState,
  update: {
    readonly addMarkets?: readonly Hex[];
    readonly removeMarkets?: readonly Hex[];
    readonly addWallets?: readonly string[];
    readonly removeWallets?: readonly string[];
    readonly updatedAt: string;
  },
): WatchlistState {
  const removedMarkets = new Set(update.removeMarkets ?? []);
  const removedWallets = new Set(
    (update.removeWallets ?? []).map((wallet) => wallet.toLowerCase()),
  );
  return {
    wallet: current.wallet,
    marketIds: [
      ...new Set([
        ...current.marketIds.filter((market) => !removedMarkets.has(market)),
        ...(update.addMarkets ?? []),
      ]),
    ],
    wallets: [
      ...new Set([
        ...current.wallets
          .map((wallet) => wallet.toLowerCase())
          .filter((wallet) => !removedWallets.has(wallet)),
        ...(update.addWallets ?? []).map((wallet) => wallet.toLowerCase()),
      ]),
    ],
    updatedAt: update.updatedAt,
  };
}

export type AttentionSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AttentionType =
  | "LOW_MARGIN"
  | "ORDER_PENDING_TOO_LONG"
  | "ORDER_FAILED"
  | "MARKET_DOWNGRADED"
  | "MARKET_PAUSED"
  | "MARKET_CLOSE_ONLY"
  | "ORACLE_DEGRADED"
  | "QUALIFICATION_EXPIRING"
  | "LIQUIDITY_COLLAPSE";
export interface NeedsAttentionItem {
  readonly id: string;
  readonly wallet: string;
  readonly severity: AttentionSeverity;
  readonly type: AttentionType;
  readonly title: string;
  readonly reason: string;
  readonly marketId: Hex | null;
  readonly orderId: string | null;
  readonly positionId: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly availableActions: readonly string[];
}

export class NeedsAttentionEngine {
  private readonly items = new Map<string, NeedsAttentionItem>();
  public upsert(item: NeedsAttentionItem): void {
    this.items.set(item.id, item);
  }
  public resolve(id: string, at = new Date().toISOString()): void {
    const item = this.items.get(id);
    if (item !== undefined) this.items.set(id, { ...item, resolvedAt: at });
  }
  public list(wallet: string, includeResolved = false): readonly NeedsAttentionItem[] {
    return [...this.items.values()]
      .filter(
        (item) =>
          item.wallet.toLowerCase() === wallet.toLowerCase() &&
          (includeResolved || item.resolvedAt === null),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}

export class NotificationEngine {
  private readonly emitted = new Set<string>();
  public create(
    input: Omit<
      NotificationEvent,
      "schemaVersion" | "id" | "createdAt" | "sourceEventId" | "readAt"
    > & {
      readonly id?: string;
      readonly createdAt?: string;
      readonly sourceEventId?: string | null;
      readonly readAt?: string | null;
    },
  ): NotificationEvent | null {
    const id =
      input.id ??
      keccak256Hex(
        canonicalJson({ eventId: input.eventId, recipient: input.recipient, type: input.type }),
      );
    if (this.emitted.has(id)) return null;
    const event = NotificationEventSchema.parse({
      ...input,
      id,
      createdAt: input.createdAt ?? new Date().toISOString(),
      schemaVersion: "notification-event/v1",
    });
    this.emitted.add(id);
    return event;
  }
}

export interface CompetitionSeason {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly eligibleMarkets: readonly Hex[];
  readonly minimumTrades: number;
  readonly scoringMethod:
    "REALIZED_PNL" | "RETURN_PCT" | "RISK_ADJUSTED_RETURN" | "WIN_RATE" | "CONSISTENCY";
  readonly status: "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED";
}

export interface CompetitionAccountInput {
  readonly account: string;
  readonly startingEquityUsdWad: bigint;
  readonly endingEquityUsdWad: bigint;
  readonly realizedPnlUsdWad: bigint;
  readonly maxDrawdownBps: number;
  readonly liquidationCount: number;
  readonly tradeCount: number;
  readonly dailyReturnBps: readonly number[];
  readonly linkedWalletSignals: number;
  readonly eventIds: readonly string[];
}

export function scoreRiskAdjustedCompetition(
  input: CompetitionAccountInput,
  minimumTrades: number,
): {
  readonly scoreBps: bigint;
  readonly status: "VALID" | "SUSPICIOUS" | "UNDER_REVIEW" | "DISQUALIFIED";
  readonly reasonCodes: readonly string[];
} {
  if (input.startingEquityUsdWad <= 0n)
    return { scoreBps: 0n, status: "DISQUALIFIED", reasonCodes: ["INVALID_STARTING_EQUITY"] };
  if (input.eventIds.length === 0)
    return { scoreBps: 0n, status: "DISQUALIFIED", reasonCodes: ["NO_VERIFIED_EVENTS"] };
  if (input.tradeCount < minimumTrades)
    return { scoreBps: 0n, status: "UNDER_REVIEW", reasonCodes: ["MINIMUM_ACTIVITY_NOT_MET"] };
  const returnBps = (input.realizedPnlUsdWad * 10_000n) / input.startingEquityUsdWad;
  const drawdownPenalty =
    ((returnBps > 0n ? returnBps : 0n) * BigInt(Math.min(10_000, input.maxDrawdownBps))) / 10_000n;
  const liquidationPenalty =
    ((returnBps > 0n ? returnBps : 0n) * BigInt(Math.min(10_000, input.liquidationCount * 1_000))) /
    10_000n;
  const consistencyPenalty =
    input.dailyReturnBps.length === 0
      ? 0n
      : BigInt(
          Math.min(
            10_000,
            Math.max(
              0,
              10_000 -
                Math.round(
                  input.dailyReturnBps.reduce((sum, value) => sum + Math.abs(value), 0) /
                    input.dailyReturnBps.length,
                ),
            ),
          ),
        );
  const score = returnBps - drawdownPenalty - liquidationPenalty + consistencyPenalty / 10n;
  const suspicious = input.linkedWalletSignals > 0;
  return {
    scoreBps: score,
    status: suspicious ? "UNDER_REVIEW" : "VALID",
    reasonCodes: suspicious ? ["LINKED_WALLET_SIGNAL"] : [],
  };
}

function calculateDrawdownBps(
  trades: readonly VerifiedWalletTrade[],
  startingEquity: bigint,
): number {
  let equity = startingEquity;
  let peak = equity;
  let max = 0n;
  for (const trade of trades) {
    equity +=
      trade.realizedPnlUsdWad -
      trade.feeUsdWad -
      trade.fundingPaidUsdWad +
      trade.fundingReceivedUsdWad;
    if (equity > peak) peak = equity;
    if (peak > 0n && peak - equity > max) max = peak - equity;
  }
  return Number((max * 10_000n) / (peak === 0n ? 1n : peak));
}

export interface OrganicActivityMetrics {
  readonly holderGrowthBps: number | null;
  readonly newHolderVelocity: number | null;
  readonly independentTraderCount: number | null;
  readonly retentionBps: number | null;
  readonly netCapitalFlowUsdWad: bigint | null;
  readonly tradeDiversityBps: number | null;
  readonly volumePersistenceBps: number | null;
  readonly venueDiversity: number | null;
  readonly status: "AVAILABLE" | "INSUFFICIENT_DATA";
  readonly reasonCodes: readonly string[];
}

export interface OrganicActivityInput {
  readonly holderCountNow: number | null;
  readonly holderCountBefore: number | null;
  readonly newHolders: number | null;
  readonly independentTraders: number | null;
  readonly retainedTraders: number | null;
  readonly grossBuyUsdWad: bigint | null;
  readonly grossSellUsdWad: bigint | null;
  readonly activeIntervals: number | null;
  readonly observedIntervals: number | null;
  readonly venues: number | null;
}

export function analyzeOrganicActivity(input: OrganicActivityInput): OrganicActivityMetrics {
  const holderGrowthBps =
    input.holderCountNow !== null && input.holderCountBefore !== null && input.holderCountBefore > 0
      ? Math.trunc(
          ((input.holderCountNow - input.holderCountBefore) * 10_000) / input.holderCountBefore,
        )
      : null;
  const retentionBps =
    input.independentTraders !== null &&
    input.independentTraders > 0 &&
    input.retainedTraders !== null
      ? Math.max(
          0,
          Math.min(10_000, Math.trunc((input.retainedTraders * 10_000) / input.independentTraders)),
        )
      : null;
  const netCapitalFlowUsdWad =
    input.grossBuyUsdWad !== null && input.grossSellUsdWad !== null
      ? input.grossBuyUsdWad - input.grossSellUsdWad
      : null;
  const persistenceBps =
    input.activeIntervals !== null &&
    input.observedIntervals !== null &&
    input.observedIntervals > 0
      ? Math.max(
          0,
          Math.min(10_000, Math.trunc((input.activeIntervals * 10_000) / input.observedIntervals)),
        )
      : null;
  const sufficient = [
    holderGrowthBps,
    input.independentTraders,
    retentionBps,
    netCapitalFlowUsdWad,
    persistenceBps,
  ].every((value) => value !== null);
  return {
    holderGrowthBps,
    newHolderVelocity: input.newHolders,
    independentTraderCount: input.independentTraders,
    retentionBps,
    netCapitalFlowUsdWad,
    tradeDiversityBps:
      input.independentTraders === null ? null : Math.min(10_000, input.independentTraders * 100),
    volumePersistenceBps: persistenceBps,
    venueDiversity: input.venues,
    status: sufficient ? "AVAILABLE" : "INSUFFICIENT_DATA",
    reasonCodes: sufficient ? [] : ["ORGANIC_ACTIVITY_INPUTS_INCOMPLETE"],
  };
}

export interface BundleTransaction {
  readonly wallet: string;
  readonly blockOrSlot: string;
  readonly transactionId: string;
  readonly supplyBps: number;
  readonly creatorLinked: boolean | null;
  readonly fundingSource: string | null;
  readonly evidenceIds: readonly string[];
}

export interface BundleAnalysis {
  readonly effectiveConcentrationBps: number | null;
  readonly coordinatedWallets: readonly string[];
  readonly bundleCount: number;
  readonly status: "AVAILABLE" | "INSUFFICIENT_DATA";
  readonly reasonCodes: readonly string[];
}

export function analyzeLaunchBundles(transactions: readonly BundleTransaction[]): BundleAnalysis {
  const usable = transactions.filter(
    (item) => item.evidenceIds.length > 0 && item.supplyBps >= 0 && item.supplyBps <= 10_000,
  );
  if (usable.length === 0)
    return {
      effectiveConcentrationBps: null,
      coordinatedWallets: [],
      bundleCount: 0,
      status: "INSUFFICIENT_DATA",
      reasonCodes: ["LAUNCH_BUNDLE_DATA_UNAVAILABLE"],
    };
  const groups = new Map<string, BundleTransaction[]>();
  for (const item of usable)
    groups.set(item.blockOrSlot, [...(groups.get(item.blockOrSlot) ?? []), item]);
  const bundles = [...groups.values()].filter((group) => group.length > 1);
  const coordinatedWallets = [
    ...new Set(bundles.flatMap((group) => group.map((item) => item.wallet.toLowerCase()))),
  ].sort();
  const effective = bundles
    .flatMap((group) => group)
    .reduce((sum, item) => sum + item.supplyBps, 0);
  return {
    effectiveConcentrationBps: effective,
    coordinatedWallets,
    bundleCount: bundles.length,
    status: "AVAILABLE",
    reasonCodes: bundles.length === 0 ? [] : ["SAME_BLOCK_OR_SLOT_COORDINATION"],
  };
}

export interface SourceObservationIdentity {
  readonly sourceId: string;
  readonly sourceFamily: string;
  readonly underlyingVenueId: string | null;
  readonly marketId: string;
}

export interface SourceIndependenceResult {
  readonly independentSourceIds: readonly string[];
  readonly correlatedSourceIds: readonly string[];
  readonly count: number;
  readonly reasonCodes: readonly string[];
}

/** Correlated aggregators over one pool count once, not once per API vendor. */
export function reconcileSourceIndependence(
  observations: readonly SourceObservationIdentity[],
): SourceIndependenceResult {
  const byOrigin = new Map<string, SourceObservationIdentity>();
  const correlated: string[] = [];
  for (const observation of observations) {
    const key = `${observation.marketId}:${observation.underlyingVenueId ?? observation.sourceId}`;
    if (byOrigin.has(key)) {
      correlated.push(observation.sourceId);
      continue;
    }
    byOrigin.set(key, observation);
  }
  const independentSourceIds = [...byOrigin.values()].map((item) => item.sourceId).sort();
  return {
    independentSourceIds,
    correlatedSourceIds: correlated.sort(),
    count: independentSourceIds.length,
    reasonCodes: correlated.length === 0 ? [] : ["CORRELATED_SOURCE_DEDUPLICATED"],
  };
}
