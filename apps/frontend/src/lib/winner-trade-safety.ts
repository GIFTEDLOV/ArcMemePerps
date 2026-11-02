import type { OriginMarket, Pretrade } from "./winner-types";

export interface ProductionTradingState {
  tradingEnabled?: boolean;
  lpDepositsEnabled?: boolean;
  qualificationInventory?: string;
  health?: Record<string, string>;
}

// Displayed DEX prices, user-selected leverage, and a connected wallet are
// never sufficient grounds for signing a live collateral or derivatives tx.
export function tradeReleaseBlocker(
  market: OriginMarket,
  protocol: ProductionTradingState | null,
  plan: Pretrade | null,
  account: string | null,
  chainId: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | null {
  if (!account || !/^0x[0-9a-fA-F]{40}$/.test(account) || chainId !== 5042)
    return "Connect a real Arc mainnet wallet.";
  if (!protocol || protocol.tradingEnabled !== true || protocol.lpDepositsEnabled !== true)
    return "Live trading and LP liquidity are not activated.";
  if (protocol.qualificationInventory !== "VERIFIED")
    return "Live market qualification is not verified.";
  if (market.perp.status !== "LIVE" || market.derivatives.status !== "LIVE" ||
      market.integrity.status !== "QUALIFIED" || market.isQuarantined)
    return "This market is not verified for live perpetual trading.";
  if (!plan || plan.status !== "AVAILABLE" || plan.chainId !== 5042 ||
      plan.account?.toLowerCase() !== account.toLowerCase() ||
      plan.marketId !== market.perp.marketId || plan.qualification?.eligible !== true)
    return "No signed, account-bound executable plan exists.";
  if (!plan.oracle?.sequence || !plan.qualification?.proofHash ||
      !plan.qualification?.expiresAt || !plan.expiry || !plan.acceptablePriceWad ||
      !plan.sizeUsdWad || !plan.collateralUsdUsdc)
    return "Fresh oracle, qualification, or risk evidence is missing.";
  const expiry = Number(plan.expiry);
  const proofExpiry = Date.parse(plan.qualification.expiresAt) / 1000;
  if (!Number.isFinite(expiry) || expiry <= nowSeconds ||
      !Number.isFinite(proofExpiry) || proofExpiry <= nowSeconds)
    return "Trading proof or order quote has expired.";
  try {
    if (BigInt(plan.sizeUsdWad) <= 0n || BigInt(plan.acceptablePriceWad) <= 0n ||
        BigInt(plan.collateralUsdUsdc) <= 0n)
      return "Invalid position or collateral amount.";
  } catch {
    return "Invalid unsigned transaction data.";
  }
  return null;
}
