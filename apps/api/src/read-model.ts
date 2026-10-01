import {
  MarketSnapshotSchema,
  NotificationEventSchema,
  passportAsSnapshot,
  UserProfileSchema,
  WalletSnapshotSchema,
  type MarketSnapshot,
  type UserProfile,
  type WalletSnapshot,
} from "@arcmemeperps/domain";
import { BackendRepository, type PersistenceStore } from "@arcmemeperps/persistence";

/** Durable read model used by the API. Missing projections remain unavailable. */
export class PersistenceApiReadModel {
  public constructor(
    private readonly storage: PersistenceStore,
    private readonly repository = new BackendRepository(storage),
  ) {}

  public listMarkets(): Promise<readonly MarketSnapshot[]> {
    return Promise.resolve(this.repository.listPassports().map(passportAsSnapshot));
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
        .map(passportAsSnapshot),
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
        .map(passportAsSnapshot),
    );
  }

  public getMarket(marketId: string): Promise<MarketSnapshot | null> {
    const passport = this.repository.getPassport(marketId);
    return Promise.resolve(passport === null ? null : passportAsSnapshot(passport));
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
    return Promise.resolve(this.repository.searchPassports(query, chain).map(passportAsSnapshot));
  }

  public async listFreshMarkets(): Promise<readonly MarketSnapshot[]> {
    return (await this.listMarkets()).filter((market) => market.freshness.status === "FRESH");
  }

  public getMarketResource(
    marketId: string,
    resource:
      "history" | "risk" | "proof" | "holders" | "clusters" | "deployer" | "depth" | "activity",
  ): Promise<unknown> {
    const passport = this.repository.getPassport(marketId);
    if (passport === null) throw new Error("MARKET_NOT_FOUND");
    if (resource === "risk") return Promise.resolve(passport.riskResult);
    if (resource === "proof") return Promise.resolve(passport.qualification);
    if (resource === "holders") return Promise.resolve({ holderEvidence: passport.holderEvidence });
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
    return Promise.resolve(
      this.storage
        .list("market_snapshots")
        .filter((record) => record.id.startsWith(`${marketId}:`))
        .map((record) => MarketSnapshotSchema.parse(record.payload)),
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
