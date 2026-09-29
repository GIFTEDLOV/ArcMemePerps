import type {
  AssessmentPosition,
  AuthorityState,
  DerivativesStatus,
  EvidenceBundle,
  EvidenceRecord,
  EvidenceRoot,
  HolderConcentration,
  IntegrityStatus,
  LifecycleStatus,
  LiquidityState,
  MarketObservation,
  RiskAssessment,
} from "@arcmemeperps/domain";
import {
  canonicalJson,
  keccak256Hex,
  marketIdForToken,
  tokenIdentityHash,
  type CanonicalValue,
  type Hex,
  type SupportedChain,
} from "@arcmemeperps/shared";

export const EVIDENCE_SCHEMA_VERSION = "1";
export const QUALIFICATION_PROOF_VERSION = "2";
export const COMMITMENT_VERSION = 1;
export const USD_COMMITMENT_SCALE = 1_000_000;
export const LEVERAGE_COMMITMENT_SCALE = 10_000;

export interface QualificationProof {
  readonly proofVersion: "2";
  readonly schemaVersion: "2";
  readonly evidenceSchemaVersion: string;
  readonly chain: MarketObservation["token"]["chain"];
  readonly marketId: Hex;
  readonly tokenAddress: string;
  readonly lifecycle: LifecycleStatus;
  readonly evidenceRoot: EvidenceRoot;
  readonly evidence: readonly EvidenceRecord[];
  readonly evidenceHashes: Readonly<Record<string, Hex>>;
  readonly assessmentPosition: AssessmentPosition;
  readonly liquidityMetrics: LiquidityState;
  readonly authorityState: AuthorityState;
  readonly holderConcentration: HolderConcentration;
  readonly connectedClusterConcentration: number;
  readonly bundleConcentration: number;
  readonly deployerRisk: RiskAssessment["riskMetrics"]["deployer"];
  readonly activityQualityMetrics: RiskAssessment["riskMetrics"]["activity"];
  readonly oracleMetrics: RiskAssessment["riskMetrics"]["oracle"];
  readonly manipulationCostEstimate: number;
  readonly finalStatuses: {
    readonly integrity: IntegrityStatus;
    readonly derivatives: DerivativesStatus;
  };
  readonly riskParameters: {
    readonly recommendedMaxLeverage: number;
    readonly recommendedMaxOI: number;
    readonly recommendedMaxPosition: number;
  };
  readonly riskRuleVersion: string;
  readonly ruleVersion: string;
  readonly assessedAt: string;
  readonly expiresAt: string | null;
}

export interface QualificationCommitment {
  readonly proofVersion: 1;
  readonly marketId: Hex;
  readonly originChain: SupportedChain;
  readonly tokenIdentityHash: Hex;
  readonly evidenceRoot: Hex;
  readonly integrityStatus: IntegrityStatus;
  readonly derivativesStatus: DerivativesStatus;
  readonly maxLeverage: number;
  readonly maxOI: number;
  readonly maxPosition: number;
  readonly riskRuleVersion: string;
  readonly assessedAt: string;
  readonly expiresAt: string | null;
}

export function evidenceLeafHash(record: EvidenceRecord): Hex {
  return keccak256Hex(canonicalJson(toCanonicalValue(record)));
}

export function evidenceRootForBundle(bundle: EvidenceBundle): EvidenceRoot {
  const records = [...bundle.records].sort((left, right) =>
    left.evidenceId < right.evidenceId ? -1 : left.evidenceId > right.evidenceId ? 1 : 0,
  );
  const leaves = records.map(evidenceLeafHash);
  return {
    algorithm: "keccak256-merkle-v1",
    schemaVersion: bundle.schemaVersion,
    root: merkleRoot(leaves),
    recordCount: records.length,
    leafCount: leaves.length,
  };
}

export function qualificationProofFromAssessment(
  assessment: RiskAssessment,
  evidenceHashes: Readonly<Record<string, Hex>>,
): QualificationProof;
export function qualificationProofFromAssessment(
  assessment: RiskAssessment,
  bundle: EvidenceBundle,
  assessmentPosition: AssessmentPosition,
  expiresAt?: string | null,
): QualificationProof;
export function qualificationProofFromAssessment(
  assessment: RiskAssessment,
  bundleOrHashes: EvidenceBundle | Readonly<Record<string, Hex>>,
  assessmentPosition?: AssessmentPosition,
  expiresAt: string | null = null,
): QualificationProof {
  const bundle: EvidenceBundle =
    "records" in bundleOrHashes
      ? (bundleOrHashes as EvidenceBundle)
      : { schemaVersion: EVIDENCE_SCHEMA_VERSION, records: [] };
  const legacyEvidenceHashes = "records" in bundleOrHashes ? null : bundleOrHashes;
  const resolvedPosition: AssessmentPosition = assessmentPosition ?? {
    chain: assessment.token.chain,
    blockNumber: null,
    blockHash: null,
    slot: null,
  };
  const marketId = marketIdForToken(assessment.token.chain, assessment.token.tokenAddress);
  const evidenceHashes =
    legacyEvidenceHashes ??
    Object.fromEntries(bundle.records.map((record) => [record.kind, evidenceLeafHash(record)]));
  return {
    proofVersion: QUALIFICATION_PROOF_VERSION,
    schemaVersion: QUALIFICATION_PROOF_VERSION,
    evidenceSchemaVersion: bundle.schemaVersion,
    chain: assessment.token.chain,
    marketId,
    tokenAddress: assessment.token.tokenAddress,
    lifecycle: assessment.lifecycle.status,
    evidenceRoot: evidenceRootForBundle(bundle),
    evidence: [...bundle.records].sort((left, right) =>
      left.evidenceId < right.evidenceId ? -1 : 1,
    ),
    evidenceHashes,
    assessmentPosition: resolvedPosition,
    liquidityMetrics: assessment.riskMetrics.liquidity,
    authorityState: assessment.riskMetrics.authorities,
    holderConcentration: assessment.riskMetrics.holders,
    connectedClusterConcentration: assessment.riskMetrics.holders.connectedClusterPct,
    bundleConcentration: assessment.riskMetrics.holders.bundledLaunchPct,
    deployerRisk: assessment.riskMetrics.deployer,
    activityQualityMetrics: assessment.riskMetrics.activity,
    oracleMetrics: assessment.riskMetrics.oracle,
    manipulationCostEstimate: assessment.riskMetrics.oracle.manipulationCostUsd,
    finalStatuses: {
      integrity: assessment.integrityStatus,
      derivatives: assessment.derivativesStatus,
    },
    riskParameters: {
      recommendedMaxLeverage: assessment.recommendedMaxLeverage,
      recommendedMaxOI: assessment.recommendedMaxOI,
      recommendedMaxPosition: assessment.recommendedMaxPosition,
    },
    riskRuleVersion: assessment.ruleVersion,
    ruleVersion: assessment.ruleVersion,
    assessedAt: assessment.assessedAt,
    expiresAt,
  };
}

export function qualificationCommitmentFromProof(
  proof: QualificationProof,
): QualificationCommitment {
  return {
    proofVersion: COMMITMENT_VERSION,
    marketId: proof.marketId,
    originChain: proof.chain,
    tokenIdentityHash: tokenIdentityHash(proof.chain, proof.tokenAddress),
    evidenceRoot: proof.evidenceRoot.root,
    integrityStatus: proof.finalStatuses.integrity,
    derivativesStatus: proof.finalStatuses.derivatives,
    maxLeverage: proof.riskParameters.recommendedMaxLeverage,
    maxOI: proof.riskParameters.recommendedMaxOI,
    maxPosition: proof.riskParameters.recommendedMaxPosition,
    riskRuleVersion: proof.riskRuleVersion,
    assessedAt: proof.assessedAt,
    expiresAt: proof.expiresAt,
  };
}

/**
 * Typed commitment encoding (qualification-commitment-v1):
 * uint256 proofVersion || bytes32 marketId || uint256 chainCode || bytes32 tokenIdentityHash ||
 * bytes32 evidenceRoot || uint256 integrityCode || uint256 derivativesCode ||
 * uint256 maxLeverageX1e4 || uint256 maxOIX1e6 || uint256 maxPositionX1e6 ||
 * bytes32 keccak256(riskRuleVersion) || uint256 assessedAtUnix || uint256 expiresAtUnix.
 * Every field is a 32-byte ABI-style word; no arbitrary JSON is part of the commitment.
 */
export function qualificationCommitmentBytes(commitment: QualificationCommitment): Uint8Array {
  return concatBytes(
    uint256Word(BigInt(commitment.proofVersion)),
    hexToBytes(commitment.marketId),
    uint256Word(BigInt(chainCode(commitment.originChain))),
    hexToBytes(commitment.tokenIdentityHash),
    hexToBytes(commitment.evidenceRoot),
    uint256Word(BigInt(integrityCode(commitment.integrityStatus))),
    uint256Word(BigInt(derivativesCode(commitment.derivativesStatus))),
    uint256Word(scaledUint(commitment.maxLeverage, LEVERAGE_COMMITMENT_SCALE)),
    uint256Word(scaledUint(commitment.maxOI, USD_COMMITMENT_SCALE)),
    uint256Word(scaledUint(commitment.maxPosition, USD_COMMITMENT_SCALE)),
    hexToBytes(keccak256Hex(commitment.riskRuleVersion)),
    uint256Word(unixSeconds(commitment.assessedAt)),
    uint256Word(commitment.expiresAt === null ? 0n : unixSeconds(commitment.expiresAt)),
  );
}

export function qualificationCommitmentHash(commitment: QualificationCommitment): Hex {
  return keccak256Hex(qualificationCommitmentBytes(commitment));
}

export function canonicalQualificationProof(proof: QualificationProof): string {
  const canonicalProof = {
    ...proof,
    evidence: [...proof.evidence].sort((left, right) =>
      left.evidenceId < right.evidenceId ? -1 : left.evidenceId > right.evidenceId ? 1 : 0,
    ),
  };
  return canonicalJson(canonicalProof as unknown as CanonicalValue);
}

export function qualificationProofHash(proof: QualificationProof): Hex {
  return keccak256Hex(canonicalQualificationProof(proof));
}

function merkleRoot(leaves: readonly Hex[]): Hex {
  if (leaves.length === 0) return keccak256Hex("ARCMEMEPERPS_EMPTY_EVIDENCE_ROOT_V1");
  let layer = leaves.map(hexToBytes);
  while (layer.length > 1) {
    const next: Uint8Array[] = [];
    for (let index = 0; index < layer.length; index += 2) {
      const left = layer[index]!;
      const right = layer[index + 1] ?? left;
      next.push(keccakBytes(concatBytes(left, right)));
    }
    layer = next;
  }
  return `0x${Array.from(layer[0]!)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function toCanonicalValue(value: unknown): CanonicalValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(toCanonicalValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, toCanonicalValue(child)]),
    );
  }
  throw new Error("evidence contains a non-canonical value");
}

function chainCode(chain: SupportedChain): number {
  return { ARC: 1, SOLANA: 2, ETHEREUM: 3, BASE: 4, BNB: 5, ROBINHOOD: 6 }[chain];
}

function integrityCode(status: IntegrityStatus): number {
  return { PENDING: 0, WATCH: 1, QUALIFIED: 2, REJECTED: 3 }[status];
}

function derivativesCode(status: DerivativesStatus): number {
  return {
    UNASSESSED: 0,
    WATCH: 1,
    ELIGIBLE: 2,
    LIVE: 3,
    PAUSED: 4,
    CLOSE_ONLY: 5,
    BLOCKED: 6,
  }[status];
}

function scaledUint(value: number, scale: number): bigint {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("commitment amount must be finite and non-negative");
  }
  const scaled = Math.round(value * scale);
  if (!Number.isSafeInteger(scaled))
    throw new Error("commitment amount exceeds safe integer precision");
  return BigInt(scaled);
}

function unixSeconds(value: string): bigint {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new Error(`invalid commitment timestamp: ${value}`);
  }
  return BigInt(Math.floor(milliseconds / 1_000));
}

function keccakBytes(value: Uint8Array): Uint8Array {
  return hexToBytes(keccak256Hex(value));
}

function hexToBytes(value: Hex): Uint8Array {
  const output = new Uint8Array((value.length - 2) / 2);
  for (let index = 2; index < value.length; index += 2) {
    output[(index - 2) / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return output;
}

function uint256Word(value: bigint): Uint8Array {
  if (value < 0n || value > (1n << 256n) - 1n) throw new Error("uint256 out of range");
  const output = new Uint8Array(32);
  let remaining = value;
  for (let index = 31; index >= 0; index -= 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
