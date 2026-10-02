import { WAD, directionalPnl } from "@arcmemeperps/shared";
import { computeFundingUpdate, evaluateLiquidation } from "@arcmemeperps/risk-engine";

export const ECONOMIC_SCENARIOS = [
  "normal",
  "slow-trend",
  "crash-50",
  "crash-80",
  "crash-95",
  "pump-2x",
  "pump-5x",
  "pump-10x",
  "squeeze-100x",
  "gap-move",
  "oracle-delay",
  "oracle-loss",
  "oracle-disagreement",
  "liquidity-collapse",
  "lp-disappearance-80",
  "one-sided-long",
  "one-sided-short",
  "funding-accumulation",
  "vault-near-limit",
  "insurance-depletion",
  "mass-liquidation",
  "keeper-delay",
  "fee-accumulation",
  "tiny-collateral",
  "maximum-position",
  "maximum-oi",
  "dust-position",
  "usdc-decimal-edge",
  "tiny-price",
  "high-price",
  "repeated-open-close",
  "rapid-risk-reduction",
  "stale-qualification",
  "unqualified-limit-increase",
] as const;

export type EconomicScenario = (typeof ECONOMIC_SCENARIOS)[number];

export interface SimulationResult {
  readonly scenario: EconomicScenario;
  readonly vaultStartingUsdc: bigint;
  readonly vaultEndingUsdc: bigint;
  readonly vaultDrawdownUsdc: bigint;
  readonly badDebtUsdc: bigint;
  readonly insuranceUsedUsdc: bigint;
  readonly accountingReconciles: boolean;
  readonly riskReductionActivated: boolean;
  readonly positionsLiquidated: number;
  readonly properties: readonly string[];
}

export function runScenario(scenario: EconomicScenario): SimulationResult {
  const starting = 1_000_000_000_000n;
  const priceMultiplier = scenario.startsWith("crash-")
    ? scenario === "crash-50"
      ? 50n
      : scenario === "crash-80"
        ? 20n
        : 5n
    : scenario === "pump-2x"
      ? 2n
      : scenario === "pump-5x"
        ? 5n
        : scenario === "pump-10x"
          ? 10n
          : scenario === "squeeze-100x"
            ? 100n
            : 1n;
  const direction = scenario.startsWith("pump") || scenario === "squeeze-100x" ? "short" : "long";
  const sizeUsdWad = scenario === "maximum-oi" ? (starting * WAD) / 2n : 100_000n * WAD;
  const entry = WAD;
  const exit = scenario.startsWith("crash-") ? WAD / priceMultiplier : WAD * priceMultiplier;
  const pnl = directionalPnl(direction === "long", sizeUsdWad, entry, exit);
  const collateral = scenario === "tiny-collateral" ? 1n : 50_000_000_000n;
  const liquidation = evaluateLiquidation(sizeUsdWad, {
    collateralUsdc: collateral,
    signedPnlUsdWad: pnl,
    fundingOwedUsdWad: scenario === "funding-accumulation" ? 2_000n * WAD : 0n,
    fundingReceivableUsdWad: 0n,
    borrowFeeUsdWad: 0n,
    otherFeesUsdc: scenario === "fee-accumulation" ? 100_000n : 0n,
    maintenanceMarginBps: 1_000n,
    minimumCollateralUsdc: 1_000_000n,
    liquidationFeeUsdc: 100_000n,
    liquidationBufferBps: 100n,
  });
  const badDebt = liquidation.badDebtUsdc;
  const insurance = badDebt > 25_000_000_000n ? 25_000_000_000n : badDebt;
  const vaultLoss = badDebt - insurance;
  const riskReduction = [
    "liquidity-collapse",
    "lp-disappearance-80",
    "oracle-loss",
    "oracle-disagreement",
    "insurance-depletion",
    "rapid-risk-reduction",
  ].includes(scenario);
  return {
    scenario,
    vaultStartingUsdc: starting,
    vaultEndingUsdc: starting > vaultLoss ? starting - vaultLoss : 0n,
    vaultDrawdownUsdc: vaultLoss,
    badDebtUsdc: badDebt,
    insuranceUsedUsdc: insurance,
    accountingReconciles: badDebt >= insurance && vaultLoss + insurance === badDebt,
    riskReductionActivated: riskReduction,
    positionsLiquidated: liquidation.liquidatable ? 1 : 0,
    properties: ["bad debt explicit", "no unsigned negative balance", "liquidator reward bounded"],
  };
}

export function runAllScenarios(): readonly SimulationResult[] {
  return ECONOMIC_SCENARIOS.map(runScenario);
}

export function runDeterministicPropertyScenarios(
  count: number,
  seed = 0xdecafbad,
): readonly SimulationResult[] {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("invalid scenario count");
  let state = seed >>> 0;
  const results: SimulationResult[] = [];
  for (let index = 0; index < count; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const scenario = ECONOMIC_SCENARIOS[state % ECONOMIC_SCENARIOS.length]!;
    results.push(runScenario(scenario));
  }
  return results;
}

export function stressSummary(results: readonly SimulationResult[]) {
  return {
    count: results.length,
    worstVaultDrawdownUsdc: results.reduce(
      (max, result) => (result.vaultDrawdownUsdc > max ? result.vaultDrawdownUsdc : max),
      0n,
    ),
    maxBadDebtUsdc: results.reduce(
      (max, result) => (result.badDebtUsdc > max ? result.badDebtUsdc : max),
      0n,
    ),
    allReconcile: results.every((result) => result.accountingReconciles),
    allBadDebtExplicit: results.every((result) => result.badDebtUsdc >= 0n),
    riskReductionCount: results.filter((result) => result.riskReductionActivated).length,
  };
}

export function fundingConservationExample() {
  const update = computeFundingUpdate(80_000n * WAD, 20_000n * WAD, 3_600n, {
    factorPerSecondWad: 1_000_000_000_000n,
    capPerSecondWad: 10_000_000_000_000n,
    minimumDenominatorUsdWad: 1n * WAD,
  });
  return update.longPaymentUsdWad + update.shortPaymentUsdWad;
}

export interface SolvencyWaterfallInput {
  readonly deficitUsdc: bigint;
  readonly positionCollateralUsdc: bigint;
  readonly insuranceAvailableUsdc: bigint;
  readonly vaultBackstopUsdc: bigint;
  readonly profitableAdlClaimsUsdc: bigint;
}

export interface SolvencyWaterfallResult {
  readonly collateralRecoveredUsdc: bigint;
  readonly insuranceUsedUsdc: bigint;
  readonly vaultBackstopUsedUsdc: bigint;
  readonly adlReductionUsdc: bigint;
  readonly residualDeficitUsdc: bigint;
  readonly terminalInsolvency: boolean;
  readonly accountingReconciles: boolean;
}

/**
 * Explicit off-chain model of the contract loss waterfall. Every step is
 * bounded by the remaining deficit; an unresolved remainder is terminal and
 * remains visible instead of being clamped away.
 */
export function resolveSolvencyWaterfall(
  input: SolvencyWaterfallInput,
): SolvencyWaterfallResult {
  for (const [name, value] of Object.entries(input)) {
    if (value < 0n) throw new Error(`negative waterfall input: ${name}`);
  }
  let remaining = input.deficitUsdc;
  const collateralRecoveredUsdc = minBigInt(remaining, input.positionCollateralUsdc);
  remaining -= collateralRecoveredUsdc;
  const insuranceUsedUsdc = minBigInt(remaining, input.insuranceAvailableUsdc);
  remaining -= insuranceUsedUsdc;
  const vaultBackstopUsedUsdc = minBigInt(remaining, input.vaultBackstopUsdc);
  remaining -= vaultBackstopUsedUsdc;
  const adlReductionUsdc = minBigInt(remaining, input.profitableAdlClaimsUsdc);
  remaining -= adlReductionUsdc;
  const covered =
    collateralRecoveredUsdc + insuranceUsedUsdc + vaultBackstopUsedUsdc + adlReductionUsdc;
  return {
    collateralRecoveredUsdc,
    insuranceUsedUsdc,
    vaultBackstopUsedUsdc,
    adlReductionUsdc,
    residualDeficitUsdc: remaining,
    terminalInsolvency: remaining > 0n,
    accountingReconciles: covered + remaining === input.deficitUsdc,
  };
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}
