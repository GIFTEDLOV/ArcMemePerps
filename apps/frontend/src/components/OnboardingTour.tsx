import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { WalletActions } from "../lib/winner-wallet";

export interface TourStep {
  title: string;
  icon: string;
  targetSelector: string;
  areaName: string;
  whatHappens: string;
  keyActions: string[];
  tip?: string;
  route?: string;
  placement: "bottom" | "top" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to CLUSTER",
    icon: "🚀",
    targetSelector: ".gmgn-brand",
    areaName: "Chain Identity & Availability",
    placement: "bottom",
    whatHappens:
      "CLUSTER connects to Arc Mainnet (5042) for wallet and market status. Trading and liquidity deposits are disabled until live contract and transaction receipt paths are verified.",
    keyActions: [
      "Wallet connection reads the injected provider account",
      "Current vault balances and PnL reads are unavailable",
      "No keeper or risk monitor is claimed active by this interface",
    ],
    tip: "The top bar identifies the configured chain; it does not report RPC latency.",
  },
  {
    title: "Memes & Markets Navigation",
    icon: "🧭",
    targetSelector: ".header-nav",
    areaName: "Terminal Navigation Bar",
    placement: "bottom",
    whatHappens:
      "This navigation bar opens the terminal's market, portfolio, LP, competition, and release-status pages.",
    keyActions: [
      "Memes and Markets: inspect available provider records",
      "Trending: filters provider records when available",
      "Portfolio: current canonical position index is unavailable",
      "LP and competition pages report unavailable status when no verified data exists",
    ],
    tip: "Hover over 'More' in the top bar for Competitions, Liquidity Earn, and Platform Proofs.",
  },
  {
    title: "Instant Token Search & Importer",
    icon: "🔍",
    targetSelector: ".gmgn-quick-search",
    areaName: "Universal Quick Search",
    placement: "bottom",
    whatHappens:
      "Search the market records returned by the configured API, or read basic ERC-20 metadata for a pasted Arc contract address.",
    keyActions: [
      "Press the '/' key anywhere on your keyboard to instantly focus search",
      "A pasted contract address does not establish token safety or perpetual eligibility",
      "Imported metadata is not a qualified market and cannot be traded",
    ],
    tip: "Typing just 2 letters brings up instant matching token suggestions.",
  },
  {
    title: "Market Charts",
    icon: "📈",
    targetSelector: ".chart-panel",
    route: "/markets/0x4152433a30783939393939393939393939393939393939393939393939393939",
    areaName: "Market Data and History",
    placement: "right",
    whatHappens:
      "Charts show provider-backed or timestamped observations when available. Unavailable history is not replaced with synthetic candles.",
    keyActions: [
      "Chart interval controls are unavailable until a verified source is connected",
      "Trade flow and order book data are not currently indexed",
      "Qualification evidence is shown only when a current proof is supplied",
    ],
    tip: "Missing chart data is displayed as unavailable; no generated price history is shown.",
  },
  {
    title: "Order Preview",
    icon: "⚡",
    targetSelector: ".trade-rail",
    route: "/markets/0x4152433a30783939393939393939393939393939393939393939393939393939",
    areaName: "Trading Availability",
    placement: "left",
    whatHappens:
      "The order controls are a preview only. Order submission is disabled because a verified live market and receipt path are not connected.",
    keyActions: [
      "Order side and size are not submitted",
      "Capacity and leverage limits are unavailable",
      "Collateral balance is unavailable unless read from chain",
      "Take Profit and Stop Loss controls do not set on-chain triggers",
    ],
    tip: "Do not treat the preview values as an order, expected fill, or active risk control.",
  },
  {
    title: "Trader Profile & Custom Avatars",
    icon: "👑",
    targetSelector: ".wallet-button",
    areaName: "Profile & Identity Customization",
    placement: "bottom",
    whatHappens:
      "Set local display preferences for this browser. The app does not currently connect these preferences to a verified leaderboard or on-chain identity.",
    keyActions: [
      "Choose from 12+ iconic Meme & Cyberpunk avatars (Doge, Pepe, Arc Bull, Cyber Samurai)",
      "Customize a locally saved display handle and avatar",
      "Save local order preview defaults",
      "Replay this visual tour anytime from Profile > Trading Defaults",
    ],
    tip: "Connect a wallet before viewing wallet-specific information.",
  },
];

interface ElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export function OnboardingTour({ wallet }: { wallet: WalletActions }) {
  const address = wallet.state.address;
  const isConnected = wallet.state.status === "CONNECTED";
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<ElementRect | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const cardRef = useRef<HTMLDivElement>(null);

  // Auto-launch when wallet is connected for the first time
  useEffect(() => {
    if (!isConnected || !address) {
      setIsOpen(false);
      return;
    }
    const storageKey = `arcmemeperps.tour_done.${address.toLowerCase()}`;
    const alreadyDone = window.localStorage.getItem(storageKey);
    if (!alreadyDone) {
      const timer = setTimeout(() => {
        setIsOpen(true);
        setStepIndex(0);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [isConnected, address]);

  // Support manual launch from Profile or Help menu via custom event
  useEffect(() => {
    const handleManualStart = () => {
      setStepIndex(0);
      setIsOpen(true);
    };
    window.addEventListener("arcmemeperps:start_tour", handleManualStart);
    return () => window.removeEventListener("arcmemeperps:start_tour", handleManualStart);
  }, []);

  const currentStep = TOUR_STEPS[stepIndex] || TOUR_STEPS[0];

  // Auto-navigate to required route if the target element lives on a specific page
  useEffect(() => {
    if (!isOpen) return;
    if (currentStep.route && !location.pathname.startsWith("/markets/")) {
      navigate(currentStep.route);
    }
  }, [isOpen, stepIndex, currentStep.route, location.pathname, navigate]);

  // Measure and scroll target element into view
  const updateTargetRect = useCallback(() => {
    if (!isOpen) {
      setTargetRect(null);
      return;
    }
    const selector = currentStep.targetSelector;
    if (!selector) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(selector) as HTMLElement | null;
    if (el) {
      const r = el.getBoundingClientRect();
      // Scroll into view smoothly if out of visible bounds
      if (r.top < 60 || r.bottom > window.innerHeight - 60) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setTargetRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
        bottom: r.bottom,
        right: r.right,
      });
    } else {
      setTargetRect(null);
    }
  }, [isOpen, currentStep.targetSelector]);

  useEffect(() => {
    const timer = setTimeout(updateTargetRect, 180);
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
    };
  }, [updateTargetRect, stepIndex]);

  const handleSkipOrComplete = useCallback(() => {
    if (address) {
      const storageKey = `arcmemeperps.tour_done.${address.toLowerCase()}`;
      try {
        window.localStorage.setItem(storageKey, "true");
      } catch {
        /* ignore */
      }
    }
    setIsOpen(false);
  }, [address]);

  const handleNext = () => {
    if (stepIndex < TOUR_STEPS.length - 1) {
      setStepIndex((prev) => prev + 1);
    } else {
      handleSkipOrComplete();
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) {
      setStepIndex((prev) => prev - 1);
    }
  };

  if (!isOpen) return null;

  const totalSteps = TOUR_STEPS.length;
  const progressPercent = Math.round(((stepIndex + 1) / totalSteps) * 100);

  // Compute smart, non-overlapping positioning for the explanation card
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const cardWidth = isMobile ? window.innerWidth - 32 : 420;
  const cardEstimatedHeight = 350;
  const pad = 16;

  let cardStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 10002,
    width: `${cardWidth}px`,
    background: "#0c0e14",
    border: "1.5px solid rgba(0, 245, 160, 0.45)",
    borderRadius: "14px",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.95), 0 0 35px rgba(0, 245, 160, 0.25)",
    overflow: "hidden",
    animation: "tourFadeIn 0.25s ease-out",
  };

  if (isMobile) {
    cardStyle = {
      ...cardStyle,
      bottom: "16px",
      left: "16px",
      right: "16px",
    };
  } else if (targetRect) {
    let top = 0;
    let left = 0;

    if (currentStep.placement === "left") {
      // Place to the left of the highlighted element (e.g. for trade-rail on the right)
      left = Math.max(pad, targetRect.left - cardWidth - 20);
      top = Math.max(pad, Math.min(window.innerHeight - cardEstimatedHeight - pad, targetRect.top + 10));
    } else if (currentStep.placement === "right") {
      // Place to the right of the highlighted element (e.g. for chart panel on the left)
      left = Math.min(window.innerWidth - cardWidth - pad, targetRect.right + 20);
      top = Math.max(pad, Math.min(window.innerHeight - cardEstimatedHeight - pad, targetRect.top + 10));
    } else if (currentStep.placement === "top") {
      // Place above the element
      top = Math.max(pad, targetRect.top - cardEstimatedHeight - 16);
      left = Math.max(pad, Math.min(window.innerWidth - cardWidth - pad, targetRect.left));
    } else {
      // Default: place below the element (e.g. for topbar, nav, search, wallet button)
      top = targetRect.bottom + 16;
      if (top + cardEstimatedHeight > window.innerHeight - pad) {
        top = Math.max(pad, targetRect.top - cardEstimatedHeight - 16);
      }
      left = Math.max(pad, Math.min(window.innerWidth - cardWidth - pad, targetRect.left));
    }

    cardStyle = {
      ...cardStyle,
      top: `${top}px`,
      left: `${left}px`,
    };
  } else {
    cardStyle = {
      ...cardStyle,
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  // Calculate polygon clip-path cutout hole so the target element is 100% UNBLURRED and SHARP
  let backdropClipPath: string | undefined = undefined;
  let spotlightX = 0;
  let spotlightY = 0;
  let spotlightW = 0;
  let spotlightH = 0;

  if (targetRect) {
    spotlightX = Math.max(0, Math.round(targetRect.left - 6));
    spotlightY = Math.max(0, Math.round(targetRect.top - 6));
    spotlightW = Math.round(targetRect.width + 12);
    spotlightH = Math.round(targetRect.height + 12);
    const x2 = spotlightX + spotlightW;
    const y2 = spotlightY + spotlightH;

    // Even-odd inverted rectangle: fills the whole screen EXCEPT the target area!
    backdropClipPath = `polygon(
      0% 0%,
      0% 100%,
      ${spotlightX}px 100%,
      ${spotlightX}px ${spotlightY}px,
      ${x2}px ${spotlightY}px,
      ${x2}px ${y2}px,
      ${spotlightX}px ${y2}px,
      ${spotlightX}px 100%,
      100% 100%,
      100% 0%
    )`;
  }

  return (
    <>
      {/* 1. Deeply Blurred Full-Screen Backdrop Overlay WITH CUTOUT HOLE over the active function */}
      <div
        className="tour-overlay-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="App Onboarding Tour"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "rgba(3, 5, 8, 0.78)",
          backdropFilter: "blur(9px)",
          WebkitBackdropFilter: "blur(9px)",
          clipPath: backdropClipPath,
          WebkitClipPath: backdropClipPath,
          transition: "clip-path 0.3s cubic-bezier(0.16, 1, 0.3, 1), -webkit-clip-path 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          pointerEvents: "auto",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) handleSkipOrComplete();
        }}
      />

      {/* 2. Visual Spotlight Glowing Border & Sonar Beacon pointing to the function */}
      {targetRect && (
        <div
          className="tour-spotlight-box"
          style={{
            position: "fixed",
            top: `${spotlightY}px`,
            left: `${spotlightX}px`,
            width: `${spotlightW}px`,
            height: `${spotlightH}px`,
            borderRadius: "10px",
            border: "2px solid #00f5a0",
            boxShadow: "0 0 30px rgba(0, 245, 160, 0.75), inset 0 0 15px rgba(0, 245, 160, 0.25)",
            zIndex: 10001,
            pointerEvents: "none",
            transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Sonar Beacon Ping */}
          <span
            style={{
              position: "absolute",
              top: "-8px",
              left: "-8px",
              display: "flex",
              height: "20px",
              width: "20px",
            }}
          >
            <span
              style={{
                position: "absolute",
                display: "inline-flex",
                height: "100%",
                width: "100%",
                borderRadius: "50%",
                background: "#00f5a0",
                opacity: 0.75,
                animation: "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite",
              }}
            />
            <span
              style={{
                position: "relative",
                display: "inline-flex",
                borderRadius: "50%",
                height: "14px",
                width: "14px",
                margin: "3px",
                background: "#00f5a0",
                boxShadow: "0 0 10px #00f5a0",
              }}
            />
          </span>

          {/* Feature Badge above spotlight */}
          <div
            style={{
              position: "absolute",
              top: "-24px",
              right: "4px",
              background: "#00f5a0",
              color: "#000",
              fontSize: "9.5px",
              fontWeight: 800,
              padding: "2px 8px",
              borderRadius: "4px",
              fontFamily: "var(--mono)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
              whiteSpace: "nowrap",
            }}
          >
            FEATURE: {currentStep.areaName}
          </div>
        </div>
      )}

      {/* 3. Non-Overlapping Explanation Box */}
      <div ref={cardRef} className="tour-card" style={cardStyle}>
        {/* Animated Progress Bar */}
        <div style={{ width: "100%", height: "3px", background: "rgba(255, 255, 255, 0.08)" }}>
          <div
            style={{
              height: "100%",
              width: `${progressPercent}%`,
              background: "linear-gradient(90deg, #00f5a0, #00d4ff)",
              transition: "width 0.3s ease",
            }}
          />
        </div>

        {/* Card Header with Consistent Step Badge & Skip Button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px 10px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "10.5px",
                fontFamily: "var(--mono)",
                fontWeight: 800,
                letterSpacing: "0.08em",
                padding: "2px 8px",
                borderRadius: "4px",
                background: "rgba(0, 245, 160, 0.15)",
                color: "#00f5a0",
                border: "1px solid rgba(0, 245, 160, 0.35)",
              }}
            >
              STEP {stepIndex + 1} OF {totalSteps}
            </span>
          </div>

          {/* Prominent Skip Button */}
          <button
            type="button"
            onClick={handleSkipOrComplete}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "rgba(255, 255, 255, 0.8)",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              padding: "4px 10px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#ffffff";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.12)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgba(255, 255, 255, 0.8)";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
            }}
            title="Close and skip the visual demo"
          >
            Skip Tour <span style={{ fontSize: "12px", lineHeight: 1 }}>✕</span>
          </button>
        </div>

        {/* Card Body — Clear Explanation of What Happens in This Area */}
        <div style={{ padding: "16px 18px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, rgba(0, 245, 160, 0.2), rgba(0, 212, 255, 0.2))",
                border: "1px solid rgba(0, 245, 160, 0.4)",
                display: "grid",
                placeItems: "center",
                fontSize: "20px",
                flexShrink: 0,
              }}
            >
              {currentStep.icon}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#ffffff", letterSpacing: "-0.01em" }}>
                {currentStep.title}
              </h3>
              <span style={{ fontSize: "11px", color: "#00f5a0", fontWeight: 600 }}>
                Pointing to: {currentStep.areaName}
              </span>
            </div>
          </div>

          {/* What happens explanation */}
          <div
            style={{
              fontSize: "12px",
              lineHeight: 1.55,
              color: "rgba(255, 255, 255, 0.88)",
              marginBottom: "10px",
              background: "rgba(255, 255, 255, 0.03)",
              padding: "8px 10px",
              borderRadius: "6px",
              border: "1px solid rgba(255, 255, 255, 0.07)",
            }}
          >
            <strong style={{ color: "#00f5a0", display: "block", marginBottom: "3px", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              What happens in this area:
            </strong>
            {currentStep.whatHappens}
          </div>

          {/* Key actions checklist */}
          {currentStep.keyActions && (
            <div style={{ marginBottom: "10px" }}>
              <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "11.5px", color: "rgba(255, 255, 255, 0.78)", lineHeight: 1.5 }}>
                {currentStep.keyActions.map((action, idx) => (
                  <li key={idx} style={{ marginBottom: "2px" }}>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Pro tip */}
          {currentStep.tip && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                padding: "7px 10px",
                borderRadius: "6px",
                background: "rgba(0, 245, 160, 0.06)",
                border: "1px solid rgba(0, 245, 160, 0.2)",
                fontSize: "11px",
                color: "rgba(255, 255, 255, 0.82)",
                lineHeight: 1.4,
              }}
            >
              <span style={{ color: "#00f5a0", fontSize: "13px" }}>💡</span>
              <div>
                <strong style={{ color: "#00f5a0", marginRight: "4px" }}>Pro Tip:</strong>
                {currentStep.tip}
              </div>
            </div>
          )}
        </div>

        {/* Card Footer with Skip, Back, and Next Buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px 14px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(0, 0, 0, 0.35)",
          }}
        >
          {/* Step dots */}
          <div style={{ display: "flex", gap: "5px" }}>
            {TOUR_STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStepIndex(i)}
                aria-label={`Go to step ${i + 1}`}
                style={{
                  width: i === stepIndex ? "16px" : "6px",
                  height: "6px",
                  borderRadius: "3px",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  background: i === stepIndex ? "#00f5a0" : "rgba(255, 255, 255, 0.2)",
                  transition: "all 0.2s ease",
                }}
              />
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Secondary Skip Button */}
            <button
              type="button"
              className="button button-secondary compact"
              onClick={handleSkipOrComplete}
              style={{ fontSize: "11px", height: "28px", padding: "0 10px", color: "rgba(255, 255, 255, 0.6)" }}
            >
              Skip
            </button>

            {/* Back Button */}
            {stepIndex > 0 && (
              <button
                type="button"
                className="button button-secondary compact"
                style={{ fontSize: "11px", height: "28px", padding: "0 12px" }}
                onClick={handlePrev}
              >
                ← Back
              </button>
            )}

            {/* Next Button */}
            <button
              type="button"
              className="button button-primary compact"
              style={{
                fontSize: "11px",
                fontWeight: 700,
                height: "28px",
                padding: "0 16px",
                background: "#00f5a0",
                color: "#000000",
                border: "none",
                boxShadow: "0 0 12px rgba(0, 245, 160, 0.4)",
              }}
              onClick={handleNext}
            >
              {stepIndex === totalSteps - 1 ? "Finish" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function triggerAppTour() {
  window.dispatchEvent(new CustomEvent("arcmemeperps:start_tour"));
}
