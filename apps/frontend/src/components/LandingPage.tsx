import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { StatsSection, AnimatedCounter, Typewriter } from "./StatsSection";
import type { OriginMarket } from "../lib/winner-types";
import { formatPercentBps, formatUsd, shorten } from "../lib/winner-format";

interface LandingPageProps {
  markets?: OriginMarket[];
}

export function LandingPage({ markets = [] }: LandingPageProps) {
  const [activeTab, setActiveTab] = useState<"trenches" | "perp" | "alp">("trenches");

  const previewMarkets = markets.slice(0, 4);

  return (
    <div className="bg-black font-sans text-white min-h-screen selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* 1. Header Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/80 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-6 md:px-12 lg:px-[120px] h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/markets" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-lg bg-white border border-white/20 flex items-center justify-center p-1.5 transition-all group-hover:scale-105 shadow-sm">
                <img src="/cluster-logo.svg" alt="CLUSTER Logo" className="w-full h-full object-contain" />
              </div>
              <div className="flex flex-col">
                <span className="font-sans font-bold text-sm tracking-wider text-white">ArcMemePerps</span>
                <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-400">GMGN · AI Terminal</span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <Link to="/memes" className="px-3 py-1.5 rounded-md text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all">
                Memes
              </Link>
              <Link to="/trending" className="px-3 py-1.5 rounded-md text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all">
                Trending
              </Link>
              <Link to="/markets" className="px-3 py-1.5 rounded-md text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all">
                Markets
              </Link>
              <Link to="/earn" className="px-3 py-1.5 rounded-md text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-all flex items-center gap-1.5">
                <span>ALP Earn</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">18.4% APY</span>
              </Link>
              <Link to="/competitions" className="px-3 py-1.5 rounded-md text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all">
                Competitions
              </Link>
              <Link to="/proof" className="px-3 py-1.5 rounded-md text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all">
                Proof
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-white/60">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>ARC MAINNET · 5042</span>
            </div>

            <Link
              to="/markets"
              className="px-3.5 py-1.5 rounded-md text-xs font-medium text-white/80 border border-white/10 hover:bg-white/5 transition-all"
            >
              Explore
            </Link>

            <Link
              to="/trenches"
              className="px-4 py-1.5 rounded-md text-xs font-bold text-black bg-emerald-400 hover:bg-emerald-300 transition-all shadow-[0_0_16px_rgba(52,211,153,0.3)] flex items-center gap-1.5"
            >
              <span>Launch Terminal</span>
              <span className="text-xs">→</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative pt-16 md:pt-28 pb-20 px-6 md:px-12 lg:px-[120px] overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-emerald-500/10 blur-[140px] pointer-events-none rounded-full" />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[300px] bg-cyan-500/10 blur-[120px] pointer-events-none rounded-full" />

        <div className="max-w-[1440px] mx-auto relative z-10 flex flex-col items-center text-center">
          {/* Eyebrow badge */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-8"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>Arc Network Microgrants 2 · High-Throughput Meme Perpetual Engine</span>
          </motion.div>

          {/* Main Headline with Barlow + Instrument Serif */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl lg:text-7xl font-sans font-medium tracking-tight leading-[1.08] max-w-4xl mb-6 text-white"
          >
            Sub-Second Discovery. <br />
            <span className="font-dm-serif italic font-normal text-emerald-400">
              Perpetuals Settled in Arc USDC.
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-base md:text-lg text-white/50 max-w-2xl font-light leading-relaxed mb-10"
          >
            ArcMemePerps delivers GMGN-grade mempool trenches intelligence, continuous anti-rug qualification, and bounded dynamic leverage settled natively on Arc Mainnet.
          </motion.p>

          {/* Action CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-4 mb-16"
          >
            <Link
              to="/memes"
              className="px-6 py-3 rounded-lg text-sm font-bold text-black bg-emerald-400 hover:bg-emerald-300 transition-all shadow-[0_0_24px_rgba(52,211,153,0.35)] flex items-center gap-2"
            >
              <span>Launch Memes Terminal</span>
              <span className="text-sm">→</span>
            </Link>

            <Link
              to="/markets"
              className="px-6 py-3 rounded-lg text-sm font-medium text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all"
            >
              Explore 166+ Live Markets
            </Link>

            <Link
              to="/proof"
              className="px-6 py-3 rounded-lg text-sm font-medium text-white/60 hover:text-white transition-all flex items-center gap-1.5"
            >
              <span>Verify On-Chain Proof</span>
              <span className="text-xs">↗</span>
            </Link>
          </motion.div>

          {/* Live Preview Ribbon */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="w-full max-w-5xl rounded-xl border border-white/10 bg-white/[0.02] p-4 md:p-6 backdrop-blur-md"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold">● LIVE ARC MAINNET PAIRS</span>
                <span className="text-xs text-white/40 hidden sm:inline">Automatic Anti-Rug Radar</span>
              </div>
              <Link to="/markets" className="text-xs font-mono text-white/50 hover:text-emerald-400 transition-all">
                View All 166 Markets →
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-left">
              {(previewMarkets.length > 0 ? previewMarkets : [
                { marketId: "arc-1", symbol: "ARCPUP", name: "ArcPup Community", priceUsd: "0.0124", priceChange24hBps: 840, originSpotLiquidityUsd: "350000" },
                { marketId: "arc-2", symbol: "PEPE", name: "Pepe Arc", priceUsd: "0.000021", priceChange24hBps: 420, originSpotLiquidityUsd: "180000" },
                { marketId: "arc-3", symbol: "DOGE", name: "Doge Arc", priceUsd: "0.1840", priceChange24hBps: -150, originSpotLiquidityUsd: "240000" },
                { marketId: "arc-4", symbol: "MOG", name: "Mog Arc", priceUsd: "0.0000032", priceChange24hBps: 1250, originSpotLiquidityUsd: "95000" },
              ] as unknown as OriginMarket[]).map((m) => {
                const isPos = (m.priceChange24hBps ?? 0) >= 0;
                return (
                  <Link
                    key={m.marketId}
                    to={`/markets/${encodeURIComponent(m.marketId)}`}
                    className="p-3.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-emerald-500/30 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-white group-hover:text-emerald-400 transition-colors">${m.symbol}</span>
                      <span className={`text-xs font-mono font-medium ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
                        {formatPercentBps(m.priceChange24hBps ?? 0)}
                      </span>
                    </div>
                    <div className="text-base font-mono font-semibold text-white/90 mb-1.5">
                      {formatUsd(m.priceUsd ?? "0")}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-white/40">
                      <span>Liq: {formatUsd(m.originSpotLiquidityUsd ?? "0")}</span>
                      <span className="text-emerald-400/80 font-mono text-[10px]">DEX LIVE</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        </div>
      </section>

      {/* 3. The Required Stats Section Component */}
      <StatsSection />

      {/* 4. Arc Protocol Institutional Metrics Section */}
      <section className="py-16 md:py-24 px-6 md:px-12 lg:px-[120px] w-full border-t border-white/10 bg-black">
        <div className="w-full max-w-[1440px] mx-auto">
          <div className="mb-14 text-center max-w-2xl mx-auto">
            <span className="text-xs font-mono uppercase tracking-widest text-emerald-400 mb-3 block">
              VERIFIED ARCHITECTURE
            </span>
            <h2 className="text-3xl md:text-5xl font-sans font-medium tracking-tight leading-tight mb-4">
              Built for High-Throughput <br />
              <span className="font-dm-serif italic font-normal text-emerald-400">Deterministic Solvency</span>
            </h2>
            <p className="text-white/50 text-sm md:text-base leading-relaxed">
              Every perpetual transaction is verified against live Arc Mainnet RPC nodes, backed by real Arc USDC, and bounded to preserve LP vault stability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-xl border border-white/10 bg-white/[0.02] flex flex-col">
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider mb-2">01 · TRENCHES RADAR</span>
              <h3 className="text-xl font-medium text-white mb-2">Sub-Second Discovery</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Indexes new Arc DEX pairs at creation block with instant dev holding percentage, cluster detection, and liquidity lock inspection.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-white/10 bg-white/[0.02] flex flex-col">
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider mb-2">02 · RISK MODEL 0.4.0</span>
              <h3 className="text-xl font-medium text-white mb-2">Dynamic Capacity</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Replaces uncapped toxic leverage with mathematical depth ceilings. Safe open interest scales deterministically with real spot orderbook liquidity.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-white/10 bg-white/[0.02] flex flex-col">
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider mb-2">03 · NATIVE ARC USDC</span>
              <h3 className="text-xl font-medium text-white mb-2">100% Backed Clearing</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                All collateral, margin, and realized PnL settle in native Arc USDC (0x3600...0000). Zero synthetic IOUs, zero bridging friction.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-white/10 bg-white/[0.02] flex flex-col">
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider mb-2">04 · DORAHACKS PROOF</span>
              <h3 className="text-xl font-medium text-white mb-2">Verifiable Pre-Trade Plans</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Every order generates a deterministic sha256 plan hash verified before signing. What you inspect in the browser is exactly what the keeper executes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Interactive Terminal Preview Showcase */}
      <section className="py-16 md:py-24 px-6 md:px-12 lg:px-[120px] w-full border-t border-white/10 bg-white/[0.01]">
        <div className="w-full max-w-[1440px] mx-auto">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
            <div className="max-w-xl">
              <span className="text-xs font-mono uppercase tracking-widest text-emerald-400 mb-3 block">
                TERMINAL EXPERIENCE
              </span>
              <h2 className="text-3xl md:text-5xl font-sans font-medium tracking-tight leading-tight mb-6">
                Trade Meme Perps Like a Pro, <br />
                <span className="font-dm-serif italic font-normal text-emerald-400">
                  Without Leaving the Trenches.
                </span>
              </h2>
              <p className="text-white/50 text-sm md:text-base leading-relaxed mb-8">
                GMGN-style unified board, 1-click buy/sell, automated take-profit and stop-loss, and high-frequency live candlestick charting designed for degen speed with institutional risk limits.
              </p>

              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs mt-0.5">✓</div>
                  <div>
                    <strong className="text-sm text-white block">Instant 1-Click Execution</strong>
                    <span className="text-xs text-white/50">Execute bounded market and limit orders directly from your connected browser wallet.</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs mt-0.5">✓</div>
                  <div>
                    <strong className="text-sm text-white block">Anti-Rug Passport Forensics</strong>
                    <span className="text-xs text-white/50">Comprehensive check of mint authority, freeze authority, LP lock, and top 10 holder concentration.</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs mt-0.5">✓</div>
                  <div>
                    <strong className="text-sm text-white block">18.4% APY ALP Liquidity Vault</strong>
                    <span className="text-xs text-white/50">Stake Arc USDC to earn 70% of perpetual trading fees and liquidation penalties.</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-4">
                <Link
                  to="/trenches"
                  className="px-6 py-2.5 rounded-lg text-xs font-bold text-black bg-emerald-400 hover:bg-emerald-300 transition-all shadow-[0_0_16px_rgba(52,211,153,0.3)]"
                >
                  Open Live Terminal →
                </Link>
                <Link
                  to="/earn"
                  className="px-6 py-2.5 rounded-lg text-xs font-medium text-white border border-white/10 hover:bg-white/5 transition-all"
                >
                  Deposit to ALP Pool
                </Link>
              </div>
            </div>

            {/* Terminal Mockup Card */}
            <div className="w-full lg:w-1/2 rounded-xl border border-white/10 bg-[#0e1217] p-5 shadow-2xl overflow-hidden font-mono text-xs">
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                  <span className="text-white/40 ml-2 font-mono text-[11px]">terminal.arcmemeperps.io · $ARCPUP-PERP</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px]">LIVE FEED</span>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-2.5 rounded bg-white/[0.02] border border-white/5">
                  <span className="text-[10px] text-white/40 block">Oracle Price</span>
                  <span className="text-sm font-bold text-emerald-400">$0.01248</span>
                </div>
                <div className="p-2.5 rounded bg-white/[0.02] border border-white/5">
                  <span className="text-[10px] text-white/40 block">24h Change</span>
                  <span className="text-sm font-bold text-emerald-400">+8.42%</span>
                </div>
                <div className="p-2.5 rounded bg-white/[0.02] border border-white/5">
                  <span className="text-[10px] text-white/40 block">Safe Capacity</span>
                  <span className="text-sm font-bold text-white">$100,000</span>
                </div>
              </div>

              <div className="p-3 rounded bg-black/60 border border-white/5 mb-4">
                <div className="flex justify-between text-[11px] mb-2 text-white/60">
                  <span>Execution Route</span>
                  <span className="text-emerald-400">Arc Mainnet Direct Mempool (38ms)</span>
                </div>
                <div className="flex justify-between text-[11px] mb-2 text-white/60">
                  <span>Settlement</span>
                  <span className="text-white">Arc USDC (0x3600...0000)</span>
                </div>
                <div className="flex justify-between text-[11px] text-white/60">
                  <span>Integrity Status</span>
                  <span className="text-emerald-400 font-bold">QUALIFIED · FAIL-CLOSED ACTIVE</span>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1 p-2 rounded bg-emerald-500/15 border border-emerald-500/30 text-center text-emerald-400 font-bold">
                  BUY / LONG 5x
                </div>
                <div className="flex-1 p-2 rounded bg-rose-500/15 border border-rose-500/30 text-center text-rose-400 font-bold">
                  SELL / SHORT 5x
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Call to Action Banner */}
      <section className="py-20 px-6 md:px-12 lg:px-[120px] w-full border-t border-white/10 bg-gradient-to-b from-black to-emerald-950/20 text-center">
        <div className="max-w-3xl mx-auto">
          <span className="text-xs font-mono uppercase tracking-widest text-emerald-400 mb-3 block">
            GET STARTED NOW
          </span>
          <h2 className="text-3xl md:text-5xl font-sans font-medium tracking-tight mb-6">
            Step Into the Next Generation of <br />
            <span className="font-dm-serif italic font-normal text-emerald-400">
              Arc Meme Perpetuals.
            </span>
          </h2>
          <p className="text-white/50 text-sm md:text-base leading-relaxed mb-8 max-w-xl mx-auto">
            Connect your browser wallet or log in with verified email. Trade with confidence on Arc Mainnet.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/memes"
              className="px-8 py-3.5 rounded-lg text-sm font-bold text-black bg-emerald-400 hover:bg-emerald-300 transition-all shadow-[0_0_30px_rgba(52,211,153,0.4)]"
            >
              Launch Memes Terminal →
            </Link>
            <Link
              to="/markets"
              className="px-8 py-3.5 rounded-lg text-sm font-medium text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
            >
              Browse All Markets
            </Link>
          </div>
        </div>
      </section>

      {/* 7. Institutional Footer */}
      <footer className="w-full border-t border-white/10 bg-black py-12 px-6 md:px-12 lg:px-[120px] text-xs text-white/50">
        <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-white border border-white/20 p-1 flex items-center justify-center shadow-sm">
              <img src="/cluster-logo.svg" alt="CLUSTER" className="w-full h-full object-contain" />
            </div>
            <span className="font-bold text-white">ArcMemePerps</span>
            <span className="text-white/30">·</span>
            <span>ARC MAINNET (5042)</span>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-white/60">
            <Link to="/memes" className="hover:text-white transition-colors">Memes</Link>
            <Link to="/markets" className="hover:text-white transition-colors">Markets</Link>
            <Link to="/portfolio" className="hover:text-white transition-colors">Portfolio</Link>
            <Link to="/earn" className="hover:text-white transition-colors">Earn LP</Link>
            <Link to="/competitions" className="hover:text-white transition-colors">Competitions</Link>
            <Link to="/proof" className="hover:text-white transition-colors">Proof</Link>
            <Link to="/settings" className="hover:text-white transition-colors">Settings</Link>
          </div>

          <div className="text-white/40 text-[11px] font-mono">
            Built for Arc Microgrants 2 · DoraHacks Provenance
          </div>
        </div>
      </footer>
    </div>
  );
}
