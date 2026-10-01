import type { MarketObservation } from "@arcmemeperps/domain";
import { assessRisk, type RiskRuleConfig } from "./index.js";

export interface CalibrationCase {
  readonly id: string;
  readonly observation: MarketObservation;
}

export interface CalibrationResult {
  readonly ruleVersion: string;
  readonly total: number;
  readonly qualified: number;
  readonly watch: number;
  readonly rejected: number;
  readonly derivativesWatchOrBlocked: number;
  readonly insufficientEvidence: number;
  readonly hardGateFrequency: Readonly<Record<string, number>>;
}

export function calibrateRules(
  cases: readonly CalibrationCase[],
  rules: RiskRuleConfig,
  assessedAt: string,
): CalibrationResult {
  const frequency = new Map<string, number>();
  let qualified = 0;
  let watch = 0;
  let rejected = 0;
  let derivativesWatchOrBlocked = 0;
  let insufficientEvidence = 0;
  for (const item of cases) {
    const result = assessRisk(item.observation, { rules, assessedAt });
    if (result.integrityStatus === "QUALIFIED") qualified += 1;
    else if (result.integrityStatus === "WATCH") watch += 1;
    else rejected += 1;
    if (result.derivativesStatus === "WATCH" || result.derivativesStatus === "BLOCKED")
      derivativesWatchOrBlocked += 1;
    for (const gate of result.hardGates) {
      if (!gate.passed) frequency.set(gate.code, (frequency.get(gate.code) ?? 0) + 1);
      if (gate.code === "INSUFFICIENT_EVIDENCE" && !gate.passed) insufficientEvidence += 1;
    }
  }
  return {
    ruleVersion: rules.version,
    total: cases.length,
    qualified,
    watch,
    rejected,
    derivativesWatchOrBlocked,
    insufficientEvidence,
    hardGateFrequency: Object.fromEntries(
      [...frequency.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

export interface ThresholdSensitivity {
  readonly threshold: number;
  readonly qualified: number;
  readonly rejected: number;
}

/** Only changes the connected-cluster development rule; all other rules stay fixed. */
export function clusterThresholdSensitivity(
  cases: readonly CalibrationCase[],
  rules: RiskRuleConfig,
  thresholds: readonly number[],
  assessedAt: string,
): readonly ThresholdSensitivity[] {
  return thresholds.map((threshold) => {
    const result = calibrateRules(
      cases,
      { ...rules, maxConnectedClusterPct: threshold },
      assessedAt,
    );
    return { threshold, qualified: result.qualified, rejected: result.rejected };
  });
}
