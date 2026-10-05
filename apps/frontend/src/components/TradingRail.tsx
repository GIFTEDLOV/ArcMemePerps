import { useEffect, useMemo, useState } from "react";
import { parseUnits } from "viem";
import type { ApiClient } from "../lib/api";
import type { Market, Pretrade } from "../lib/types";
import { effectiveFreshness } from "../lib/format";
import { AvailabilityPill } from "./ui";

export function TradingRail({
  market,
  pretrade,
  api,
  walletAddress,
}: {
  market: Market;
  pretrade: Pretrade | null;
  api: ApiClient;
  walletAddress: string | null;
}) {
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [collateral, setCollateral] = useState("0.05");
  const [leverage, setLeverage] = useState("2");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewPretrade, setReviewPretrade] = useState<Pretrade | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const maxLeverage = useMemo(
    () =>
      pretrade?.risk?.maxLeverageWad
        ? Number(BigInt(pretrade.risk.maxLeverageWad) / 1_000_000_000_000_000n) / 1000
        : null,
    [pretrade],
  );
  const oracleFreshness = effectiveFreshness(
    market.oracleEvidence?.freshness,
    market.freshness?.observedAt ?? market.observedAt,
    market.freshness?.maxAgeSeconds,
  );
  const validation = useMemo(() => {
    if (!/^\d+(\.\d{1,6})?$/.test(collateral) || /^0+(\.0{1,6})?$/.test(collateral))
      return "Enter a positive USDC amount.";
    try {
      const collateralWad = parseUnits(collateral, 6) * 1_000_000_000_000n;
      const leverageWad = parseUnits(leverage, 18);
      if (pretrade?.risk?.maxLeverageWad && leverageWad > BigInt(pretrade.risk.maxLeverageWad))
        return "Leverage exceeds the canonical market maximum.";
      if (
        pretrade?.risk?.maxPositionWad &&
        (collateralWad * leverageWad) / 1_000_000_000_000_000_000n >
          BigInt(pretrade.risk.maxPositionWad)
      )
        return "Collateral × leverage exceeds the position cap.";
    } catch {
      return "Enter a valid fixed-point amount.";
    }
    return null;
  }, [collateral, leverage, pretrade]);
  useEffect(() => {
    if (!reviewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReviewOpen(false);
        setReviewPretrade(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reviewOpen]);
  const review = async () => {
    if (validation) {
      setMessage(validation);
      return;
    }
    await api
      .pretrade(market.identity.marketId)
      .then((latest) => {
        if (latest.status !== "AVAILABLE" || latest.oracle?.freshness !== "FRESH") {
          setMessage("Review invalidated: canonical oracle or execution state is not fresh.");
          return;
        }
        setReviewPretrade(latest);
        setReviewOpen(true);
        setMessage(null);
      })
      .catch(() => setMessage("The canonical pretrade surface could not be refreshed."));
  };
  return (
    <aside className="trading-rail">
      <div className="rail-head">
        <div>
          <span className="eyebrow">EXECUTION GATE</span>
          <h2>Trade {market.identity.symbol ?? "market"}</h2>
        </div>
        <AvailabilityPill value={market.tradability?.status ?? "UNAVAILABLE"} />
      </div>
      <div className="segmented">
        <button className={side === "LONG" ? "selected long" : ""} onClick={() => setSide("LONG")}>
          Long
        </button>
        <button
          className={side === "SHORT" ? "selected short" : ""}
          onClick={() => setSide("SHORT")}
        >
          Short
        </button>
      </div>
      <label className="field">
        <span>
          Collateral <small>USDC</small>
        </span>
        <input
          inputMode="decimal"
          value={collateral}
          onChange={(event) => setCollateral(event.target.value)}
        />
        <em>Available after connect</em>
      </label>
      <label className="field">
        <span>
          Leverage <small>max {maxLeverage ? `${maxLeverage}x` : "UNAVAILABLE"}</small>
        </span>
        <input
          type="range"
          min="1"
          max={maxLeverage ?? 2}
          step="0.5"
          value={leverage}
          onChange={(event) => setLeverage(event.target.value)}
        />
        <strong className="range-value">{leverage}x</strong>
      </label>
      <div className="rail-facts">
        <div>
          <span>Entry reference</span>
          <strong>
            {market.marketData?.priceUsdWad && oracleFreshness === "FRESH"
              ? `$${(Number(BigInt(market.marketData.priceUsdWad) / 1_000_000_000_000_000n) / 1000).toFixed(4)}`
              : "UNAVAILABLE"}
          </strong>
        </div>
        <div>
          <span>Oracle</span>
          <strong>{oracleFreshness}</strong>
        </div>
        <div>
          <span>Fees</span>
          <strong>UNAVAILABLE</strong>
        </div>
        <div>
          <span>Liquidation estimate</span>
          <strong>Review required</strong>
        </div>
      </div>
      {oracleFreshness !== "FRESH" && (
        <div className="oracle-warning">
          <AvailabilityPill value={oracleFreshness} label="ORACLE STALE" />
          <span>Risk-increasing review is disabled until the canonical observation refreshes.</span>
        </div>
      )}
      {!walletAddress && (
        <div className="wallet-callout">
          <span>◉</span>
          <div>
            <strong>Connect to sign</strong>
            <p>
              Review is available read-only. Your wallet signs; the backend never impersonates it.
            </p>
          </div>
        </div>
      )}
      <button
        className="button button-primary button-wide"
        onClick={() => void review()}
        disabled={
          pretrade?.status !== "AVAILABLE" || Boolean(validation) || oracleFreshness !== "FRESH"
        }
      >{`Review ${side === "LONG" ? "Long" : "Short"}`}</button>
      {validation && <p className="inline-error">{validation}</p>}
      {message && <p className="inline-error">{message}</p>}
      <p className="rail-footnote">
        Plan binds account, market, side, oracle sequence, nonce and expiry before signature.
      </p>
      {reviewOpen && (
        <div className="review-overlay" role="dialog" aria-modal="true">
          <div className="review-sheet">
            <div className="sheet-head">
              <div>
                <span className="eyebrow">STEP 2 OF 3 · REVIEW</span>
                <h2>Immutable pretrade intent</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setReviewOpen(false);
                  setReviewPretrade(null);
                }}
                aria-label="Close review"
              >
                ×
              </button>
            </div>
            <div className="review-status">
              <AvailabilityPill value="AVAILABLE" label="CANONICAL FACTS" />
              <span>fresh oracle · user wallet signs</span>
            </div>
            <div className="review-grid">
              <div>
                <span>Account</span>
                <strong>{walletAddress ?? "CONNECT WALLET"}</strong>
              </div>
              <div>
                <span>Market</span>
                <strong>{market.identity.symbol ?? market.identity.marketId}</strong>
              </div>
              <div>
                <span>Action</span>
                <strong>{side}</strong>
              </div>
              <div>
                <span>Collateral</span>
                <strong>{collateral} USDC</strong>
              </div>
              <div>
                <span>Leverage</span>
                <strong>{leverage}x</strong>
              </div>
              <div>
                <span>Oracle freshness</span>
                <strong>{reviewPretrade?.oracle?.freshness ?? "UNAVAILABLE"}</strong>
              </div>
              <div>
                <span>Fees</span>
                <strong>UNAVAILABLE</strong>
              </div>
              <div>
                <span>Expiry</span>
                <strong>{reviewPretrade?.expiry?.minimumSeconds ?? "—"}s minimum</strong>
              </div>
            </div>
            <div className="review-warning">
              <strong>Signature boundary</strong>
              <p>
                This local API is read-only. No transaction is submitted from this screen. A future
                wallet adapter must revalidate chain, account, plan hash and expiry immediately
                before signing.
              </p>
            </div>
            <button
              className="button button-secondary button-wide"
              onClick={() => {
                setReviewOpen(false);
                setReviewPretrade(null);
              }}
            >
              Close review
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
