import {
  NotificationEventSchema,
  passportAsSnapshot,
  UserProfileSchema,
  WalletSnapshotSchema,
  type MarketSnapshot,
  type UserProfile,
  type WalletSnapshot,
} from "@arcmemeperps/domain";
import { BackendRepository, type PersistenceStore } from "@arcmemeperps/persistence";

function refreshSnapshotFreshness(snapshot: MarketSnapshot): MarketSnapshot {
  const { observedAt, maxAgeSeconds } = snapshot.freshness;
  let status = snapshot.freshness.status;
  if (status === "FRESH") {
    const observedMs = observedAt === null ? Number.NaN : Date.parse(observedAt);
    if (!Number.isFinite(observedMs)) status = "UNAVAILABLE";
    else if (observedMs > Date.now()) status = "FUTURE_TIMESTAMP";
    else if (Date.now() - observedMs > maxAgeSeconds * 1_000) status = "STALE";
  }
  return {
    ...snapshot,
    oracleEvidence: { ...snapshot.oracleEvidence, freshness: status },
    freshness: { ...snapshot.freshness, status },
  };
}

function snapshotFromPassport(passport: Parameters<typeof passportAsSnapshot>[0]): MarketSnapshot {
  return refreshSnapshotFreshness(passportAsSnapshot(passport));
}

/** Durable read model used by the API. Missing projections remain unavailable. */
export class PersistenceApiReadModel {
  public constructor(
    private readonly storage: PersistenceStore,
    private readonly repository = new BackendRepository(storage),
  ) {}

  public listMarkets(): Promise<readonly MarketSnapshot[]> {
    return Promise.resolve(this.repository.listPassports().map(snapshotFromPassport));
  }

  public listMarketsWithOptions(options: {
    readonly chain?: string;
    readonly lifecycle?: string;
    readonly qualification?: string;
    readonly limit?: number;
    readonly offset?: number;
  }): Promise<readonly MarketSnapshot[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    return Promise.resolve(
      this.repository
        .listPassports(options)
        .slice(offset, offset + limit)
        .map(snapshotFromPassport),
    );
  }

  public listTrending(): Promise<readonly MarketSnapshot[]> {
    return Promise.resolve(
      [...this.repository.listPassports()]
        .sort((left, right) => {
          const volume =
            BigInt(right.marketData.volume24hUsdWad ?? "0") -
            BigInt(left.marketData.volume24hUsdWad ?? "0");
          if (volume !== 0n) return volume > 0n ? 1 : -1;
          return right.observedAt.localeCompare(left.observedAt);
        })
        .map(snapshotFromPassport),
    );
  }

  public getMarket(marketId: string): Promise<MarketSnapshot | null> {
    const passport = this.repository.getPassport(marketId);
    return Promise.resolve(passport === null ? null : snapshotFromPassport(passport));
  }

  public getWallet(address: string): Promise<WalletSnapshot | null> {
    const record = this.storage.get("wallet_analytics", address.toLowerCase());
    return Promise.resolve(record === null ? null : WalletSnapshotSchema.parse(record.payload));
  }

  public getProfile(address: string): Promise<UserProfile | null> {
    const profile = this.repository.getProfile(address);
    return Promise.resolve(profile === null ? null : UserProfileSchema.parse(profile));
  }

  public getNotifications(address: string): Promise<readonly Record<string, unknown>[]> {
    return Promise.resolve(
      this.repository
        .listNotifications(address)
        .map((event) => NotificationEventSchema.parse(event) as unknown as Record<string, unknown>),
    );
  }

  public searchMarkets(query: string, chain?: string): Promise<readonly MarketSnapshot[]> {
    return Promise.resolve(this.repository.searchPassports(query, chain).map(snapshotFromPassport));
  }

  public async listFreshMarkets(): Promise<readonly MarketSnapshot[]> {
    return (await this.listMarkets()).filter((market) => market.freshness.status === "FRESH");
  }

  public getMarketResource(
    marketId: string,
    resource:
      | "history"
      | "risk"
      | "proof"
      | "holders"
      | "clusters"
      | "deployer"
      | "depth"
      | "activity"
      | "pretrade",
  ): Promise<unknown> {
    const passport = this.repository.getPassport(marketId);
    if (passport === null) throw new Error("MARKET_NOT_FOUND");
    const snapshot = snapshotFromPassport(passport);
    if (resource === "risk") return Promise.resolve(snapshot.riskResult);
    if (resource === "proof") return Promise.resolve(snapshot.qualification);
    if (resource === "holders") return Promise.resolve({ holderEvidence: snapshot.holderEvidence });
    if (resource === "clusters")
      return Promise.resolve({
        holderEvidence: passport.holderEvidence,
        bundleEvidence: passport.bundleEvidence,
      });
    if (resource === "deployer") return Promise.resolve(passport.deployerProfile);
    if (resource === "depth") return Promise.resolve(passport.marketDepth);
    if (resource === "activity")
      return Promise.resolve({
        marketData: passport.marketData,
        organicActivity: passport.organicActivity,
        washFarm: passport.washFarm,
      });
    if (resource === "pretrade")
      return Promise.resolve({
        status:
          snapshot.oracleEvidence.freshness === "FRESH"
            ? "AVAILABLE"
            : snapshot.oracleEvidence.freshness === "UNAVAILABLE"
              ? "UNAVAILABLE"
              : "STALE",
        deploymentId: "arc-testnet-product-v2",
        chainId: 5042002,
        marketId,
        oracle: snapshot.oracleEvidence,
        qualification: snapshot.qualification,
        risk: snapshot.derivativesEvidence,
        fees: {
          status: "UNAVAILABLE",
          reason: "fee schedule is not yet exposed by the canonical read model",
        },
        nonce: { source: "USER_WALLET", required: true },
        expiry: { required: true, source: "USER_WALLET", minimumSeconds: 30 },
        signer: { backendSigns: false, userWalletSigns: true },
      });
    return Promise.resolve(
      this.storage
        .list("market_snapshots")
        .filter((record) => record.id.startsWith(`${marketId}:`))
        .map((record) => snapshotFromPassport(record.payload as never)),
    );
  }

  public getWalletActivity(address: string): Promise<readonly Record<string, unknown>[]> {
    return Promise.resolve(
      this.storage
        .list("wallet_events")
        .filter(
          (record) =>
            typeof record.payload.wallet === "string" &&
            record.payload.wallet.toLowerCase() === address.toLowerCase(),
        )
        .map((record) => record.payload),
    );
  }

  public getWalletIntelligence(address: string): Promise<WalletSnapshot | null> {
    const record = this.storage.get("wallet_analytics", address.toLowerCase());
    if (record === null) return this.getWallet(address);
    try {
      return Promise.resolve(WalletSnapshotSchema.parse(record.payload));
    } catch {
      return Promise.resolve(null);
    }
  }

  public getProfileStats(address: string): Promise<unknown> {
    return Promise.resolve(
      this.storage.get("wallet_analytics", address.toLowerCase())?.payload ?? {
        status: "UNAVAILABLE",
        reason: "WALLET_ANALYTICS_NOT_INDEXED",
      },
    );
  }

  public getProfileWatchlist(address: string): Promise<unknown> {
    return Promise.resolve(
      this.repository.getWatchlist(address) ?? {
        address: address.toLowerCase(),
        marketIds: [],
        wallets: [],
      },
    );
  }

  public listCompetitions(): Promise<readonly Record<string, unknown>[]> {
    return Promise.resolve(
      this.storage.list("competition_seasons").map((record) => record.payload),
    );
  }

  public getCompetition(id: string): Promise<Record<string, unknown> | null> {
    return Promise.resolve(this.storage.get("competition_seasons", id)?.payload ?? null);
  }

  public getCompetitionLeaderboard(id: string): Promise<readonly Record<string, unknown>[]> {
    return Promise.resolve(
      this.storage
        .list("competition_score_snapshots")
        .filter((record) => record.payload.seasonId === id)
        .map((record) => record.payload),
    );
  }

  public getCompetitionAccount(
    id: string,
    address: string,
  ): Promise<Record<string, unknown> | null> {
    return Promise.resolve(
      this.storage
        .list("competition_score_snapshots")
        .find(
          (record) =>
            record.payload.seasonId === id &&
            typeof record.payload.account === "string" &&
            record.payload.account.toLowerCase() === address.toLowerCase(),
        )?.payload ?? null,
    );
  }

  public getAttention(address: string): Promise<readonly Record<string, unknown>[]> {
    return Promise.resolve(
      this.storage
        .list("notifications")
        .filter(
          (record) =>
            typeof record.payload.recipient === "string" &&
            record.payload.recipient.toLowerCase() === address.toLowerCase(),
        )
        .filter(
          (record) =>
            record.payload.type === "MARGIN_LOW" ||
            record.payload.type === "MARKET_PAUSED" ||
            record.payload.type === "ORACLE_DEGRADED",
        )
        .map((record) => record.payload),
    );
  }
}
