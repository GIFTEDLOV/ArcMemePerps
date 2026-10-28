import type { Availability, Chain, Integrity, Lifecycle, OriginMarket, PerpState } from "./winner-types";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const stringValue = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;
const decimalString = (value: unknown) => {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Number(value))) return null;
  return value;
};
const numberValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const validDate = (value: string | null) => value !== null && Number.isFinite(Date.parse(value));

const chains: readonly Chain[] = ["SOLANA", "BASE", "BNB", "ETHEREUM", "ARC", "ROBINHOOD", "UNKNOWN"];
const lifecycles: readonly Lifecycle[] = ["NEW", "BONDING", "BONDED", "GRADUATED", "MIGRATED", "DEX_LIVE", "ESTABLISHED", "DISCOVERED", "UNKNOWN"];
const integrities: readonly Integrity[] = ["PENDING", "WATCH", "QUALIFIED", "REJECTED", "UNKNOWN"];
const perpStates: readonly PerpState[] = ["NOT_REGISTERED", "ELIGIBLE", "LIVE", "PAUSED", "CLOSE_ONLY", "BLOCKED", "UNKNOWN"];
const availabilityStates: readonly Availability[] = ["AVAILABLE", "PARTIAL", "STALE", "UNAVAILABLE", "CONFLICTED"];
const isOneOf = <T extends string>(value: string | null, values: readonly T[]): value is T =>
  value !== null && (values as readonly string[]).includes(value);

function proofHash(value: unknown): string | null {
  const candidate = stringValue(value);
  return candidate && /^0x[0-9a-fA-F]{64}$/.test(candidate) ? candidate : null;
}

export function normalizeMarket(
  raw: unknown,
  options: { historicalSnapshot?: boolean } = {},
): OriginMarket {
  const r = record(raw);
  const lifecycle = record(r.lifecycle);
  const integrity = record(r.integrity);
  const derivatives = record(r.derivatives);
  const perp = record(r.perp);
  const freshness = record(r.freshness);
  const provider = record(r.providerState);
  const token = record(r.token);
  const rawChain = stringValue(r.chain)?.toUpperCase() ?? null;
  const chain = isOneOf(rawChain, chains) ? rawChain : "UNKNOWN";
  const rawProofHash = proofHash(perp.qualificationHash);
  const rawIntegrity = stringValue(integrity.status)?.toUpperCase() ?? null;
  const rawPerp = stringValue(perp.status)?.toUpperCase() ?? null;
  const rawDerivatives = stringValue(derivatives.status)?.toUpperCase() ?? null;
  // A provider-supplied hash is only a claim. This client does not currently
  // verify qualification state against PerpEngine, so it cannot authorize a
  // positive derivatives status.
  const statusHasProof = false;
  const rawObservations = Array.isArray(integrity.observations) ? integrity.observations : [];
  const observations = rawObservations.flatMap((item) => {
    const observation = record(item);
    const providerName = stringValue(observation.provider);
    const rawStatus = stringValue(observation.status)?.toUpperCase() ?? null;
    if (!providerName || !isOneOf(rawStatus, availabilityStates)) return [];
    return [{
      provider: providerName,
      status: rawStatus,
      observedAt: stringValue(observation.observedAt),
      fetchedAt: stringValue(observation.fetchedAt),
      blockOrSlot: stringValue(observation.blockOrSlot),
      evidenceHash: proofHash(observation.evidenceHash),
      reason: stringValue(observation.reason),
    }];
  });

  const integrityStatus = isOneOf(rawIntegrity, integrities)
    ? rawIntegrity === "QUALIFIED" ? "UNKNOWN" : rawIntegrity
    : "UNKNOWN";
  const perpStatus = isOneOf(rawPerp, perpStates)
    ? (rawPerp === "ELIGIBLE" || rawPerp === "LIVE") && !statusHasProof
      ? "NOT_REGISTERED"
      : rawPerp === "PAUSED" || rawPerp === "CLOSE_ONLY" || rawPerp === "BLOCKED"
        ? "UNKNOWN"
        : rawPerp
    : "UNKNOWN";
  const derivativesStatus = isOneOf(rawDerivatives, perpStates)
    ? (rawDerivatives === "ELIGIBLE" || rawDerivatives === "LIVE") && !statusHasProof
      ? "NOT_REGISTERED"
      : rawDerivatives === "PAUSED" || rawDerivatives === "CLOSE_ONLY" || rawDerivatives === "BLOCKED"
        ? "UNKNOWN"
        : rawDerivatives
    : "UNKNOWN";
  const rawProviderStatus = stringValue(provider.status)?.toUpperCase() ?? null;
  const rawFreshnessStatus = stringValue(freshness.status)?.toUpperCase() ?? null;
  const providerFetchedAt = stringValue(provider.fetchedAt);
  const freshnessObservedAt = stringValue(freshness.observedAt);
  const freshnessMaxAgeSeconds = numberValue(freshness.maxAgeSeconds);
  const providerStatus = options.historicalSnapshot
    ? "STALE"
    : isOneOf(rawProviderStatus, availabilityStates) && validDate(providerFetchedAt)
      ? rawProviderStatus
      : "UNAVAILABLE";
  const hasFreshnessPolicy =
    isOneOf(rawFreshnessStatus, availabilityStates) &&
    validDate(freshnessObservedAt) &&
    freshnessMaxAgeSeconds !== null &&
    freshnessMaxAgeSeconds >= 0;
  const ageMs = hasFreshnessPolicy && freshnessObservedAt
    ? Date.now() - Date.parse(freshnessObservedAt)
    : Number.POSITIVE_INFINITY;
  const freshnessStatus = options.historicalSnapshot
    ? "STALE"
    : !hasFreshnessPolicy
      ? "UNAVAILABLE"
      : ageMs >= 0 && ageMs <= freshnessMaxAgeSeconds! * 1000
        ? rawFreshnessStatus!
        : "STALE";
  const history = Array.isArray(r.history)
    ? r.history.flatMap((point) => {
        const item = record(point);
        const observedAt = stringValue(item.observedAt);
        const priceUsd = decimalString(item.priceUsd);
        return validDate(observedAt) && priceUsd ? [{ observedAt: observedAt!, priceUsd }] : [];
      })
    : [];

  return {
    marketId: stringValue(r.marketId) ?? stringValue(r.id) ?? "unidentified",
    chain,
    tokenAddress: stringValue(r.tokenAddress) ?? stringValue(token.address) ?? "",
    symbol: stringValue(r.symbol) ?? stringValue(token.symbol),
    name: stringValue(r.name) ?? stringValue(token.name),
    decimals: numberValue(r.decimals) ?? numberValue(token.decimals),
    imageUrl: stringValue(r.imageUrl) ?? stringValue(token.imageUrl),
    sourceUrl: stringValue(r.sourceUrl),
    originPlatform: stringValue(r.originPlatform),
    lifecycle: {
      status: isOneOf(stringValue(lifecycle.status)?.toUpperCase() ?? stringValue(r.lifecycleStatus)?.toUpperCase() ?? null, lifecycles)
        ? (stringValue(lifecycle.status)?.toUpperCase() ?? stringValue(r.lifecycleStatus)?.toUpperCase() ?? "UNKNOWN") as Lifecycle
        : "UNKNOWN",
      observedAt: stringValue(lifecycle.observedAt),
      confidenceBps: numberValue(lifecycle.confidenceBps),
      evidenceHash: proofHash(lifecycle.evidenceHash),
    },
    priceUsd: decimalString(r.priceUsd) ?? decimalString(r.price),
    priceChange24hBps: numberValue(r.priceChange24hBps),
    volume24hUsd: decimalString(r.volume24hUsd) ?? decimalString(r.volumeUsd),
    transactions24h: numberValue(r.transactions24h),
    originSpotLiquidityUsd: decimalString(r.originSpotLiquidityUsd) ?? decimalString(r.liquidityUsd),
    originDepth2PctUsd: decimalString(r.originDepth2PctUsd),
    holders: numberValue(r.holders),
    top10ConcentrationBps: numberValue(r.top10ConcentrationBps),
    largestClusterBps: numberValue(r.largestClusterBps),
    integrity: {
      status: integrityStatus,
      reasonCodes: Array.isArray(integrity.reasonCodes)
        ? integrity.reasonCodes.filter((value): value is string => typeof value === "string")
        : [],
      observations,
    },
    derivatives: {
      status: derivativesStatus,
      safeOiUsd: statusHasProof ? decimalString(derivatives.safeOiUsd) : null,
      safePositionUsd: statusHasProof ? decimalString(derivatives.safePositionUsd) : null,
      maxLeverage: statusHasProof ? stringValue(derivatives.maxLeverage) : null,
      oracleQuality: stringValue(derivatives.oracleQuality),
      sourceIndependence: numberValue(derivatives.sourceIndependence),
      reasonCodes: Array.isArray(derivatives.reasonCodes)
        ? derivatives.reasonCodes.filter((value): value is string => typeof value === "string")
        : [],
    },
    perp: {
      status: perpStatus,
      deploymentId: stringValue(perp.deploymentId),
      marketId: stringValue(perp.marketId),
      currentOiUsd: decimalString(perp.currentOiUsd),
      capacityUsd: statusHasProof ? decimalString(perp.capacityUsd) : null,
      qualificationHash: statusHasProof ? rawProofHash : null,
      riskRuleVersion: stringValue(perp.riskRuleVersion),
    },
    providerState: {
      status: providerStatus,
      fetchedAt: stringValue(provider.fetchedAt),
      reason: stringValue(provider.reason),
    },
    freshness: {
      status: freshnessStatus,
      observedAt: stringValue(freshness.observedAt),
      maxAgeSeconds: numberValue(freshness.maxAgeSeconds),
    },
    history,
    isQuarantined: r.isQuarantined === true,
    quarantineReason: stringValue(r.quarantineReason),
  };
}
