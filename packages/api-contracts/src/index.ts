import { z } from "zod";
import {
  MarketSnapshotSchema,
  NotificationEventSchema,
  WalletSnapshotSchema,
} from "@arcmemeperps/domain";

export const API_VERSION = "v1" as const;
export const API_ENDPOINTS = [
  "GET /markets",
  "GET /markets/search",
  "GET /markets/trending",
  "GET /markets/fresh",
  "GET /markets/:marketId",
  "GET /markets/:marketId/risk",
  "GET /markets/:marketId/proof",
  "GET /markets/:marketId/history",
  "GET /markets/:marketId/holders",
  "GET /markets/:marketId/deployer",
  "GET /markets/:marketId/clusters",
  "GET /markets/:marketId/depth",
  "GET /markets/:marketId/activity",
  "GET /wallet/:address",
  "GET /wallet/:address/activity",
  "GET /wallet/:address/intelligence",
  "GET /profile/:address",
  "GET /profile/:address/stats",
  "GET /profile/:address/watchlist",
  "GET /competitions",
  "GET /competitions/:id",
  "GET /competitions/:id/leaderboard",
  "GET /notifications/:address",
  "GET /attention/:address",
  "GET /protocol/status",
] as const;

export const MarketListResponseSchema = z
  .object({
    schemaVersion: z.literal(API_VERSION),
    items: z.array(MarketSnapshotSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const MarketResponseSchema = z
  .object({ schemaVersion: z.literal(API_VERSION), market: MarketSnapshotSchema })
  .strict();
export const WalletResponseSchema = z
  .object({ schemaVersion: z.literal(API_VERSION), wallet: WalletSnapshotSchema })
  .strict();
export const NotificationListResponseSchema = z
  .object({
    schemaVersion: z.literal(API_VERSION),
    items: z.array(NotificationEventSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const ProtocolStatusSchema = z
  .object({
    schemaVersion: z.literal(API_VERSION),
    asOf: z.string().datetime({ offset: true }),
    health: z.record(
      z.string(),
      z.enum(["OPERATIONAL", "DEGRADED", "STALE", "UNAVAILABLE", "CRITICAL"]),
    ),
    readOnly: z.literal(true),
  })
  .strict();

export type MarketListResponse = z.infer<typeof MarketListResponseSchema>;
export type MarketResponse = z.infer<typeof MarketResponseSchema>;
export type WalletResponse = z.infer<typeof WalletResponseSchema>;
export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;
export type ProtocolStatus = z.infer<typeof ProtocolStatusSchema>;

export function assertApiPath(path: string): void {
  if (!path.startsWith("/api/v1/")) throw new Error("API path must be versioned");
}
