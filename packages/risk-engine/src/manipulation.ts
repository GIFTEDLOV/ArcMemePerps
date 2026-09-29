export type ManipulationResistance =
  "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH" | "UNAVAILABLE";

export interface ManipulationInputs {
  readonly buyDepth1PctUsd: bigint | null;
  readonly sellDepth1PctUsd: bigint | null;
  readonly buyDepth2PctUsd: bigint | null;
  readonly sellDepth2PctUsd: bigint | null;
  readonly dominantPoolShareBps: bigint;
  readonly independentSourceCount: number;
}

export interface ManipulationEstimate {
  readonly status: ManipulationResistance;
  readonly move1PctUsd: bigint | null;
  readonly move2PctUsd: bigint | null;
  readonly move5PctUsd: bigint | null;
  readonly reason: string;
}

/** Conservative range estimator; this is not an executable attack-cost quote. */
export function estimateManipulationResistance(inputs: ManipulationInputs): ManipulationEstimate {
  const one = minAvailable(inputs.buyDepth1PctUsd, inputs.sellDepth1PctUsd);
  const two = minAvailable(inputs.buyDepth2PctUsd, inputs.sellDepth2PctUsd);
  if (one === null || two === null || inputs.independentSourceCount === 0) {
    return {
      status: "UNAVAILABLE",
      move1PctUsd: one,
      move2PctUsd: two,
      move5PctUsd: null,
      reason: "directional quote depth or source independence unavailable",
    };
  }
  const move5 = two * 2n;
  const adjustedOne = inputs.dominantPoolShareBps >= 8_000n ? one / 2n : one;
  let status: ManipulationResistance = "VERY_LOW";
  const usdWad = 1_000_000_000_000_000_000n;
  if (adjustedOne >= 1_000_000n * usdWad) status = "VERY_HIGH";
  else if (adjustedOne >= 250_000n * usdWad) status = "HIGH";
  else if (adjustedOne >= 100_000n * usdWad) status = "MEDIUM";
  else if (adjustedOne >= 25_000n * usdWad) status = "LOW";
  return {
    status,
    move1PctUsd: adjustedOne,
    move2PctUsd: two,
    move5PctUsd: move5,
    reason:
      inputs.dominantPoolShareBps >= 8_000n
        ? "dominant pool concentration halves conservative estimate"
        : "minimum directional quote depth across observed venues",
  };
}

function minAvailable(left: bigint | null, right: bigint | null): bigint | null {
  if (left === null || right === null) return null;
  return left < right ? left : right;
}
