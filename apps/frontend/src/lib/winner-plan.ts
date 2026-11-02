import type { Pretrade } from "./winner-types";

const material = ["account", "marketId", "action", "side", "collateralUsdUsdc", "sizeUsdWad", "acceptablePriceWad", "nonce", "expiry", "planHash"] as const;
export function isPretradeIntact(before: Pretrade, after: Pretrade, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (before.expiry !== null && before.expiry !== undefined && Number(before.expiry) <= nowSeconds) return false;
  return material.every((key) => String(before[key] ?? "") === String(after[key] ?? "")) &&
    String(before.oracle?.sequence ?? "") === String(after.oracle?.sequence ?? "") &&
    String(before.oracle?.priceWad ?? "") === String(after.oracle?.priceWad ?? "") &&
    String(before.qualification?.ruleVersion ?? "") === String(after.qualification?.ruleVersion ?? "") &&
    String(before.qualification?.proofHash ?? "") === String(after.qualification?.proofHash ?? "") &&
    String(before.qualification?.eligible ?? "") === String(after.qualification?.eligible ?? "") &&
    String(before.qualification?.expiresAt ?? "") === String(after.qualification?.expiresAt ?? "") &&
    String(before.risk?.status ?? "") === String(after.risk?.status ?? "") &&
    String(before.risk?.maxLeverageWad ?? "") === String(after.risk?.maxLeverageWad ?? "") &&
    String(before.risk?.maxPositionWad ?? "") === String(after.risk?.maxPositionWad ?? "") &&
    String(before.risk?.maxOIWad ?? "") === String(after.risk?.maxOIWad ?? "");
}
