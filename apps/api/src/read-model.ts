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
import { loadArcDeploymentConfig, type ArcDeploymentConfig } from "@arcmemeperps/shared";

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
    private readonly deployment: ArcDeploymentConfig = loadArcDeploymentConfig(),
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

  public listUniverseMarkets(options: {
    readonly chain?: string;
    readonly lifecycle?: string;
    readonly perp?: string;
    readonly limit?: number;
    readonly offset?: number;
  }): Promise<{ readonly items: readonly Record<string, unknown>[]; readonly total: number; readonly discoveryCount: number; readonly perpCount: number }> {
    const all = this.storage.list("market_universe").map((item) => item.payload);
    const filtered = all.filter((market) =>
      (options.chain === undefined || market.chain === options.chain) &&
      (options.lifecycle === undefined || (market.lifecycle as Record<string, unknown> | undefined)?.status === options.lifecycle) &&
      (options.perp === undefined || (market.perp as Record<string, unknown> | undefined)?.status === options.perp),
    );
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const perpCount = this.countRegisteredPerps(all);
    return Promise.resolve({ items: filtered.slice(offset, offset + limit), total: filtered.length, discoveryCount: all.length, perpCount });
  }

  public searchUniverseMarkets(query: string, chain?: string): Promise<{ readonly items: readonly Record<string, unknown>[]; readonly total: number; readonly discoveryCount: number; readonly perpCount: number }> {
    const normalized = query.trim().toLowerCase();
    const all = this.storage.list("market_universe").map((item) => item.payload);
    const matched = all.filter((market) => {
      const token = typeof market.tokenAddress === "string" ? market.tokenAddress.toLowerCase() : "";
      const id = typeof market.marketId === "string" ? market.marketId.toLowerCase() : "";
      const symbol = typeof market.symbol === "string" ? market.symbol.toLowerCase() : "";
      const name = typeof market.name === "string" ? market.name.toLowerCase() : "";
      return (chain === undefined || market.chain === chain) && (normalized.length === 0 || token === normalized || id === normalized || symbol.includes(normalized) || name.includes(normalized));
    });
    const perpCount = this.countRegisteredPerps(all);
    return Promise.resolve({ items: matched, total: matched.length, discoveryCount: all.length, perpCount });
  }

  public getUniverseMarket(marketId: string): Promise<Record<string, unknown> | null> {
    return Promise.resolve(this.storage.get("market_universe", marketId)?.payload ?? null);
  }

  public getUniverseResource(marketId: string, resource: string): Promise<unknown> {
    const market = this.storage.get("market_universe", marketId)?.payload;
    if (market === null || market === undefined) return Promise.resolve(null);
    if (resource === "history") return Promise.resolve({ status: Array.isArray(market.history) && market.history.length > 1 ? "AVAILABLE" : "UNAVAILABLE", items: market.history ?? [], reason: "INSUFFICIENT_REAL_OBSERVATIONS" });
    if (resource === "risk") return Promise.resolve({ status: "PARTIAL", integrity: market.integrity, derivatives: market.derivatives, freshness: market.freshness });
    if (resource === "proof") return Promise.resolve({ status: "UNAVAILABLE", qualification: market.perp, reason: "MARKET_NOT_REGISTERED_FOR_ARC_PERPS" });
    if (resource === "activity") return Promise.resolve({ status: "UNAVAILABLE", reason: "ORIGIN_ACTIVITY_READER_NOT_CONFIGURED" });
    if (resource === "holders" || resource === "clusters" || resource === "deployer") return Promise.resolve({ status: "UNAVAILABLE", reason: "ENRICHMENT_PROVIDER_NOT_CONFIGURED" });
    if (resource === "depth") return Promise.resolve({ status: "UNAVAILABLE", reason: "DIRECTIONAL_DEPTH_NOT_OBSERVED" });
    if (resource === "pretrade")
      return Promise.resolve({
        status: "UNAVAILABLE",
        reason: this.deployment.lifecycle === "DEPLOYMENT_PENDING" ? "ARC_DEPLOYMENT_PENDING" : "ARC_PERP_NOT_REGISTERED",
        marketId,
        network: this.deployment.chainName,
        chainId: this.deployment.chainId,
        deploymentId: this.deployment.deploymentId,
        signer: { backendSigns: false, userWalletSigns: true },
      });
    throw new Error("RESOURCE_NOT_SUPPORTED");
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
          this.deployment.lifecycle === "DEPLOYMENT_PENDING"
            ? "UNAVAILABLE"
            : snapshot.oracleEvidence.freshness === "FRESH"
              ? "AVAILABLE"
              : snapshot.oracleEvidence.freshness === "UNAVAILABLE"
                ? "UNAVAILABLE"
                : "STALE",
        reason: this.deployment.lifecycle === "DEPLOYMENT_PENDING" ? "ARC_DEPLOYMENT_PENDING" : undefined,
        network: this.deployment.chainName,
        deploymentId: this.deployment.deploymentId,
        chainId: this.deployment.chainId,
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

  private countRegisteredPerps(markets: readonly Record<string, unknown>[]): number {
    if (this.deployment.lifecycle === "DEPLOYMENT_PENDING") return 0;
    return markets.filter((market) => (market.perp as Record<string, unknown> | undefined)?.status !== "NOT_REGISTERED").length;
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
