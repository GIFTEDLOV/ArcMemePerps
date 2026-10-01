import type { SignedCompositeReport, SignedReportSignature } from "@arcmemeperps/oracle";
import type { HealthRecord } from "@arcmemeperps/shared";

export interface ReporterObservationSource {
  observe(marketId: `0x${string}`): Promise<SignedCompositeReport>;
}
export interface ReporterSigner {
  sign(report: SignedCompositeReport): Promise<SignedReportSignature>;
}
export interface ReporterSequenceStore {
  load(marketId: `0x${string}`): Promise<bigint>;
  save(marketId: `0x${string}`, sequence: bigint): Promise<void>;
}

/** One reporter process owns one signer. Threshold aggregation remains a separate concern. */
export class ReporterService {
  private lastSuccessAt: string | null = null;
  private lastError: string | null = null;
  public constructor(
    private readonly observations: ReporterObservationSource,
    private readonly signer: ReporterSigner | null,
    private readonly sequences: ReporterSequenceStore | null = null,
  ) {}
  public async createSignedReport(marketId: `0x${string}`): Promise<{
    readonly report: SignedCompositeReport;
    readonly signature: SignedReportSignature;
  }> {
    if (this.signer === null) throw new Error("REPORTER_SIGNER_UNAVAILABLE");
    try {
      const report = await this.observations.observe(marketId);
      const previous = this.sequences === null ? 0n : await this.sequences.load(marketId);
      if (report.sequence <= previous) throw new Error("REPORT_SEQUENCE_NOT_MONOTONIC");
      const signature = await this.signer.sign(report);
      if (this.sequences !== null) await this.sequences.save(marketId, report.sequence);
      this.lastSuccessAt = new Date().toISOString();
      this.lastError = null;
      return { report, signature };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "REPORTER_FAILED";
      throw error;
    }
  }
  public health(): HealthRecord {
    return {
      component: "ORACLE_REPORTERS",
      state: this.signer === null ? "UNAVAILABLE" : "OPERATIONAL",
      lastSuccessAt: this.lastSuccessAt,
      latencyMs: null,
      error: this.signer === null ? "REPORTER_SIGNER_UNAVAILABLE" : this.lastError,
      freshness: this.signer === null || this.lastSuccessAt === null ? "UNAVAILABLE" : "FRESH",
    };
  }
}
