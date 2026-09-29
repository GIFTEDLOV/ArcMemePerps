export interface ActivityTrade {
  readonly trader: string;
  readonly side: "BUY" | "SELL";
  readonly amountUsd: number;
  readonly timestamp: string;
  readonly walletAgeDays?: number;
  readonly fundingSource?: string | null;
}

export interface ActivityFeatureSet {
  readonly uniqueTraderCount: number;
  readonly grossVolumeUsd: number;
  readonly estimatedNetFlowUsd: number;
  readonly buySellSymmetryPct: number;
  readonly roundTripFrequencyPct: number;
  readonly repeatedTradeSizePct: number;
  readonly repeatedTimingIntervalPct: number;
  readonly walletReusePct: number;
  readonly walletAgeEvidencePct: number;
  readonly commonFundingRelationshipPct: number | null;
  readonly volumeLiquidityRatio: number | null;
  readonly holderGrowthPct24h: number | null;
  readonly traderConcentrationPct: number;
}

export type ActivityQualityStatus = "CLEAR" | "SUSPICIOUS" | "HIGH_RISK" | "INSUFFICIENT_DATA";

export interface ActivityQualityAssessment {
  readonly status: ActivityQualityStatus;
  readonly features: ActivityFeatureSet;
  readonly reasons: readonly string[];
}

export interface ActivityAnalysisOptions {
  readonly liquidityUsd?: number | null;
  readonly holderGrowthPct24h?: number | null;
  readonly knownFundingRelationships?: ReadonlySet<string>;
}

export function analyzeActivity(
  trades: readonly ActivityTrade[],
  options: ActivityAnalysisOptions = {},
): ActivityQualityAssessment {
  if (trades.length === 0) {
    return {
      status: "INSUFFICIENT_DATA",
      features: emptyFeatures(options),
      reasons: ["no trades available"],
    };
  }
  const traders = new Map<string, number>();
  let buys = 0;
  let sells = 0;
  let grossVolumeUsd = 0;
  let netFlowUsd = 0;
  for (const trade of trades) {
    if (
      !Number.isFinite(trade.amountUsd) ||
      trade.amountUsd <= 0 ||
      !Number.isFinite(Date.parse(trade.timestamp))
    ) {
      return {
        status: "INSUFFICIENT_DATA",
        features: emptyFeatures(options),
        reasons: ["invalid trade value or timestamp"],
      };
    }
    const trader = trade.trader.toLowerCase();
    traders.set(trader, (traders.get(trader) ?? 0) + trade.amountUsd);
    grossVolumeUsd += trade.amountUsd;
    if (trade.side === "BUY") {
      buys += trade.amountUsd;
      netFlowUsd += trade.amountUsd;
    } else {
      sells += trade.amountUsd;
      netFlowUsd -= trade.amountUsd;
    }
  }
  const repeatedSizes = repetitionPct(
    trades.map((trade) => Math.round(trade.amountUsd * 100) / 100),
  );
  const times = trades.map((trade) => Date.parse(trade.timestamp)).sort((a, b) => a - b);
  const intervals = times.slice(1).map((time, index) => time - times[index]!);
  const repeatedIntervals = repetitionPct(
    intervals.map((interval) => Math.round(interval / 1_000)),
  );
  const roundTrips = estimateRoundTrips(trades);
  const knownFundingRelationships = options.knownFundingRelationships;
  const commonFunding =
    knownFundingRelationships === undefined
      ? null
      : (trades.filter(
          (trade) =>
            trade.fundingSource !== null &&
            trade.fundingSource !== undefined &&
            knownFundingRelationships.has(trade.trader.toLowerCase()),
        ).length /
          trades.length) *
        100;
  const topTrader = Math.max(...traders.values());
  const features: ActivityFeatureSet = {
    uniqueTraderCount: traders.size,
    grossVolumeUsd,
    estimatedNetFlowUsd: netFlowUsd,
    buySellSymmetryPct:
      grossVolumeUsd === 0 ? 0 : 100 - (Math.abs(buys - sells) / grossVolumeUsd) * 100,
    roundTripFrequencyPct: roundTrips,
    repeatedTradeSizePct: repeatedSizes,
    repeatedTimingIntervalPct: repeatedIntervals,
    walletReusePct:
      trades.length === 0 ? 0 : ((trades.length - traders.size) / trades.length) * 100,
    walletAgeEvidencePct:
      (trades.filter((trade) => trade.walletAgeDays !== undefined).length / trades.length) * 100,
    commonFundingRelationshipPct: commonFunding,
    volumeLiquidityRatio:
      options.liquidityUsd === undefined ||
      options.liquidityUsd === null ||
      options.liquidityUsd <= 0
        ? null
        : grossVolumeUsd / options.liquidityUsd,
    holderGrowthPct24h: options.holderGrowthPct24h ?? null,
    traderConcentrationPct: grossVolumeUsd === 0 ? 0 : (topTrader / grossVolumeUsd) * 100,
  };
  const reasons: string[] = [];
  if (features.uniqueTraderCount < 5) reasons.push("few unique traders");
  if (features.roundTripFrequencyPct >= 40) reasons.push("frequent round trips");
  if (features.repeatedTradeSizePct >= 50) reasons.push("repeated trade sizes");
  if (features.repeatedTimingIntervalPct >= 50) reasons.push("repeated timing intervals");
  if (features.commonFundingRelationshipPct !== null && features.commonFundingRelationshipPct >= 25)
    reasons.push("common funding relationships");
  if (features.volumeLiquidityRatio !== null && features.volumeLiquidityRatio > 10)
    reasons.push("volume/liquidity ratio is unusually high");
  if (features.traderConcentrationPct >= 50) reasons.push("trader concentration is high");
  const severe =
    features.roundTripFrequencyPct >= 70 ||
    features.repeatedTradeSizePct >= 80 ||
    features.repeatedTimingIntervalPct >= 80 ||
    features.traderConcentrationPct >= 80;
  return {
    status: severe ? "HIGH_RISK" : reasons.length > 0 ? "SUSPICIOUS" : "CLEAR",
    features,
    reasons,
  };
}

function emptyFeatures(options: ActivityAnalysisOptions): ActivityFeatureSet {
  return {
    uniqueTraderCount: 0,
    grossVolumeUsd: 0,
    estimatedNetFlowUsd: 0,
    buySellSymmetryPct: 0,
    roundTripFrequencyPct: 0,
    repeatedTradeSizePct: 0,
    repeatedTimingIntervalPct: 0,
    walletReusePct: 0,
    walletAgeEvidencePct: 0,
    commonFundingRelationshipPct: null,
    volumeLiquidityRatio:
      options.liquidityUsd === undefined || options.liquidityUsd === null ? null : 0,
    holderGrowthPct24h: options.holderGrowthPct24h ?? null,
    traderConcentrationPct: 0,
  };
}

function repetitionPct(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const repeated = [...counts.values()]
    .filter((count) => count > 1)
    .reduce((sum, count) => sum + count, 0);
  return (repeated / values.length) * 100;
}

function estimateRoundTrips(trades: readonly ActivityTrade[]): number {
  const byTrader = new Map<string, { buys: number; sells: number }>();
  for (const trade of trades) {
    const current = byTrader.get(trade.trader.toLowerCase()) ?? { buys: 0, sells: 0 };
    current[trade.side === "BUY" ? "buys" : "sells"] += 1;
    byTrader.set(trade.trader.toLowerCase(), current);
  }
  const tradersWithRoundTrip = [...byTrader.values()].filter(
    (value) => value.buys > 0 && value.sells > 0,
  ).length;
  return byTrader.size === 0 ? 0 : (tradersWithRoundTrip / byTrader.size) * 100;
}
