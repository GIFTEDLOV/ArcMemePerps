import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MarketObservation } from "@arcmemeperps/domain";
import {
  assessRisk,
  AUDITED_RISK_RULES,
  DEVELOPMENT_RISK_RULES,
  type RiskRuleConfig,
} from "@arcmemeperps/risk-engine";
import { FIXTURE_CASES } from "../fixtures/corpus.js";

const root = resolve(process.cwd());
const originalInput = JSON.parse(readFileSync(resolve(root, "evidence/winner-rebuild/real-market-intelligence.json"), "utf8")) as InputFile;
const auditedPath = resolve(root, "evidence/winner-rebuild/real-market-intelligence-phase3.json");
const auditedInput = readJsonIfPresent(auditedPath) ?? originalInput;
const assessedAt = new Date().toISOString();

interface InputFile {
  readonly candidates: readonly Candidate[];
}
interface Candidate {
  readonly candidate: { readonly marketId: string; readonly chain: string; readonly tokenAddress: string; readonly symbol: string | null };
  readonly record?: MarketObservation;
}

function readJsonIfPresent(path: string): InputFile | null {
  try { return JSON.parse(readFileSync(path, "utf8")) as InputFile; } catch { return null; }
}

function observations(input: InputFile): readonly Candidate[] {
  return input.candidates.filter((item) => item.record !== undefined);
}

type Assessment = ReturnType<typeof assessRisk>;

function evaluate(candidate: Candidate, rules: RiskRuleConfig, mode: "LEGACY" | "AUDITED"): Assessment {
  return assessRisk(candidate.record!, { assessedAt, rules, mode });
}

function summarize(items: readonly { candidate: Candidate; assessment: Assessment }[]) {
  const byGate = (state: "FAIL" | "UNKNOWN") => Object.fromEntries(
    [...items.flatMap(({ assessment }) => assessment.hardGates.filter((gate) => gate.state === state).map((gate) => gate.code).reduce<string[]>((all, code) => { all.push(code); return all; }, []))]
      .reduce<Map<string, number>>((counts, code) => { counts.set(code, (counts.get(code) ?? 0) + 1); return counts; }, new Map())
      .entries(),
  );
  const qualified = items.filter(({ assessment }) => assessment.integrityStatus === "QUALIFIED");
  const watch = items.filter(({ assessment }) => assessment.integrityStatus === "WATCH");
  const pending = items.filter(({ assessment }) => assessment.integrityStatus === "PENDING");
  const rejected = items.filter(({ assessment }) => assessment.integrityStatus === "REJECTED");
  return {
    total: items.length,
    qualified: qualified.length,
    watch: watch.length,
    pendingInsufficientEvidence: pending.length,
    rejectedUnsafe: rejected.length,
    derivativesEligible: items.filter(({ assessment }) => assessment.derivativesStatus === "ELIGIBLE").length,
    derivativesWatch: items.filter(({ assessment }) => assessment.derivativesStatus === "WATCH").length,
    derivativesUnassessedOrBlocked: items.filter(({ assessment }) => assessment.derivativesStatus === "UNASSESSED" || assessment.derivativesStatus === "BLOCKED").length,
    failureFrequency: byGate("FAIL"),
    unknownFrequency: byGate("UNKNOWN"),
    outcomes: items.map(({ candidate, assessment }) => ({
      marketId: candidate.candidate.marketId,
      chain: candidate.candidate.chain,
      tokenAddress: candidate.candidate.tokenAddress,
      symbol: candidate.candidate.symbol,
      integrityStatus: assessment.integrityStatus,
      derivativesStatus: assessment.derivativesStatus,
      hardFailures: assessment.hardGates.filter((gate) => gate.state === "FAIL").map((gate) => gate.code),
      unknownGates: assessment.hardGates.filter((gate) => gate.state === "UNKNOWN").map((gate) => gate.code),
      warnings: assessment.warnings.map(({ code }) => code),
    })),
  };
}

const original = observations(originalInput).map((candidate) => ({ candidate, assessment: evaluate(candidate, DEVELOPMENT_RISK_RULES, "LEGACY") }));
const audited = observations(auditedInput).map((candidate) => ({ candidate, assessment: evaluate(candidate, AUDITED_RISK_RULES, "AUDITED") }));

const sensitivityFields = [
  ["maxIndividualHolderPct", [2.5, 5, 7.5]],
  ["maxConnectedClusterPct", [2.5, 5, 7.5]],
  ["maxBundledLaunchPct", [5, 10, 15]],
  ["maxDeployerHoldingsPct", [5, 10, 15]],
  ["minimumSpotLiquidityUsd", [250_000, 500_000, 1_000_000]],
  ["minimumDepth1PctUsd", [25_000, 50_000, 100_000]],
  ["minimumDepth2PctUsd", [50_000, 100_000, 200_000]],
  ["minimumOrganicVolume24hUsd", [50_000, 100_000, 250_000]],
  ["maximumRealizedVolatilityPct", [100, 150, 250]],
  ["minimumOracleSources", [1, 2, 3]],
  ["maximumOracleDisagreementPct", [1, 3, 5]],
  ["minimumOracleConfidenceBps", [7_500, 8_500, 9_000]],
  ["minimumManipulationCostUsd", [50_000, 100_000, 250_000]],
  ["minimumLiquidationCapacityUsd", [50_000, 100_000, 250_000]],
  ["minimumSafeOpenInterestUsd", [10_000, 25_000, 50_000]],
] as const;

const sensitivity = Object.fromEntries(sensitivityFields.map(([field, values]) => [field, values.map((value) => {
  const rules = { ...AUDITED_RISK_RULES, [field]: value };
  const results = observations(auditedInput).map((candidate) => evaluate(candidate, rules, "AUDITED"));
  return { value, qualified: results.filter((result) => result.integrityStatus === "QUALIFIED").length, pending: results.filter((result) => result.integrityStatus === "PENDING").length, rejected: results.filter((result) => result.integrityStatus === "REJECTED").length, eligible: results.filter((result) => result.derivativesStatus === "ELIGIBLE").length };
})]));

const changes = audited.map(({ candidate, assessment }) => {
  const before = original.find((item) => item.candidate.candidate.marketId === candidate.candidate.marketId)?.assessment;
  return {
    marketId: candidate.candidate.marketId,
    tokenAddress: candidate.candidate.tokenAddress,
    symbol: candidate.candidate.symbol,
    original: before === undefined ? null : { integrityStatus: before.integrityStatus, derivativesStatus: before.derivativesStatus },
    audited: { integrityStatus: assessment.integrityStatus, derivativesStatus: assessment.derivativesStatus },
    reason: before === undefined ? "NEW_OR_ENRICHED_INPUT" : `${before.integrityStatus}/${before.derivativesStatus} -> ${assessment.integrityStatus}/${assessment.derivativesStatus}`,
  };
});

const unsafeControls = FIXTURE_CASES.filter((fixture) => fixture.expected.integrityStatus === "REJECTED").map((fixture) => {
  const result = assessRisk(fixture.market.observation, { assessedAt, rules: AUDITED_RISK_RULES, mode: "AUDITED" });
  return { id: fixture.id, integrityStatus: result.integrityStatus, derivativesStatus: result.derivativesStatus, expectedRejected: result.integrityStatus === "REJECTED" };
});

const output = {
  schemaVersion: "qualification-calibration/v1",
  generatedAt: assessedAt,
  input: {
    original: "evidence/winner-rebuild/real-market-intelligence.json",
    audited: readJsonIfPresent(auditedPath) === null ? "evidence/winner-rebuild/real-market-intelligence.json" : "evidence/winner-rebuild/real-market-intelligence-phase3.json",
    discoveryMarketCount: 104,
  },
  currentRulesUnchanged: summarize(original),
  auditedRules: summarize(audited),
  changes,
  sensitivity,
  securityRegression: { unsafeControls, allExplicitUnsafeRemainRejected: unsafeControls.every((item) => item.expectedRejected) },
  decision: audited.some(({ assessment }) => assessment.integrityStatus === "QUALIFIED") ? "QUALIFIED_MARKET_REVIEW_ALLOWED" : "NO_NATURAL_QUALIFICATION_STOP_UNLESS_EVIDENCE_OR_EXPLICIT_RISK_REMAINS",
};

writeFileSync(resolve(root, "evidence/winner-rebuild/qualification-calibration.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(JSON.stringify({ original: output.currentRulesUnchanged, audited: output.auditedRules, decision: output.decision }) + "\n");
