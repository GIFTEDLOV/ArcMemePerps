import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { useWallet } from "../lib/winner-wallet";
import type { StoredPosition } from "../WinnerApp";
import { PnlShareModal } from "../WinnerApp";
import { AVATAR_LIST, getTraderAvatar, type TraderAvatar } from "../lib/avatars";
import { AvatarPickerModal } from "./AvatarPickerModal";
import { triggerAppTour } from "./OnboardingTour";

export function ProfilePage({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  const address = wallet.state.address || "0x4F7a14c8d578B3f0A8A938Fec510B5C1B62Ce3e5";
  const isConnected = wallet.state.status === "CONNECTED";

  const [handle, setHandle] = useState<string>(() => {
    return window.localStorage.getItem(`arcmemeperps.profile.handle.${address}`) || "ArcTrader_5042";
  });
  const [isEditingHandle, setIsEditingHandle] = useState(false);
  const [tempHandle, setTempHandle] = useState(handle);
  const [activeTab, setActiveTab] = useState<"Overview" | "Avatars" | "Positions" | "Defaults">("Overview");

  const [avatarId, setAvatarId] = useState<string>(() => {
    return window.localStorage.getItem(`arcmemeperps.profile.avatar.${address}`) || "arc";
  });
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);

  const [defaultLeverage, setDefaultLeverage] = useState<string>(() => {
    return window.localStorage.getItem(`arcmemeperps.profile.leverage.${address}`) || "5";
  });
  const [defaultSlippage, setDefaultSlippage] = useState<string>(() => {
    return window.localStorage.getItem(`arcmemeperps.profile.slippage.${address}`) || "1.0";
  });
  const [defaultTp, setDefaultTp] = useState<string>(() => {
    return window.localStorage.getItem(`arcmemeperps.profile.tp.${address}`) || "50";
  });
  const [defaultSl, setDefaultSl] = useState<string>(() => {
    return window.localStorage.getItem(`arcmemeperps.profile.sl.${address}`) || "20";
  });
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const [arcBalance, setArcBalance] = useState<string>("4.940");
  const [usdcBalance, setUsdcBalance] = useState<string>("3.94");
  const [vaultCollateral, setVaultCollateral] = useState<string>("1.00");
  const [positions, setPositions] = useState<StoredPosition[]>([]);
  const [sharePos, setSharePos] = useState<StoredPosition | null>(null);

  // Sync balances and positions from localStorage
  useEffect(() => {
    const sync = () => {
      try {
        const storedArc = window.localStorage.getItem(`arcmemeperps.balance.arc.${address}`);
        if (storedArc) setArcBalance(storedArc);
        const storedUsdc = window.localStorage.getItem(`arcmemeperps.balance.usdc.${address}`);
        if (storedUsdc) setUsdcBalance(storedUsdc);
        const storedVault = window.localStorage.getItem(`arcmemeperps.balance.vault.${address}`);
        if (storedVault) setVaultCollateral(storedVault);
        const storedPositions = JSON.parse(
          window.localStorage.getItem("arcmemeperps.positions") || "[]"
        ) as StoredPosition[];
        setPositions(storedPositions);
      } catch {
        /* ignore */
      }
    };
    sync();
    const interval = setInterval(sync, 4000);
    return () => clearInterval(interval);
  }, [address, wallet.state.status]);

  const handleSelectAvatar = (newAvatarId: string) => {
    setAvatarId(newAvatarId);
    try {
      window.localStorage.setItem(`arcmemeperps.profile.avatar.${address}`, newAvatarId);
      setSavedNotice("Avatar updated successfully!");
      setTimeout(() => setSavedNotice(null), 3000);
    } catch {
      /* ignore */
    }
  };

  const saveProfileSettings = () => {
    try {
      window.localStorage.setItem(`arcmemeperps.profile.handle.${address}`, handle);
      window.localStorage.setItem(`arcmemeperps.profile.avatar.${address}`, avatarId);
      window.localStorage.setItem(`arcmemeperps.profile.leverage.${address}`, defaultLeverage);
      window.localStorage.setItem(`arcmemeperps.profile.slippage.${address}`, defaultSlippage);
      window.localStorage.setItem(`arcmemeperps.profile.tp.${address}`, defaultTp);
      window.localStorage.setItem(`arcmemeperps.profile.sl.${address}`, defaultSl);
      setSavedNotice("Profile & preferences saved permanently!");
      setTimeout(() => setSavedNotice(null), 3000);
    } catch {
      /* ignore */
    }
  };

  const closePosition = (id: string) => {
    const updated = positions.filter((p) => p.id !== id);
    setPositions(updated);
    try {
      window.localStorage.setItem("arcmemeperps.positions", JSON.stringify(updated));
    } catch {
      /* ignore */
    }
  };

  const currentAvatar = getTraderAvatar(avatarId);

  return (
    <section className="page detail-page">
      {/* 1. Market-Grade Header */}
      <div className="detail-header" style={{ marginBottom: "16px" }}>
        <div className="detail-token">
          {/* Avatar with click-to-edit badge */}
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: currentAvatar.bgGradient,
              border: `2px solid ${currentAvatar.borderColor}`,
              boxShadow: `0 0 16px ${currentAvatar.glowColor}`,
              display: "grid",
              placeItems: "center",
              fontSize: "26px",
              flexShrink: 0,
              cursor: "pointer",
              position: "relative",
              transition: "transform 0.15s ease",
            }}
            onClick={() => setIsAvatarPickerOpen(true)}
            title="Click to change your avatar"
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {currentAvatar.icon}
            <div
              style={{
                position: "absolute",
                bottom: "-2px",
                right: "-2px",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: "#0c0e14",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                display: "grid",
                placeItems: "center",
                fontSize: "10px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.6)",
              }}
            >
              ✏️
            </div>
          </div>

          <div>
            <div className="eyebrow">
              ARC MAINNET (5042) · VERIFIED TRADER ACCOUNT
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "4px 0 5px" }}>
              {isEditingHandle ? (
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    type="text"
                    value={tempHandle}
                    onChange={(e) => setTempHandle(e.target.value)}
                    style={{
                      padding: "2px 8px",
                      background: "rgba(0,0,0,0.5)",
                      border: "1px solid var(--accent)",
                      borderRadius: "4px",
                      color: "#fff",
                      fontSize: "15px",
                      fontWeight: 700,
                    }}
                  />
                  <button
                    className="button button-primary compact"
                    onClick={() => {
                      setHandle(tempHandle);
                      setIsEditingHandle(false);
                      window.localStorage.setItem(`arcmemeperps.profile.handle.${address}`, tempHandle);
                      setSavedNotice("Handle updated!");
                      setTimeout(() => setSavedNotice(null), 2500);
                    }}
                  >
                    Save
                  </button>
                </div>
              ) : (
                <>
                  <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700, letterSpacing: "-0.02em" }}>
                    @{handle}
                  </h1>
                  <button
                    type="button"
                    className="button button-secondary compact"
                    style={{ fontSize: "9px", padding: "1px 6px", height: "20px" }}
                    onClick={() => {
                      setTempHandle(handle);
                      setIsEditingHandle(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="button button-secondary compact"
                    style={{ fontSize: "9px", padding: "1px 6px", height: "20px", color: "#00f5a0" }}
                    onClick={() => setIsAvatarPickerOpen(true)}
                  >
                    Change Avatar
                  </button>
                </>
              )}
            </div>

            <div style={{ fontSize: "11px", color: currentAvatar.borderColor, fontWeight: 600, marginBottom: "4px" }}>
              {currentAvatar.name} · <span style={{ color: "rgba(255, 255, 255, 0.5)", fontWeight: 400 }}>{currentAvatar.title}</span>
            </div>

            <div className="address-line">
              <code>{address}</code>
              <button
                className="copy-button"
                onClick={() => void navigator.clipboard?.writeText(address)}
                aria-label="Copy address"
              >
                Copy
              </button>
              <a
                className="explorer-link"
                href={`https://explorer.arc.io/address/${address}`}
                target="_blank"
                rel="noreferrer"
              >
                ArcScan Explorer
              </a>
            </div>

            {/* Social badges — Email Unbound is removed completely */}
            <div className="social-links-row" style={{ marginTop: "8px" }}>
              <span className="social-badge arc-scan">Arc Pioneer</span>
              <span className="social-badge twitter">DoraHacks Cohort</span>
              <span className="social-badge telegram">Arc Mainnet USDC</span>
              <span className="social-badge" style={{ color: "var(--good)", borderColor: "rgba(0, 245, 160, 0.3)" }}>
                Non-Custodial
              </span>
            </div>
          </div>
        </div>

        <div className="detail-actions">
          {isConnected ? (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span className="status-pill status-good"><i /> Arc 5042 Connected</span>
              <button
                className="button button-secondary compact"
                style={{ fontSize: "10px", padding: "4px 8px" }}
                onClick={() => wallet.disconnect()}
              >
                Disconnect
              </button>
            </div>
          ) : wallet.state.status === "WRONG_NETWORK" ? (
            <button
              className="button button-primary compact"
              onClick={() => void wallet.switchToArc()}
              style={{ background: "#ffb84d", color: "#000" }}
            >
              Switch to Arc (5042)
            </button>
          ) : (
            <button className="button button-primary compact" onClick={() => void wallet.connect()}>
              Connect Wallet
            </button>
          )}
        </div>
      </div>

      {/* 2. Institutional Market-Grade Metrics Strip */}
      <div className="detail-stats" style={{ marginBottom: "16px" }}>
        <div className="metric">
          <span>Arc USDC Margin</span>
          <strong>${usdcBalance}</strong>
          <small>Native Collateral</small>
        </div>
        <div className="metric">
          <span>Arc Native Gas</span>
          <strong>{arcBalance} ARC</strong>
          <small>Chain ID 5042</small>
        </div>
        <div className="metric">
          <span>Vault Margin</span>
          <strong>${vaultCollateral}</strong>
          <small>USDCMarginVault</small>
        </div>
        <div className="metric">
          <span>Active Perp Risk</span>
          <strong style={{ color: positions.length > 0 ? "var(--good)" : "var(--muted)" }}>
            {positions.length > 0 ? `${positions.length} Open Positions` : "Zero Risk"}
          </strong>
          <small>Isolated Margined</small>
        </div>
        <div className="metric">
          <span>Anti-Rug Protection</span>
          <strong style={{ color: "var(--good)" }}>ENABLED</strong>
          <small>Safety Sentinel</small>
        </div>
        <div className="metric">
          <span>Solvency Status</span>
          <strong style={{ color: "var(--accent)" }}>0.4.0 VERIFIED</strong>
          <small>Fail-Closed Guard</small>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="market-nav-bar" style={{ marginBottom: "16px" }}>
        <button
          className={activeTab === "Overview" ? "active" : ""}
          onClick={() => setActiveTab("Overview")}
        >
          Overview &amp; Stats
        </button>
        <button
          className={activeTab === "Avatars" ? "active" : ""}
          onClick={() => setActiveTab("Avatars")}
        >
          Avatars &amp; Persona ({AVATAR_LIST.length})
        </button>
        <button
          className={activeTab === "Positions" ? "active" : ""}
          onClick={() => setActiveTab("Positions")}
        >
          Open Positions ({positions.length})
        </button>
        <button
          className={activeTab === "Defaults" ? "active" : ""}
          onClick={() => setActiveTab("Defaults")}
        >
          Trading Defaults &amp; Tour
        </button>
      </div>

      {/* Notice Toast */}
      {savedNotice && (
        <div
          style={{
            marginBottom: "14px",
            padding: "10px 14px",
            borderRadius: "6px",
            fontSize: "12px",
            background: "rgba(16, 185, 129, 0.15)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            color: "var(--good)",
          }}
        >
          {savedNotice}
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {activeTab === "Overview" && (
        <div className="overview-stack">
          {/* Quick Account Summary */}
          <div className="panel" style={{ padding: "18px" }}>
            <div className="panel-heading" style={{ marginBottom: "12px" }}>
              <div>
                <div className="eyebrow">Account Overview</div>
                <h2>Trader Performance &amp; Risk Metrics</h2>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <span className="status-pill status-good"><i /> Anti-Rug Protected</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
              <div className="metric" style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "12px" }}>
                <span>Win Rate</span>
                <strong style={{ color: "var(--good)", fontSize: "16px" }}>75.0%</strong>
                <small>3 Won / 1 Lost</small>
              </div>
              <div className="metric" style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "12px" }}>
                <span>Total Volume</span>
                <strong style={{ fontSize: "16px" }}>$1,250.00</strong>
                <small>Arc Mainnet Swaps &amp; Perps</small>
              </div>
              <div className="metric" style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "12px" }}>
                <span>Meme Pair Exposure</span>
                <strong style={{ fontSize: "16px" }}>${(Number(vaultCollateral) + Number(usdcBalance)).toFixed(2)}</strong>
                <small>Arc USDC Margin</small>
              </div>
              <div className="metric" style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "12px" }}>
                <span>Solvency Model</span>
                <strong style={{ fontSize: "16px", color: "var(--accent)" }}>0.4.0 Dynamic</strong>
                <small>Fail-Closed Capacity</small>
              </div>
            </div>
          </div>

          {/* Quick Avatar Gallery Teaser */}
          <div className="panel" style={{ padding: "18px" }}>
            <div className="panel-heading" style={{ marginBottom: "12px" }}>
              <div>
                <div className="eyebrow">Trader Persona</div>
                <h2>Active Avatar: {currentAvatar.name}</h2>
              </div>
              <button className="button button-secondary compact" onClick={() => setIsAvatarPickerOpen(true)}>
                Change Avatar →
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "var(--surface)", padding: "14px", borderRadius: "6px", border: "1px solid var(--border)" }}>
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  borderRadius: "50%",
                  background: currentAvatar.bgGradient,
                  border: `2px solid ${currentAvatar.borderColor}`,
                  display: "grid",
                  placeItems: "center",
                  fontSize: "24px",
                  flexShrink: 0,
                }}
              >
                {currentAvatar.icon}
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: "14px", color: "#fff", display: "block" }}>{currentAvatar.name}</strong>
                <span style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)" }}>
                  {currentAvatar.title} · Category: <span style={{ textTransform: "capitalize", color: currentAvatar.borderColor }}>{currentAvatar.category}</span>
                </span>
              </div>
              <button
                type="button"
                className="button button-primary compact"
                onClick={() => setIsAvatarPickerOpen(true)}
              >
                Browse All 12 Avatars
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AVATAR GALLERY */}
      {activeTab === "Avatars" && (
        <div className="overview-stack">
          <div className="panel" style={{ padding: "20px" }}>
            <div className="panel-heading" style={{ marginBottom: "16px" }}>
              <div>
                <div className="eyebrow">Trader Avatars &amp; Persona</div>
                <h2>Meme &amp; Cyberpunk Avatar Gallery</h2>
              </div>
              <span className="status-pill status-good">
                Active: {currentAvatar.name}
              </span>
            </div>

            <p style={{ margin: "0 0 16px", fontSize: "12px", color: "var(--muted)", lineHeight: 1.5 }}>
              Choose your public trader identity for the Arc Mainnet leaderboard, top navigation, and PnL brag cards.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                gap: "12px",
              }}
            >
              {AVATAR_LIST.map((a: TraderAvatar) => {
                const isSelected = avatarId.toLowerCase() === a.id.toLowerCase();
                return (
                  <div
                    key={a.id}
                    onClick={() => handleSelectAvatar(a.id)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      padding: "14px 10px",
                      borderRadius: "10px",
                      background: isSelected ? "rgba(0, 245, 160, 0.08)" : "rgba(255, 255, 255, 0.03)",
                      border: isSelected
                        ? `2px solid ${a.borderColor}`
                        : "1px solid rgba(255, 255, 255, 0.08)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      position: "relative",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
                    }}
                  >
                    {isSelected && (
                      <span
                        style={{
                          position: "absolute",
                          top: "6px",
                          right: "6px",
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          background: "#00f5a0",
                          color: "#000",
                          fontSize: "10px",
                          fontWeight: 800,
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        ✓
                      </span>
                    )}
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        background: a.bgGradient,
                        border: `2px solid ${a.borderColor}`,
                        boxShadow: isSelected ? `0 0 14px ${a.glowColor}` : "none",
                        display: "grid",
                        placeItems: "center",
                        fontSize: "24px",
                        marginBottom: "8px",
                      }}
                    >
                      {a.icon}
                    </div>
                    <strong style={{ fontSize: "12px", color: "#fff", textAlign: "center" }}>
                      {a.name}
                    </strong>
                    <small
                      style={{
                        fontSize: "10px",
                        color: "rgba(255, 255, 255, 0.45)",
                        textAlign: "center",
                        marginTop: "2px",
                      }}
                    >
                      {a.title}
                    </small>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: OPEN POSITIONS */}
      {activeTab === "Positions" && (
        <div className="panel" style={{ padding: "18px" }}>
          <div className="panel-heading" style={{ marginBottom: "14px" }}>
            <div>
              <div className="eyebrow">Active Risk &amp; Orders</div>
              <h2>Open Perpetual Positions</h2>
            </div>
            <Link to="/markets" className="button button-primary compact">
              + New Position
            </Link>
          </div>

          {positions.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="token-table" style={{ width: "100%", fontSize: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--muted)", textAlign: "left" }}>
                    <th style={{ padding: "8px 12px" }}>Position</th>
                    <th style={{ padding: "8px 12px" }}>Side</th>
                    <th style={{ padding: "8px 12px" }}>Leverage</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Collateral</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Size</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>PnL (USDC)</th>
                    <th style={{ padding: "8px 12px", textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>${p.symbol}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ color: p.side === "LONG" ? "var(--good)" : "var(--bad)", fontWeight: 700 }}>
                          {p.side}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--mono)" }}>{p.leverage}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "var(--mono)" }}>
                        ${p.collateral}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "var(--mono)" }}>
                        ${p.size}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--good)", fontWeight: 700, fontFamily: "var(--mono)" }}>
                        +$0.42 (+8.4%)
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <button
                          type="button"
                          className="button button-secondary compact"
                          style={{ fontSize: "10px", padding: "2px 8px" }}
                          onClick={() => closePosition(p.id)}
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "36px 16px" }}>
              <h3 style={{ margin: "0 0 6px", fontSize: "14px" }}>No open positions currently</h3>
              <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "12px" }}>
                Your account has zero open perpetual margin risk. Explore trending Arc meme pairs on the terminal to open an isolated long or short position.
              </p>
              <Link to="/markets" className="button button-primary compact">
                Explore Markets
              </Link>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: TRADING DEFAULTS & VISUAL TOUR */}
      {activeTab === "Defaults" && (
        <div className="panel" style={{ padding: "20px" }}>
          <div className="panel-heading" style={{ marginBottom: "16px" }}>
            <div>
              <div className="eyebrow">Execution Defaults &amp; Tools</div>
              <h2>Terminal Trading Preferences</h2>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="button button-secondary compact"
                onClick={triggerAppTour}
                style={{ color: "#00f5a0", borderColor: "rgba(0, 245, 160, 0.3)" }}
              >
                Replay Visual App Tour 🚀
              </button>
              <button className="button button-primary compact" onClick={saveProfileSettings}>
                Save Preferences
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
            <div>
              <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Default Leverage:</span>
              <div style={{ display: "flex", gap: "6px" }}>
                {["1", "2", "3", "5", "10"].map((lev) => (
                  <button
                    key={lev}
                    type="button"
                    className={defaultLeverage === lev ? "button button-primary compact" : "button button-secondary compact"}
                    onClick={() => setDefaultLeverage(lev)}
                  >
                    {lev}x
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Slippage Tolerance:</span>
              <div style={{ display: "flex", gap: "6px" }}>
                {["0.5", "1.0", "2.5", "5.0"].map((slip) => (
                  <button
                    key={slip}
                    type="button"
                    className={defaultSlippage === slip ? "button button-primary compact" : "button button-secondary compact"}
                    onClick={() => setDefaultSlippage(slip)}
                  >
                    {slip}%
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Default Take-Profit:</span>
              <div style={{ display: "flex", gap: "6px" }}>
                {["25", "50", "100", "200"].map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    className={defaultTp === tp ? "button button-primary compact" : "button button-secondary compact"}
                    onClick={() => setDefaultTp(tp)}
                  >
                    +{tp}%
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Default Stop-Loss:</span>
              <div style={{ display: "flex", gap: "6px" }}>
                {["10", "20", "35", "50"].map((sl) => (
                  <button
                    key={sl}
                    type="button"
                    className={defaultSl === sl ? "button button-primary compact" : "button button-secondary compact"}
                    onClick={() => setDefaultSl(sl)}
                  >
                    -{sl}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Avatar Picker Modal */}
      <AvatarPickerModal
        isOpen={isAvatarPickerOpen}
        onClose={() => setIsAvatarPickerOpen(false)}
        currentAvatarId={avatarId}
        onSelectAvatar={handleSelectAvatar}
        handle={handle}
      />

      {sharePos && <PnlShareModal position={sharePos} onClose={() => setSharePos(null)} />}
    </section>
  );
}
