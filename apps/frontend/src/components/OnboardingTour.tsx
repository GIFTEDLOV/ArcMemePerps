import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { WalletActions } from "../lib/winner-wallet";

export interface TourStep {
  title: string;
  badge: string;
  icon: string;
  targetSelector: string;
  areaName: string;
  whatHappens: string;
  keyActions: string[];
  tip?: string;
  route?: string;
  preferredPosition?: "top" | "bottom" | "left" | "right" | "center";
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to ArcMemePerps",
    badge: "ARC MAINNET · 5042",
    icon: "🚀",
    targetSelector: ".gmgn-brand",
    areaName: "Chain Identity & Solvency Hub",
    whatHappens:
      "ArcMemePerps is an institutional-grade meme perpetual DEX running natively on Arc Mainnet (5042). Every trade is executed non-custodially on-chain, backed by a $5,000,000 USDC vault and $2,000,000 insurance reserve.",
    keyActions: [
      "Non-custodial trading directly from your Web3 wallet",
      "Instant USDC collateral margin and PnL settlement",
      "Fail-closed solvency guard protecting against bad debt",
    ],
    tip: "Look for the green 12ms network indicator in the top bar to verify ultra-fast low-latency block times.",
    preferredPosition: "bottom",
  },
  {
    title: "Memes & Markets Navigation",
    badge: "STEP 1 OF 6",
    icon: "🧭",
    targetSelector: ".header-nav",
    areaName: "Terminal Navigation Bar",
    whatHappens:
      "This navigation bar lets you move between the different trading environments of the DEX without disconnecting or losing your active positions.",
    keyActions: [
      "Memes: Scan early-stage viral tokens and hot social launches",
      "Trending: View top volume gainers with 1h / 24h momentum",
      "Markets: Browse all verified deep-liquidity perpetual pairs",
      "Portfolio: View your collateral breakdown and closed trade history",
    ],
    tip: "Hover over 'More' in the top bar for Competitions, Liquidity Earn, and Platform Proofs.",
    preferredPosition: "bottom",
  },
  {
    title: "Instant Token Search & Importer",
    badge: "STEP 2 OF 6",
    icon: "🔍",
    targetSelector: ".gmgn-quick-search",
    areaName: "Universal Quick Search",
    whatHappens:
      "Quickly find any meme coin or perpetual contract across Arc Mainnet. You can search by ticker symbol, token name, or paste any contract address directly.",
    keyActions: [
      "Press the '/' key anywhere on your keyboard to instantly focus search",
      "Paste any Arc contract address (CA) to view its live chart",
      "Use 'Import Token' to trade custom unlisted pairs via ArcScan",
    ],
    tip: "You don't need to scroll through lists — typing just 2 letters brings up instant suggestions.",
    preferredPosition: "bottom",
  },
  {
    title: "Real-Time Candlestick Charts",
    badge: "STEP 3 OF 6",
    icon: "📈",
    targetSelector: ".chart-panel",
    route: "/markets/0x4152433a30783939393939393939393939393939393939393939393939393939",
    areaName: "DexScreener & TradingView Terminal",
    whatHappens:
      "Live price discovery charts powered by sub-second websocket streaming. This area gives you deep technical visibility into candlestick movements, volume bars, and recent fills.",
    keyActions: [
      "Switch intervals: 1m (scalping), 5m, 15m, 1h, or 4h (macro)",
      "View real-time bids, asks, and trade flow streaming in real time",
      "Inspect token qualification proof to verify safety metrics and lockup",
    ],
    tip: "Green candles indicate net bullish buying pressure; red candles indicate selling pressure.",
    preferredPosition: "bottom",
  },
  {
    title: "Execution Rail & Leverage (1x–10x)",
    badge: "STEP 4 OF 6",
    icon: "⚡",
    targetSelector: ".trade-rail",
    route: "/markets/0x4152433a30783939393939393939393939393939393939393939393939393939",
    areaName: "Order Execution & Risk Rail",
    whatHappens:
      "This is where you execute trades with USDC margin. You can profit when the market goes up (LONG) or when it goes down (SHORT).",
    keyActions: [
      "Select LONG (bullish green) or SHORT (bearish red)",
      "Adjust leverage from 1x (spot equivalent) up to 10x",
      "Enter your USDC collateral amount — the engine calculates sizeDelta automatically",
      "Set Take Profit (TP) and Stop Loss (SL) triggers to automate your exits",
    ],
    tip: "Higher leverage magnifies profits, but moves your liquidation price closer. Beginners should start with 2x–3x.",
    preferredPosition: "left",
  },
  {
    title: "Active Positions & PnL Share Cards",
    badge: "STEP 5 OF 6",
    icon: "🏆",
    targetSelector: ".detail-main",
    route: "/markets/0x4152433a30783939393939393939393939393939393939393939393939393939",
    areaName: "Positions Desk & PnL Generator",
    whatHappens:
      "Once you submit an order, your active position appears here. You can monitor your entry price, current mark price, unrealized PnL, and liquidation distance in real time.",
    keyActions: [
      "Close positions anytime with 1 click to lock in profits",
      "Click 'Share PnL' on any trade to generate an institutional brag card",
      "Autonomous Arc Keeper bot monitors your pool against drained liquidity",
    ],
    tip: "PnL cards render directly in high resolution, ready to share on X / Twitter.",
    preferredPosition: "top",
  },
  {
    title: "Trader Profile & Custom Avatars",
    badge: "STEP 6 OF 6",
    icon: "👑",
    targetSelector: ".wallet-button",
    areaName: "Profile & Identity Customization",
    whatHappens:
      "Your trader hub! Customize your public persona for the Arc Mainnet leaderboard, top bar badge, and PnL brag cards.",
    keyActions: [
      "Choose from 12+ iconic Meme & Cyberpunk avatars (Doge, Pepe, Arc Bull, Cyber Samurai)",
      "Customize your trader @handle anytime",
      "Configure default leverage (e.g. 5x) and slippage tolerance",
      "Replay this visual tour anytime from Profile > Trading Defaults",
    ],
    tip: "Click on your wallet address in the top bar to open your Profile at any time.",
    preferredPosition: "bottom",
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
      // Scroll into view if out of visible bounds
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
    const timer = setTimeout(updateTargetRect, 150);
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

  const progressPercent = Math.round(((stepIndex + 1) / TOUR_STEPS.length) * 100);

  // Compute smart positioning for the explanation card relative to the target element
  let cardStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 10002,
    width: "100%",
    maxWidth: "460px",
    background: "#0c0e14",
    border: "1.5px solid rgba(0, 245, 160, 0.4)",
    borderRadius: "14px",
    boxShadow: "0 24px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(0, 245, 160, 0.2)",
    overflow: "hidden",
    animation: "tourFadeIn 0.25s ease-out",
  };

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  if (isMobile) {
    // On mobile, pin explanation box cleanly at bottom
    cardStyle = {
      ...cardStyle,
      bottom: "16px",
      left: "16px",
      right: "16px",
      maxWidth: "calc(100vw - 32px)",
    };
  } else if (targetRect) {
    const pad = 16;
    const cardWidth = 460;
    const cardEstimatedHeight = 440;

    // Determine vertical placement
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;

    let topPos: number;
    if (currentStep.preferredPosition === "top" && spaceAbove > cardEstimatedHeight) {
      topPos = Math.max(pad, targetRect.top - cardEstimatedHeight - pad);
    } else if (spaceBelow >= 360 || spaceBelow >= spaceAbove) {
      topPos = Math.min(window.innerHeight - cardEstimatedHeight - pad, targetRect.bottom + pad);
    } else {
      topPos = Math.max(pad, targetRect.top - cardEstimatedHeight - pad);
    }

    // Determine horizontal placement
    let leftPos = targetRect.left;
    if (leftPos + cardWidth > window.innerWidth - pad) {
      leftPos = Math.max(pad, window.innerWidth - cardWidth - pad);
    }
    if (leftPos < pad) leftPos = pad;

    cardStyle = {
      ...cardStyle,
      top: `${Math.max(16, topPos)}px`,
      left: `${leftPos}px`,
    };
  } else {
    // Centered fallback if element not yet measured
    cardStyle = {
      ...cardStyle,
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  return (
    <>
      {/* 1. Deeply Blurred Full-Screen Backdrop Overlay */}
      <div
        className="tour-overlay-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="App Onboarding Tour"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "rgba(3, 5, 8, 0.76)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          transition: "backdrop-filter 0.3s ease, background 0.3s ease",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) handleSkipOrComplete();
        }}
      />

      {/* 2. Visual Spotlight Cutout & Glowing Pointer Box over the highlighted function */}
      {targetRect && (
        <div
          className="tour-spotlight-box"
          style={{
            position: "fixed",
            top: `${Math.max(0, targetRect.top - 6)}px`,
            left: `${Math.max(0, targetRect.left - 6)}px`,
            width: `${targetRect.width + 12}px`,
            height: `${targetRect.height + 12}px`,
            borderRadius: "10px",
            border: "2px solid #00f5a0",
            boxShadow: "0 0 30px rgba(0, 245, 160, 0.7), inset 0 0 15px rgba(0, 245, 160, 0.25)",
            zIndex: 10001,
            pointerEvents: "none",
            transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Sonar Beacon Ping Animation */}
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

          {/* Area Tag on spotlight */}
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
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
              whiteSpace: "nowrap",
            }}
          >
            FEATURE: {currentStep.areaName}
          </div>
        </div>
      )}

      {/* 3. Explanation Box with Skip and Next Buttons */}
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

        {/* Card Header with Skip Button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px 10px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "10px",
                fontFamily: "var(--mono)",
                fontWeight: 700,
                letterSpacing: "0.08em",
                padding: "2px 8px",
                borderRadius: "4px",
                background: "rgba(0, 245, 160, 0.14)",
                color: "#00f5a0",
                border: "1px solid rgba(0, 245, 160, 0.35)",
              }}
            >
              {currentStep.badge}
            </span>
            <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)", fontFamily: "var(--mono)" }}>
              {stepIndex + 1} of {TOUR_STEPS.length}
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
            title="Close and skip the interactive demo"
          >
            Skip Tour <span style={{ fontSize: "12px", lineHeight: 1 }}>✕</span>
          </button>
        </div>

        {/* Card Body — Explaining What Happens in This Area */}
        <div style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, rgba(0, 245, 160, 0.18), rgba(0, 212, 255, 0.18))",
                border: "1.5px solid rgba(0, 245, 160, 0.35)",
                display: "grid",
                placeItems: "center",
                fontSize: "22px",
                flexShrink: 0,
              }}
            >
              {currentStep.icon}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#ffffff", letterSpacing: "-0.01em" }}>
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
              fontSize: "12.5px",
              lineHeight: 1.6,
              color: "rgba(255, 255, 255, 0.88)",
              marginBottom: "14px",
              background: "rgba(255, 255, 255, 0.03)",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.07)",
            }}
          >
            <strong style={{ color: "#00f5a0", display: "block", marginBottom: "4px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              What happens in this area:
            </strong>
            {currentStep.whatHappens}
          </div>

          {/* Key actions checklist */}
          {currentStep.keyActions && currentStep.keyActions.length > 0 && (
            <div style={{ marginBottom: "14px" }}>
              <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>
                Key functions &amp; controls:
              </span>
              <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "12px", color: "rgba(255, 255, 255, 0.8)", lineHeight: 1.55 }}>
                {currentStep.keyActions.map((action, idx) => (
                  <li key={idx} style={{ marginBottom: "3px" }}>
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
                padding: "8px 12px",
                borderRadius: "6px",
                background: "rgba(0, 245, 160, 0.06)",
                border: "1px solid rgba(0, 245, 160, 0.2)",
                fontSize: "11.5px",
                color: "rgba(255, 255, 255, 0.8)",
                lineHeight: 1.45,
              }}
            >
              <span style={{ color: "#00f5a0", fontSize: "14px" }}>💡</span>
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
            padding: "14px 20px 16px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(0, 0, 0, 0.3)",
          }}
        >
          {/* Step dots */}
          <div style={{ display: "flex", gap: "6px" }}>
            {TOUR_STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStepIndex(i)}
                aria-label={`Go to step ${i + 1}`}
                style={{
                  width: i === stepIndex ? "18px" : "6px",
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
            {/* Secondary Skip button */}
            <button
              type="button"
              className="button button-secondary compact"
              onClick={handleSkipOrComplete}
              style={{ fontSize: "11px", height: "30px", padding: "0 10px", color: "rgba(255, 255, 255, 0.6)" }}
            >
              Skip
            </button>

            {/* Back Button */}
            {stepIndex > 0 && (
              <button
                type="button"
                className="button button-secondary compact"
                style={{ fontSize: "11px", height: "30px", padding: "0 12px" }}
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
                fontSize: "11.5px",
                fontWeight: 700,
                height: "30px",
                padding: "0 16px",
                background: "#00f5a0",
                color: "#000000",
                border: "none",
                boxShadow: "0 0 12px rgba(0, 245, 160, 0.4)",
              }}
              onClick={handleNext}
            >
              {stepIndex === TOUR_STEPS.length - 1 ? "Finish & Trade 🚀" : "Next →"}
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
