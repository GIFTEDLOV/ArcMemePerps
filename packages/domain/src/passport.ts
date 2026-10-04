import { z } from "zod";
import { MarketSnapshotSchema, type MarketSnapshot } from "./canonical.js";

/**
 * Complete submission read model. It is an extension of the versioned
 * MarketSnapshot boundary; consumers must not rebuild these sections from
 * provider-specific records.
 */
export const MARKET_PASSPORT_SCHEMA = "market-passport/v1" as const;

const address = z.string().min(1);
const isoTimestamp = z.string().datetime({ offset: true });
const integerString = z.string().regex(/^-?[0-9]+$/);
const nonNegativeIntegerString = z.string().regex(/^[0-9]+$/);

const MarketPassportExtrasSchema = z
  .object({
        passportSchemaVersion: z.literal(MARKET_PASSPORT_SCHEMA),
        marketAgeSeconds: z.number().int().min(0).nullable(),
        priceHistory: z
          .array(
            z
              .object({
                observedAt: isoTimestamp,
                priceUsdWad: nonNegativeIntegerString,
                source: z.string(),
              })
              .strict(),
          )
          .readonly(),
        pools: z
          .array(
            z
              .object({
                venue: z.string(),
                poolAddress: address,
                poolType: z.string(),
                liquidityUsdWad: nonNegativeIntegerString.nullable(),
                buyDepth1PctUsdWad: nonNegativeIntegerString.nullable(),
                sellDepth1PctUsdWad: nonNegativeIntegerString.nullable(),
                buyDepth2PctUsdWad: nonNegativeIntegerString.nullable(),
                sellDepth2PctUsdWad: nonNegativeIntegerString.nullable(),
                buyDepth5PctUsdWad: nonNegativeIntegerString.nullable(),
                sellDepth5PctUsdWad: nonNegativeIntegerString.nullable(),
              })
              .strict(),
          )
          .readonly(),
        lpControl: z
          .object({
            status: z.enum(["BURNED", "LOCKED", "PROTOCOL_CONTROLLED", "WITHDRAWABLE", "UNKNOWN"]),
            reason: z.string(),
            evidenceIds: z.array(z.string()).readonly(),
            observedAt: isoTimestamp,
          })
          .strict(),
        bundleEvidence: z
          .object({
            effectiveConcentrationBps: z.number().int().min(0).max(10_000).nullable(),
            coordinatedWallets: z.array(address).readonly(),
            evidenceIds: z.array(z.string()).readonly(),
          })
          .strict(),
        firstBuyers: z
          .array(
            z
              .object({
                wallet: address,
                observedAt: isoTimestamp,
                supplyBps: z.number().int().min(0).max(10_000),
                costUsdWad: nonNegativeIntegerString.nullable(),
                signals: z.array(z.string()).readonly(),
                evidenceIds: z.array(z.string()).readonly(),
              })
              .strict(),
          )
          .readonly(),
        sniperSignals: z.array(z.string()).readonly(),
        deployerProfile: z
          .object({
            tokensCreated: z.number().int().min(0).nullable(),
            survival1dBps: z.number().int().min(0).max(10_000).nullable(),
            survival7dBps: z.number().int().min(0).max(10_000).nullable(),
            survival30dBps: z.number().int().min(0).max(10_000).nullable(),
            liquidityRemovalIncidents: z.number().int().min(0).nullable(),
            mintAdminIncidents: z.number().int().min(0).nullable(),
            associatedWallets: z.array(address).readonly(),
            reasonCodes: z.array(z.string()).readonly(),
          })
          .strict(),
        fundingGraph: z
          .object({
            status: z.enum(["AVAILABLE", "UNAVAILABLE", "INSUFFICIENT_DATA"]),
            nodes: z.array(address).readonly(),
            edges: z
              .array(
                z
                  .object({
                    from: address,
                    to: address,
                    depth: z.number().int().min(1),
                    relation: z.string(),
                    evidenceIds: z.array(z.string()).readonly(),
                  })
                  .strict(),
              )
              .readonly(),
            reasonCodes: z.array(z.string()).readonly(),
          })
          .strict(),
        washFarm: z
          .object({
            verdict: z.enum(["CLEAR", "SUSPICIOUS", "HIGH_RISK", "INSUFFICIENT_DATA"]),
            reasonCodes: z.array(z.string()).readonly(),
            features: z.record(z.string(), integerString),
          })
          .strict(),
        organicActivity: z
          .object({
            holderGrowthBps: z.number().int().nullable(),
            newHolderVelocity: z.number().int().nullable(),
            independentTraderCount: z.number().int().nullable(),
            retentionBps: z.number().int().min(0).max(10_000).nullable(),
            netCapitalFlowUsdWad: integerString.nullable(),
            venueDiversity: z.number().int().min(0).nullable(),
            persistenceBps: z.number().int().min(0).max(10_000).nullable(),
          })
          .strict(),
        smartWalletActivity: z
          .object({
            participatingWallets: z.array(address).readonly(),
            qualityBps: z.number().int().min(0).max(10_000).nullable(),
            evidenceIds: z.array(z.string()).readonly(),
          })
          .strict(),
        marketDepth: z
          .object({
            status: z.enum(["AVAILABLE", "UNAVAILABLE", "INVALID"]),
            buyDepth1PctUsdWad: nonNegativeIntegerString.nullable(),
            sellDepth1PctUsdWad: nonNegativeIntegerString.nullable(),
            buyDepth2PctUsdWad: nonNegativeIntegerString.nullable(),
            sellDepth2PctUsdWad: nonNegativeIntegerString.nullable(),
            buyDepth5PctUsdWad: nonNegativeIntegerString.nullable(),
            sellDepth5PctUsdWad: nonNegativeIntegerString.nullable(),
            observedAt: isoTimestamp,
            reason: z.string().nullable(),
          })
          .strict(),
        sourceIndependence: z
          .object({
            independentSourceCount: z.number().int().min(0),
            sourceIds: z.array(z.string()).readonly(),
            correlatedSourceIds: z.array(z.string()).readonly(),
          })
          .strict(),
        arcMarketState: z.enum([
          "UNREGISTERED",
          "REGISTERED",
          "LIVE",
          "PAUSED",
          "CLOSE_ONLY",
          "BLOCKED",
        ]),
        providerHealth: z
          .array(
            z
              .object({
                component: z.string(),
                state: z.enum(["OPERATIONAL", "DEGRADED", "STALE", "UNAVAILABLE", "CRITICAL"]),
                lastSuccessAt: isoTimestamp.nullable(),
                latencyMs: z.number().int().min(0).nullable(),
                error: z.string().nullable(),
              })
              .strict(),
          )
          .readonly(),
        riskRuleVersion: z.string().min(1),
  })
  .strict();

const MARKET_PASSPORT_EXTRA_KEYS = new Set([
  "passportSchemaVersion",
  "marketAgeSeconds",
  "priceHistory",
  "pools",
  "lpControl",
  "bundleEvidence",
  "firstBuyers",
  "sniperSignals",
  "deployerProfile",
  "fundingGraph",
  "washFarm",
  "organicActivity",
  "smartWalletActivity",
  "marketDepth",
  "sourceIndependence",
  "arcMarketState",
  "providerHealth",
  "riskRuleVersion",
]);
const MARKET_SNAPSHOT_KEYS = new Set([
  "schemaVersion",
  "observedAt",
  "identity",
  "originChain",
  "originPlatform",
  "lifecycle",
  "marketData",
  "liquidity",
  "holderEvidence",
  "deployerEvidence",
  "securityEvidence",
  "oracleEvidence",
  "derivativesEvidence",
  "providerState",
  "freshness",
  "riskResult",
  "qualification",
  "tradability",
]);

export type MarketPassport = MarketSnapshot & z.infer<typeof MarketPassportExtrasSchema>;

/**
 * Zod's strict intersection rejects the fields contributed by the other side.
 * Validate the two canonical strict objects independently so a complete
 * passport remains strict while accepting both its snapshot and passport
 * sections.
 */
export const MarketPassportSchema = z.custom<MarketPassport>(
  (input) => {
    try {
      if (input === null || typeof input !== "object" || Array.isArray(input)) return false;
      const record = input as Record<string, unknown>;
      const baseInput = Object.fromEntries(
        Object.entries(record).filter(([key]) => !MARKET_PASSPORT_EXTRA_KEYS.has(key)),
      );
      try { MarketSnapshotSchema.parse(baseInput); } catch { return false; }
      const extrasInput = Object.fromEntries(
        Object.entries(record).filter(([key]) => !MARKET_SNAPSHOT_KEYS.has(key)),
      );
      try { MarketPassportExtrasSchema.parse(extrasInput); } catch { return false; }
      return true;
    } catch {
      return false;
    }
  },
  { message: "invalid market passport" },
);

export function parseMarketPassport(input: unknown): MarketPassport {
  return MarketPassportSchema.parse(input);
}

export function passportAsSnapshot(passport: MarketPassport): MarketSnapshot {
  const record: Record<string, unknown> = passport;
  const base = Object.fromEntries(
    Object.entries(record).filter(([key]) => !MARKET_PASSPORT_EXTRA_KEYS.has(key)),
  );
  return MarketSnapshotSchema.parse(base);
}
