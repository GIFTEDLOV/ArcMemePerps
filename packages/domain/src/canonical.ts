import { z } from "zod";
import {
  SUPPORTED_CHAINS,
  canonicalJson,
  marketIdForToken,
  type CanonicalValue,
  type SupportedChain,
} from "@arcmemeperps/shared";

/** Versioned wire contracts used by the API, indexer, risk engine, and future clients. */
export const CANONICAL_SCHEMA_VERSION = "1" as const;
export const MARKET_SNAPSHOT_SCHEMA = "market-snapshot/v1" as const;
export const WALLET_SNAPSHOT_SCHEMA = "wallet-snapshot/v1" as const;
export const COMPETITION_SCORE_SCHEMA = "competition-score/v1" as const;
export const NOTIFICATION_EVENT_SCHEMA = "notification-event/v1" as const;
export const USER_PROFILE_SCHEMA = "user-profile/v1" as const;

const LIFECYCLE = [
  "DISCOVERED",
  "PRIMARY_MARKET",
  "BONDING",
  "GRADUATED",
  "DEX_LIVE",
  "ESTABLISHED",
] as const;
const ORIGIN_PLATFORMS = [
  "PUMP_STYLE",
  "UNISWAP_STYLE",
  "RAYDIUM_STYLE",
  "DIRECT_DEX",
  "UNKNOWN",
] as const;
const INTEGRITY = ["PENDING", "WATCH", "QUALIFIED", "REJECTED"] as const;
const DERIVATIVES = [
  "UNASSESSED",
  "WATCH",
  "ELIGIBLE",
  "LIVE",
  "PAUSED",
  "CLOSE_ONLY",
  "BLOCKED",
] as const;

const decimalString = z.string().regex(/^-?[0-9]+$/, "must be an integer string");
const nonNegativeDecimalString = z.string().regex(/^[0-9]+$/, "must be non-negative");
const isoTimestamp = z.string().datetime({ offset: true });
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().min(1);

export const MarketIdentitySchema = z
  .object({
    marketId: hash,
    chain: z.enum(SUPPORTED_CHAINS),
    tokenAddress: address,
    symbol: z.string().nullable(),
    name: z.string().nullable(),
    decimals: z.number().int().min(0).max(255).nullable(),
    deployer: address.nullable(),
    createdAt: isoTimestamp.nullable(),
    originPlatform: z.enum(ORIGIN_PLATFORMS),
  })
  .strict();

export const MarketSnapshotSchema = z
  .object({
    schemaVersion: z.literal(MARKET_SNAPSHOT_SCHEMA),
    observedAt: isoTimestamp,
    identity: MarketIdentitySchema,
    originChain: z.enum(SUPPORTED_CHAINS),
    originPlatform: z.enum(ORIGIN_PLATFORMS),
    lifecycle: z
      .object({
        status: z.enum(LIFECYCLE),
        evidenceIds: z.array(z.string()).readonly(),
        observedAt: isoTimestamp,
        confidenceBps: z.number().int().min(0).max(10_000),
      })
      .strict(),
    marketData: z
      .object({
        priceUsdWad: nonNegativeDecimalString.nullable(),
        volume24hUsdWad: nonNegativeDecimalString.nullable(),
        buyCount24h: z.number().int().min(0).nullable(),
        sellCount24h: z.number().int().min(0).nullable(),
        priceChange24hBps: decimalString.nullable(),
        volatilityBps: nonNegativeDecimalString.nullable(),
      })
      .strict(),
    liquidity: z
      .object({
        totalUsdWad: nonNegativeDecimalString.nullable(),
        dominantPool: address.nullable(),
        poolConcentrationBps: z.number().int().min(0).max(10_000).nullable(),
        venueCount: z.number().int().min(0).nullable(),
        buyDepth1PctUsdWad: nonNegativeDecimalString.nullable(),
        sellDepth1PctUsdWad: nonNegativeDecimalString.nullable(),
        buyDepth2PctUsdWad: nonNegativeDecimalString.nullable(),
        sellDepth2PctUsdWad: nonNegativeDecimalString.nullable(),
        securityStatus: z.enum([
          "LOCKED",
          "BURNED",
          "PROTOCOL_CONTROLLED",
          "WITHDRAWABLE",
          "UNKNOWN",
        ]),
        earliestUnlockAt: isoTimestamp.nullable(),
      })
      .strict(),
    holderEvidence: z
      .object({
        largestHolderBps: z.number().int().min(0).max(10_000).nullable(),
        largestNonSystemHolderBps: z.number().int().min(0).max(10_000).nullable(),
        top10NonSystemBps: z.number().int().min(0).max(10_000).nullable(),
        largestConnectedClusterBps: z.number().int().min(0).max(10_000).nullable(),
        clusterCount: z.number().int().min(0).nullable(),
        systemExclusions: z
          .array(
            z
              .object({ address, classification: z.string(), evidenceIds: z.array(z.string()) })
              .strict(),
          )
          .readonly(),
      })
      .strict(),
    deployerEvidence: z
      .object({
        deployer: address.nullable(),
        tokensCreated: z.number().int().min(0).nullable(),
        survival7dBps: z.number().int().min(0).max(10_000).nullable(),
        survival30dBps: z.number().int().min(0).max(10_000).nullable(),
        associatedWallets: z.array(address).readonly(),
        reasonCodes: z.array(z.string()).readonly(),
      })
      .strict(),
    securityEvidence: z
      .object({
        mintAuthorityActive: z.boolean().nullable(),
        freezeAuthorityActive: z.boolean().nullable(),
        ownerPrivilege: z.boolean().nullable(),
        upgradeable: z.boolean().nullable(),
        transferRestricted: z.boolean().nullable(),
        honeypot: z.boolean().nullable(),
        lpSecurity: z.enum(["LOCKED", "BURNED", "PROTOCOL_CONTROLLED", "WITHDRAWABLE", "UNKNOWN"]),
        evidenceIds: z.array(z.string()).readonly(),
      })
      .strict(),
    oracleEvidence: z
      .object({
        priceSourceCount: z.number().int().min(0),
        independentSourceCount: z.number().int().min(0),
        dispersionBps: z.number().int().min(0).nullable(),
        confidenceBps: z.number().int().min(0).max(10_000).nullable(),
        freshness: z.enum(["FRESH", "STALE", "FUTURE_TIMESTAMP", "UNAVAILABLE", "INVALID"]),
        sourceFamilies: z.array(z.string()).readonly(),
      })
      .strict(),
    derivativesEvidence: z
      .object({
        status: z.enum(DERIVATIVES),
        maxLeverageWad: nonNegativeDecimalString.nullable(),
        maxOIWad: nonNegativeDecimalString.nullable(),
        maxPositionWad: nonNegativeDecimalString.nullable(),
        maintenanceMarginBps: z.number().int().min(0).max(10_000).nullable(),
        manipulationResistance: z.enum([
          "VERY_LOW",
          "LOW",
          "MEDIUM",
          "HIGH",
          "VERY_HIGH",
          "UNAVAILABLE",
        ]),
        reasonCodes: z.array(z.string()).readonly(),
      })
      .strict(),
    providerState: z
      .object({
        providers: z
          .array(
            z
              .object({
                provider: z.string(),
                status: z.enum(["AVAILABLE", "UNAVAILABLE", "ERROR"]),
                lastSuccessAt: isoTimestamp.nullable(),
                fetchedAt: isoTimestamp,
                reason: z.string().nullable(),
              })
              .strict(),
          )
          .readonly(),
        disagreements: z
          .array(
            z
              .object({
                field: z.string(),
                status: z.enum(["MINOR_DIVERGENCE", "MATERIAL_DIVERGENCE", "STALE"]),
                sources: z.array(z.string()).readonly(),
                resolution: z.enum(["BLOCK_AUTOMATIC_QUALIFICATION", "RETAIN_CONSERVATIVE_VALUE"]),
              })
              .strict(),
          )
          .readonly(),
      })
      .strict(),
    freshness: z
      .object({
        status: z.enum(["FRESH", "STALE", "FUTURE_TIMESTAMP", "UNAVAILABLE", "INVALID"]),
        observedAt: isoTimestamp.nullable(),
        fetchedAt: isoTimestamp,
        maxAgeSeconds: z.number().int().positive(),
      })
      .strict(),
    riskResult: z
      .object({
        integrityStatus: z.enum(INTEGRITY),
        derivativesStatus: z.enum(DERIVATIVES),
        hardGateCodes: z.array(z.string()).readonly(),
        rejectionReasons: z.array(z.string()).readonly(),
        warnings: z.array(z.string()).readonly(),
        ruleVersion: z.string(),
      })
      .strict(),
    qualification: z
      .object({
        eligible: z.boolean(),
        proofHash: hash.nullable(),
        commitmentHash: hash.nullable(),
        evidenceRoot: hash.nullable(),
        assessedAt: isoTimestamp.nullable(),
        expiresAt: isoTimestamp.nullable(),
      })
      .strict(),
    tradability: z
      .object({
        status: z.enum(["NOT_TRADABLE", "WATCH", "LIVE", "PAUSED", "CLOSE_ONLY", "BLOCKED"]),
        reasons: z.array(z.string()).readonly(),
        asOf: isoTimestamp,
      })
      .strict(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.identity.chain !== snapshot.originChain) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["identity", "chain"],
        message: "identity chain must equal origin chain",
      });
    }
    try {
      const expected = marketIdForToken(snapshot.originChain, snapshot.identity.tokenAddress);
      if (snapshot.identity.marketId.toLowerCase() !== expected.toLowerCase()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["identity", "marketId"],
          message: "marketId does not match canonical token identity",
        });
      }
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["identity", "tokenAddress"],
        message: error instanceof Error ? error.message : "invalid token identity",
      });
    }
  });

export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;

export const WalletSnapshotSchema = z
  .object({
    schemaVersion: z.literal(WALLET_SNAPSHOT_SCHEMA),
    wallet: address,
    observedAt: isoTimestamp,
    realizedPnlUsdWad: decimalString,
    unrealizedPnlUsdWad: decimalString,
    volumeUsdWad: nonNegativeDecimalString,
    winCount: z.number().int().min(0),
    lossCount: z.number().int().min(0),
    averageHoldSeconds: z.number().int().min(0).nullable(),
    drawdownBps: z.number().int().min(0).max(10_000),
    marketsTraded: z.array(hash).readonly(),
    evidenceIds: z.array(z.string()).readonly(),
  })
  .strict();
export type WalletSnapshot = z.infer<typeof WalletSnapshotSchema>;

export const CompetitionScoreSchema = z
  .object({
    schemaVersion: z.literal(COMPETITION_SCORE_SCHEMA),
    seasonId: z.string().min(1),
    account: address,
    snapshotAt: isoTimestamp,
    scoreWad: decimalString,
    status: z.enum(["VALID", "SUSPICIOUS", "DISQUALIFIED", "UNDER_REVIEW"]),
    reasonCodes: z.array(z.string()).readonly(),
    sourceEventIds: z.array(z.string()).readonly(),
  })
  .strict();
export type CompetitionScore = z.infer<typeof CompetitionScoreSchema>;

export const NotificationEventSchema = z
  .object({
    schemaVersion: z.literal(NOTIFICATION_EVENT_SCHEMA),
    id: z.string().min(1),
    recipient: address,
    type: z.enum([
      "ORDER_EXECUTED",
      "ORDER_FAILED",
      "ORDER_EXPIRED",
      "POSITION_OPENED",
      "POSITION_CLOSED",
      "POSITION_LIQUIDATED",
      "MARGIN_LOW",
      "MARKET_QUALIFIED",
      "MARKET_DOWNGRADED",
      "MARKET_PAUSED",
      "MARKET_CLOSE_ONLY",
      "RISK_LIMIT_REDUCED",
      "ORACLE_DEGRADED",
      "WATCHED_WALLET_BUY",
      "WATCHED_WALLET_SELL",
      "WATCHED_TOKEN_GRADUATED",
    ]),
    marketId: hash.nullable(),
    eventId: z.string().min(1),
    occurredAt: isoTimestamp,
    createdAt: isoTimestamp,
    payload: z.record(z.string(), z.string()),
  })
  .strict();
export type NotificationEvent = z.infer<typeof NotificationEventSchema>;

export const UserProfileSchema = z
  .object({
    schemaVersion: z.literal(USER_PROFILE_SCHEMA),
    primaryWallet: address,
    displayName: z.string().max(80).nullable(),
    avatarUrl: z.string().url().nullable(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
    notificationPreferences: z
      .object({
        enabled: z.boolean(),
        types: z.array(z.string()).readonly(),
      })
      .strict(),
    watchlistMarketIds: z.array(hash).readonly(),
    watchlistWallets: z.array(address).readonly(),
    authorization: z
      .object({
        method: z.literal("WALLET_SIGNATURE"),
        authorizationHash: hash,
        authorizedAt: isoTimestamp,
      })
      .strict()
      .nullable(),
  })
  .strict();
export type UserProfile = z.infer<typeof UserProfileSchema>;

export function parseMarketSnapshot(input: unknown): MarketSnapshot {
  return MarketSnapshotSchema.parse(input);
}

export function canonicalMarketSnapshot(snapshot: MarketSnapshot): string {
  return canonicalJson(snapshot as unknown as CanonicalValue);
}

export function isSupportedSnapshotChain(value: string): value is SupportedChain {
  return (SUPPORTED_CHAINS as readonly string[]).includes(value);
}
