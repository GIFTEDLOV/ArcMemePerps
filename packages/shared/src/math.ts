/**
 * Cross-language fixed-point specification.
 *
 * Monetary input/output is USDC base units (6 decimals); USD notionals, prices and rates
 * use WAD (18 decimals). All operations are bigint-only. Down-rounding is used for trader
 * payouts and capacity; up-rounding is used for protocol liabilities and fees.
 */
export const USDC_SCALE = 1_000_000n;
export const WAD = 1_000_000_000_000_000_000n;
export const BPS = 10_000n;
export const INT256_MAX = (1n << 255n) - 1n;
export const INT256_MIN = -(1n << 255n);

export function mulDivDown(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("division by zero");
  if (a < 0n || b < 0n) throw new Error("mulDivDown requires unsigned operands");
  return (a * b) / denominator;
}

export function mulDivUp(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("division by zero");
  if (a < 0n || b < 0n) throw new Error("mulDivUp requires unsigned operands");
  if (a === 0n || b === 0n) return 0n;
  return (a * b - 1n) / denominator + 1n;
}

export function usdcToUsdWad(usdc: bigint): bigint {
  if (usdc < 0n) throw new Error("USDC amount cannot be negative");
  return mulDivDown(usdc, WAD, USDC_SCALE);
}

export function usdWadToUsdcDown(usdWad: bigint): bigint {
  if (usdWad < 0n) throw new Error("USD amount cannot be negative");
  return usdWad / (WAD / USDC_SCALE);
}

export function usdWadToUsdcUp(usdWad: bigint): bigint {
  if (usdWad < 0n) throw new Error("USD amount cannot be negative");
  const scale = WAD / USDC_SCALE;
  return usdWad === 0n ? 0n : (usdWad + scale - 1n) / scale;
}

export function signedMulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("division by zero");
  if (b < 0n) throw new Error("signedMulDiv multiplier must be unsigned");
  const negative = a < 0n;
  const magnitude = negative ? -a : a;
  const quotient = mulDivDown(magnitude, b, denominator);
  const result = negative ? -quotient : quotient;
  if (result < INT256_MIN || result > INT256_MAX) throw new Error("signed arithmetic overflow");
  return result;
}

export function directionalPnl(
  isLong: boolean,
  sizeUsdWad: bigint,
  entryPriceWad: bigint,
  exitPriceWad: bigint,
): bigint {
  if (sizeUsdWad < 0n || entryPriceWad <= 0n || exitPriceWad <= 0n) {
    throw new Error("invalid PnL input");
  }
  const delta = isLong ? exitPriceWad - entryPriceWad : entryPriceWad - exitPriceWad;
  return signedMulDiv(delta, sizeUsdWad, entryPriceWad);
}

export function feeOnNotionalUp(notionalUsdWad: bigint, feeRateWad: bigint): bigint {
  if (notionalUsdWad < 0n || feeRateWad < 0n) throw new Error("invalid fee input");
  return mulDivUp(notionalUsdWad, feeRateWad, WAD);
}

export function normalizePriceToWad(rawPrice: bigint, decimals: number): bigint {
  if (rawPrice <= 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error("invalid price precision");
  }
  if (decimals === 18) return rawPrice;
  if (decimals < 18) return rawPrice * 10n ** BigInt(18 - decimals);
  return rawPrice / 10n ** BigInt(decimals - 18);
}
