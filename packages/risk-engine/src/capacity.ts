import type { DerivativesStatus } from "@arcmemeperps/domain";
import { WAD } from "@arcmemeperps/shared";

export type CapacityBoundStatus = "AVAILABLE" | "UNAVAILABLE";

export interface CapacityBound {
  readonly name: string;
  readonly valueUsdWad: bigint | null;
  readonly status: CapacityBoundStatus;
  readonly formula: string;
  readonly reason: string;
}

export interface CapacityInputs {
  readonly integrityQualified: boolean;
  readonly spotLiquidityUsdWad: bigint;
  readonly depth1PctUsdWad: bigint | null;
  readonly depth2PctUsdWad: bigint | null;
  readonly organicVolume24hUsdWad: bigint;
  readonly realizedVolatilityBps: bigint;
  readonly independentOracleSources: number;
  readonly oracleDispersionBps: bigint;
  readonly oracleConfidenceBps: bigint;
  readonly manipulationCostUsdWad: bigint | null;
  readonly vaultBackingUsdWad: bigint;
  readonly marketAgeDays: bigint;
  readonly liquidityStable: boolean;
  readonly currentOiUsdWad: bigint;
  readonly currentSkewUsdWad: bigint;
  /** Optional final-policy liquidation bound from the executable venue model. */
  readonly liquidationCapacityUsdWad?: bigint | null;
}

export interface CapacityRules {
  readonly globalMaxLeverageWad: bigint;
  readonly minimumOracleSources: number;
  readonly maximumOracleDispersionBps: bigint;
  readonly minimumOracleConfidenceBps: bigint;
  readonly newMarketDays: bigint;
  readonly matureMarketDays: bigint;
}

export interface CapacityOutput {
  readonly derivativesStatus: DerivativesStatus;
  readonly maxLeverageWad: bigint;
  readonly maxOiUsdWad: bigint;
  readonly maxPositionUsdWad: bigint;
  readonly maxLongOiUsdWad: bigint;
  readonly maxShortOiUsdWad: bigint;
  readonly maintenanceMarginBps: bigint;
  readonly liquidationBufferBps: bigint;
  readonly requiredOracleConfidenceBps: bigint;
  readonly bounds: readonly CapacityBound[];
  readonly reasons: readonly string[];
}

export interface DynamicCapacityRules extends CapacityRules {
  readonly minimumSafeOpenInterestWad: bigint;
  readonly minimumPositionUsdWad: bigint;
  readonly depthHaircutBps: bigint;
  readonly secondDepthHaircutBps: bigint;
  readonly volumeFractionBps: bigint;
  readonly manipulationFractionBps: bigint;
  readonly liquidationHaircutBps: bigint;
  readonly vaultFractionBps: bigint;
}

export const DEVELOPMENT_CAPACITY_RULES: CapacityRules = {
  globalMaxLeverageWad: 5n * WAD,
  minimumOracleSources: 2,
  maximumOracleDispersionBps: 300n,
  minimumOracleConfidenceBps: 8_500n,
  newMarketDays: 7n,
  matureMarketDays: 30n,
};

export const FINAL_DYNAMIC_CAPACITY_RULES: DynamicCapacityRules = {
  ...DEVELOPMENT_CAPACITY_RULES,
  minimumSafeOpenInterestWad: 25_000n * WAD,
  minimumPositionUsdWad: 250n * WAD,
  depthHaircutBps: 5_000n,
  secondDepthHaircutBps: 5_000n,
  volumeFractionBps: 1_000n,
  manipulationFractionBps: 500n,
  liquidationHaircutBps: 5_000n,
  vaultFractionBps: 1_000n,
};

export function calculateRiskCapacity(
  inputs: CapacityInputs,
  rules: CapacityRules = DEVELOPMENT_CAPACITY_RULES,
): CapacityOutput {
  const bounds: CapacityBound[] = [
    bound("LIQUIDITY", inputs.spotLiquidityUsdWad / 10n, "spotLiquidity / 10"),
    bound(
      "DEPTH",
      inputs.depth1PctUsdWad === null ? null : inputs.depth1PctUsdWad * 2n,
      "depth1Pct * 2",
    ),
    bound(
      "MANIPULATION",
      inputs.manipulationCostUsdWad === null ? null : inputs.manipulationCostUsdWad / 4n,
      "manipulationCost / 4",
    ),
    bound("VAULT", inputs.vaultBackingUsdWad / 10n, "vaultBacking / 10"),
    bound("VOLUME", inputs.organicVolume24hUsdWad / 2n, "organicVolume24h / 2"),
    bound("DEPTH_2", inputs.depth2PctUsdWad === null ? null : inputs.depth2PctUsdWad, "depth2Pct"),
  ];
  const reasons: string[] = [];
  if (!inputs.integrityQualified) reasons.push("INTEGRITY_NOT_QUALIFIED");
  if (inputs.independentOracleSources < rules.minimumOracleSources)
    reasons.push("INSUFFICIENT_INDEPENDENT_ORACLES");
  if (inputs.oracleDispersionBps > rules.maximumOracleDispersionBps)
    reasons.push("ORACLE_DISPERSION");
  if (inputs.oracleConfidenceBps < rules.minimumOracleConfidenceBps)
    reasons.push("LOW_ORACLE_CONFIDENCE");
  if (!inputs.liquidityStable) reasons.push("LIQUIDITY_NOT_STABLE");
  if (bounds.some((item) => item.status === "UNAVAILABLE"))
    reasons.push("CRITICAL_BOUND_UNAVAILABLE");
  const available = bounds.flatMap((item) => (item.valueUsdWad === null ? [] : [item.valueUsdWad]));
  const maxOi =
    available.length === 0
      ? 0n
      : available.reduce((minimum, value) => (value < minimum ? value : minimum));
  const tierLeverage =
    inputs.marketAgeDays < rules.newMarketDays
      ? 15n * 10n ** 17n
      : inputs.marketAgeDays < rules.matureMarketDays
        ? 3n * WAD
        : rules.globalMaxLeverageWad;
  const volatilityLeverage =
    inputs.realizedVolatilityBps === 0n
      ? rules.globalMaxLeverageWad
      : (10_000n * WAD) / inputs.realizedVolatilityBps;
  const maxLeverage = [rules.globalMaxLeverageWad, tierLeverage, volatilityLeverage].reduce(
    (minimum, value) => (value < minimum ? value : minimum),
  );
  const maxPosition = maxOi / 4n;
  const blocked = reasons.length > 0 || maxOi === 0n;
  return {
    derivativesStatus: blocked ? "BLOCKED" : maxOi < 25_000n * WAD ? "WATCH" : "ELIGIBLE",
    maxLeverageWad: blocked ? 0n : maxLeverage,
    maxOiUsdWad: maxOi,
    maxPositionUsdWad: maxPosition,
    maxLongOiUsdWad: maxOi / 2n,
    maxShortOiUsdWad: maxOi / 2n,
    maintenanceMarginBps:
      maxLeverage <= 15n * 10n ** 17n ? 2_000n : maxLeverage <= 3n * WAD ? 1_500n : 1_000n,
    liquidationBufferBps: 100n,
    requiredOracleConfidenceBps: rules.minimumOracleConfidenceBps,
    bounds,
    reasons,
  };
}

/**
 * 0.4.0 capacity projection. The absolute 0.3.0 market-size values are
 * inputs to conservative bounds; they are not discarded and the retained
 * minimum safe OI still prevents a zero-capacity listing.
 */
export function calculateDynamicRiskCapacity(
  inputs: CapacityInputs,
  rules: DynamicCapacityRules = FINAL_DYNAMIC_CAPACITY_RULES,
): CapacityOutput {
  const liquidation = inputs.liquidationCapacityUsdWad ?? null;
  const bounds: CapacityBound[] = [
    bound("SPOT_LIQUIDITY", fraction(inputs.spotLiquidityUsdWad, 1_000n), "spotLiquidity / 10"),
    bound(
      "DEPTH_1",
      inputs.depth1PctUsdWad === null
        ? null
        : fraction(inputs.depth1PctUsdWad, rules.depthHaircutBps),
      "directional depth1 * 50%",
    ),
    bound(
      "DEPTH_2",
      inputs.depth2PctUsdWad === null
        ? null
        : fraction(inputs.depth2PctUsdWad, rules.secondDepthHaircutBps),
      "directional depth2 * 50%",
    ),
    bound("VOLUME", fraction(inputs.organicVolume24hUsdWad, rules.volumeFractionBps), "volume * 10%"),
    bound(
      "MANIPULATION",
      inputs.manipulationCostUsdWad === null
        ? null
        : fraction(inputs.manipulationCostUsdWad, rules.manipulationFractionBps),
      "manipulation cost * 5%",
    ),
    bound(
      "LIQUIDATION",
      liquidation === null ? null : fraction(liquidation, rules.liquidationHaircutBps),
      "liquidation capacity * 50%",
    ),
    bound("VAULT", fraction(inputs.vaultBackingUsdWad, rules.vaultFractionBps), "vault backing * 10%"),
  ];
  const reasons: string[] = [];
  if (!inputs.integrityQualified) reasons.push("INTEGRITY_NOT_QUALIFIED");
  if (inputs.independentOracleSources < rules.minimumOracleSources)
    reasons.push("INSUFFICIENT_INDEPENDENT_ORACLES");
  if (inputs.oracleDispersionBps > rules.maximumOracleDispersionBps)
    reasons.push("ORACLE_DISPERSION");
  if (inputs.oracleConfidenceBps < rules.minimumOracleConfidenceBps)
    reasons.push("LOW_ORACLE_CONFIDENCE");
  if (!inputs.liquidityStable) reasons.push("LIQUIDITY_NOT_STABLE");
  if (bounds.some((item) => item.status === "UNAVAILABLE"))
    reasons.push("CRITICAL_BOUND_UNAVAILABLE");
  const available = bounds.flatMap((item) => (item.valueUsdWad === null ? [] : [item.valueUsdWad]));
  const rawMinimum = available.length === 0 ? null : available.reduce(minimumBigint);
  const maxOi = rawMinimum === null ? 0n : fraction(rawMinimum, inputs.oracleConfidenceBps);
  if (maxOi < rules.minimumSafeOpenInterestWad) reasons.push("CAPACITY_BELOW_MINIMUM");
  const volatilityLeverage =
    inputs.realizedVolatilityBps === 0n
      ? rules.globalMaxLeverageWad
      : (10_000n * WAD) / inputs.realizedVolatilityBps;
  const capacityLeverage =
    maxOi < rules.minimumSafeOpenInterestWad * 2n
      ? 125n * 10n ** 16n
      : maxOi < rules.minimumSafeOpenInterestWad * 5n
        ? 2n * WAD
        : rules.globalMaxLeverageWad;
  const tierLeverage =
    inputs.marketAgeDays < rules.newMarketDays
      ? 15n * 10n ** 17n
      : inputs.marketAgeDays < rules.matureMarketDays
        ? 3n * WAD
        : rules.globalMaxLeverageWad;
  const maxLeverage = [rules.globalMaxLeverageWad, tierLeverage, volatilityLeverage, capacityLeverage].reduce(
    minimumBigint,
  );
  const maxPosition = [
    maxOi / 4n,
    inputs.depth1PctUsdWad === null ? 0n : inputs.depth1PctUsdWad / 4n,
    liquidation === null ? 0n : liquidation / 4n,
  ].reduce(minimumBigint);
  if (maxPosition < rules.minimumPositionUsdWad) reasons.push("POSITION_BELOW_MINIMUM");
  const blocked = reasons.length > 0 || maxOi === 0n || maxPosition === 0n;
  return {
    derivativesStatus: blocked ? "BLOCKED" : "ELIGIBLE",
    maxLeverageWad: blocked ? 0n : maxLeverage,
    maxOiUsdWad: maxOi,
    maxPositionUsdWad: maxPosition,
    maxLongOiUsdWad: maxOi / 2n,
    maxShortOiUsdWad: maxOi / 2n,
    maintenanceMarginBps: maxLeverage <= 15n * 10n ** 17n ? 2_000n : maxLeverage <= 3n * WAD ? 1_500n : 1_000n,
    liquidationBufferBps: 100n,
    requiredOracleConfidenceBps: rules.minimumOracleConfidenceBps,
    bounds,
    reasons,
  };
}

function fraction(value: bigint, bps: bigint): bigint {
  return (value * bps) / 10_000n;
}

function minimumBigint(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function bound(name: string, valueUsdWad: bigint | null, formula: string): CapacityBound {
  return {
    name,
    valueUsdWad,
    status: valueUsdWad === null ? "UNAVAILABLE" : "AVAILABLE",
    formula,
    reason: valueUsdWad === null ? "required evidence unavailable" : "development bound",
  };
}
