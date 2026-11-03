/** Arc's ERC-20 USDC balanceOf returns 6 decimals; native gas uses 18.
 * Keep all balance formatting in bigint space to avoid precision loss. */
export function formatArcErc20Usdc(baseUnits: bigint): string {
  if (baseUnits < 0n) throw new Error("NEGATIVE_USDC_BALANCE");
  const roundedCents = (baseUnits + 5_000n) / 10_000n;
  const dollars = roundedCents / 100n;
  const cents = (roundedCents % 100n).toString().padStart(2, "0");
  return `${dollars.toString()}.${cents}`;
}
