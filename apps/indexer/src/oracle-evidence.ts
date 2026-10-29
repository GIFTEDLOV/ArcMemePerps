import { decodeFunctionData, keccak256, parseAbi, stringToHex, type Address, type Hex } from "viem";
import {
  aggregatePriceObservations,
  signedCompositeDigest,
  verifySignedCompositeReport,
  DEVELOPMENT_AGGREGATION_POLICY,
  type OracleAggregationPolicy,
  type PriceObservation,
  type ReporterSet,
  type SignedCompositeReport,
  type SignedReportSignature,
} from "@arcmemeperps/oracle";

export const SIGNED_REPORT_WRITE_ABI = parseAbi([
  "function setSignedReport((bytes32 marketId,uint256 arcChainId,uint256 midPrice,uint256 minPrice,uint256 maxPrice,uint256 confidenceBps,uint256 sourceCount,uint256 independentSourceCount,uint64 observedAt,uint64 validFrom,uint64 expiresAt,uint64 sequence,bytes32 evidenceRoot,bytes32 reporterSetVersion) report,bytes[] signatures)",
]);

export interface HistoricalOracleEvidence {
  readonly transactionInput: Hex;
  readonly transactionTo: Address;
  readonly transactionReceiptStatus: "success" | "reverted";
  readonly receiptBlockHash: Hex | null;
  readonly router: Address;
  readonly expectedMarketId: Hex;
  readonly eventSequence: bigint;
  readonly priorSequence: bigint | null;
  readonly blockTimestamp: bigint;
  readonly reporterSet: ReporterSet | null;
  readonly observations: readonly PriceObservation[] | null;
  readonly policy?: OracleAggregationPolicy;
}

export interface HistoricalOracleAssessment {
  readonly report: SignedCompositeReport | null;
  readonly digest: Hex | null;
  readonly signatureChecksPass: boolean;
  readonly observationChecksPass: boolean;
  readonly sourceProvenance: "UNVERIFIED_EXTERNAL";
  readonly qualificationReady: false;
  readonly reasons: readonly string[];
}

/** Canonical root for a proposed source-evidence bundle. Every source's raw
 * response hash is included, but the caller must still prove the response was
 * actually fetched from that independent origin. */
export function oracleObservationRoot(observations: readonly PriceObservation[]): Hex {
  const records = observations
    .map((item) => ({
      marketId: item.marketId.toLowerCase(),
      chain: item.chain,
      source: item.source,
      sourceFamily: item.sourceFamily,
      underlyingVenueId: item.underlyingVenueId ?? null,
      rawPrice: item.rawPrice.toString(),
      priceDecimals: item.priceDecimals,
      observedAt: item.observedAt.toString(),
      confidenceBps: item.confidenceBps.toString(),
      evidenceRoot: item.evidenceRoot.toLowerCase(),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return keccak256(stringToHex(JSON.stringify(records)));
}

export async function assessHistoricalOracleEvidence(
  input: HistoricalOracleEvidence,
): Promise<HistoricalOracleAssessment> {
  const reasons: string[] = [];
  let report: SignedCompositeReport | null = null;
  let signatures: readonly SignedReportSignature[] = [];
  try {
    const decoded = decodeFunctionData({
      abi: SIGNED_REPORT_WRITE_ABI,
      data: input.transactionInput,
    });
    if (decoded.functionName !== "setSignedReport") throw new Error("UNSIGNED_ORACLE_UPDATE");
    const [raw, rawSignatures] = decoded.args;
    report = {
      marketId: raw.marketId,
      arcChainId: raw.arcChainId,
      oracleRouter: input.router,
      midPriceWad: raw.midPrice,
      minPriceWad: raw.minPrice,
      maxPriceWad: raw.maxPrice,
      confidenceBps: raw.confidenceBps,
      sourceCount: raw.sourceCount,
      independentSourceCount: raw.independentSourceCount,
      observedAt: raw.observedAt,
      validFrom: raw.validFrom,
      expiresAt: raw.expiresAt,
      sequence: raw.sequence,
      evidenceRoot: raw.evidenceRoot,
      reporterSetVersion: raw.reporterSetVersion,
    };
    signatures = rawSignatures.map((signature) => ({ signature }));
  } catch {
    reasons.push("UNSIGNED_OR_UNDECODABLE_ORACLE_UPDATE");
  }
  if (!report)
    return {
      report: null,
      digest: null,
      signatureChecksPass: false,
      observationChecksPass: false,
      sourceProvenance: "UNVERIFIED_EXTERNAL",
      qualificationReady: false,
      reasons,
    };

  if (report.arcChainId !== 5042n) reasons.push("WRONG_CHAIN");
  if (input.transactionTo.toLowerCase() !== input.router.toLowerCase())
    reasons.push("WRONG_ORACLE_ROUTER");
  if (input.transactionReceiptStatus !== "success" || !input.receiptBlockHash)
    reasons.push("RECEIPT_UNCONFIRMED_OR_UNPINNED");
  if (report.marketId.toLowerCase() !== input.expectedMarketId.toLowerCase())
    reasons.push("MARKET_EVENT_MISMATCH");
  if (
    report.sequence !== input.eventSequence ||
    (input.priorSequence !== null && report.sequence <= input.priorSequence)
  )
    reasons.push("REPORT_SEQUENCE_REPLAY_OR_EVENT_MISMATCH");
  if (input.priorSequence === null) reasons.push("SEQUENCE_HISTORY_INCOMPLETE");
  if (
    report.observedAt > input.blockTimestamp ||
    report.expiresAt < input.blockTimestamp ||
    report.validFrom > input.blockTimestamp
  )
    reasons.push("REPORT_TIME_WINDOW_INVALID");
  if (report.evidenceRoot === `0x${"00".repeat(32)}`) reasons.push("EMPTY_EVIDENCE_ROOT");

  let signatureChecksPass = false;
  if (!input.reporterSet || input.reporterSet.threshold < 2)
    reasons.push("PINNED_REPORTER_SET_UNAVAILABLE_OR_WEAK");
  else {
    const result = await verifySignedCompositeReport(
      report,
      signatures,
      input.reporterSet,
      input.blockTimestamp,
    );
    reasons.push(...result.reasons);
    signatureChecksPass = result.valid && result.signers.length >= 2;
  }

  let observationChecksPass = false;
  if (!input.observations || input.observations.length < 2)
    reasons.push("INDEPENDENT_SOURCE_EVIDENCE_UNAVAILABLE");
  else {
    const policy = input.policy ?? DEVELOPMENT_AGGREGATION_POLICY;
    const aggregate = aggregatePriceObservations(
      report.marketId,
      "ARC",
      input.observations,
      input.blockTimestamp,
      policy,
    );
    if (aggregate.status !== "READY")
      reasons.push("SOURCE_AGGREGATION_BLOCKED", ...aggregate.reasonCodes);
    if (
      report.sourceCount !== BigInt(input.observations.length) ||
      report.independentSourceCount !== BigInt(aggregate.independentSourceCount)
    )
      reasons.push("SOURCE_COUNT_MISMATCH");
    if (
      aggregate.medianPriceWad !== report.midPriceWad ||
      aggregate.minPriceWad === null ||
      aggregate.maxPriceWad === null ||
      report.minPriceWad > aggregate.minPriceWad ||
      report.maxPriceWad < aggregate.maxPriceWad
    )
      reasons.push("SOURCE_PRICE_BAND_MISMATCH");
    if (aggregate.confidenceBps === null || report.confidenceBps > aggregate.confidenceBps)
      reasons.push("SOURCE_CONFIDENCE_MISMATCH");
    if (
      oracleObservationRoot(input.observations).toLowerCase() !== report.evidenceRoot.toLowerCase()
    )
      reasons.push("SOURCE_EVIDENCE_ROOT_MISMATCH");
    if (input.observations.some((item) => item.evidenceRoot === `0x${"00".repeat(32)}`))
      reasons.push("SOURCE_RESPONSE_HASH_MISSING");
    observationChecksPass = !reasons.some(
      (reason) =>
        reason.startsWith("SOURCE_") || reason === "INDEPENDENT_SOURCE_EVIDENCE_UNAVAILABLE",
    );
  }
  // Source response hashes and reporter signatures cannot by themselves prove
  // the offchain responses came from independent origins. No qualification PASS.
  return {
    report,
    digest: signedCompositeDigest(report),
    signatureChecksPass,
    observationChecksPass,
    sourceProvenance: "UNVERIFIED_EXTERNAL",
    qualificationReady: false,
    reasons,
  };
}
