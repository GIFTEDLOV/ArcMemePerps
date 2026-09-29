import type { DataDisagreement } from "@arcmemeperps/domain";
import type { ReconciliationResult } from "./types.js";

export function reconcileNumeric(
  field: string,
  observations: readonly {
    readonly source: string;
    readonly value: number | null;
    readonly stale?: boolean;
  }[],
  relativeMinorTolerance = 0.05,
  relativeMaterialTolerance = 0.2,
): ReconciliationResult {
  const available = observations.filter(
    (item): item is { readonly source: string; readonly value: number; readonly stale?: boolean } =>
      item.value !== null,
  );
  if (available.length === 0) return { status: "UNAVAILABLE", value: null, disagreement: null };
  if (available.some((item) => item.stale === true)) {
    return {
      status: "STALE",
      value: Math.min(...available.map((item) => item.value)),
      disagreement: disagreement(
        field,
        "STALE",
        available,
        "stale observations",
        "BLOCK_AUTOMATIC_QUALIFICATION",
      ),
    };
  }
  const values = available.map((item) => item.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const denominator = Math.max(Math.abs(minimum), Math.abs(maximum), 1);
  const relativeDifference = (maximum - minimum) / denominator;
  if (relativeDifference === 0) return { status: "CONSISTENT", value: minimum, disagreement: null };
  if (relativeDifference <= relativeMinorTolerance) {
    return {
      status: "MINOR_DIVERGENCE",
      value: minimum,
      disagreement: disagreement(
        field,
        "MINOR_DIVERGENCE",
        available,
        `${relativeMinorTolerance * 100}%`,
        "RETAIN_CONSERVATIVE_VALUE",
      ),
    };
  }
  return {
    status: "MATERIAL_DIVERGENCE",
    value: minimum,
    disagreement: disagreement(
      field,
      "MATERIAL_DIVERGENCE",
      available,
      `${relativeMaterialTolerance * 100}%`,
      "BLOCK_AUTOMATIC_QUALIFICATION",
    ),
  };
}

function disagreement(
  field: string,
  status: Exclude<ReconciliationResult["status"], "CONSISTENT" | "UNAVAILABLE">,
  observations: readonly {
    readonly source: string;
    readonly value: number;
    readonly stale?: boolean;
  }[],
  tolerance: string,
  resolution: "BLOCK_AUTOMATIC_QUALIFICATION" | "RETAIN_CONSERVATIVE_VALUE",
): NonNullable<ReconciliationResult["disagreement"]> {
  return {
    field,
    status,
    sources: observations.map((item) => item.source),
    values: observations.map((item) => item.value.toString()),
    tolerance,
    resolution,
  };
}

export function disagreementsFor(result: ReconciliationResult): readonly DataDisagreement[] {
  return result.disagreement === null ? [] : [result.disagreement];
}
