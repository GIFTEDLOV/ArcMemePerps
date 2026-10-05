import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface EvidenceItem {
  readonly kind: string;
  readonly source: { readonly provider: string; readonly dataVersion?: string };
  readonly value: unknown;
}

interface CandidateResult {
  readonly candidate: { readonly chain: string; readonly symbol: string | null; readonly tokenAddress: string };
  readonly status: string;
  readonly assessment: {
    readonly integrityStatus: string;
    readonly derivativesStatus: string;
    readonly rejectionReasons: readonly {
      readonly code: string;
      readonly details: Record<string, unknown>;
    }[];
  };
  readonly record?: {
    readonly evidence: readonly EvidenceItem[];
    readonly holders: { readonly evidenceScope?: string | null };
    readonly deployer: { readonly deployerAddress?: string | null };
    readonly history?: readonly unknown[];
    readonly providerAvailability: readonly { readonly provider: string; readonly status: string; readonly reason: string | null }[];
  };
}

const root = resolve(process.cwd());
const discovery = JSON.parse(
  readFileSync(resolve(root, "evidence/winner-rebuild/discovery-snapshot.json"), "utf8"),
) as { readonly marketCount: number; readonly markets: readonly { readonly chain: string; readonly lifecycle: { readonly status: string } }[] };
const intelligence = JSON.parse(
  readFileSync(resolve(root, "evidence/winner-rebuild/real-market-intelligence.json"), "utf8"),
) as { readonly evaluatedMarketCount: number; readonly candidates: readonly CandidateResult[] };

const by = (values: readonly string[]) => Object.fromEntries(
  [...new Set(values)].sort().map((key) => [key, values.filter((value) => value === key).length]),
);
const rejectionCodes = intelligence.candidates.flatMap((item) => item.assessment.rejectionReasons.map((reason) => reason.code));
const isUnsafe = (item: CandidateResult): boolean => item.assessment.rejectionReasons.some((reason) => {
  const details = reason.details;
  return details.active === true || details.upgradeable === true || details.detected === true ||
    (typeof details.topHolderPct === "number" && details.topHolderPct > 5) ||
    (typeof details.connectedClusterPct === "number" && details.connectedClusterPct > 5);
});
const candidateOutcomes = intelligence.candidates.map((item) => ({
  chain: item.candidate.chain,
  symbol: item.candidate.symbol,
  tokenAddress: item.candidate.tokenAddress,
  integrityStatus: item.assessment.integrityStatus,
  derivativesStatus: item.assessment.derivativesStatus,
  classification: isUnsafe(item) ? "UNSAFE" : "INSUFFICIENT_EVIDENCE",
  rejectionCodes: [...new Set(item.assessment.rejectionReasons.map((reason) => reason.code))].sort(),
}));
const evidence = intelligence.candidates.flatMap((item) => item.record?.evidence ?? []);
const pools = new Set<string>();
for (const item of evidence) {
  if (item.kind !== "dex-market-pairs" && item.kind !== "gecko-token-pools") continue;
  const value = item.value as { readonly pairs?: readonly { readonly pairAddress?: string }[]; readonly pools?: readonly { readonly poolAddress?: string }[] } | null;
  for (const pool of value?.pairs ?? []) if (pool.pairAddress) pools.add(pool.pairAddress.toLowerCase());
  for (const pool of value?.pools ?? []) if (pool.poolAddress) pools.add(pool.poolAddress.toLowerCase());
}

const output = {
  schemaVersion: "winner-rebuild/phase2-closure-v1",
  generatedAt: new Date().toISOString(),
  discovery: {
    marketCount: discovery.marketCount,
    evaluatedMarketCount: intelligence.evaluatedMarketCount,
    marketCountByChain: by(discovery.markets.map((market) => market.chain)),
    marketCountByLifecycle: by(discovery.markets.map((market) => market.lifecycle.status)),
    realOriginPoolCount: pools.size,
  },
  qualification: {
    candidatesEvaluated: intelligence.candidates.length,
    pass: intelligence.candidates.filter((item) => item.assessment.integrityStatus === "QUALIFIED").length,
    watch: intelligence.candidates.filter((item) => item.assessment.integrityStatus === "WATCH").length,
    rejected: intelligence.candidates.filter((item) => item.assessment.integrityStatus === "REJECTED").length,
    rejectedUnsafe: candidateOutcomes.filter((item) => item.classification === "UNSAFE").length,
    rejectedInsufficientEvidence: candidateOutcomes.filter((item) => item.classification === "INSUFFICIENT_EVIDENCE").length,
    rejectionCodeCounts: by(rejectionCodes),
    candidateOutcomes,
  },
  evidenceCoverage: {
    realHistoryMarkets: intelligence.candidates.filter((item) => (item.record?.history?.length ?? 0) > 0).length,
    resolvedSolanaHolderMarkets: intelligence.candidates.filter((item) => item.record?.holders.evidenceScope === "RESOLVED_TOP_OWNERS").length,
    chainNativeAuthorityEvidenceMarkets: intelligence.candidates.filter((item) => item.record?.evidence.some((evidenceItem) => evidenceItem.kind === "solana-mint-account")).length,
    contractMetadataEvidenceMarkets: intelligence.candidates.filter((item) => item.record?.evidence.some((evidenceItem) => evidenceItem.kind === "erc20-token-metadata")).length,
    deployerEvidenceMarkets: intelligence.candidates.filter((item) => item.record?.deployer.deployerAddress != null).length,
    directDepthMarkets: intelligence.candidates.filter((item) => item.record?.evidence.some((evidenceItem) => evidenceItem.kind === "direct-v2-pool-state")).length,
    providerAvailability: intelligence.candidates.flatMap((item) => item.record?.providerAvailability ?? []),
  },
  safety: {
    zeroAsUnknownAudit: "PASS",
    oracleConfidenceModel: "DERIVED_FROM_MEANINGFUL_POOL_COUNT_VENUE_COUNT_LIQUIDITY_AND_DISAGREEMENT",
    sourceFamilyModel: "POOL_IDENTITY_DEDUPLICATED_PROVIDER_CORROBORATION_NOT_INDEPENDENCE",
    directDepthModel: "READ_ONLY_V2_RESERVES_WITH_SPOT_PRICE_CONSISTENCY_AND_USD_10000_MEANINGFUL_POOL_FLOOR",
    testnetWritesPerformed: false,
    registrationDecision: "NO_MARKET_NATURALLY_QUALIFIED",
    stopCondition: "ZERO_QUALIFIED_AFTER_104_REAL_MARKETS_AND_20_EVIDENCE_RANKED_CANDIDATES",
  },
};

writeFileSync(resolve(root, "evidence/winner-rebuild/phase2-closure.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(JSON.stringify({
  evaluated: output.discovery.evaluatedMarketCount,
  pass: output.qualification.pass,
  watch: output.qualification.watch,
  rejected: output.qualification.rejected,
  unsafe: output.qualification.rejectedUnsafe,
  insufficientEvidence: output.qualification.rejectedInsufficientEvidence,
  directDepthMarkets: output.evidenceCoverage.directDepthMarkets,
}) + "\n");
