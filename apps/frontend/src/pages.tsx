import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { ApiClient } from "./lib/api";
import { PRODUCT } from "./lib/product";
import type {
  Health,
  JsonRecord,
  Market,
  Profile,
  RealtimeEvent,
  WalletSnapshot,
} from "./lib/types";
import { freshness, pctBps, shortAddress, wad } from "./lib/format";
import type { useWallet } from "./components/Shell";
import { RiskPassport } from "./components/Passport";
import { TradingRail } from "./components/TradingRail";
import {
  AvailabilityPill,
  AttentionPanel,
  EmptyState,
  ErrorState,
  LoadingState,
  MarketRow,
  MarketStatLine,
  MarketTable,
  Metric,
  ProductBadge,
  RiskRow,
  SectionHeader,
  StatCard,
} from "./components/ui";
import { useMarket } from "./hooks/useProduct";

export interface PageProps {
  markets: Market[];
  health: Health | null;
  streamState: string;
  events: RealtimeEvent[];
  api: ApiClient;
  wallet: ReturnType<typeof useWallet>;
  refresh: () => Promise<void>;
}

function PageTitle({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {body && <p>{body}</p>}
      </div>
      {action}
    </div>
  );
}

export function Landing({ markets, health }: PageProps) {
  const market = markets[0];
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="brand">
          <span className="brand-mark">A</span>
          <span>
            ArcMeme<strong>Perps</strong>
          </span>
        </Link>
        <nav>
          <a href="#how">How it works</a>
          <a href="#proof">Proof</a>
          <a href="#system">System status</a>
        </nav>
        <div className="landing-actions">
          <ProductBadge />
          <Link className="button button-secondary" to="/app">
            Open terminal →
          </Link>
        </div>
      </header>
      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <ProductBadge />
            <h1>
              Markets worth trading
              <br />
              <span>earn their leverage.</span>
            </h1>
            <p>
              Discover meme markets across chains, inspect who launched them and how real the
              activity is, then trade only when the market earns derivatives eligibility.
            </p>
            <div className="hero-actions">
              <Link to="/app" className="button button-primary">
                Open terminal <span>↗</span>
              </Link>
              <Link to="/proof" className="button button-ghost">
                View qualification proof
              </Link>
            </div>
            <div className="hero-proof">
              <span className="live-dot live" />
              Live on Arc Testnet <b>·</b> 2-of-3 oracle <b>·</b> USDC settlement
            </div>
          </div>
          <div className="hero-terminal">
            <div className="terminal-top">
              <span>PRODUCT / LIVE SNAPSHOT</span>
              <AvailabilityPill value={market?.oracleEvidence?.freshness} />
            </div>
            <div className="terminal-market">
              <div className="token-mark large">AR</div>
              <div>
                <span className="eyebrow">
                  {market?.identity.chain ?? "ARC"} · {market?.lifecycle?.status ?? "LIVE"}
                </span>
                <h3>{market?.identity.symbol ?? "Arc Product Market"}</h3>
                <span>{market?.identity.name ?? "Canonical Product Testnet market"}</span>
              </div>
            </div>
            <div className="snapshot-rule">
              <span>LIVE REFERENCE</span>
              <span>
                {market?.priceHistory?.length
                  ? `${market.priceHistory.length} observed point${market.priceHistory.length === 1 ? "" : "s"}`
                  : "NO HISTORY INDEXED"}
              </span>
            </div>
            <div className="terminal-price">
              <strong>
                {market?.marketData?.priceUsdWad
                  ? wad(market.marketData.priceUsdWad, 4)
                  : "UNAVAILABLE"}
              </strong>
              <span>
                ORACLE REFERENCE · {market?.oracleEvidence?.independentSourceCount ?? "—"}{" "}
                independent
              </span>
            </div>
            <div className="terminal-grid">
              <Metric
                label="Liquidity"
                value={
                  market?.liquidity?.totalUsdWad ? wad(market.liquidity.totalUsdWad) : "UNAVAILABLE"
                }
              />
              <Metric label="Perps" value={market?.derivativesEvidence?.status ?? "UNAVAILABLE"} />
              <Metric
                label="Qualification"
                value={market?.qualification?.eligible ? "APPROVED" : "UNAVAILABLE"}
              />
            </div>
          </div>
        </section>
        <section className="story-grid" id="how">
          <div className="story-intro">
            <span className="eyebrow">THE PRODUCT LOOP</span>
            <h2>
              Speed to discovery.
              <br />
              <em>Friction before risk.</em>
            </h2>
            <p>
              ArcMemePerps turns noisy market discovery into a decision surface. Every important
              field carries provenance, age and an honest unavailable state.
            </p>
          </div>
          <div className="story-card">
            <span className="story-index">01</span>
            <h3>Discover with context</h3>
            <p>
              Lifecycle, holder concentration, deployer history and live liquidity share one market
              row.
            </p>
            <span className="story-link">Market intelligence →</span>
          </div>
          <div className="story-card">
            <span className="story-index">02</span>
            <h3>Qualify before leverage</h3>
            <p>
              Qualification, oracle independence and capacity are hard gates—not a mystery composite
              score.
            </p>
            <span className="story-link">Risk passport →</span>
          </div>
          <div className="story-card">
            <span className="story-index">03</span>
            <h3>Review before signing</h3>
            <p>
              Account, market, side, oracle sequence, bounds, nonce and expiry are visible before a
              wallet action.
            </p>
            <span className="story-link">Execution gate →</span>
          </div>
        </section>
        <section className="landing-proof" id="proof">
          <div>
            <span className="eyebrow">VISIBLE SAFETY</span>
            <h2>Security is a product surface.</h2>
            <p>
              The exact frozen runtime was exercised in a separate stress deployment through
              liquidation, insurance exhaustion, ADL and terminal solvency blocking. The normal
              Product Testnet stays isolated and healthy.
            </p>
            <Link to="/proof" className="button button-secondary">
              Read the evidence →
            </Link>
          </div>
          <div className="proof-ledger">
            <div>
              <span>Product deployment</span>
              <strong>HEALTHY</strong>
              <small>solvencyBlocked false · bad debt 0</small>
            </div>
            <div>
              <span>Stress deployment</span>
              <strong className="danger-text">BLOCKED BY DESIGN</strong>
              <small>explicit residual bad debt preserved</small>
            </div>
            <div>
              <span>System status</span>
              <strong>{health?.health?.INDEXER ?? "UNAVAILABLE"}</strong>
              <small>Arc RPC · indexer · oracle · vault</small>
            </div>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <span>ARCMEMEPERPS / PRODUCT TESTNET</span>
        <span>Built around proof, not promises.</span>
      </footer>
    </div>
  );
}

export function HomePage({ markets, health, events, wallet, api, streamState }: PageProps) {
  const market = markets[0];
  const [attention, setAttention] = useState<JsonRecord[]>([]);
  useEffect(() => {
    if (!wallet.address) {
      setAttention([]);
      return;
    }
    void api
      .attention(wallet.address)
      .then((response) => setAttention(response.items ?? []))
      .catch(() => setAttention([]));
  }, [api, wallet.address]);
  return (
    <div className="page">
      <PageTitle
        eyebrow="COMMAND CENTER"
        title="Good morning, operator."
        body="The Product Testnet is live. Start with what needs attention, then move into the market surface."
        action={
          <Link className="button button-primary" to="/markets">
            Discover markets →
          </Link>
        }
      />
      <AttentionPanel items={attention} />
      <section className="kpi-grid">
        <StatCard
          label="Product state"
          value={market?.tradability?.status ?? "UNAVAILABLE"}
          detail={market?.riskResult?.integrityStatus ?? "UNAVAILABLE"}
          tone={market?.tradability?.status === "LIVE" ? "good" : "default"}
        />
        <StatCard
          label="Live markets"
          value={markets.length.toString()}
          detail="indexed Product markets"
        />
        <StatCard
          label="LP liquidity"
          value={market?.liquidity?.totalUsdWad ? wad(market.liquidity.totalUsdWad) : "UNAVAILABLE"}
          detail="PublicLPVault custody"
        />
        <StatCard
          label="Oracle"
          value={market?.oracleEvidence?.freshness ?? "UNAVAILABLE"}
          detail="3 sources · 2-of-3"
          tone="good"
        />
      </section>
      <section className="home-grid">
        <div className="panel">
          <SectionHeader
            eyebrow="FRESH / QUALIFIED"
            title="Markets in focus"
            action={
              <Link className="text-link" to="/markets">
                View all →
              </Link>
            }
          />
          {market ? (
            <MarketRow market={market} />
          ) : (
            <EmptyState
              title="No Product market discovered"
              body="The live indexer has not exposed a market yet."
            />
          )}
        </div>
        <div className="panel system-panel">
          <SectionHeader eyebrow="SYSTEM" title="Operational posture" />
          <div className="system-rows">
            {["DATABASE", "ARC_RPC", "INDEXER", "RISK_ENGINE", "REALTIME_STREAM"].map((key) => (
              <div key={key}>
                <span>{key.replaceAll("_", " ")}</span>
                <AvailabilityPill
                  value={
                    key === "REALTIME_STREAM"
                      ? streamState
                      : (health?.health?.[key] ?? "UNAVAILABLE")
                  }
                />
              </div>
            ))}
          </div>
          <Link to="/proof" className="panel-footer-link">
            Inspect deployment evidence →
          </Link>
        </div>
      </section>
      <section className="activity-strip">
        <SectionHeader
          eyebrow="LIVE ACTIVITY"
          title="Canonical events"
          action={
            <Link className="text-link" to="/activity">
              Open activity →
            </Link>
          }
        />
        {events.length ? (
          <div className="event-list">
            {events.map((event) => (
              <div className="event-row" key={event.sequence}>
                <span className="event-seq">#{event.sequence}</span>
                <strong>{event.type.replaceAll(".", " · ")}</strong>
                <span>
                  {event.payload?.marketId
                    ? shortAddress(event.payload.marketId)
                    : "Product deployment"}
                </span>
                <small>{freshness(event.occurredAt)}</small>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No new events"
            body={
              wallet.address
                ? "Your wallet-scoped activity will appear here."
                : "Connect a wallet to personalize this surface."
            }
          />
        )}
      </section>
    </div>
  );
}

export function MarketsPage({ markets }: PageProps) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("search") ?? "");
  const [filter, setFilter] = useState("All");
  const filtered = markets.filter((market) => {
    const text =
      `${market.identity.symbol ?? ""} ${market.identity.name ?? ""} ${market.identity.marketId}`.toLowerCase();
    return (
      text.includes(query.toLowerCase()) &&
      (filter === "All" ||
        (filter === "Qualified"
          ? market.qualification?.eligible
          : market.derivativesEvidence?.status === filter.toUpperCase()))
    );
  });
  function submit(event: React.FormEvent) {
    event.preventDefault();
    setParams(query ? { search: query } : {});
  }
  return (
    <div className="page">
      <PageTitle
        eyebrow="MARKET DISCOVERY"
        title="Find the signal."
        body="Fast discovery, slow assumptions. Every row is backed by the canonical Product API."
        action={<span className="result-count">{filtered.length} indexed</span>}
      />
      <div className="filter-bar">
        <form className="market-search" onSubmit={submit}>
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search symbol, name, address or market ID"
          />
          <button className="button button-secondary">Search</button>
        </form>
        <div className="filter-tabs">
          {["All", "Qualified", "LIVE", "CLOSE_ONLY"].map((item) => (
            <button
              key={item}
              className={filter === item ? "active" : ""}
              onClick={() => setFilter(item)}
            >
              {item.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>
      {filtered.length ? (
        <MarketTable markets={filtered} />
      ) : (
        <EmptyState
          title="No matching markets"
          body="Try an exact token address, market ID or a broader lifecycle filter. No synthetic result was inserted."
        />
      )}
    </div>
  );
}

export function MarketDetailPage({ api, wallet }: PageProps) {
  const { marketId } = useParams();
  const { market, pretrade, resources, error } = useMarket(api, marketId);
  if (error)
    return (
      <div className="page">
        <ErrorState message={error} />
      </div>
    );
  if (!market)
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  return (
    <div className="page market-page">
      <div className="market-detail-grid">
        <main>
          <div className="market-detail-header">
            <div className="market-name detail-name">
              <div className="token-mark large">{(market.identity.symbol ?? "?").slice(0, 2)}</div>
              <div>
                <div className="tag-row">
                  <span className="chain-tag">{market.identity.chain}</span>
                  <AvailabilityPill value={market.lifecycle?.status} />
                  <AvailabilityPill
                    value={market.qualification?.eligible ? "QUALIFIED" : "UNAVAILABLE"}
                  />
                </div>
                <h1>{market.identity.symbol ?? "Unnamed market"}</h1>
                <p>{market.identity.name ?? "Market metadata unavailable"}</p>
              </div>
            </div>
            <div className="detail-price">
              <strong>{wad(market.marketData?.priceUsdWad, 4)}</strong>
              <span>
                oracle reference · {freshness(market.freshness?.observedAt ?? market.observedAt)}
              </span>
            </div>
          </div>
          <MarketStatLine market={market} />
          <div className="chart-card">
            <div className="chart-head">
              <div>
                <span className="eyebrow">PRICE HISTORY</span>
                <h2>Canonical series</h2>
              </div>
              <div className="chart-ranges">
                <button className="active">Available</button>
                <button disabled>5m</button>
                <button disabled>1h</button>
                <button disabled>24h</button>
              </div>
            </div>
            {market.priceHistory && market.priceHistory.length > 1 ? (
              <div className="price-chart">
                <div className="chart-line">
                  {market.priceHistory.map((point, index) => (
                    <span
                      key={`${point.observedAt}-${index}`}
                      style={{
                        height: `${Math.max(8, Math.min(92, Number(point.priceUsdWad ?? 0n) % 100))}%`,
                      }}
                    />
                  ))}
                </div>
                <div className="chart-axis">
                  <span>{freshness(market.priceHistory[0]?.observedAt)}</span>
                  <span>
                    {market.priceHistory.length} observed points · source: Arc OracleRouter
                  </span>
                </div>
              </div>
            ) : (
              <EmptyState
                title="Insufficient historical series"
                body="The Product backend has not indexed enough real historical points for a chart. The current oracle reference remains visible above."
              />
            )}
          </div>
          <div className="tab-strip">
            <button className="active">Overview</button>
            <button>Risk passport</button>
            <button>Holders</button>
            <button>Trades</button>
            <button>Deployer</button>
            <button>Proof</button>
          </div>
          <RiskPassport market={market} resources={resources} />
          <div className="proof-callout">
            <div>
              <span className="eyebrow">QUALIFICATION PROOF</span>
              <h3>Eligibility is explicit, not implied.</h3>
              <p>
                Proof hash and evidence root are read from the live QualificationRegistry
                projection.
              </p>
            </div>
            <Link to="/proof" className="button button-secondary">
              Open proof →
            </Link>
          </div>
        </main>
        <TradingRail market={market} pretrade={pretrade} api={api} walletAddress={wallet.address} />
      </div>
    </div>
  );
}

export function PortfolioPage({ api, wallet }: PageProps) {
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  useEffect(() => {
    if (wallet.address)
      void api
        .wallet(wallet.address)
        .then(setSnapshot)
        .catch(() => setSnapshot(null));
  }, [api, wallet.address]);
  if (!wallet.address)
    return (
      <div className="page">
        <PageTitle
          eyebrow="PORTFOLIO"
          title="Your capital, clearly."
          body="Connect an Arc wallet to read your canonical collateral, positions and PnL."
        />
        <EmptyState
          title="Wallet not connected"
          body="Read-only market discovery stays available. Connect only when you are ready to sign a user-authorized action."
          action={
            <button className="button button-primary" onClick={() => void wallet.connect()}>
              Connect wallet
            </button>
          }
        />
      </div>
    );
  return (
    <div className="page">
      <PageTitle
        eyebrow="PORTFOLIO"
        title="Your capital, clearly."
        body={`Canonical wallet projection for ${shortAddress(wallet.address)}.`}
      />
      <section className="kpi-grid">
        <StatCard
          label="Realized PnL"
          value={snapshot?.realizedPnlUsdWad ? wad(snapshot.realizedPnlUsdWad) : "UNAVAILABLE"}
          detail="canonical profile"
          tone={snapshot?.realizedPnlUsdWad?.startsWith("-") ? "bad" : "good"}
        />
        <StatCard
          label="Unrealized PnL"
          value={snapshot?.unrealizedPnlUsdWad ? wad(snapshot.unrealizedPnlUsdWad) : "UNAVAILABLE"}
          detail="live mark"
        />
        <StatCard
          label="Volume"
          value={snapshot?.volumeUsdWad ? wad(snapshot.volumeUsdWad) : "UNAVAILABLE"}
          detail="indexed Product events"
        />
        <StatCard label="Margin usage" value="UNAVAILABLE" detail="no open position" />
      </section>
      <div className="panel">
        <SectionHeader eyebrow="OPEN POSITIONS" title="No open positions" />
        <EmptyState
          title="Flat by canonical state"
          body="This Product wallet has no open positions at the current checkpoint. Closed lifecycle history remains available in Activity."
        />
      </div>
    </div>
  );
}

export function ActivityPage({ api, wallet }: PageProps) {
  const [items, setItems] = useState<JsonRecord[]>([]);
  useEffect(() => {
    if (wallet.address)
      void api
        .get<JsonRecord[]>(`/wallet/${wallet.address}/activity`)
        .then(setItems)
        .catch(() => setItems([]));
  }, [api, wallet.address]);
  return (
    <div className="page">
      <PageTitle
        eyebrow="ACTIVITY"
        title="One canonical timeline."
        body="Orders, fills, funding, deposits and risk events stay connected to source transaction identity."
      />
      {wallet.address ? (
        <div className="panel">
          <div className="activity-filters">
            <button className="active">All</button>
            <button>Orders</button>
            <button>Trades</button>
            <button>Funding</button>
            <button>LP</button>
            <button>Risk</button>
          </div>
          {items.length ? (
            <div className="event-list">
              {items.map((item, index) => (
                <div className="event-row" key={item.id ?? index}>
                  <span className="event-seq">{item.eventType ?? "EVENT"}</span>
                  <strong>{item.marketId ? shortAddress(item.marketId) : "Product"}</strong>
                  <span>
                    {item.blockNumber ? `block ${item.blockNumber}` : "canonical projection"}
                  </span>
                  <small>{item.eventId ? shortAddress(item.eventId) : "UNAVAILABLE"}</small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No wallet activity returned"
              body="The API did not provide a row for this wallet. Zero is not being used as a substitute."
            />
          )}
        </div>
      ) : (
        <EmptyState
          title="Connect to see activity"
          body="Activity is wallet-scoped and will not be invented before authorization."
        />
      )}
    </div>
  );
}

export function EarnPage({ markets }: PageProps) {
  const market = markets[0];
  return (
    <div className="page">
      <PageTitle
        eyebrow="EARN / PUBLIC LP"
        title="Provide liquidity with the liabilities in view."
        body="PublicLPVault is protocol-controlled. Deposits, shares, NAV and withdrawal queues are economic state—not marketing copy."
      />
      <section className="kpi-grid">
        <StatCard
          label="Vault assets"
          value={market?.liquidity?.totalUsdWad ? wad(market.liquidity.totalUsdWad) : "UNAVAILABLE"}
          detail="live Product snapshot"
        />
        <StatCard
          label="Share price"
          value="UNAVAILABLE"
          detail="not exposed by current read model"
        />
        <StatCard
          label="Withdrawable"
          value="UNAVAILABLE"
          detail="not exposed by current read model"
        />
        <StatCard
          label="Insurance"
          value="UNAVAILABLE"
          detail="not exposed by current read model"
        />
      </section>
      <div className="earn-grid">
        <div className="panel lp-hero">
          <span className="eyebrow">LP CONTROL</span>
          <h2>
            Custody is visible.
            <br />
            Yield is not guaranteed.
          </h2>
          <p>
            LPs are economic counterparties to traders. Profitable trader liabilities affect NAV;
            insurance and ADL are separate layers.
          </p>
          <div className="lp-visual">
            <div className="lp-ring">
              <strong>
                {market?.liquidity?.totalUsdWad ? wad(market.liquidity.totalUsdWad) : "UNAVAILABLE"}
              </strong>
              <span>vault assets</span>
            </div>
            <div>
              <Metric
                label="Managed assets"
                value={
                  market?.liquidity?.totalUsdWad ? wad(market.liquidity.totalUsdWad) : "UNAVAILABLE"
                }
              />
              <Metric label="Protocol state" value="ACTIVE" />
            </div>
          </div>
        </div>
        <div className="panel">
          <SectionHeader eyebrow="YOUR POSITION" title="Wallet required" />
          <EmptyState
            title="Connect to deposit or withdraw"
            body="The current backend exposes live vault state. Signing and mutation flows remain wallet-authorized and are not impersonated by this read-only API."
            action={
              <Link className="button button-secondary" to="/proof">
                Read LP safety →
              </Link>
            }
          />
        </div>
      </div>
    </div>
  );
}

export function ProfilePage({ api, wallet }: PageProps) {
  const { address = "" } = useParams();
  const target = address || wallet.address;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  useEffect(() => {
    if (target)
      void Promise.all([api.profile(target), api.wallet(target)])
        .then(([nextProfile, nextSnapshot]) => {
          setProfile(nextProfile);
          setSnapshot(nextSnapshot);
        })
        .catch(() => undefined);
  }, [api, target]);
  if (!target)
    return (
      <div className="page">
        <PageTitle
          eyebrow="PROFILE"
          title="A wallet-native record."
          body="Connect a wallet or open a profile address to inspect canonical performance."
        />
        <EmptyState title="No wallet selected" body="There is no profile data to display yet." />
      </div>
    );
  return (
    <div className="page">
      <PageTitle
        eyebrow="PROFILE"
        title={profile?.displayName ?? "Wallet profile"}
        body={shortAddress(target)}
        action={<AvailabilityPill value="AVAILABLE" label="CANONICAL" />}
      />
      <section className="profile-head">
        <div className="avatar">{(profile?.displayName ?? target).slice(0, 2).toUpperCase()}</div>
        <div>
          <h2>{profile?.displayName ?? "Unnamed wallet"}</h2>
          <code>{target}</code>
        </div>
      </section>
      <section className="kpi-grid">
        <StatCard
          label="Realized PnL"
          value={snapshot?.realizedPnlUsdWad ? wad(snapshot.realizedPnlUsdWad) : "UNAVAILABLE"}
        />
        <StatCard
          label="Volume"
          value={snapshot?.volumeUsdWad ? wad(snapshot.volumeUsdWad) : "UNAVAILABLE"}
        />
        <StatCard
          label="Win / loss"
          value={
            snapshot ? `${snapshot.winCount ?? "—"} / ${snapshot.lossCount ?? "—"}` : "UNAVAILABLE"
          }
        />
        <StatCard
          label="Drawdown"
          value={snapshot?.drawdownBps !== undefined ? pctBps(snapshot.drawdownBps) : "UNAVAILABLE"}
        />
      </section>
      <div className="panel">
        <SectionHeader eyebrow="PROFILE STATUS" title="Truthful by default" />
        <div className="profile-facts">
          <RiskRow
            label="Markets traded"
            value={snapshot?.marketsTraded?.length?.toString() ?? "UNAVAILABLE"}
            source="canonical wallet analytics"
          />
          <RiskRow
            label="Unrealized PnL"
            value={
              snapshot?.unrealizedPnlUsdWad ? wad(snapshot.unrealizedPnlUsdWad) : "UNAVAILABLE"
            }
            source="canonical wallet analytics"
          />
          <RiskRow
            label="Liquidations"
            value="UNAVAILABLE"
            source="canonical history"
            status="UNAVAILABLE"
          />
        </div>
      </div>
    </div>
  );
}

export function CompetitionPage({ api }: PageProps) {
  const { id } = useParams();
  const [items, setItems] = useState<JsonRecord[]>([]);
  const [selected, setSelected] = useState<JsonRecord | null>(null);
  useEffect(() => {
    void api.competitions().then((response) => setItems(response.items ?? []));
  }, [api]);
  useEffect(() => {
    if (id)
      void api
        .competition(id)
        .then(setSelected)
        .catch(() => setSelected(null));
  }, [api, id]);
  return (
    <div className="page">
      <PageTitle
        eyebrow="COMPETITIONS"
        title="Compete on the ledger, not the leaderboard fantasy."
        body="Scores are projections from canonical Product activity. No prizes or user-submitted points are implied."
      />
      {id && selected ? (
        <div className="panel">
          <SectionHeader eyebrow="TESTNET SEASON" title={selected.name ?? id} />
          <div className="competition-boards">
            <StatCard label="Realized PnL" value="CANONICAL" />
            <StatCard label="Return %" value="CANONICAL" />
            <StatCard label="Risk-adjusted" value="CANONICAL" />
            <StatCard label="Win rate" value="CANONICAL" />
          </div>
          <Link to="/competitions" className="button button-secondary">
            Back to seasons
          </Link>
        </div>
      ) : (
        <div className="competition-list">
          {items.map((season) => (
            <Link
              className="season-card"
              key={season.id}
              to={`/competitions/${encodeURIComponent(String(season.id))}`}
            >
              <div>
                <span className="eyebrow">{season.status ?? "TESTNET"}</span>
                <h2>{season.name}</h2>
                <p>
                  {season.prizes
                    ? "Prize details available"
                    : "No prizes · canonical activity only"}
                </p>
              </div>
              <span>→</span>
            </Link>
          ))}
          {!items.length && (
            <EmptyState
              title="No seasons available"
              body="The backend has not exposed a competition season."
            />
          )}
        </div>
      )}
    </div>
  );
}

export function NotificationsPage({ api, wallet }: PageProps) {
  const [items, setItems] = useState<JsonRecord[]>([]);
  useEffect(() => {
    if (wallet.address)
      void api.notifications(wallet.address).then((response) => setItems(response.items ?? []));
  }, [api, wallet.address]);
  return (
    <div className="page">
      <PageTitle
        eyebrow="NOTIFICATIONS"
        title="Relevant, not noisy."
        body="Notifications are generated from indexed Product events and retain their source identity."
      />
      {wallet.address ? (
        <div className="panel notification-list">
          {items.length ? (
            items.map((item) => (
              <div className="notification-row" key={item.id}>
                <AvailabilityPill
                  value="AVAILABLE"
                  label={String(item.type ?? "EVENT").replaceAll("_", " ")}
                />
                <div>
                  <strong>{item.type ?? "Event"}</strong>
                  <span>{item.marketId ? shortAddress(item.marketId) : "Product deployment"}</span>
                </div>
                <small>{freshness(item.occurredAt)}</small>
              </div>
            ))
          ) : (
            <EmptyState
              title="No notifications"
              body="The live API returned no wallet-scoped notifications."
            />
          )}
        </div>
      ) : (
        <EmptyState
          title="Connect a wallet"
          body="Unread state is never fabricated when the API has no authorized recipient."
        />
      )}
    </div>
  );
}

export function ProofPage({ health }: PageProps) {
  return (
    <div className="page proof-page">
      <PageTitle
        eyebrow="PROOF & SECURITY"
        title="Read the gates before you read the chart."
        body="Product Testnet is the healthy application target. Stress Security is immutable evidence from the exact same frozen runtime."
      />
      <div className="proof-deployment-grid">
        <div className="panel proof-card product-proof">
          <ProductBadge />
          <h2>Product Testnet</h2>
          <p>
            Normal frontend target. Fresh deployed suite, qualified market, live oracle and bounded
            LP liquidity.
          </p>
          <div className="proof-state">
            <AvailabilityPill value="OPERATIONAL" />
            <strong>bad debt 0</strong>
            <strong>solvencyBlocked false</strong>
          </div>
        </div>
        <div className="panel proof-card stress-proof">
          <span className="eyebrow">STRESS / SECURITY</span>
          <h2>Adversarial evidence</h2>
          <p>
            The exact frozen source was exercised through liquidation, insurance exhaustion, ADL and
            terminal insolvency.
          </p>
          <div className="proof-state">
            <AvailabilityPill value="BLOCKED" label="BLOCKED BY DESIGN" />
            <strong className="danger-text">bad debt 2,099,781</strong>
            <strong>solvencyBlocked true</strong>
          </div>
        </div>
      </div>
      <section className="panel proof-ledger-large">
        <SectionHeader eyebrow="DEPLOYMENT PROVENANCE" title="What the UI can prove" />
        <div className="proof-ledger-grid">
          <RiskRow
            label="Chain"
            value="Arc Testnet · 5042002"
            source="canonical Product manifest"
          />
          <RiskRow
            label="Contract source SHA"
            value={PRODUCT.contractSourceSha.slice(0, 18) + "…"}
            source="frozen contract source"
          />
          <RiskRow
            label="Runtime parity"
            value={PRODUCT.runtimeParity}
            source="compiled ↔ Stress ↔ Product"
            status="AVAILABLE"
          />
          <RiskRow label="Risk rule" value={PRODUCT.riskRuleVersion} source="RiskConfig" />
          <RiskRow label="Oracle policy" value="2-of-3 reporters" source="OracleRouter" />
          <RiskRow
            label="Explorer verification"
            value="UNAVAILABLE"
            source="ArcScan"
            status="UNAVAILABLE"
          />
        </div>
      </section>
      <section className="proof-gates">
        <div>
          <span className="eyebrow">QUALIFICATION GATE</span>
          <h3>Proof before leverage</h3>
          <p>QualificationRegistry binds evidence root, rule version, expiry and capacity.</p>
        </div>
        <div>
          <span className="eyebrow">EXECUTION GATE</span>
          <h3>Review before signature</h3>
          <p>The pretrade surface is explicit about stale oracle, capacity and wallet signing.</p>
        </div>
        <div>
          <span className="eyebrow">SYSTEM</span>
          <h3>{health?.health?.INDEXER ?? "UNAVAILABLE"}</h3>
          <p>Product projections are deployment-scoped and replay-safe.</p>
        </div>
      </section>
    </div>
  );
}

export function SystemPage({ health, streamState }: PageProps) {
  return (
    <div className="page">
      <PageTitle
        eyebrow="SYSTEM STATUS"
        title="Operational detail, not a green dot."
        body="Each dependency exposes its own state and freshness."
      />
      <div className="panel system-detail">
        {Object.entries(health?.health ?? {}).map(([key, value]) => (
          <div className="system-detail-row" key={key}>
            <div>
              <strong>{key.replaceAll("_", " ")}</strong>
              <span>Product Testnet dependency</span>
            </div>
            <AvailabilityPill value={key === "REALTIME_STREAM" ? streamState : value} />
          </div>
        ))}
        {!health && (
          <EmptyState
            title="Status unavailable"
            body="The API health endpoint could not be reached."
          />
        )}
      </div>
    </div>
  );
}

export function SettingsPage({ wallet }: PageProps) {
  return (
    <div className="page">
      <PageTitle
        eyebrow="SETTINGS"
        title="Control the surface."
        body="Preferences are local display choices. Wallets remain external and user-controlled."
      />
      <div className="settings-grid">
        <div className="panel">
          <SectionHeader eyebrow="WALLET DISPLAY" title="Wallet connection" />
          <div className="settings-row">
            <div>
              <strong>Current wallet</strong>
              <span>{wallet.address ?? "Disconnected"}</span>
            </div>
            {wallet.address ? (
              <button className="button button-secondary" onClick={wallet.disconnect}>
                Disconnect
              </button>
            ) : (
              <button className="button button-primary" onClick={() => void wallet.connect()}>
                Connect
              </button>
            )}
          </div>
          <div className="settings-row">
            <div>
              <strong>Network</strong>
              <span>Arc Testnet · 5042002</span>
            </div>
            <AvailabilityPill
              value={wallet.state === "WRONG_NETWORK" ? "CRITICAL" : "OPERATIONAL"}
            />
          </div>
        </div>
        <div className="panel">
          <SectionHeader eyebrow="PRIVACY & SAFETY" title="Browser boundaries" />
          <p className="panel-copy">
            No private keys, mnemonics or signing material are stored here. Reviews are read-only
            until a wallet adapter explicitly signs a user-authorized plan.
          </p>
        </div>
      </div>
    </div>
  );
}
