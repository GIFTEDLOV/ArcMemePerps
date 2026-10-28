export function shouldExecuteMainnetKeeper(args: readonly string[], enableFlag: string | undefined): boolean {
  return args.includes("--execute") && !args.includes("--dry-run") && enableFlag === "true";
}

export function applyPositionIndexPage(
  activeIds: readonly string[],
  touchedIds: readonly string[],
  openById: ReadonlyMap<string, boolean>,
): string[] {
  const next = new Set(activeIds);
  for (const id of touchedIds) {
    const isOpen = openById.get(id);
    if (isOpen === undefined) throw new Error(`Position ${id} was not reconciled against on-chain state.`);
    if (isOpen) next.add(id);
    else next.delete(id);
  }
  return [...next].sort((left, right) => BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0);
}

export function classifyLiquidationError(error: unknown): { category: string; description: string; isHealthy: boolean } {
  const value = error as { message?: string; details?: string; shortMessage?: string };
  const message = (value?.shortMessage || value?.details || value?.message || String(error)).toLowerCase();
  if (message.includes("notliquidatable") || message.includes("not liquidatable")) {
    return { category: "NOT_LIQUIDATABLE", description: "Position is not currently liquidatable", isHealthy: true };
  }
  if (message.includes("unauthorized") || message.includes("notowner") || message.includes("onlyliquidationkeeper")) {
    return { category: "UNAUTHORIZED_KEEPER", description: "Keeper account is not authorized by PerpEngine", isHealthy: false };
  }
  if (message.includes("stale") || message.includes("expired") || message.includes("sequence")) {
    return { category: "STALE_ORACLE", description: "Oracle report is stale or its sequence is invalid", isHealthy: false };
  }
  if (message.includes("insufficient funds") || message.includes("gas") || message.includes("nonce")) {
    return { category: "GAS_OR_NONCE_ERROR", description: "Keeper balance or transaction nonce is unavailable", isHealthy: false };
  }
  if (message.includes("timeout") || message.includes("connection") || message.includes("fetch failed") || message.includes("econnrefused")) {
    return { category: "RPC_NETWORK_ERROR", description: "RPC is unavailable", isHealthy: false };
  }
  return { category: "UNKNOWN_REVERT", description: `Simulation failed: ${message.slice(0, 100)}`, isHealthy: false };
}
