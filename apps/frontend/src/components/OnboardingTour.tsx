import { useState, useEffect, useCallback } from "react";
import type { WalletActions } from "../lib/winner-wallet";

export interface TourStep {
  title: string;
  badge: string;
  icon: string;
  description: string;
  targetSelector?: string;
  tip?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to ArcMemePerps",
    badge: "ARC MAINNET · 5042",
    icon: "🚀",
    description:
      "You are connected to Arc Mainnet! ArcMemePerps is an institutional-grade meme perpetual DEX offering up to 10x leverage, fail-closed solvency protection, and instant USDC settlement.",
    tip: "Every trade is backed by a $5M USDC vault and $2M insurance pool.",
  },
  {
    title: "Memes & Markets Navigation",
    badge: "STEP 1 OF 5",
    icon: "📊",
    targetSelector: ".header-nav",
    description:
      "Explore the Memes trenches for viral token discovery, check trending pairs with real-time liquidity depth, or filter verified Arc perpetual markets in one click.",
    tip: "Use the top search bar ('/') to quickly find any token by ticker or contract address.",
  },
  {
    title: "Real-Time Streaming Charts",
    badge: "STEP 2 OF 5",
    icon: "📈",
    targetSelector: ".chart-panel",
    description:
      "Inspect sub-second TradingView and DexScreener candlestick charts. Switch between 1m, 5m, 15m, 1h, and 4h intervals to catch market momentum and breakout levels.",
    tip: "Toggle between chart view and qualification proof to audit token safety.",
  },
  {
    title: "Leveraged Long & Short Execution",
    badge: "STEP 3 OF 5",
    icon: "⚡",
    targetSelector: ".trade-rail",
    description:
      "Trade both directions: Go LONG if you expect prices to rise, or SHORT to profit from dips. Select your leverage (1x to 10x) and deposit USDC margin with fail-closed execution.",
    tip: "Always configure Take Profit (TP) and Stop Loss (SL) triggers to automate your exits.",
  },
  {
    title: "Positions & PnL Share Cards",
    badge: "STEP 4 OF 5",
    icon: "🏆",
    targetSelector: ".portfolio-positions",
    description:
      "Track your active positions, live unrealized PnL, and liquidation distance in real-time. Click 'Share PnL' anytime to generate branded brag cards for X / Twitter.",
    tip: "Arc's autonomous Keeper bot automatically protects positions against drained liquidity.",
  },
  {
    title: "Profile & Custom Avatars",
    badge: "STEP 5 OF 5",
    icon: "👑",
    targetSelector: ".wallet-button",
    description:
      "Customize your trader identity! Choose from 12+ iconic crypto & meme avatars (Doge, Pepe, Arc Bull, Cyber Samurai), edit your handle, and set default leverage preferences.",
    tip: "Click on your wallet address in the top bar anytime to open your Profile.",
  },
];

export function OnboardingTour({ wallet }: { wallet: WalletActions }) {
  const address = wallet.state.address;
  const isConnected = wallet.state.status === "CONNECTED";
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Auto-launch when wallet is connected for the first time
  useEffect(() => {
    if (!isConnected || !address) {
      setIsOpen(false);
      return;
    }
    const storageKey = `arcmemeperps.tour_done.${address.toLowerCase()}`;
    const alreadyDone = window.localStorage.getItem(storageKey);
    if (!alreadyDone) {
      // Small delay to let page elements mount cleanly
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

  const currentStep = TOUR_STEPS[stepIndex];
  const progressPercent = Math.round(((stepIndex + 1) / TOUR_STEPS.length) * 100);

  return (
    <div
      className="tour-overlay-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="App Onboarding Tour"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(3, 5, 8, 0.82)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleSkipOrComplete();
      }}
    >
      <div
        className="tour-card"
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "#0c0e14",
          border: "1px solid rgba(255, 255, 255, 0.16)",
          borderRadius: "14px",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.8), 0 0 25px rgba(0, 245, 160, 0.15)",
          overflow: "hidden",
          animation: "tourFadeIn 0.25s ease-out",
        }}
      >
        {/* Progress bar */}
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

        {/* Card Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px 12px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
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
                background: "rgba(0, 245, 160, 0.12)",
                color: "#00f5a0",
                border: "1px solid rgba(0, 245, 160, 0.3)",
              }}
            >
              {currentStep.badge}
            </span>
            <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)", fontFamily: "var(--mono)" }}>
              {stepIndex + 1} of {TOUR_STEPS.length}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSkipOrComplete}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.5)",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255, 255, 255, 0.5)")}
          >
            Skip Tour <span style={{ fontSize: "14px", lineHeight: 1 }}>✕</span>
          </button>
        </div>

        {/* Card Body */}
        <div style={{ padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, rgba(0, 245, 160, 0.15), rgba(0, 212, 255, 0.15))",
                border: "1px solid rgba(0, 245, 160, 0.3)",
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
              <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)" }}>
                Interactive Feature Walkthrough
              </span>
            </div>
          </div>

          <p
            style={{
              fontSize: "13px",
              lineHeight: 1.6,
              color: "rgba(255, 255, 255, 0.82)",
              margin: "0 0 16px 0",
            }}
          >
            {currentStep.description}
          </p>

          {currentStep.tip && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                padding: "10px 12px",
                borderRadius: "8px",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                fontSize: "11.5px",
                color: "rgba(255, 255, 255, 0.7)",
                lineHeight: 1.45,
              }}
            >
              <span style={{ color: "#00f5a0", fontSize: "14px" }}>💡</span>
              <div>
                <strong style={{ color: "#ffffff", marginRight: "4px" }}>Pro Tip:</strong>
                {currentStep.tip}
              </div>
            </div>
          )}
        </div>

        {/* Card Footer Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px 18px",
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
            background: "rgba(0, 0, 0, 0.2)",
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

          <div style={{ display: "flex", gap: "8px" }}>
            {stepIndex > 0 && (
              <button
                type="button"
                className="button button-secondary compact"
                style={{ fontSize: "11px", height: "30px", padding: "0 12px" }}
                onClick={handlePrev}
              >
                Back
              </button>
            )}

            <button
              type="button"
              className="button button-primary compact"
              style={{
                fontSize: "11px",
                fontWeight: 600,
                height: "30px",
                padding: "0 14px",
                background: "#00f5a0",
                color: "#000000",
                border: "none",
              }}
              onClick={handleNext}
            >
              {stepIndex === TOUR_STEPS.length - 1 ? "Start Trading 🚀" : "Next Step →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function triggerAppTour() {
  window.dispatchEvent(new CustomEvent("arcmemeperps:start_tour"));
}
