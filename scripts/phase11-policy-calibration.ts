import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FIXTURE_CASES } from "../fixtures/corpus.js";
import type { RiskAssessment } from "@arcmemeperps/domain";
import {
  assessRisk,
  CORE_SAFETY_RISK_RULES,
  FINAL_RISK_RULES,
  type RiskRuleConfig,
} from "@arcmemeperps/risk-engine";

type PersistedCandidate = {
  readonly candidate: {
    readonly chain: string;
    readonly tokenAddress: string;
    readonly symbol: string | null;
  };
  readonly observedAt: string;
  readonly record: Parameters<typeof assessRisk>[0];
};

const inputPath = resolve(process.cwd(), "evidence/winner-rebuild/real-market-intelligence.json");
const inputText = readFileSync(inputPath, "utf8");
const input = JSON.parse(inputText) as { readonly candidates: readonly PersistedCandidate[] };
const assessedAt = "2026-10-08T00:00:00.000Z";

function evaluate(candidate: PersistedCandidate, rules: RiskRuleConfig): RiskAssessment {
  return assessRisk(candidate.record, { assessedAt, rules });
}

function summary(assessment: RiskAssessment) {
  return {
    coreIntegrity: assessment.coreIntegrityStatus,
    surveillance: assessment.surveillanceStatus,
    derivatives: assessment.derivativesStatus,
    coverage: assessment.evidenceCoverage.overall,
    maxLeverage: assessment.recommendedMaxLeverage,
    maxOI: assessment.recommendedMaxOI,
    maxPosition: assessment.recommendedMaxPosition,
    rejectionReasons: assessment.rejectionReasons.map((item) => item.code),
    unknownReasons: assessment.unknownReasons.map((item) => item.code),
    warningReasons: assessment.warnings.map((item) => item.code),
  };
}

function counts(results: readonly ReturnType<typeof summary>[]) {
  const count = (field: keyof ReturnType<typeof summary>, value: string) =>
    results.filter((item) => item[field] === value).length;
  return {
    coreQualified: count("coreIntegrity", "QUALIFIED"),
    corePending: count("coreIntegrity", "PENDING"),
    coreRejected: count("coreIntegrity", "REJECTED"),
    surveillanceClear: count("surveillance", "CLEAR"),
    surveillanceWatch: count("surveillance", "WATCH"),
    surveillanceLimited: count("surveillance", "LIMITED"),
    surveillanceHighRisk: count("surveillance", "HIGH_RISK"),
    derivativesEligible: count("derivatives", "ELIGIBLE"),
    derivativesWatch: count("derivatives", "WATCH"),
    derivativesBlocked: count("derivatives", "BLOCKED"),
    derivativesUnassessed: count("derivatives", "UNASSESSED"),
  };
}

const baseline = input.candidates.map((candidate) => ({
  candidate: candidate.candidate,
  result: summary(evaluate(candidate, CORE_SAFETY_RISK_RULES)),
}));
const final = input.candidates.map((candidate) => ({
  candidate: candidate.candidate,
  result: summary(evaluate(candidate, FINAL_RISK_RULES)),
}));

const transitions = final.flatMap((item, index) => {
  const before = baseline[index]!;
  const changed = JSON.stringify(before.result) !== JSON.stringify(item.result);
  return changed
    ? [{ candidate: item.candidate, before: before.result, after: item.result }]
    : [];
});

const realCorpusSensitivity = [10_000, 25_000, 50_000].map((minimumSafeOpenInterestUsd) => {
  const rules: RiskRuleConfig = { ...FINAL_RISK_RULES, minimumSafeOpenInterestUsd };
  const results = input.candidates.map((candidate) => summary(evaluate(candidate, rules)));
  return { minimumSafeOpenInterestUsd, counts: counts(results) };
});

const coefficientSensitivity = [
  { name: "conservative", depthCapacityHaircut: 0.25, manipulationCapacityFraction: 0.025 },
  { name: "final", depthCapacityHaircut: 0.5, manipulationCapacityFraction: 0.05 },
  { name: "less-conservative", depthCapacityHaircut: 0.75, manipulationCapacityFraction: 0.1 },
].map((variant) => {
  const rules: RiskRuleConfig = { ...FINAL_RISK_RULES, ...variant };
  const results = input.candidates.map((candidate) => summary(evaluate(candidate, rules)));
  return { ...variant, counts: counts(results) };
});

const securityRegression = FIXTURE_CASES.map((fixture) => {
  const assessment = assessRisk(fixture.market.observation, {
    assessedAt,
    rules: FINAL_RISK_RULES,
  });
  return {
    id: fixture.id,
    expectedCoreUnsafe: fixture.expected.integrityStatus === "REJECTED",
    coreIntegrity: assessment.coreIntegrityStatus,
    derivatives: assessment.derivativesStatus,
    rejectionReasons: assessment.rejectionReasons.map((item) => item.code),
  };
});

const explicitUnsafeIds = [
  "active-mint-authority",
  "withdrawable-lp",
  "cluster-fifteen",
  "cluster-over-five-individual-under-five",
  "cluster-six-point-three-individuals-under-five",
  "bundled-launch",
  "known-risk-deployer",
];

const output = {
  schemaVersion: "winner-rebuild/phase11-policy-calibration-v1",
  generatedAt: new Date().toISOString(),
  assessedAt,
  source: {
    artifact: "evidence/winner-rebuild/real-market-intelligence.json",
    sha256: createHash("sha256").update(inputText).digest("hex"),
    persistedCandidateCount: input.candidates.length,
    noNewProviderCalls: true,
    noSyntheticObservations: true,
  },
  baselinePolicy: {
    version: CORE_SAFETY_RISK_RULES.version,
    counts: counts(baseline.map((item) => item.result)),
    candidates: baseline,
  },
  finalPolicy: {
    version: FINAL_RISK_RULES.version,
    counts: counts(final.map((item) => item.result)),
    candidates: final,
  },
  classificationTransitions: transitions,
  sensitivity: {
    note: "Hypothetical threshold sweeps over the frozen corpus; no sweep changes the committed policy.",
    minimumSafeOpenInterestUsd: realCorpusSensitivity,
    capacityCoefficients: coefficientSensitivity,
  },
  securityRegression: {
    cases: securityRegression,
    explicitUnsafeCasesRemainRejected: explicitUnsafeIds.every(
      (id) => securityRegression.find((item) => item.id === id)?.coreIntegrity === "REJECTED",
    ),
  },
};

const outputPath = resolve(process.cwd(), "evidence/winner-rebuild/phase11-policy-calibration.json");
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(
  `${JSON.stringify({
    corpus: input.candidates.length,
    baseline: output.baselinePolicy.counts,
    final: output.finalPolicy.counts,
    transitions: transitions.length,
    explicitUnsafeCasesRemainRejected: output.securityRegression.explicitUnsafeCasesRemainRejected,
  })}\n`,
);
