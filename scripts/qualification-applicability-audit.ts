import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HardGateCode, MarketObservation } from "@arcmemeperps/domain";
import {
  assessRisk,
  AUDITED_RISK_RULES,
  gateDisposition,
  policyProfileForObservation,
} from "@arcmemeperps/risk-engine";

const root = resolve(process.cwd());
const inputPath = resolve(root, "evidence/winner-rebuild/real-market-intelligence-phase3.json");
const outputPath = resolve(root, "evidence/winner-rebuild/qualification-applicability-audit.json");
const pendingPath = resolve(root, "evidence/winner-rebuild/pending-evidence-matrix.json");

interface Phase3Input {
  readonly fetchedAt: string;
  readonly candidates: readonly {
    readonly candidate: {
      readonly marketId: string;
      readonly chain: string;
      readonly tokenAddress: string;
      readonly symbol: string | null;
    };
    readonly record: MarketObservation;
  }[];
}

const input = JSON.parse(readFileSync(inputPath, "utf8")) as Phase3Input;

const evaluated = input.candidates.map((candidate) => {
  const assessment = assessRisk(candidate.record, {
    assessedAt: input.fetchedAt,
    rules: AUDITED_RISK_RULES,
    mode: "AUDITED",
  });
  const policy = policyProfileForObservation(candidate.record);
  return { candidate, assessment, policy };
});

const frequency = (state: "FAIL" | "UNKNOWN" | "NOT_APPLICABLE") => Object.fromEntries(
  [...evaluated.flatMap(({ assessment }) => assessment.hardGates
    .filter((gate) => gate.state === state)
    .map((gate) => gate.code))]
    .reduce<Map<string, number>>((counts, code) => {
      counts.set(code, (counts.get(code) ?? 0) + 1);
      return counts;
    }, new Map())
    .entries(),
);

const sourceForGate = (code: HardGateCode, policy: ReturnType<typeof policyProfileForObservation>): readonly string[] =>
  policy.evidenceByGate[code] ?? ["policy-specific source evidence"];

const outcomes = evaluated.map(({ candidate, assessment, policy }) => {
  const mandatoryUnknown = assessment.hardGates.filter(
    (gate) => gate.state === "UNKNOWN" && gateDisposition(policy, gate.code) === "MANDATORY" && gate.code !== "INSUFFICIENT_EVIDENCE",
  );
  const optionalUnknown = assessment.hardGates.filter(
    (gate) => gate.state === "UNKNOWN" && gateDisposition(policy, gate.code) === "OPTIONAL",
  );
  return {
    marketId: candidate.candidate.marketId,
    chain: candidate.candidate.chain,
    tokenAddress: candidate.candidate.tokenAddress,
    symbol: candidate.candidate.symbol,
    policyProfile: policy.id,
    integrityStatus: assessment.integrityStatus,
    derivativesStatus: assessment.derivativesStatus,
    gates: assessment.hardGates.map((gate) => ({
      code: gate.code,
      state: gate.state,
      disposition: gateDisposition(policy, gate.code),
    })),
    hardFailures: assessment.hardGates.filter((gate) => gate.state === "FAIL").map((gate) => gate.code),
    mandatoryUnknownGates: mandatoryUnknown.map((gate) => gate.code),
    optionalUnknownGates: optionalUnknown.map((gate) => gate.code),
    warnings: assessment.warnings.map(({ code }) => code),
  };
});

const pendingEvidence = evaluated
  .filter(({ assessment }) => assessment.integrityStatus === "PENDING")
  .map(({ candidate, assessment, policy }) => {
    const missing: { readonly gate: string; readonly evidenceRequired: readonly string[] }[] = assessment.hardGates
      .filter((gate) => gate.state === "UNKNOWN" && gateDisposition(policy, gate.code) === "MANDATORY" && gate.code !== "INSUFFICIENT_EVIDENCE")
      .map((gate) => ({
        gate: gate.code,
        evidenceRequired: sourceForGate(gate.code, policy),
      }));
    if (
      candidate.record.token.chain === "SOLANA"
      && (candidate.record.token.tokenProgram === undefined || candidate.record.token.tokenProgram === "UNKNOWN")
    ) {
      missing.push({
        gate: "TOKEN_PROGRAM_CLASSIFICATION",
        evidenceRequired: ["canonical Solana mint account owner program from RPC"],
      });
    }
    return {
      marketId: candidate.candidate.marketId,
      chain: candidate.candidate.chain,
      tokenAddress: candidate.candidate.tokenAddress,
      symbol: candidate.candidate.symbol,
      policyProfile: policy.id,
      missing,
      derivedGate: "INSUFFICIENT_EVIDENCE",
      closureRule: "Resolve every listed mandatory applicable gate; the derived completeness gate then becomes PASS.",
    };
  });

const output = {
  schemaVersion: "qualification-applicability-audit/v1",
  generatedAt: new Date().toISOString(),
  input: "evidence/winner-rebuild/real-market-intelligence-phase3.json",
  rules: AUDITED_RISK_RULES.version,
  numericThresholdsUnchanged: true,
  candidateCount: evaluated.length,
  notApplicableGateCount: evaluated.reduce((count, item) => count + item.assessment.hardGates.filter((gate) => gate.state === "NOT_APPLICABLE").length, 0),
  perGateFailureFrequency: frequency("FAIL"),
  perGateUnknownFrequency: frequency("UNKNOWN"),
  perGateNotApplicableFrequency: frequency("NOT_APPLICABLE"),
  currentRuleResults: {
    qualified: evaluated.filter(({ assessment }) => assessment.integrityStatus === "QUALIFIED").length,
    watch: evaluated.filter(({ assessment }) => assessment.integrityStatus === "WATCH").length,
    pending: evaluated.filter(({ assessment }) => assessment.integrityStatus === "PENDING").length,
    rejected: evaluated.filter(({ assessment }) => assessment.integrityStatus === "REJECTED").length,
    derivativesEligible: evaluated.filter(({ assessment }) => assessment.derivativesStatus === "ELIGIBLE").length,
    derivativesWatch: evaluated.filter(({ assessment }) => assessment.derivativesStatus === "WATCH").length,
    derivativesUnassessedOrBlocked: evaluated.filter(({ assessment }) => assessment.derivativesStatus === "UNASSESSED" || assessment.derivativesStatus === "BLOCKED").length,
  },
  outcomes,
};

writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
writeFileSync(pendingPath, `${JSON.stringify({
  schemaVersion: "pending-evidence-matrix/v1",
  generatedAt: output.generatedAt,
  rules: output.rules,
  source: output.input,
  candidates: pendingEvidence,
}, null, 2)}\n`, "utf8");

process.stdout.write(JSON.stringify({
  results: output.currentRuleResults,
  notApplicableGateCount: output.notApplicableGateCount,
  pendingEvidenceCandidates: pendingEvidence.length,
}, null, 2) + "\n");
