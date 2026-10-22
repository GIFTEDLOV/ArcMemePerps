import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { StatsSection } from "./StatsSection";
import type { OriginMarket } from "../lib/winner-types";
import { formatPercentBps, formatUsd } from "../lib/winner-format";

interface LandingPageProps {
  markets?: OriginMarket[];
}

export function LandingPage({ markets = [] }: LandingPageProps) {
  const [activeTab] = useState<"trenches" | "perp" | "alp">("trenches");

  const previewMarkets = markets.slice(0, 4);

  return (
    <div className="landing-page-pattern-bg font-sans text-white min-h-screen selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* 1. Header Navigation (Bigger, spacious, chain tag removed) */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/75 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-6 md:px-12 lg:px-[120px] h-20 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Link to="/markets" className="flex items-center gap-3.5 group">
              <div className="w-10 h-10 rounded-xl bg-white border border-white/20 flex items-center justify-center p-2 transition-all group-hover:scale-105 shadow-md">
                <img src="/cluster-logo.svg" alt="CLUSTER Logo" className="w-full h-full object-contain" />
              </div>
              <div className="flex flex-col">
                <span className="font-sans font-extrabold text-base tracking-wider text-white">ArcMemePerps</span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">GMGN · AI Terminal</span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1.5">
              <Link to="/memes" className="px-4 py-2 rounded-lg text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-all">
                Memes
              </Link>
              <Link to="/trending" className="px-4 py-2 rounded-lg text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-all">
                Trending
              </Link>
              <Link to="/markets" className="px-4 py-2 rounded-lg text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-all">
                Markets
              </Link>
              <Link to="/earn" className="px-4 py-2 rounded-lg text-sm font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-all flex items-center gap-2">
                <span>ALP Earn</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">18.4% APY</span>
              </Link>
              <Link to="/competitions" className="px-4 py-2 rounded-lg text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-all">
                Competitions
              </Link>
              <Link to="/proof" className="px-4 py-2 rounded-lg text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-all">
                Proof
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {/* Chain tag has been completely removed as requested */}
            <Link
              to="/markets"
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-white/80 border border-white/15 hover:bg-white/10 hover:border-white/30 transition-all"
            >
              Explore
            </Link>

            <Link
              to="/trenches"
              className="px-6 py-2.5 rounded-lg text-sm font-bold text-black bg-emerald-400 hover:bg-emerald-300 transition-all shadow-[0_0_20px_rgba(52,211,153,0.35)] flex items-center gap-2"
            >
              <span>Launch Terminal</span>
              <span className="text-sm font-bold">→</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Hero Section (Bigger headline, bigger subtitle, bigger CTAs) */}
      <section className="relative pt-20 md:pt-32 pb-24 px-6 md:px-12 lg:px-[120px] overflow-hidden">
        {/* Glow ambient background aura */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[400px] bg-emerald-500/12 blur-[160px] pointer-events-none rounded-full" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[350px] bg-cyan-500/10 blur-[140px] pointer-events-none rounded-full" />

        <div className="max-w-[1440px] mx-auto relative z-10 flex flex-col items-center text-center">
          {/* Eyebrow badge (Bigger) */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full text-xs md:text-sm font-mono bg-emerald-500/12 border border-emerald-500/30 text-emerald-400 mb-8 shadow-sm"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Arc Network Microgrants 2 · High-Throughput Meme Perpetual Engine</span>
          </motion.div>

          {/* Main Headline (Much Bigger & Commanding) */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-7xl md:text-8xl lg:text-[88px] font-sans font-medium tracking-tight leading-[1.04] max-w-5xl mb-8 text-white"
          >
            Sub-Second Discovery. <br />
            <span className="font-dm-serif italic font-normal text-emerald-400">
              Perpetuals Settled in Arc USDC.
            </span>
          </motion.h1>

          {/* Subtitle (Bigger font, larger line-height) */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-2xl text-white/60 max-w-3xl font-light leading-relaxed mb-12"
          >
            ArcMemePerps delivers GMGN-grade mempool trenches intelligence, continuous anti-rug qualification, and bounded dynamic leverage settled natively on Arc Mainnet.
          </motion.p>

          {/* Action CTAs (Bigger buttons) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-5 mb-20"
          >
            <Link
              to="/memes"
              className="px-9 py-4 rounded-xl text-base font-extrabold text-black bg-emerald-400 hover:bg-emerald-300 transition-all shadow-[0_0_30px_rgba(52,211,153,0.45)] hover:scale-[1.02] flex items-center gap-2.5"
            >
              <span>Launch Memes Terminal</span>
              <span className="text-base font-bold">→</span>
            </Link>

            <Link
              to="/markets"
              className="px-8 py-4 rounded-xl text-base font-semibold text-white bg-white/5 border border-white/15 hover:bg-white/10 hover:border-white/30 transition-all hover:scale-[1.02]"
            >
              Explore 166+ Live Markets
            </Link>

            <Link
              to="/proof"
              className="px-7 py-4 rounded-xl text-base font-semibold text-white/70 hover:text-white transition-all flex items-center gap-2"
            >
              <span>Verify On-Chain Proof</span>
              <span className="text-sm font-bold">↗</span>
            </Link>
          </motion.div>

          {/* Live Preview Ribbon (Bigger cards & metrics) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="w-full max-w-6xl rounded-2xl border border-white/12 bg-black/40 p-6 md:p-8 backdrop-blur-md shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-5 mb-5">
              <div className="flex items-center gap-3.5">
                <span className="text-sm font-mono uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE ARC MAINNET PAIRS
                </span>
                <span className="text-sm text-white/50 hidden sm:inline">Automatic Anti-Rug Radar</span>
              </div>
              <Link to="/markets" className="text-sm font-mono text-white/60 hover:text-emerald-400 transition-all font-semibold">
                View All 166 Markets →
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
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
                    className="p-4 rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.08] hover:border-emerald-500/40 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="font-bold text-base text-white group-hover:text-emerald-400 transition-colors">${m.symbol}</span>
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${isPos ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                        {formatPercentBps(m.priceChange24hBps ?? 0)}
                      </span>
                    </div>
                    <div className="text-xl md:text-2xl font-mono font-bold text-white mb-2">
                      {formatUsd(m.priceUsd ?? "0")}
                    </div>
                    <div className="flex items-center justify-between text-xs text-white/50">
                      <span>Liq: {formatUsd(m.originSpotLiquidityUsd ?? "0")}</span>
                      <span className="text-emerald-400/90 font-mono text-[11px] font-semibold">DEX LIVE</span>
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

      {/* 4. Arc Protocol Institutional Metrics Section (Bigger cards & fonts) */}
      <section className="py-20 md:py-32 px-6 md:px-12 lg:px-[120px] w-full border-t border-white/10 bg-transparent">
        <div className="w-full max-w-[1440px] mx-auto">
          <div className="mb-16 text-center max-w-3xl mx-auto">
            <span className="text-xs md:text-sm font-mono uppercase tracking-widest text-emerald-400 mb-3 block font-bold">
              VERIFIED ARCHITECTURE
            </span>
            <h2 className="text-4xl md:text-6xl font-sans font-medium tracking-tight leading-tight mb-5">
              Built for High-Throughput <br />
              <span className="font-dm-serif italic font-normal text-emerald-400">Deterministic Solvency</span>
            </h2>
            <p className="text-white/60 text-base md:text-lg leading-relaxed">
              Every perpetual transaction is verified against live Arc Mainnet RPC nodes, backed by real Arc USDC, and bounded to preserve LP vault stability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-8 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm flex flex-col">
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider mb-3 font-bold">01 · TRENCHES RADAR</span>
              <h3 className="text-2xl font-semibold text-white mb-3">Sub-Second Discovery</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                Indexes new Arc DEX pairs at creation block with instant dev holding percentage, cluster detection, and liquidity lock inspection.
              </p>
            </div>

            <div className="p-8 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm flex flex-col">
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider mb-3 font-bold">02 · RISK MODEL 0.4.0</span>
              <h3 className="text-2xl font-semibold text-white mb-3">Dynamic Capacity</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                Replaces uncapped toxic leverage with mathematical depth ceilings. Safe open interest scales deterministically with real spot orderbook liquidity.
              </p>
            </div>

            <div className="p-8 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm flex flex-col">
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider mb-3 font-bold">03 · NATIVE ARC USDC</span>
              <h3 className="text-2xl font-semibold text-white mb-3">100% Backed Clearing</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                All collateral, margin, and realized PnL settle in native Arc USDC (0x3600...0000). Zero synthetic IOUs, zero bridging friction.
              </p>
            </div>

            <div className="p-8 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm flex flex-col">
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider mb-3 font-bold">04 · DORAHACKS PROOF</span>
              <h3 className="text-2xl font-semibold text-white mb-3">Verifiable Pre-Trade Plans</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                Every order generates a deterministic sha256 plan hash verified before signing. What you inspect in the browser is exactly what the keeper executes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Interactive Terminal Preview Showcase (Bigger) */}
      <section className="py-20 md:py-32 px-6 md:px-12 lg:px-[120px] w-full border-t border-white/10 bg-transparent">
        <div className="w-full max-w-[1440px] mx-auto">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-16">
            <div className="max-w-xl">
              <span className="text-xs md:text-sm font-mono uppercase tracking-widest text-emerald-400 mb-3 block font-bold">
                TERMINAL EXPERIENCE
              </span>
              <h2 className="text-4xl md:text-6xl font-sans font-medium tracking-tight leading-tight mb-6">
                Trade Meme Perps Like a Pro, <br />
                <span className="font-dm-serif italic font-normal text-emerald-400">
                  Without Leaving the Trenches.
                </span>
              </h2>
              <p className="text-white/60 text-base md:text-lg leading-relaxed mb-10">
                GMGN-style unified board, 1-click buy/sell, automated take-profit and stop-loss, and high-frequency live candlestick charting designed for degen speed with institutional risk limits.
              </p>

              <div className="flex flex-col gap-5">
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm font-bold mt-0.5">✓</div>
                  <div>
                    <strong className="text-base text-white block">Instant 1-Click Execution</strong>
                    <span className="text-sm text-white/60">Execute bounded market and limit orders directly from your connected browser wallet.</span>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm font-bold mt-0.5">✓</div>
                  <div>
                    <strong className="text-base text-white block">Anti-Rug Passport Forensics</strong>
                    <span className="text-sm text-white/60">Comprehensive check of mint authority, freeze authority, LP lock, and top 10 holder concentration.</span>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm font-bold mt-0.5">✓</div>
                  <div>
                    <strong className="text-base text-white block">18.4% APY ALP Liquidity Vault</strong>
                    <span className="text-sm text-white/60">Stake Arc USDC to earn 70% of perpetual trading fees and liquidation penalties.</span>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex gap-5">
                <Link
                  to="/trenches"
                  className="px-8 py-3.5 rounded-xl text-sm font-bold text-black bg-emerald-400 hover:bg-emerald-300 transition-all shadow-[0_0_20px_rgba(52,211,153,0.35)]"
                >
                  Open Live Terminal →
                </Link>
                <Link
                  to="/earn"
                  className="px-8 py-3.5 rounded-xl text-sm font-semibold text-white border border-white/15 hover:bg-white/10 transition-all"
                >
                  Deposit to ALP Pool
                </Link>
              </div>
            </div>

            {/* Terminal Mockup Card (Bigger) */}
            <div className="w-full lg:w-1/2 rounded-2xl border border-white/12 bg-[#0c1015]/90 p-6 md:p-8 shadow-2xl overflow-hidden font-mono text-sm backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full bg-rose-500/70" />
                  <span className="w-3 h-3 rounded-full bg-amber-500/70" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
                  <span className="text-white/50 ml-2 font-mono text-xs">terminal.arcmemeperps.io · $ARCPUP-PERP</span>
                </div>
                <span className="px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-400 text-xs font-bold">LIVE FEED</span>
              </div>

              <div className="grid grid-cols-3 gap-3.5 mb-5">
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/8">
                  <span className="text-xs text-white/50 block mb-1">Oracle Price</span>
                  <span className="text-base font-bold text-emerald-400">$0.01248</span>
                </div>
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/8">
                  <span className="text-xs text-white/50 block mb-1">24h Change</span>
                  <span className="text-base font-bold text-emerald-400">+8.42%</span>
                </div>
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/8">
                  <span className="text-xs text-white/50 block mb-1">Safe Capacity</span>
                  <span className="text-base font-bold text-white">$100,000</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-black/60 border border-white/8 mb-5">
                <div className="flex justify-between text-xs mb-2.5 text-white/70">
                  <span>Execution Route</span>
                  <span className="text-emerald-400 font-semibold">Arc Mainnet Direct Mempool (38ms)</span>
                </div>
                <div className="flex justify-between text-xs mb-2.5 text-white/70">
                  <span>Settlement</span>
                  <span className="text-white font-semibold">Arc USDC (0x3600...0000)</span>
                </div>
                <div className="flex justify-between text-xs text-white/70">
                  <span>Integrity Status</span>
                  <span className="text-emerald-400 font-bold">QUALIFIED · FAIL-CLOSED ACTIVE</span>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-center text-emerald-400 font-extrabold text-sm">
                  BUY / LONG 5x
                </div>
                <div className="flex-1 p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-center text-rose-400 font-extrabold text-sm">
                  SELL / SHORT 5x
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Call to Action Banner (Bigger) */}
      <section className="py-24 px-6 md:px-12 lg:px-[120px] w-full border-t border-white/10 bg-gradient-to-b from-transparent to-emerald-950/20 text-center">
        <div className="max-w-4xl mx-auto">
          <span className="text-xs md:text-sm font-mono uppercase tracking-widest text-emerald-400 mb-4 block font-bold">
            GET STARTED NOW
          </span>
          <h2 className="text-4xl md:text-6xl font-sans font-medium tracking-tight mb-6">
            Step Into the Next Generation of <br />
            <span className="font-dm-serif italic font-normal text-emerald-400">
              Arc Meme Perpetuals.
            </span>
          </h2>
          <p className="text-white/60 text-lg md:text-xl leading-relaxed mb-10 max-w-2xl mx-auto font-light">
            Connect your Web3 wallet and trade with institutional confidence on Arc Mainnet.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <Link
              to="/memes"
              className="px-10 py-4 rounded-xl text-base font-extrabold text-black bg-emerald-400 hover:bg-emerald-300 transition-all shadow-[0_0_35px_rgba(52,211,153,0.45)] hover:scale-[1.02]"
            >
              Launch Memes Terminal →
            </Link>
            <Link
              to="/markets"
              className="px-9 py-4 rounded-xl text-base font-semibold text-white bg-white/5 border border-white/15 hover:bg-white/10 hover:border-white/30 transition-all hover:scale-[1.02]"
            >
              Browse All Markets
            </Link>
          </div>
        </div>
      </section>

      {/* 7. Institutional Footer (Bigger) */}
      <footer className="w-full border-t border-white/10 bg-black/60 backdrop-blur-sm py-14 px-6 md:px-12 lg:px-[120px] text-sm text-white/50">
        <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3.5">
            <div className="w-8 h-8 rounded-lg bg-white border border-white/20 p-1.5 flex items-center justify-center shadow-sm">
              <img src="/cluster-logo.svg" alt="CLUSTER" className="w-full h-full object-contain" />
            </div>
            <span className="font-bold text-white text-base">ArcMemePerps</span>
            <span className="text-white/30">·</span>
            <span className="font-mono text-xs text-white/70">ARC MAINNET (5042)</span>
          </div>

          <div className="flex flex-wrap items-center gap-8 text-white/70 font-medium">
            <Link to="/memes" className="hover:text-white transition-colors">Memes</Link>
            <Link to="/markets" className="hover:text-white transition-colors">Markets</Link>
            <Link to="/portfolio" className="hover:text-white transition-colors">Portfolio</Link>
            <Link to="/earn" className="hover:text-white transition-colors">Earn LP</Link>
            <Link to="/competitions" className="hover:text-white transition-colors">Competitions</Link>
            <Link to="/proof" className="hover:text-white transition-colors">Proof</Link>
            <Link to="/settings" className="hover:text-white transition-colors">Settings</Link>
          </div>

          <div className="text-white/40 text-xs font-mono">
            Built for Arc Microgrants 2 · DoraHacks Provenance
          </div>
        </div>
      </footer>
    </div>
  );
}
