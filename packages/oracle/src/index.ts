export interface OracleSourceReading {
  readonly source: string;
  readonly priceUsd: number;
  readonly observedAt: string;
  readonly confidenceBps: number;
}

export interface NormalizedOracleReading {
  readonly priceUsd: number;
  readonly observedAt: string;
  readonly confidenceBps: number;
  readonly sourceCount: number;
  readonly disagreementPct: number;
  readonly stale: boolean;
  readonly sources: readonly string[];
}

export interface OraclePolicy {
  readonly maxAgeSeconds: number;
  readonly minimumConfidenceBps: number;
  readonly maximumDisagreementPct: number;
}

export const DEVELOPMENT_ORACLE_POLICY: OraclePolicy = {
  maxAgeSeconds: 120,
  minimumConfidenceBps: 8_500,
  maximumDisagreementPct: 3,
};

export function normalizeOracleReadings(
  readings: readonly OracleSourceReading[],
  now: string,
  policy: OraclePolicy = DEVELOPMENT_ORACLE_POLICY,
): NormalizedOracleReading {
  if (readings.length === 0) {
    throw new Error("oracle requires at least one source");
  }
  const sorted = [...readings].sort((left, right) => left.priceUsd - right.priceUsd);
  const median = sorted[Math.floor(sorted.length / 2)]?.priceUsd;
  if (median === undefined || median <= 0) {
    throw new Error("oracle prices must be positive");
  }
  const minimum = sorted[0]?.priceUsd ?? median;
  const maximum = sorted[sorted.length - 1]?.priceUsd ?? median;
  const disagreementPct = ((maximum - minimum) / median) * 100;
  const freshest = [...readings].sort(
    (left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt),
  )[0];
  if (freshest === undefined) {
    throw new Error("oracle source selection failed");
  }
  const ageSeconds = (Date.parse(now) - Date.parse(freshest.observedAt)) / 1_000;
  const stale = !Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > policy.maxAgeSeconds;
  const confidenceBps = Math.min(...readings.map((reading) => reading.confidenceBps));
  return {
    priceUsd: median,
    observedAt: freshest.observedAt,
    confidenceBps,
    sourceCount: readings.length,
    disagreementPct,
    stale,
    sources: readings.map((reading) => reading.source).sort(),
  };
}

export function assertOracleUsable(
  reading: NormalizedOracleReading,
  policy: OraclePolicy = DEVELOPMENT_ORACLE_POLICY,
): void {
  if (reading.stale) {
    throw new Error("stale oracle price");
  }
  if (reading.confidenceBps < policy.minimumConfidenceBps) {
    throw new Error("oracle confidence below minimum");
  }
  if (reading.disagreementPct > policy.maximumDisagreementPct) {
    throw new Error("oracle sources disagree beyond maximum");
  }
  if (reading.priceUsd <= 0) {
    throw new Error("oracle price must be positive");
  }
}
