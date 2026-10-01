import type { SignedCompositeReport, SignedReportSignature } from "@arcmemeperps/oracle";
import type { HealthRecord } from "@arcmemeperps/shared";

export interface ReporterObservationSource {
  observe(marketId: `0x${string}`): Promise<SignedCompositeReport>;
}
export interface ReporterSigner {
  sign(report: SignedCompositeReport): Promise<SignedReportSignature>;
}

/** One reporter process owns one signer. Threshold aggregation remains a separate concern. */
export class ReporterService {
  public constructor(
    private readonly observations: ReporterObservationSource,
    private readonly signer: ReporterSigner | null,
  ) {}
  public async createSignedReport(marketId: `0x${string}`): Promise<{
    readonly report: SignedCompositeReport;
    readonly signature: SignedReportSignature;
  }> {
    if (this.signer === null) throw new Error("REPORTER_SIGNER_UNAVAILABLE");
    const report = await this.observations.observe(marketId);
    return { report, signature: await this.signer.sign(report) };
  }
  public health(): HealthRecord {
    return {
      component: "ORACLE_REPORTERS",
      state: this.signer === null ? "UNAVAILABLE" : "OPERATIONAL",
      lastSuccessAt: null,
      latencyMs: null,
      error: this.signer === null ? "REPORTER_SIGNER_UNAVAILABLE" : null,
      freshness: this.signer === null ? "UNAVAILABLE" : "FRESH",
    };
  }
}
