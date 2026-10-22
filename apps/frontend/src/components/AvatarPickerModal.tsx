import { useState } from "react";
import { AVATAR_LIST, type TraderAvatar, getTraderAvatar } from "../lib/avatars";

interface AvatarPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatarId: string;
  onSelectAvatar: (avatarId: string) => void;
  handle: string;
}

export function AvatarPickerModal({
  isOpen,
  onClose,
  currentAvatarId,
  onSelectAvatar,
  handle,
}: AvatarPickerModalProps) {
  const [selectedId, setSelectedId] = useState(currentAvatarId || "arc");
  const [filter, setFilter] = useState<"all" | "meme" | "crypto" | "arc">("all");

  if (!isOpen) return null;

  const currentPreview = getTraderAvatar(selectedId);
  const filteredList =
    filter === "all" ? AVATAR_LIST : AVATAR_LIST.filter((a) => a.category === filter);

  const handleSave = () => {
    onSelectAvatar(selectedId);
    onClose();
  };

  return (
    <div
      className="pnl-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        background: "rgba(0, 0, 0, 0.82)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="avatar-picker-modal"
        style={{
          width: "100%",
          maxWidth: "540px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: "#0c0e14",
          border: "1px solid rgba(255, 255, 255, 0.16)",
          borderRadius: "14px",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.85), 0 0 25px rgba(0, 245, 160, 0.15)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#fff" }}>
              Choose Trader Avatar
            </h2>
            <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)" }}>
              Select your persona for Arc Mainnet leaderboard &amp; PnL cards
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.5)",
              fontSize: "18px",
              cursor: "pointer",
              padding: "4px 8px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Live Preview Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            padding: "14px 20px",
            background: "rgba(255, 255, 255, 0.02)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: currentPreview.bgGradient,
              border: `2px solid ${currentPreview.borderColor}`,
              boxShadow: `0 0 16px ${currentPreview.glowColor}`,
              display: "grid",
              placeItems: "center",
              fontSize: "26px",
              flexShrink: 0,
              transition: "all 0.2s ease",
            }}
          >
            {currentPreview.icon}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>
                @{handle || "ArcTrader"}
              </span>
              <span
                style={{
                  fontSize: "9px",
                  padding: "1px 6px",
                  borderRadius: "3px",
                  background: "rgba(0, 245, 160, 0.15)",
                  color: "#00f5a0",
                  border: "1px solid rgba(0, 245, 160, 0.3)",
                  fontFamily: "var(--mono)",
                }}
              >
                PREVIEW
              </span>
            </div>
            <div style={{ fontSize: "12px", color: currentPreview.borderColor, marginTop: "2px", fontWeight: 600 }}>
              {currentPreview.name} · <span style={{ color: "rgba(255, 255, 255, 0.5)", fontWeight: 400 }}>{currentPreview.title}</span>
            </div>
          </div>
        </div>

        {/* Category Tabs */}
        <div
          style={{
            display: "flex",
            gap: "6px",
            padding: "10px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          {[
            { id: "all", label: "All Avatars" },
            { id: "meme", label: "Meme Kings" },
            { id: "crypto", label: "Crypto Degens" },
            { id: "arc", label: "Arc Mainnet" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id as typeof filter)}
              style={{
                fontSize: "11px",
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: "6px",
                border: filter === t.id ? "1px solid rgba(0, 245, 160, 0.4)" : "1px solid transparent",
                background: filter === t.id ? "rgba(0, 245, 160, 0.1)" : "rgba(255, 255, 255, 0.04)",
                color: filter === t.id ? "#00f5a0" : "rgba(255, 255, 255, 0.6)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Avatar Grid */}
        <div
          style={{
            padding: "16px 20px",
            overflowY: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
            gap: "12px",
            maxHeight: "360px",
          }}
        >
          {filteredList.map((a: TraderAvatar) => {
            const isSelected = selectedId.toLowerCase() === a.id.toLowerCase();
            return (
              <div
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "12px 8px",
                  borderRadius: "10px",
                  background: isSelected ? "rgba(0, 245, 160, 0.08)" : "rgba(255, 255, 255, 0.03)",
                  border: isSelected
                    ? `1.5px solid ${a.borderColor}`
                    : "1px solid rgba(255, 255, 255, 0.07)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  position: "relative",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.25)";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.07)";
                }}
              >
                {isSelected && (
                  <span
                    style={{
                      position: "absolute",
                      top: "6px",
                      right: "6px",
                      width: "14px",
                      height: "14px",
                      borderRadius: "50%",
                      background: "#00f5a0",
                      color: "#000",
                      fontSize: "9px",
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
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    background: a.bgGradient,
                    border: `1.5px solid ${a.borderColor}`,
                    boxShadow: isSelected ? `0 0 12px ${a.glowColor}` : "none",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "22px",
                    marginBottom: "8px",
                  }}
                >
                  {a.icon}
                </div>
                <strong style={{ fontSize: "11px", color: "#fff", textAlign: "center" }}>
                  {a.name}
                </strong>
                <small
                  style={{
                    fontSize: "9px",
                    color: "rgba(255, 255, 255, 0.4)",
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

        {/* Footer Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "10px",
            padding: "14px 20px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(0, 0, 0, 0.25)",
          }}
        >
          <button
            type="button"
            className="button button-secondary compact"
            onClick={onClose}
            style={{ fontSize: "11px", height: "30px", padding: "0 14px" }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary compact"
            onClick={handleSave}
            style={{
              fontSize: "11px",
              fontWeight: 600,
              height: "30px",
              padding: "0 18px",
              background: "#00f5a0",
              color: "#000",
              border: "none",
            }}
          >
            Apply Avatar
          </button>
        </div>
      </div>
    </div>
  );
}
