import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { effectiveFreshness, freshness, pctBps, usdc, wad } from "../lib/format";
import type { Availability, Health, JsonRecord, Market } from "../lib/types";

export function AvailabilityPill({ value, label }: { value?: string | null; label?: string }) {
  const normalized = (value ?? "UNAVAILABLE").toUpperCase();
  const tone =
    normalized === "LIVE" ||
    normalized === "AVAILABLE" ||
    normalized === "QUALIFIED" ||
    normalized === "OPERATIONAL" ||
    normalized === "FRESH" ||
    normalized === "PROTOCOL_CONTROLLED"
      ? "good"
      : normalized === "WATCH" || normalized === "STALE" || normalized === "PARTIAL"
        ? "warn"
        : normalized === "BLOCKED" || normalized === "REJECTED" || normalized === "CRITICAL"
          ? "bad"
          : "muted";
  return (
    <span className={`pill pill-${tone}`}>
      <span className="pill-dot" />
      {label ?? normalized}
    </span>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: string;
}) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      {detail && <span className="stat-detail">{detail}</span>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-mark">∅</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function LoadingState({ label = "Reading canonical Product state…" }: { label?: string }) {
  return (
    <div className="loading-state">
      <span className="spinner" />
      {label}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-state">
      <div>
        <span className="eyebrow">LIVE DATA ERROR</span>
        <h3>Canonical data is unavailable</h3>
        <p>{message}. The interface is keeping the failure explicit.</p>
      </div>
      {retry && (
        <button className="button button-secondary" onClick={retry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className="tabular">{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function MarketRow({ market }: { market: Market }) {
  const id = market.identity.marketId;
  return (
    <Link className="market-row" to={`/markets/${id}`}>
      <div className="market-name">
        <div className="token-mark">{(market.identity.symbol ?? "?").slice(0, 2)}</div>
        <div>
          <strong>{market.identity.symbol ?? market.identity.name ?? "Unnamed market"}</strong>
          <span>{market.identity.name ?? "UNAVAILABLE"}</span>
        </div>
      </div>
      <span className="chain-tag">
        {market.identity.chain} · {market.lifecycle?.status?.replaceAll("_", " ") ?? "UNAVAILABLE"}
      </span>
      <span className="tabular">{wad(market.marketData?.priceUsdWad)}</span>
      <span className="tabular">
        {usdc(
          market.liquidity?.totalUsdWad
            ? BigInt(market.liquidity.totalUsdWad) / 1_000_000_000_000n
            : null,
        )}
      </span>
      <AvailabilityPill value={market.qualification?.eligible ? "QUALIFIED" : "UNAVAILABLE"} />
      <AvailabilityPill value={market.derivativesEvidence?.status} />
      <span className="row-chevron">→</span>
    </Link>
  );
}

export function MarketTable({ markets }: { markets: Market[] }) {
  return (
    <div className="market-table">
      <div className="market-table-head">
        <span>Market</span>
        <span>Lifecycle</span>
        <span>Price</span>
        <span>Liquidity</span>
        <span>Qualification</span>
        <span>Perps</span>
        <span />
      </div>
      {markets.map((market) => (
        <MarketRow key={market.identity.marketId} market={market} />
      ))}
    </div>
  );
}

export function AttentionPanel({ items }: { items: JsonRecord[] }) {
  return (
    <div className="attention-panel">
      <div>
        <span className="attention-icon">!</span>
        <div>
          <span className="eyebrow">NEEDS ATTENTION</span>
          <h3>
            {items.length
              ? `${items.length} item${items.length === 1 ? "" : "s"} need attention`
              : "No immediate action required"}
          </h3>
        </div>
      </div>
      <p>
        {items.length
          ? "These items come directly from canonical Product state."
          : "Wallet-scoped attention appears here after connecting a wallet."}
      </p>
      {items.length > 0 && (
        <div className="attention-events">
          {items.slice(0, 3).map((item, index) => (
            <div key={String(item.id ?? item.reasonCode ?? index)}>
              <span className="event-seq">{String(item.severity ?? "WATCH")}</span>
              {String(item.reason ?? item.reasonCode ?? item.type ?? "ATTENTION")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HealthStrip({
  health,
  streamState,
}: {
  health: Health | null;
  streamState: Availability | "LIVE";
}) {
  const statuses = health?.health ?? {};
  return (
    <div className="health-strip">
      <div className="health-live">
        <span className={`live-dot ${streamState === "LIVE" ? "live" : "stale"}`} />
        {streamState === "LIVE" ? "LIVE STREAM" : "STREAM " + streamState}
      </div>
      {["ARC_RPC", "INDEXER", "ORACLE", "VAULT", "INSURANCE"].map((key) => (
        <div className="health-item" key={key}>
          <span>{key.replace("_", " ")}</span>
          <AvailabilityPill value={statuses[key] ?? "UNAVAILABLE"} />
        </div>
      ))}
      <span className="health-time">
        {health?.asOf ? `updated ${freshness(health.asOf)}` : "status unavailable"}
      </span>
    </div>
  );
}

export function SourceLine({
  source,
  observedAt,
  status,
}: {
  source: string;
  observedAt?: string;
  status?: string;
}) {
  return (
    <div className="source-line">
      <span className="source-badge">{source}</span>
      {status && <AvailabilityPill value={status} />}
      {observedAt && <span>{freshness(observedAt)}</span>}
    </div>
  );
}

export function RiskRow({
  label,
  value,
  source = "canonical Product",
  status = "AVAILABLE",
  observedAt,
}: {
  label: string;
  value: string;
  source?: string;
  status?: string;
  observedAt?: string;
}) {
  return (
    <div className="risk-row">
      <div>
        <strong>{label}</strong>
        <span>{source}</span>
      </div>
      <div className="risk-value">
        <strong>{value}</strong>
        <SourceLine source={source} observedAt={observedAt} status={status} />
      </div>
    </div>
  );
}

export function ProductBadge() {
  return (
    <span className="product-badge">
      <span className="brand-mark">A</span> PRODUCT TESTNET
    </span>
  );
}

export function DeploymentLabel() {
  return (
    <span className="deployment-label">
      ARC TESTNET <b>5042002</b>
    </span>
  );
}

export function SidebarLink({
  to,
  label,
  icon,
  active,
}: {
  to: string;
  label: string;
  icon: string;
  active?: boolean;
}) {
  return (
    <Link className={`side-link ${active ? "active" : ""}`} to={to}>
      <span>{icon}</span>
      {label}
    </Link>
  );
}

export function formatRisk(market: Market | null) {
  return market?.derivativesEvidence?.maxLeverageWad
    ? `${Number(BigInt(market.derivativesEvidence.maxLeverageWad) / 1_000_000_000_000_000n) / 1000}x max`
    : "UNAVAILABLE";
}

export function MarketStatLine({ market }: { market: Market }) {
  return (
    <div className="market-stat-line">
      <Metric label="Price" value={wad(market.marketData?.priceUsdWad)} />
      <Metric
        label="Liquidity"
        value={usdc(
          market.liquidity?.totalUsdWad
            ? BigInt(market.liquidity.totalUsdWad) / 1_000_000_000_000n
            : null,
        )}
      />
      <Metric
        label="Oracle"
        value={effectiveFreshness(
          market.oracleEvidence?.freshness,
          market.freshness?.observedAt ?? market.observedAt,
          market.freshness?.maxAgeSeconds,
        )}
        hint={`${market.oracleEvidence?.independentSourceCount ?? "—"} independent sources`}
      />
      <Metric label="Capacity" value={formatRisk(market)} />
    </div>
  );
}

export function BaseUnits({ value }: { value?: string | null }) {
  return (
    <span className="tabular">
      {value === null || value === undefined ? "UNAVAILABLE" : usdc(value)}
    </span>
  );
}

export function Bps({ value }: { value?: number | null }) {
  return <span className="tabular">{pctBps(value)}</span>;
}
