import { hashTypedData, recoverTypedDataAddress } from "viem";
import type { Address, Hex } from "viem";
import type { SupportedChain } from "@arcmemeperps/shared";
import { BPS, WAD, normalizePriceToWad } from "@arcmemeperps/shared";

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
  if (readings.length === 0) throw new Error("oracle requires at least one source");
  const sorted = [...readings].sort((left, right) => left.priceUsd - right.priceUsd);
  const median = sorted[Math.floor(sorted.length / 2)]?.priceUsd;
  if (median === undefined || median <= 0) throw new Error("oracle prices must be positive");
  const minimum = sorted[0]?.priceUsd ?? median;
  const maximum = sorted[sorted.length - 1]?.priceUsd ?? median;
  const disagreementPct = ((maximum - minimum) / median) * 100;
  const freshest = [...readings].sort(
    (left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt),
  )[0];
  if (freshest === undefined) throw new Error("oracle source selection failed");
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
  if (reading.stale) throw new Error("stale oracle price");
  if (reading.confidenceBps < policy.minimumConfidenceBps) {
    throw new Error("oracle confidence below minimum");
  }
  if (reading.disagreementPct > policy.maximumDisagreementPct) {
    throw new Error("oracle sources disagree beyond maximum");
  }
  if (reading.priceUsd <= 0) throw new Error("oracle price must be positive");
}

export const SOURCE_FAMILIES = [
  "DIRECT_UNISWAP_POOL",
  "DIRECT_PANCAKESWAP_POOL",
  "DIRECT_RAYDIUM_POOL",
  "DEXSCREENER_AGGREGATION",
  "CHAINLINK_FEED",
  "CHAINLINK_DATA_STREAM",
  "SIGNED_COMPOSITE",
  "CEX_REFERENCE",
  "OTHER",
] as const;
export type OracleSourceFamily = (typeof SOURCE_FAMILIES)[number];

export interface PriceObservation {
  readonly marketId: Hex;
  readonly chain: SupportedChain;
  readonly source: string;
  readonly sourceFamily: OracleSourceFamily;
  readonly rawPrice: bigint;
  readonly priceDecimals: number;
  readonly observedAt: bigint;
  readonly confidenceBps: bigint;
  readonly evidenceRoot: Hex;
}

export interface OracleAggregationPolicy {
  readonly maxAgeSeconds: bigint;
  readonly maximumDispersionBps: bigint;
  readonly maximumIndividualDeviationBps: bigint;
  readonly minimumIndependentSources: number;
  readonly minimumConfidenceBps: bigint;
  readonly confidenceBandBps: bigint;
}

export const DEVELOPMENT_AGGREGATION_POLICY: OracleAggregationPolicy = {
  maxAgeSeconds: 120n,
  maximumDispersionBps: 300n,
  maximumIndividualDeviationBps: 1_000n,
  minimumIndependentSources: 2,
  minimumConfidenceBps: 8_500n,
  confidenceBandBps: 100n,
};

export type OracleRejectionReason =
  | "WRONG_MARKET"
  | "WRONG_CHAIN"
  | "STALE"
  | "FUTURE"
  | "INVALID_PRICE"
  | "INVALID_DECIMALS"
  | "DUPLICATE_SOURCE"
  | "CORRELATED_SOURCE_FAMILY"
  | "OUTLIER"
  | "INVALID_CONFIDENCE";

export interface OracleObservationDecision {
  readonly observation: PriceObservation;
  readonly normalizedPriceWad: bigint | null;
  readonly accepted: boolean;
  readonly reason?: OracleRejectionReason;
}

export interface AggregatedOracleResult {
  readonly status: "READY" | "BLOCKED" | "UNAVAILABLE";
  readonly marketId: Hex;
  readonly chain: SupportedChain;
  readonly accepted: readonly OracleObservationDecision[];
  readonly rejected: readonly OracleObservationDecision[];
  readonly medianPriceWad: bigint | null;
  readonly dispersionBps: bigint | null;
  readonly confidenceBps: bigint | null;
  readonly minPriceWad: bigint | null;
  readonly maxPriceWad: bigint | null;
  readonly independentSourceCount: number;
  readonly reasonCodes: readonly string[];
}

export function aggregatePriceObservations(
  marketId: Hex,
  chain: SupportedChain,
  observations: readonly PriceObservation[],
  nowSeconds: bigint,
  policy: OracleAggregationPolicy = DEVELOPMENT_AGGREGATION_POLICY,
): AggregatedOracleResult {
  const decisions: OracleObservationDecision[] = [];
  const seenSources = new Set<string>();
  const seenFamilies = new Set<OracleSourceFamily>();
  for (const observation of observations) {
    let reason: OracleRejectionReason | undefined;
    let normalizedPriceWad: bigint | null = null;
    if (observation.marketId !== marketId) reason = "WRONG_MARKET";
    else if (observation.chain !== chain) reason = "WRONG_CHAIN";
    else if (observation.rawPrice <= 0n) reason = "INVALID_PRICE";
    else if (observation.observedAt > nowSeconds) reason = "FUTURE";
    else if (nowSeconds - observation.observedAt > policy.maxAgeSeconds) reason = "STALE";
    else if (observation.priceDecimals < 0 || observation.priceDecimals > 36) {
      reason = "INVALID_DECIMALS";
    } else if (observation.confidenceBps > BPS) reason = "INVALID_CONFIDENCE";
    else if (seenSources.has(observation.source)) reason = "DUPLICATE_SOURCE";
    else if (seenFamilies.has(observation.sourceFamily)) reason = "CORRELATED_SOURCE_FAMILY";
    else normalizedPriceWad = normalizePriceToWad(observation.rawPrice, observation.priceDecimals);
    const decision: OracleObservationDecision = reason
      ? { observation, normalizedPriceWad, accepted: false, reason }
      : { observation, normalizedPriceWad, accepted: true };
    decisions.push(decision);
    if (!reason) {
      seenSources.add(observation.source);
      seenFamilies.add(observation.sourceFamily);
    }
  }

  const initiallyAccepted = decisions.filter(
    (decision): decision is OracleObservationDecision & { normalizedPriceWad: bigint } =>
      decision.accepted && decision.normalizedPriceWad !== null,
  );
  const preliminarySorted = initiallyAccepted
    .map((item) => item.normalizedPriceWad)
    .sort(compareBigInt);
  const preliminaryMedian = median(preliminarySorted);
  const accepted = initiallyAccepted.filter((item) => {
    if (preliminaryMedian === null) return false;
    const deviation = (abs(item.normalizedPriceWad - preliminaryMedian) * BPS) / preliminaryMedian;
    return deviation <= policy.maximumIndividualDeviationBps;
  });
  const outlierIds = new Set(
    accepted.length === initiallyAccepted.length
      ? []
      : initiallyAccepted
          .filter((item) => !accepted.includes(item))
          .map((item) => item.observation.source),
  );
  const finalDecisions = decisions.map((decision) => {
    if (decision.accepted && outlierIds.has(decision.observation.source)) {
      return { ...decision, accepted: false, reason: "OUTLIER" as const };
    }
    return decision;
  });
  const finalAccepted = finalDecisions.filter(
    (decision): decision is OracleObservationDecision & { normalizedPriceWad: bigint } =>
      decision.accepted && decision.normalizedPriceWad !== null,
  );
  const sorted = finalAccepted.map((item) => item.normalizedPriceWad).sort(compareBigInt);
  const medianPriceWad = median(sorted);
  const minimum = sorted[0] ?? null;
  const maximum = sorted.at(-1) ?? null;
  const dispersionBps =
    medianPriceWad && minimum !== null && maximum !== null
      ? ((maximum - minimum) * BPS) / medianPriceWad
      : null;
  const confidenceBps =
    finalAccepted.length === 0
      ? null
      : finalAccepted.reduce(
          (minimumConfidence, item) =>
            item.observation.confidenceBps < minimumConfidence
              ? item.observation.confidenceBps
              : minimumConfidence,
          BPS,
        );
  const independentSourceCount = new Set(finalAccepted.map((item) => item.observation.sourceFamily))
    .size;
  const confidenceBand =
    confidenceBps === null
      ? null
      : confidenceBps > policy.confidenceBandBps
        ? policy.confidenceBandBps
        : confidenceBps;
  const minPriceWad =
    medianPriceWad === null || confidenceBand === null
      ? null
      : (medianPriceWad * (BPS - confidenceBand)) / BPS;
  const maxPriceWad =
    medianPriceWad === null || confidenceBand === null
      ? null
      : (medianPriceWad * (BPS + confidenceBand)) / BPS;
  const reasonCodes = [
    ...new Set(finalDecisions.filter((item) => !item.accepted).map((item) => item.reason)),
  ].filter((reason): reason is OracleRejectionReason => reason !== undefined);
  const ready =
    medianPriceWad !== null &&
    independentSourceCount >= policy.minimumIndependentSources &&
    (confidenceBps ?? 0n) >= policy.minimumConfidenceBps &&
    (dispersionBps ?? BPS + 1n) <= policy.maximumDispersionBps;
  return {
    status: ready ? "READY" : "BLOCKED",
    marketId,
    chain,
    accepted: finalAccepted,
    rejected: finalDecisions.filter((item) => !item.accepted),
    medianPriceWad,
    dispersionBps,
    confidenceBps,
    minPriceWad,
    maxPriceWad,
    independentSourceCount,
    reasonCodes,
  };
}

export interface SignedCompositeReport {
  readonly marketId: Hex;
  readonly arcChainId: bigint;
  readonly oracleRouter: Address;
  readonly midPriceWad: bigint;
  readonly minPriceWad: bigint;
  readonly maxPriceWad: bigint;
  readonly confidenceBps: bigint;
  readonly sourceCount: bigint;
  readonly independentSourceCount: bigint;
  readonly observedAt: bigint;
  readonly validFrom: bigint;
  readonly expiresAt: bigint;
  readonly sequence: bigint;
  readonly evidenceRoot: Hex;
  readonly reporterSetVersion: Hex;
}

export const SIGNED_COMPOSITE_PRIMARY_TYPE = "CompositePriceReport" as const;
export const SIGNED_COMPOSITE_TYPES = {
  CompositePriceReport: [
    { name: "arcChainId", type: "uint256" },
    { name: "oracleRouter", type: "address" },
    { name: "marketId", type: "bytes32" },
    { name: "midPriceWad", type: "uint256" },
    { name: "minPriceWad", type: "uint256" },
    { name: "maxPriceWad", type: "uint256" },
    { name: "confidenceBps", type: "uint256" },
    { name: "sourceCount", type: "uint256" },
    { name: "independentSourceCount", type: "uint256" },
    { name: "observedAt", type: "uint256" },
    { name: "validFrom", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
    { name: "sequence", type: "uint256" },
    { name: "evidenceRoot", type: "bytes32" },
    { name: "reporterSetVersion", type: "bytes32" },
  ],
} as const;

export interface SignedReportDomain {
  readonly name: "ArcMemePerps Oracle";
  readonly version: "1";
  readonly chainId: bigint;
  readonly verifyingContract: Address;
}

export function signedCompositeDomain(chainId: bigint, router: Address): SignedReportDomain {
  return { name: "ArcMemePerps Oracle", version: "1", chainId, verifyingContract: router };
}

export function signedCompositeDigest(report: SignedCompositeReport): Hex {
  const domain = signedCompositeDomain(report.arcChainId, report.oracleRouter);
  return hashTypedData({
    domain,
    types: SIGNED_COMPOSITE_TYPES,
    primaryType: SIGNED_COMPOSITE_PRIMARY_TYPE,
    message: report,
  });
}

export interface ReporterSet {
  readonly version: Hex;
  readonly reporters: readonly Address[];
  readonly threshold: number;
}

export interface SignedReportSignature {
  readonly signature: Hex;
}

export async function verifySignedCompositeReport(
  report: SignedCompositeReport,
  signatures: readonly SignedReportSignature[],
  reporterSet: ReporterSet,
  nowSeconds: bigint,
): Promise<{
  readonly valid: boolean;
  readonly signers: readonly Address[];
  readonly reasons: readonly string[];
}> {
  const reasons: string[] = [];
  if (report.reporterSetVersion !== reporterSet.version)
    reasons.push("REPORTER_SET_VERSION_MISMATCH");
  if (report.expiresAt < nowSeconds) reasons.push("EXPIRED_REPORT");
  if (report.validFrom > nowSeconds) reasons.push("FUTURE_REPORT");
  if (
    report.minPriceWad <= 0n ||
    report.minPriceWad > report.midPriceWad ||
    report.midPriceWad > report.maxPriceWad
  ) {
    reasons.push("INVALID_PRICE_BAND");
  }
  const allowed = new Set(reporterSet.reporters.map((address) => address.toLowerCase()));
  const signers: Address[] = [];
  for (const signed of signatures) {
    try {
      const signer = await recoverTypedDataAddress({
        domain: signedCompositeDomain(report.arcChainId, report.oracleRouter),
        types: SIGNED_COMPOSITE_TYPES,
        primaryType: SIGNED_COMPOSITE_PRIMARY_TYPE,
        message: report,
        signature: signed.signature,
      });
      if (!allowed.has(signer.toLowerCase())) reasons.push("UNAUTHORIZED_SIGNER");
      else if (signers.some((existing) => existing.toLowerCase() === signer.toLowerCase())) {
        reasons.push("DUPLICATE_SIGNER");
      } else signers.push(signer);
    } catch {
      reasons.push("INVALID_SIGNATURE");
    }
  }
  if (signers.length < reporterSet.threshold) reasons.push("INSUFFICIENT_THRESHOLD");
  return { valid: reasons.length === 0, signers, reasons };
}

export interface ChainlinkAdapterResult {
  readonly status: "AVAILABLE" | "UNAVAILABLE";
  readonly reason?: "FEED_NOT_CONFIGURED" | "STREAM_CREDENTIALS_MISSING" | "RPC_READ_FAILED";
}

export interface ChainlinkFeedAdapter {
  readonly kind: "CHAINLINK_FEED";
  read(marketId: Hex): Promise<ChainlinkAdapterResult>;
}

export interface ChainlinkDataStreamsAdapter {
  readonly kind: "CHAINLINK_DATA_STREAM";
  read(marketId: Hex): Promise<ChainlinkAdapterResult>;
}

export class UnavailableChainlinkFeed implements ChainlinkFeedAdapter {
  readonly kind = "CHAINLINK_FEED" as const;
  read(): Promise<ChainlinkAdapterResult> {
    return Promise.resolve({ status: "UNAVAILABLE", reason: "FEED_NOT_CONFIGURED" });
  }
}

export class UnavailableChainlinkDataStreams implements ChainlinkDataStreamsAdapter {
  readonly kind = "CHAINLINK_DATA_STREAM" as const;
  read(): Promise<ChainlinkAdapterResult> {
    return Promise.resolve({ status: "UNAVAILABLE", reason: "STREAM_CREDENTIALS_MISSING" });
  }
}

function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function median(values: readonly bigint[]): bigint | null {
  if (values.length === 0) return null;
  return values[Math.floor(values.length / 2)] ?? null;
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export { WAD };
