import type { MarketObservation, RiskAssessment } from "@arcmemeperps/domain";
import {
  qualificationProofFromAssessment,
  qualificationProofHash,
  type QualificationProof,
} from "@arcmemeperps/qualification-proof";
import { assessRisk, type RiskEvaluationOptions } from "@arcmemeperps/risk-engine";

export interface ObservationLoader {
  load(tokenAddress: string): Promise<MarketObservation>;
}

export interface AssessmentReadModel {
  readonly assessment: RiskAssessment;
  readonly qualificationProof: QualificationProof;
  readonly qualificationProofHash: `0x${string}`;
}

/**
 * Backend application boundary. Transport, persistence, and provider wiring are deliberately
 * outside this class so a future HTTP API cannot encode chain-specific rules.
 */
export class MarketAssessmentService {
  public constructor(private readonly observations: ObservationLoader) {}

  public async assess(
    tokenAddress: string,
    evidenceHashes: Readonly<Record<string, `0x${string}`>>,
    options: RiskEvaluationOptions,
  ): Promise<AssessmentReadModel> {
    const observation = await this.observations.load(tokenAddress);
    const assessment = assessRisk(observation, options);
    const qualificationProof = qualificationProofFromAssessment(assessment, evidenceHashes);
    return {
      assessment,
      qualificationProof,
      qualificationProofHash: qualificationProofHash(qualificationProof),
    };
  }
}

export const apiBuildState = {
  transport: "versioned HTTP read model with SSE realtime stream",
  liveProviders: true,
  writesToArc: false,
} as const;
