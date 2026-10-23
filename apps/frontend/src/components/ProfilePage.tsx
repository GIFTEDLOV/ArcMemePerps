import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { useWallet } from "../lib/winner-wallet";
import type { StoredPosition } from "../WinnerApp";
import { PnlShareModal } from "../WinnerApp";
import { AVATAR_LIST, getTraderAvatar, type TraderAvatar } from "../lib/avatars";
import { AvatarPickerModal } from "./AvatarPickerModal";
import { triggerAppTour } from "./OnboardingTour";

export function ProfilePage({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  const address = wallet.state.address || "0x3c2e579c8264a14410a862b2f7e3e3e4aa84f31c";
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
  const [isCopied, setIsCopied] = useState(false);

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

  const handleCopyAddress = () => {
    void navigator.clipboard?.writeText(address);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

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
    <section className="profile-page-wrapper">
      {/* 1. Sleek Institutional Profile Hero Card */}
      <div className="profile-hero-card">
        <div className="profile-hero-top">
          {/* Identity info with avatar */}
          <div className="profile-hero-identity">
            <div
              className="profile-avatar-box"
              style={{
                background: currentAvatar.bgGradient,
                border: `2px solid ${currentAvatar.borderColor}`,
                boxShadow: `0 0 20px ${currentAvatar.glowColor}`,
              }}
              onClick={() => setIsAvatarPickerOpen(true)}
              title="Click to change your avatar"
            >
              {currentAvatar.icon}
              <div className="profile-avatar-edit-badge" title="Edit avatar">
                ✏️
              </div>
            </div>

            <div className="profile-identity-details">
              <div className="profile-eyebrow-chip">
                <span>🛡️</span> ARC MAINNET (5042) · VERIFIED TRADER ACCOUNT
              </div>

              <div className="profile-handle-line">
                {isEditingHandle ? (
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <input
                      type="text"
                      value={tempHandle}
                      onChange={(e) => setTempHandle(e.target.value)}
                      style={{
                        padding: "3px 10px",
                        background: "rgba(0,0,0,0.6)",
                        border: "1px solid var(--accent)",
                        borderRadius: "6px",
                        color: "#fff",
                        fontSize: "16px",
                        fontWeight: 700,
                        outline: "none",
                      }}
                      autoFocus
                    />
                    <button
                      className="profile-mini-btn accent"
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
                    <button
                      className="profile-mini-btn"
                      onClick={() => setIsEditingHandle(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <h1 className="profile-handle-title">@{handle}</h1>
                    <button
                      type="button"
                      className="profile-mini-btn"
                      onClick={() => {
                        setTempHandle(handle);
                        setIsEditingHandle(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="profile-mini-btn accent"
                      onClick={() => setIsAvatarPickerOpen(true)}
                    >
                      Change Avatar
                    </button>
                  </>
                )}
              </div>

              <div className="profile-role-line">
                <span style={{ color: currentAvatar.borderColor, fontWeight: 700 }}>
                  {currentAvatar.name}
                </span>
                <span>·</span>
                <span style={{ color: "rgba(255, 255, 255, 0.6)" }}>{currentAvatar.title}</span>
              </div>

              <div className="profile-address-bar">
                <code className="profile-address-chip">{address}</code>
                <button
                  type="button"
                  className={`profile-copy-btn ${isCopied ? "copied" : ""}`}
                  onClick={handleCopyAddress}
                  aria-label="Copy address"
                >
                  {isCopied ? "✓ Copied" : "Copy"}
                </button>
                <a
                  className="profile-explorer-link"
                  href={`https://explorer.arc.io/address/${address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  ArcScan Explorer ↗
                </a>
              </div>

              <div className="profile-social-badges">
                <span className="profile-badge-tag highlight">Arc Pioneer</span>
                <span className="profile-badge-tag">DoraHacks Cohort</span>
                <span className="profile-badge-tag">Arc Mainnet USDC</span>
                <span className="profile-badge-tag highlight">Non-Custodial</span>
              </div>
            </div>
          </div>

          {/* Action buttons on the right */}
          <div className="profile-hero-actions">
            {isConnected ? (
              <>
                <span className="profile-conn-pill">
                  <i /> ARC 5042 CONNECTED
                </span>
                <button
                  type="button"
                  className="profile-mini-btn"
                  style={{ padding: "6px 12px", fontSize: "11px", color: "var(--bad)", borderColor: "rgba(255, 59, 48, 0.25)" }}
                  onClick={() => wallet.disconnect()}
                >
                  Disconnect
                </button>
              </>
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

            <button
              type="button"
              className="profile-mini-btn accent"
              onClick={triggerAppTour}
              style={{ padding: "6px 12px", fontSize: "11px" }}
              title="Interactive tour showing all app features"
            >
              🚀 App Tour
            </button>
          </div>
        </div>
      </div>

      {/* 2. Structured Institutional Metrics Strip */}
      <div className="profile-metrics-strip">
        <div className="profile-stat-box">
          <span className="profile-stat-label">Arc USDC Margin</span>
          <strong className="profile-stat-val">${usdcBalance}</strong>
          <small className="profile-stat-sub">Native Collateral</small>
        </div>

        <div className="profile-stat-box">
          <span className="profile-stat-label">Arc Native Gas</span>
          <strong className="profile-stat-val">{arcBalance} ARC</strong>
          <small className="profile-stat-sub">Chain ID 5042</small>
        </div>

        <div className="profile-stat-box">
          <span className="profile-stat-label">Vault Margin</span>
          <strong className="profile-stat-val">${vaultCollateral}</strong>
          <small className="profile-stat-sub">USDCMarginVault</small>
        </div>

        <div className="profile-stat-box">
          <span className="profile-stat-label">Active Perp Risk</span>
          <strong
            className="profile-stat-val"
            style={{ color: positions.length > 0 ? "var(--good)" : "var(--muted)" }}
          >
            {positions.length > 0 ? `${positions.length} Open Position${positions.length > 1 ? "s" : ""}` : "Zero Risk"}
          </strong>
          <small className="profile-stat-sub">Isolated Margined</small>
        </div>

        <div className="profile-stat-box">
          <span className="profile-stat-label">Anti-Rug Protection</span>
          <strong className="profile-stat-val" style={{ color: "var(--good)" }}>
            ENABLED
          </strong>
          <small className="profile-stat-sub">Safety Sentinel</small>
        </div>

        <div className="profile-stat-box">
          <span className="profile-stat-label">Solvency Status</span>
          <strong className="profile-stat-val" style={{ color: "var(--accent)" }}>
            0.4.0 VERIFIED
          </strong>
          <small className="profile-stat-sub">Fail-Closed Guard</small>
        </div>
      </div>

      {/* 3. Sleek Navigation Tabs */}
      <div className="profile-nav-tabs">
        <button
          type="button"
          className={`profile-tab-btn ${activeTab === "Overview" ? "active" : ""}`}
          onClick={() => setActiveTab("Overview")}
        >
          Overview &amp; Stats
        </button>
        <button
          type="button"
          className={`profile-tab-btn ${activeTab === "Avatars" ? "active" : ""}`}
          onClick={() => setActiveTab("Avatars")}
        >
          Avatars &amp; Persona ({AVATAR_LIST.length})
        </button>
        <button
          type="button"
          className={`profile-tab-btn ${activeTab === "Positions" ? "active" : ""}`}
          onClick={() => setActiveTab("Positions")}
        >
          Open Positions ({positions.length})
        </button>
        <button
          type="button"
          className={`profile-tab-btn ${activeTab === "Defaults" ? "active" : ""}`}
          onClick={() => setActiveTab("Defaults")}
        >
          Trading Defaults &amp; Tour
        </button>
      </div>

      {/* Notification Toast */}
      {savedNotice && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: 600,
            background: "rgba(0, 245, 160, 0.12)",
            border: "1px solid rgba(0, 245, 160, 0.3)",
            color: "var(--good)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>✓</span> {savedNotice}
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {activeTab === "Overview" && (
        <div style={{ display: "grid", gap: "16px" }}>
          {/* Quick Account Summary */}
          <div className="profile-content-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <div className="profile-eyebrow-chip">Account Overview</div>
                <h2 style={{ margin: "4px 0 0", fontSize: "16px", fontWeight: 700, color: "#fff" }}>
                  Trader Performance &amp; Risk Metrics
                </h2>
              </div>
              <span className="profile-badge-tag highlight">🛡️ Anti-Rug Protected</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.07)",
                  borderRadius: "8px",
                  padding: "14px",
                }}
              >
                <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block" }}>
                  Win Rate
                </span>
                <strong style={{ color: "var(--good)", fontSize: "18px", fontFamily: "var(--mono)", display: "block", margin: "4px 0 2px" }}>
                  75.0%
                </strong>
                <small style={{ color: "var(--faint)", fontSize: "10.5px" }}>3 Won / 1 Lost</small>
              </div>

              <div
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.07)",
                  borderRadius: "8px",
                  padding: "14px",
                }}
              >
                <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block" }}>
                  Total Volume
                </span>
                <strong style={{ color: "#fff", fontSize: "18px", fontFamily: "var(--mono)", display: "block", margin: "4px 0 2px" }}>
                  $1,250.00
                </strong>
                <small style={{ color: "var(--faint)", fontSize: "10.5px" }}>Arc Mainnet Swaps &amp; Perps</small>
              </div>

              <div
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.07)",
                  borderRadius: "8px",
                  padding: "14px",
                }}
              >
                <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block" }}>
                  Meme Pair Exposure
                </span>
                <strong style={{ color: "#fff", fontSize: "18px", fontFamily: "var(--mono)", display: "block", margin: "4px 0 2px" }}>
                  ${(Number(vaultCollateral) + Number(usdcBalance)).toFixed(2)}
                </strong>
                <small style={{ color: "var(--faint)", fontSize: "10.5px" }}>Arc USDC Margin</small>
              </div>

              <div
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.07)",
                  borderRadius: "8px",
                  padding: "14px",
                }}
              >
                <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block" }}>
                  Solvency Model
                </span>
                <strong style={{ color: "var(--accent)", fontSize: "18px", fontFamily: "var(--mono)", display: "block", margin: "4px 0 2px" }}>
                  0.4.0 Dynamic
                </strong>
                <small style={{ color: "var(--faint)", fontSize: "10.5px" }}>Fail-Closed Capacity</small>
              </div>
            </div>
          </div>

          {/* Persona Card */}
          <div className="profile-content-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <div className="profile-eyebrow-chip">Trader Persona</div>
                <h2 style={{ margin: "4px 0 0", fontSize: "16px", fontWeight: 700, color: "#fff" }}>
                  Active Avatar: {currentAvatar.name}
                </h2>
              </div>
              <button
                type="button"
                className="profile-mini-btn accent"
                onClick={() => setIsAvatarPickerOpen(true)}
              >
                Change Avatar →
              </button>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "18px",
                background: "rgba(255, 255, 255, 0.02)",
                padding: "16px",
                borderRadius: "10px",
                border: "1px solid rgba(255, 255, 255, 0.07)",
              }}
            >
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
                }}
              >
                {currentAvatar.icon}
              </div>

              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: "15px", color: "#fff", display: "block", marginBottom: "3px" }}>
                  {currentAvatar.name}
                </strong>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                  {currentAvatar.title} · Category:{" "}
                  <span style={{ textTransform: "capitalize", color: currentAvatar.borderColor, fontWeight: 600 }}>
                    {currentAvatar.category}
                  </span>
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
        <div className="profile-content-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div>
              <div className="profile-eyebrow-chip">Trader Avatars &amp; Persona</div>
              <h2 style={{ margin: "4px 0 0", fontSize: "16px", fontWeight: 700, color: "#fff" }}>
                Meme &amp; Cyberpunk Avatar Gallery
              </h2>
            </div>
            <span className="profile-badge-tag highlight">Active: {currentAvatar.name}</span>
          </div>

          <p style={{ margin: "0 0 18px", fontSize: "12px", color: "var(--muted)", lineHeight: 1.5 }}>
            Choose your public trader identity for the Arc Mainnet leaderboard, top navigation, and PnL brag cards.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(135px, 1fr))",
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
                    padding: "16px 12px",
                    borderRadius: "10px",
                    background: isSelected ? "rgba(0, 245, 160, 0.08)" : "rgba(255, 255, 255, 0.03)",
                    border: isSelected
                      ? `2px solid ${a.borderColor}`
                      : "1px solid rgba(255, 255, 255, 0.08)",
                    cursor: "pointer",
                    transition: "all 0.16s ease",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.28)";
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
                      e.currentTarget.style.transform = "translateY(0)";
                    }
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
                      width: "50px",
                      height: "50px",
                      borderRadius: "50%",
                      background: a.bgGradient,
                      border: `2px solid ${a.borderColor}`,
                      boxShadow: isSelected ? `0 0 16px ${a.glowColor}` : "none",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "26px",
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
      )}

      {/* TAB 3: OPEN POSITIONS */}
      {activeTab === "Positions" && (
        <div className="profile-content-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <div className="profile-eyebrow-chip">Active Risk &amp; Orders</div>
              <h2 style={{ margin: "4px 0 0", fontSize: "16px", fontWeight: 700, color: "#fff" }}>
                Open Perpetual Positions
              </h2>
            </div>
            <Link to="/markets" className="button button-primary compact">
              + New Position
            </Link>
          </div>

          {positions.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "var(--muted)", textAlign: "left" }}>
                    <th style={{ padding: "10px 12px" }}>Position</th>
                    <th style={{ padding: "10px 12px" }}>Side</th>
                    <th style={{ padding: "10px 12px" }}>Leverage</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Collateral</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Size</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>PnL (USDC)</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <td style={{ padding: "12px", fontWeight: 700, color: "#fff" }}>${p.symbol}</td>
                      <td style={{ padding: "12px" }}>
                        <span
                          style={{
                            color: p.side === "LONG" ? "var(--good)" : "var(--bad)",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: p.side === "LONG" ? "rgba(0, 245, 160, 0.1)" : "rgba(255, 59, 48, 0.1)",
                          }}
                        >
                          {p.side}
                        </span>
                      </td>
                      <td style={{ padding: "12px", fontFamily: "var(--mono)" }}>{p.leverage}</td>
                      <td style={{ padding: "12px", textAlign: "right", fontFamily: "var(--mono)" }}>
                        ${p.collateral}
                      </td>
                      <td style={{ padding: "12px", textAlign: "right", fontFamily: "var(--mono)" }}>
                        ${p.size}
                      </td>
                      <td style={{ padding: "12px", textAlign: "right", color: "var(--good)", fontWeight: 700, fontFamily: "var(--mono)" }}>
                        +$0.42 (+8.4%)
                      </td>
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        <button
                          type="button"
                          className="profile-mini-btn"
                          style={{ color: "var(--bad)" }}
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
            <div style={{ textAlign: "center", padding: "40px 16px" }}>
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>📊</div>
              <h3 style={{ margin: "0 0 6px", fontSize: "15px", color: "#fff" }}>No open positions currently</h3>
              <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "12px", maxWidth: "460px", marginLeft: "auto", marginRight: "auto" }}>
                Your account has zero open perpetual margin risk. Explore trending Arc meme pairs on the terminal to open an isolated long or short position.
              </p>
              <Link to="/markets" className="button button-primary compact">
                Explore Markets
              </Link>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: TRADING DEFAULTS & TOUR */}
      {activeTab === "Defaults" && (
        <div className="profile-content-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
            <div>
              <div className="profile-eyebrow-chip">Execution Defaults &amp; Tools</div>
              <h2 style={{ margin: "4px 0 0", fontSize: "16px", fontWeight: 700, color: "#fff" }}>
                Terminal Trading Preferences
              </h2>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="profile-mini-btn accent"
                onClick={triggerAppTour}
                style={{ padding: "6px 12px" }}
              >
                Replay App Tour 🚀
              </button>
              <button className="button button-primary compact" onClick={saveProfileSettings}>
                Save Preferences
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
            <div>
              <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: "8px", fontWeight: 600 }}>
                Default Leverage:
              </span>
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
              <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: "8px", fontWeight: 600 }}>
                Slippage Tolerance:
              </span>
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
              <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: "8px", fontWeight: 600 }}>
                Default Take-Profit:
              </span>
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
              <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: "8px", fontWeight: 600 }}>
                Default Stop-Loss:
              </span>
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
