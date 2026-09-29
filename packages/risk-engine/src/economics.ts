import { BPS, WAD, feeOnNotionalUp, mulDivDown, mulDivUp } from "@arcmemeperps/shared";

export type EconomicSide = "LONG" | "SHORT";

export interface FundingConfig {
  readonly factorPerSecondWad: bigint;
  readonly capPerSecondWad: bigint;
  readonly minimumDenominatorUsdWad: bigint;
}

export interface FundingUpdate {
  readonly imbalanceUsdWad: bigint;
  readonly imbalanceRatioWad: bigint;
  readonly ratePerSecondWad: bigint;
  readonly indexDeltaWad: bigint;
  readonly longPaymentUsdWad: bigint;
  readonly shortPaymentUsdWad: bigint;
  readonly vaultRoutedUsdWad: bigint;
  readonly roundingDustUsdWad: bigint;
}

export function computeFundingUpdate(
  longOiUsdWad: bigint,
  shortOiUsdWad: bigint,
  elapsedSeconds: bigint,
  config: FundingConfig,
): FundingUpdate {
  if (longOiUsdWad < 0n || shortOiUsdWad < 0n || elapsedSeconds < 0n) {
    throw new Error("funding inputs cannot be negative");
  }
  const total = longOiUsdWad + shortOiUsdWad;
  const imbalance =
    longOiUsdWad >= shortOiUsdWad ? longOiUsdWad - shortOiUsdWad : shortOiUsdWad - longOiUsdWad;
  const denominator =
    total > config.minimumDenominatorUsdWad ? total : config.minimumDenominatorUsdWad;
  const ratio = denominator === 0n ? 0n : mulDivDown(imbalance, WAD, denominator);
  const uncappedRate = mulDivDown(config.factorPerSecondWad, ratio, WAD);
  const rate = uncappedRate > config.capPerSecondWad ? config.capPerSecondWad : uncappedRate;
  const indexDelta = rate * elapsedSeconds;
  const dominantIsLong = longOiUsdWad >= shortOiUsdWad;
  const payerOi = dominantIsLong ? longOiUsdWad : shortOiUsdWad;
  const opposingOi = dominantIsLong ? shortOiUsdWad : longOiUsdWad;
  const grossPayer = mulDivDown(payerOi, indexDelta, WAD);
  const opposingReceivable = mulDivDown(opposingOi, indexDelta, WAD);
  const vaultRouted = grossPayer > opposingReceivable ? grossPayer - opposingReceivable : 0n;
  const dust = grossPayer - opposingReceivable - vaultRouted;
  return {
    imbalanceUsdWad: imbalance,
    imbalanceRatioWad: ratio,
    ratePerSecondWad: rate,
    indexDeltaWad: dominantIsLong ? indexDelta : -indexDelta,
    longPaymentUsdWad: dominantIsLong ? grossPayer : opposingReceivable,
    shortPaymentUsdWad: dominantIsLong ? opposingReceivable : grossPayer,
    vaultRoutedUsdWad: vaultRouted,
    roundingDustUsdWad: dust,
  };
}

export interface BorrowConfig {
  readonly baseRatePerSecondWad: bigint;
  readonly slopePerSecondWad: bigint;
  readonly kinkUtilizationWad: bigint;
  readonly maxRatePerSecondWad: bigint;
}

export interface BorrowUpdate {
  readonly utilizationWad: bigint;
  readonly ratePerSecondWad: bigint;
  readonly indexDeltaWad: bigint;
  readonly feeUsdWad: bigint;
}

export function computeBorrowUpdate(
  riskExposureUsdWad: bigint,
  availableBackingUsdWad: bigint,
  elapsedSeconds: bigint,
  notionalUsdWad: bigint,
  config: BorrowConfig,
): BorrowUpdate {
  if (
    riskExposureUsdWad < 0n ||
    availableBackingUsdWad <= 0n ||
    elapsedSeconds < 0n ||
    notionalUsdWad < 0n
  ) {
    throw new Error("invalid borrow inputs");
  }
  const utilization =
    riskExposureUsdWad >= availableBackingUsdWad
      ? WAD
      : mulDivDown(riskExposureUsdWad, WAD, availableBackingUsdWad);
  const rate =
    utilization <= config.kinkUtilizationWad
      ? config.baseRatePerSecondWad +
        mulDivDown(config.slopePerSecondWad, utilization, config.kinkUtilizationWad || 1n)
      : config.baseRatePerSecondWad + config.slopePerSecondWad;
  const boundedRate = rate > config.maxRatePerSecondWad ? config.maxRatePerSecondWad : rate;
  const indexDelta = boundedRate * elapsedSeconds;
  return {
    utilizationWad: utilization,
    ratePerSecondWad: boundedRate,
    indexDeltaWad: indexDelta,
    feeUsdWad: mulDivUp(notionalUsdWad, indexDelta, WAD),
  };
}

export interface SkewConfig {
  readonly maxSkewRatioWad: bigint;
  readonly worseningFeeRateWad: bigint;
}

export interface SkewDecision {
  readonly longOiUsdWad: bigint;
  readonly shortOiUsdWad: bigint;
  readonly netSkewUsdWad: bigint;
  readonly skewRatioWad: bigint;
  readonly worsensSkew: boolean;
  readonly feeUsdWad: bigint;
}

export function assessSkew(
  longOiUsdWad: bigint,
  shortOiUsdWad: bigint,
  side: EconomicSide,
  sizeUsdWad: bigint,
  config: SkewConfig,
): SkewDecision {
  const net = longOiUsdWad - shortOiUsdWad;
  const total = longOiUsdWad + shortOiUsdWad;
  const ratio = total === 0n ? 0n : ((net < 0n ? -net : net) * WAD) / total;
  const worsening = net === 0n || (net > 0n && side === "LONG") || (net < 0n && side === "SHORT");
  const fee = worsening ? feeOnNotionalUp(sizeUsdWad, config.worseningFeeRateWad) : 0n;
  if (ratio > config.maxSkewRatioWad && worsening) throw new Error("skew cap exceeded");
  return {
    longOiUsdWad,
    shortOiUsdWad,
    netSkewUsdWad: net,
    skewRatioWad: ratio,
    worsensSkew: worsening,
    feeUsdWad: fee,
  };
}

export interface LiquidationInputs {
  readonly collateralUsdc: bigint;
  readonly signedPnlUsdWad: bigint;
  readonly fundingOwedUsdWad: bigint;
  readonly fundingReceivableUsdWad: bigint;
  readonly borrowFeeUsdWad: bigint;
  readonly otherFeesUsdc: bigint;
  readonly maintenanceMarginBps: bigint;
  readonly minimumCollateralUsdc: bigint;
  readonly liquidationFeeUsdc: bigint;
  readonly liquidationBufferBps: bigint;
}

export interface LiquidationResult {
  readonly equityUsdc: bigint;
  readonly maintenanceRequirementUsdc: bigint;
  readonly liquidatable: boolean;
  readonly liquidatorRewardUsdc: bigint;
  readonly traderResidualUsdc: bigint;
  readonly badDebtUsdc: bigint;
}

export function evaluateLiquidation(
  sizeUsdWad: bigint,
  inputs: LiquidationInputs,
): LiquidationResult {
  const pnlUsdc =
    inputs.signedPnlUsdWad >= 0n
      ? mulDivDown(inputs.signedPnlUsdWad, 1n, 1_000_000_000_000n)
      : -mulDivUp(-inputs.signedPnlUsdWad, 1n, 1_000_000_000_000n);
  const fundingUsdc =
    inputs.fundingOwedUsdWad > inputs.fundingReceivableUsdWad
      ? mulDivUp(inputs.fundingOwedUsdWad - inputs.fundingReceivableUsdWad, 1n, 1_000_000_000_000n)
      : -mulDivDown(
          inputs.fundingReceivableUsdWad - inputs.fundingOwedUsdWad,
          1n,
          1_000_000_000_000n,
        );
  const borrowUsdc = mulDivUp(inputs.borrowFeeUsdWad, 1n, 1_000_000_000_000n);
  const equitySigned =
    BigInt(inputs.collateralUsdc) + pnlUsdc - fundingUsdc - borrowUsdc - inputs.otherFeesUsdc;
  const equityUsdc = equitySigned > 0n ? equitySigned : 0n;
  const notionalMaintenance = mulDivUp(
    sizeUsdWad,
    inputs.maintenanceMarginBps,
    BPS * 1_000_000_000_000n,
  );
  const maintenanceRequirement = inputs.minimumCollateralUsdc + notionalMaintenance;
  const liquidatable = equityUsdc < maintenanceRequirement;
  const liquidatorReward = liquidatable
    ? inputs.liquidationFeeUsdc > equityUsdc
      ? equityUsdc
      : inputs.liquidationFeeUsdc
    : 0n;
  const traderResidual =
    liquidatable && equityUsdc > liquidatorReward ? equityUsdc - liquidatorReward : 0n;
  // equitySigned already includes collateral. A negative result is the exact deficit;
  // subtracting collateral a second time would hide bad debt.
  const badDebt = equitySigned < 0n ? -equitySigned : 0n;
  return {
    equityUsdc,
    maintenanceRequirementUsdc: maintenanceRequirement,
    liquidatable,
    liquidatorRewardUsdc: liquidatorReward,
    traderResidualUsdc: traderResidual,
    badDebtUsdc: badDebt,
  };
}
