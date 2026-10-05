import type { Market } from "../lib/types";
import { effectiveFreshness, pctBps, freshness, wad } from "../lib/format";
import { AvailabilityPill, RiskRow, SectionHeader } from "./ui";

export function RiskPassport({
  market,
  resources,
}: {
  market: Market;
  resources: Record<string, any>;
}) {
  const holders = market.holderEvidence ?? {};
  const security = market.securityEvidence ?? {};
  const deployer = market.deployerProfile ?? {};
  const depth = resources.depth ?? market.marketDepth ?? {};
  return (
    <section className="passport-section">
      <SectionHeader
        eyebrow="RISK PASSPORT"
        title="Why this market is eligible"
        action={<AvailabilityPill value={market.riskResult?.integrityStatus} />}
      />
      <div className="passport-grid">
        <div className="passport-card">
          <div className="passport-card-head">
            <span>Qualification & capacity</span>
            <AvailabilityPill value={market.derivativesEvidence?.status} />
          </div>
          <RiskRow
            label="Qualification"
            value={market.qualification?.eligible ? "APPROVED" : "UNAVAILABLE"}
            source="QualificationRegistry"
            status={market.qualification?.eligible ? "QUALIFIED" : "UNAVAILABLE"}
            observedAt={market.observedAt}
          />
          <RiskRow
            label="Max leverage"
            value={
              market.derivativesEvidence?.maxLeverageWad
                ? `${Number(BigInt(market.derivativesEvidence.maxLeverageWad) / 1_000_000_000_000_000n) / 1000}x`
                : "UNAVAILABLE"
            }
            source="RiskConfig"
          />
          <RiskRow
            label="Max position"
            value={
              market.derivativesEvidence?.maxPositionWad
                ? wad(market.derivativesEvidence.maxPositionWad)
                : "UNAVAILABLE"
            }
            source="RiskConfig"
          />
          <RiskRow
            label="Manipulation resistance"
            value={market.derivativesEvidence?.manipulationResistance ?? "UNAVAILABLE"}
            source="canonical risk engine"
          />
        </div>
        <div className="passport-card">
          <div className="passport-card-head">
            <span>Oracle & freshness</span>
            <AvailabilityPill
              value={effectiveFreshness(
                market.oracleEvidence?.freshness,
                market.freshness?.observedAt ?? market.observedAt,
                market.freshness?.maxAgeSeconds,
              )}
            />
          </div>
          <RiskRow
            label="Sources"
            value={
              market.oracleEvidence?.priceSourceCount
                ? `${market.oracleEvidence.priceSourceCount} source families`
                : "UNAVAILABLE"
            }
            source="OracleRouter"
          />
          <RiskRow
            label="Independent sources"
            value={market.oracleEvidence?.independentSourceCount?.toString() ?? "UNAVAILABLE"}
            source="OracleRouter"
          />
          <RiskRow
            label="Confidence"
            value={pctBps(market.oracleEvidence?.confidenceBps)}
            source="OracleRouter"
          />
          <RiskRow
            label="Last observed"
            value={freshness(market.freshness?.observedAt ?? market.observedAt)}
            source="Arc RPC"
            status={effectiveFreshness(
              market.freshness?.status,
              market.freshness?.observedAt ?? market.observedAt,
              market.freshness?.maxAgeSeconds,
            )}
          />
        </div>
        <div className="passport-card">
          <div className="passport-card-head">
            <span>Security surface</span>
            <span className="micro-note">provenance attached</span>
          </div>
          <RiskRow
            label="LP security"
            value={security.lpSecurity ?? "UNAVAILABLE"}
            source="PublicLPVault"
            status={security.lpSecurity === "PROTOCOL_CONTROLLED" ? "AVAILABLE" : "UNAVAILABLE"}
          />
          <RiskRow
            label="Mint authority"
            value={
              security.mintAuthorityActive === null
                ? "UNAVAILABLE"
                : security.mintAuthorityActive
                  ? "ACTIVE"
                  : "INACTIVE"
            }
            source="origin provider"
            status={security.mintAuthorityActive === null ? "UNAVAILABLE" : "AVAILABLE"}
          />
          <RiskRow
            label="Freeze authority"
            value={
              security.freezeAuthorityActive === null
                ? "UNAVAILABLE"
                : security.freezeAuthorityActive
                  ? "ACTIVE"
                  : "INACTIVE"
            }
            source="origin provider"
            status={security.freezeAuthorityActive === null ? "UNAVAILABLE" : "AVAILABLE"}
          />
          <RiskRow
            label="Deployer history"
            value={deployer.reasonCodes?.[0] ?? "UNAVAILABLE"}
            source="origin provider"
            status="UNAVAILABLE"
          />
        </div>
        <div className="passport-card">
          <div className="passport-card-head">
            <span>Holders & depth</span>
            <span className="micro-note">unknown ≠ zero</span>
          </div>
          <RiskRow
            label="Largest holder"
            value={pctBps(holders.largestHolderBps)}
            source="holder provider"
            status={holders.largestHolderBps == null ? "UNAVAILABLE" : "AVAILABLE"}
          />
          <RiskRow
            label="Connected cluster"
            value={pctBps(holders.largestConnectedClusterBps)}
            source="graph provider"
            status={holders.largestConnectedClusterBps == null ? "UNAVAILABLE" : "AVAILABLE"}
          />
          <RiskRow
            label="Buy depth ±2%"
            value={depth.buyDepth2PctUsdWad ? wad(depth.buyDepth2PctUsdWad) : "UNAVAILABLE"}
            source="orderbook provider"
            status={depth.status}
          />
          <RiskRow
            label="Sell depth ±2%"
            value={depth.sellDepth2PctUsdWad ? wad(depth.sellDepth2PctUsdWad) : "UNAVAILABLE"}
            source="orderbook provider"
            status={depth.status}
          />
        </div>
      </div>
    </section>
  );
}
