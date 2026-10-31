import { describe, expect, it } from "vitest";
import { encodeFunctionData, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  SIGNED_COMPOSITE_PRIMARY_TYPE,
  SIGNED_COMPOSITE_TYPES,
  signedCompositeDomain,
  type PriceObservation,
  type SignedCompositeReport,
} from "@arcmemeperps/oracle";
import {
  assessHistoricalOracleEvidence,
  oracleObservationRoot,
  SIGNED_REPORT_WRITE_ABI,
  type HistoricalOracleEvidence,
} from "./oracle-evidence.js";

const hash = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}`;
const marketId = hash(1);
const router = "0x1531c83ac90e5ec5998eaf42a4464757dcd2c3ff";
const alice = privateKeyToAccount(`0x${"11".repeat(32)}`);
const bob = privateKeyToAccount(`0x${"22".repeat(32)}`);
const charlie = privateKeyToAccount(`0x${"33".repeat(32)}`);
const observations: PriceObservation[] = [
  {
    marketId,
    chain: "ARC",
    source: "pool-A",
    sourceFamily: "DIRECT_UNISWAP_POOL",
    underlyingVenueId: "pool-A",
    rawPrice: 1_000_000n,
    priceDecimals: 6,
    observedAt: 995n,
    confidenceBps: 9_500n,
    evidenceRoot: hash(10),
  },
  {
    marketId,
    chain: "ARC",
    source: "feed-B",
    sourceFamily: "CHAINLINK_FEED",
    underlyingVenueId: "feed-B",
    rawPrice: 1_000_000n,
    priceDecimals: 6,
    observedAt: 996n,
    confidenceBps: 9_500n,
    evidenceRoot: hash(11),
  },
];
const baseReport: SignedCompositeReport = {
  marketId,
  arcChainId: 5042n,
  oracleRouter: router,
  midPriceWad: 10n ** 18n,
  minPriceWad: 990_000_000_000_000_000n,
  maxPriceWad: 1_010_000_000_000_000_000n,
  confidenceBps: 9_500n,
  sourceCount: 2n,
  independentSourceCount: 2n,
  observedAt: 996n,
  validFrom: 990n,
  expiresAt: 1_100n,
  sequence: 1n,
  evidenceRoot: oracleObservationRoot(observations),
  reporterSetVersion: hash(12),
};
async function fixture(
  overrides: {
    report?: Partial<SignedCompositeReport>;
    observations?: PriceObservation[];
    signers?: (typeof alice)[];
    priorSequence?: bigint | null;
  } = {},
): Promise<HistoricalOracleEvidence> {
  const report = { ...baseReport, ...overrides.report };
  const signers = overrides.signers ?? [alice, bob];
  const signatures = await Promise.all(
    signers.map((account) =>
      account.signTypedData({
        domain: signedCompositeDomain(report.arcChainId, router),
        types: SIGNED_COMPOSITE_TYPES,
        primaryType: SIGNED_COMPOSITE_PRIMARY_TYPE,
        message: report,
      }),
    ),
  );
  return {
    transactionInput: encodeFunctionData({
      abi: SIGNED_REPORT_WRITE_ABI,
      functionName: "setSignedReport",
      args: [
        {
          marketId: report.marketId,
          arcChainId: report.arcChainId,
          midPrice: report.midPriceWad,
          minPrice: report.minPriceWad,
          maxPrice: report.maxPriceWad,
          confidenceBps: report.confidenceBps,
          sourceCount: report.sourceCount,
          independentSourceCount: report.independentSourceCount,
          observedAt: report.observedAt,
          validFrom: report.validFrom,
          expiresAt: report.expiresAt,
          sequence: report.sequence,
          evidenceRoot: report.evidenceRoot,
          reporterSetVersion: report.reporterSetVersion,
        },
        signatures,
      ],
    }),
    router,
    transactionTo: router,
    transactionReceiptStatus: "success",
    receiptBlockHash: hash(100),
    expectedMarketId: marketId,
    eventSequence: 1n,
    priorSequence: overrides.priorSequence === undefined ? 0n : overrides.priorSequence,
    blockTimestamp: 1_000n,
    reporterSet: { version: hash(12), reporters: [alice.address, bob.address], threshold: 2 },
    observations: overrides.observations ?? observations,
  };
}

describe("historical oracle report evidence", () => {
  it("checks EIP-712 signatures, counts, band, timestamps, root and sequence while keeping source provenance unverified", async () => {
    const assessed = await assessHistoricalOracleEvidence(await fixture());
    expect(assessed.digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(assessed.signatureChecksPass).toBe(true);
    expect(assessed.observationChecksPass).toBe(true);
    expect(assessed.qualificationReady).toBe(false);
    expect(assessed.sourceProvenance).toBe("UNVERIFIED_EXTERNAL");
    expect(assessed.reasons).toEqual([]);
  });
  it("rejects threshold failure and duplicate signer", async () => {
    expect(
      (await assessHistoricalOracleEvidence(await fixture({ signers: [alice] }))).reasons,
    ).toContain("INSUFFICIENT_THRESHOLD");
    expect(
      (await assessHistoricalOracleEvidence(await fixture({ signers: [alice, alice] }))).reasons,
    ).toContain("DUPLICATE_SIGNER");
    const unauthorized = await assessHistoricalOracleEvidence(
      await fixture({ signers: [alice, charlie] }),
    );
    expect(unauthorized.reasons).toEqual(
      expect.arrayContaining(["UNAUTHORIZED_SIGNER", "INSUFFICIENT_THRESHOLD"]),
    );
  });
  it("rejects wrong chain, replay, expiry, and a mismatched evidence root", async () => {
    const assessed = await assessHistoricalOracleEvidence(
      await fixture({
        report: { arcChainId: 1n, expiresAt: 999n, evidenceRoot: hash(55) },
        priorSequence: 1n,
      }),
    );
    expect(assessed.reasons).toEqual(
      expect.arrayContaining([
        "WRONG_CHAIN",
        "REPORT_SEQUENCE_REPLAY_OR_EVENT_MISMATCH",
        "REPORT_TIME_WINDOW_INVALID",
        "SOURCE_EVIDENCE_ROOT_MISMATCH",
      ]),
    );
  });
  it("rejects correlated feeds counted as independent and unsigned updates", async () => {
    const correlated = [observations[0]!, { ...observations[1]!, underlyingVenueId: "pool-A" }];
    const assessed = await assessHistoricalOracleEvidence(
      await fixture({ observations: correlated }),
    );
    expect(assessed.reasons).toContain("SOURCE_AGGREGATION_BLOCKED");
    expect(assessed.reasons).toContain("SOURCE_COUNT_MISMATCH");
    const unsigned = await assessHistoricalOracleEvidence({
      ...(await fixture()),
      transactionInput: "0x",
    });
    expect(unsigned.reasons).toContain("UNSIGNED_OR_UNDECODABLE_ORACLE_UPDATE");
  });
  it("fails closed on stale source readings and a missing reporter set", async () => {
    const stale = [{ ...observations[0]!, observedAt: 1n }, observations[1]!];
    const assessed = await assessHistoricalOracleEvidence(await fixture({ observations: stale }));
    expect(assessed.reasons).toContain("SOURCE_AGGREGATION_BLOCKED");
    const missingSet = await assessHistoricalOracleEvidence({
      ...(await fixture()),
      reporterSet: null,
    });
    expect(missingSet.reasons).toContain("PINNED_REPORTER_SET_UNAVAILABLE_OR_WEAK");
    expect(missingSet.qualificationReady).toBe(false);
  });
  it("rejects a reverted receipt or wrong transaction target", async () => {
    const assessed = await assessHistoricalOracleEvidence({
      ...(await fixture()),
      transactionTo: "0x0000000000000000000000000000000000000001",
      transactionReceiptStatus: "reverted",
      receiptBlockHash: null,
    });
    expect(assessed.reasons).toEqual(
      expect.arrayContaining(["WRONG_ORACLE_ROUTER", "RECEIPT_UNCONFIRMED_OR_UNPINNED"]),
    );
  });
});
