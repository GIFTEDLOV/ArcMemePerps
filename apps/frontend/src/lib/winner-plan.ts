import type { Pretrade } from "./winner-types";

const material = ["account", "marketId", "action", "side", "collateralUsdUsdc", "sizeUsdWad", "acceptablePriceWad", "nonce", "expiry", "planHash"] as const;
export function isPretradeIntact(before: Pretrade, after: Pretrade, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (before.expiry !== null && before.expiry !== undefined && Number(before.expiry) <= nowSeconds) return false;
  return material.every((key) => String(before[key] ?? "") === String(after[key] ?? "")) && String(before.oracle?.sequence ?? "") === String(after.oracle?.sequence ?? "") && String(before.qualification?.ruleVersion ?? "") === String(after.qualification?.ruleVersion ?? "");
}
