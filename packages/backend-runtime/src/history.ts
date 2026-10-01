import { z } from "zod";

export const HISTORY_WINDOWS = ["1m", "5m", "15m", "1h", "6h", "24h", "7d", "30d"] as const;
export type HistoryWindow = (typeof HISTORY_WINDOWS)[number];

export const HistoricalMarketPointSchema = z
  .object({
    observedAt: z.string().datetime({ offset: true }),
    priceUsdWad: z.string().regex(/^[0-9]+$/),
    liquidityUsdWad: z
      .string()
      .regex(/^[0-9]+$/)
      .nullable(),
    volumeUsdWad: z
      .string()
      .regex(/^[0-9]+$/)
      .nullable(),
    holderCount: z.number().int().min(0).nullable(),
    depth1PctUsdWad: z
      .string()
      .regex(/^[0-9]+$/)
      .nullable(),
    clusterConcentrationBps: z.number().int().min(0).max(10_000).nullable(),
    oracleStatus: z.enum(["FRESH", "STALE", "UNAVAILABLE", "INVALID"]),
    riskStatus: z.string().min(1),
  })
  .strict();
export type HistoricalMarketPoint = z.infer<typeof HistoricalMarketPointSchema>;

export interface HistoricalWindow {
  readonly window: HistoryWindow;
  readonly status: "AVAILABLE" | "INSUFFICIENT_DATA";
  readonly from: string;
  readonly to: string;
  readonly first: HistoricalMarketPoint | null;
  readonly latest: HistoricalMarketPoint | null;
  readonly pointCount: number;
  readonly priceChangeBps: number | null;
  readonly liquidityChangeBps: number | null;
}

const WINDOW_MS: Record<HistoryWindow, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "6h": 21_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
};

/**
 * Aggregates persisted observations only. It never creates interpolated or
 * synthetic price points; a window is unavailable until it has two real
 * observations with the required metric.
 */
export function aggregateHistoricalWindows(
  points: readonly HistoricalMarketPoint[],
  to = new Date().toISOString(),
): readonly HistoricalWindow[] {
  const end = Date.parse(to);
  if (!Number.isFinite(end)) throw new Error("invalid history end timestamp");
  const ordered = points
    .map((point) => HistoricalMarketPointSchema.parse(point))
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  return HISTORY_WINDOWS.map((window) => {
    const from = new Date(end - WINDOW_MS[window]).toISOString();
    const selected = ordered.filter((point) => {
      const timestamp = Date.parse(point.observedAt);
      return timestamp >= end - WINDOW_MS[window] && timestamp <= end;
    });
    const first = selected[0] ?? null;
    const latest = selected[selected.length - 1] ?? null;
    const firstLiquidity = first?.liquidityUsdWad ?? null;
    const latestLiquidity = latest?.liquidityUsdWad ?? null;
    return {
      window,
      status:
        first !== null && latest !== null && selected.length >= 2
          ? "AVAILABLE"
          : "INSUFFICIENT_DATA",
      from,
      to,
      first,
      latest,
      pointCount: selected.length,
      priceChangeBps:
        first === null || latest === null || first.priceUsdWad === "0"
          ? null
          : Number(
              ((BigInt(latest.priceUsdWad) - BigInt(first.priceUsdWad)) * 10_000n) /
                BigInt(first.priceUsdWad),
            ),
      liquidityChangeBps:
        firstLiquidity === null || latestLiquidity === null || firstLiquidity === "0"
          ? null
          : Number(
              ((BigInt(latestLiquidity) - BigInt(firstLiquidity)) * 10_000n) /
                BigInt(firstLiquidity),
            ),
    };
  });
}
