/**
 * Arc exposes a unified USDC Transfer event for native and ERC-20 movement.
 * Indexers may also receive an ERC-20-shaped observation for the same movement.
 * These observations are untrusted evidence and must never be treated as an
 * accounting instruction by themselves.
 */
export type ArcUsdcTransferSource = "ARC_SYSTEM_LOG" | "ERC20_LOG";

export interface ArcUsdcTransferObservation {
  readonly source: ArcUsdcTransferSource;
  readonly blockNumber: bigint;
  readonly transactionHash: string;
  readonly logIndex: bigint;
  readonly emitter: string;
  readonly from: string;
  readonly to: string;
  readonly valueUsdc6: bigint;
}

/**
 * A semantic transfer key intentionally excludes the emitter and observation
 * source. Arc's system and ERC-20 views can describe one economic movement.
 * Block, transaction, log position, endpoints, and amount remain bound so two
 * distinct transfers cannot be collapsed accidentally.
 */
export function canonicalArcUsdcTransferKey(observation: ArcUsdcTransferObservation): string {
  return [
    observation.blockNumber.toString(10),
    observation.transactionHash.toLowerCase(),
    observation.logIndex.toString(10),
    observation.from.toLowerCase(),
    observation.to.toLowerCase(),
    observation.valueUsdc6.toString(10),
  ].join(":");
}

/**
 * Deduplicates provider observations for indexing evidence only. The returned
 * values are not custody credits; protocol state transitions and explicit
 * protocol events remain the accounting source of truth.
 */
export function deduplicateArcUsdcTransfers(
  observations: readonly ArcUsdcTransferObservation[],
): readonly ArcUsdcTransferObservation[] {
  const byKey = new Map<string, ArcUsdcTransferObservation>();
  for (const observation of observations) {
    if (observation.valueUsdc6 < 0n) {
      throw new Error("Arc USDC transfer amount cannot be negative");
    }
    const key = canonicalArcUsdcTransferKey(observation);
    const current = byKey.get(key);
    if (
      current === undefined ||
      sourcePriority(observation.source) < sourcePriority(current.source)
    ) {
      byKey.set(key, observation);
    }
  }
  return [...byKey.values()].sort((left, right) =>
    canonicalArcUsdcTransferKey(left).localeCompare(canonicalArcUsdcTransferKey(right)),
  );
}

function sourcePriority(source: ArcUsdcTransferSource): number {
  return source === "ARC_SYSTEM_LOG" ? 0 : 1;
}
