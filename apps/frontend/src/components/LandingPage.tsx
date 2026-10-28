import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { StatsSection } from "./StatsSection";
import type { OriginMarket } from "../lib/winner-types";
import { formatPercentBps, formatUsd } from "../lib/winner-format";

interface LandingPageProps {
  markets?: OriginMarket[];
}

export function LandingPage({ markets = [] }: LandingPageProps) {
  const previewMarkets = markets.slice(0, 4);

  return (
    <div className="landing-page-pattern-bg font-sans text-white min-h-screen selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* 1. Floating Header Navigation (Clean, compact, no black background, floating directly on texture) */}
      <header className="sticky top-0 z-50 w-full bg-transparent border-none py-1">
        <div className="max-w-[1440px] mx-auto px-6 md:px-12 lg:px-[120px] h-14 flex items-center justify-between">
          <div className="flex items-center gap-7">
            <Link to="/markets" className="flex items-center gap-2.5 group">
              <div className="w-7 h-7 rounded-lg bg-white border border-white/20 flex items-center justify-center p-1 transition-all group-hover:scale-105 shadow-sm">
                <img src="/cluster-logo.svg" alt="CLUSTER Logo" className="w-full h-full object-contain" />
              </div>
              <span className="font-sans font-bold text-sm tracking-wider text-white">CLUSTER</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <Link to="/memes" className="px-3 py-1 rounded-md text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all">
                Memes
              </Link>
              <Link to="/trending" className="px-3 py-1 rounded-md text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all">
                Trending
              </Link>
              <Link to="/markets" className="px-3 py-1 rounded-md text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all">
                Markets
              </Link>
              <Link to="/earn" className="px-3 py-1 rounded-md text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-all flex items-center gap-1.5">
                <span>ALP Earn</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">Status unavailable</span>
              </Link>
              <Link to="/competitions" className="px-3 py-1 rounded-md text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all">
                Competitions
              </Link>
              <Link to="/proof" className="px-3 py-1 rounded-md text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all">
                Proof
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Smaller header buttons floating cleanly on the background */}
            <Link
              to="/markets"
              className="px-3 py-1.5 rounded-md text-xs font-medium text-white/80 border border-white/12 bg-white/[0.04] backdrop-blur-xs hover:bg-white/10 hover:border-white/30 transition-all"
            >
              Explore
            </Link>

            <Link
              to="/memes"
              className="px-3.5 py-1.5 rounded-md text-xs font-medium text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 hover:border-emerald-400/50 transition-all flex items-center gap-1.5"
            >
              <span>Open Markets</span>
              <span className="text-xs">→</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Hero Section (Shifted upwards towards the top of landing) */}
      <section className="relative pt-3 md:pt-8 pb-20 px-6 md:px-12 lg:px-[120px] overflow-hidden">
        {/* Glow ambient background aura */}
        <div className="absolute top-16 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[350px] bg-emerald-500/10 blur-[160px] pointer-events-none rounded-full" />
        <div className="absolute top-24 right-1/4 w-[500px] h-[300px] bg-cyan-500/8 blur-[140px] pointer-events-none rounded-full" />

        <div className="max-w-[1440px] mx-auto relative z-10 flex flex-col items-center text-center">
          {/* Main Headline (Bigger & commanding) */}
          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-6xl sm:text-7xl md:text-8xl lg:text-[96px] font-sans font-medium tracking-tight leading-[1.03] max-w-6xl mb-7 text-white mt-0"
          >
            Arc Market Discovery. <br />
            <span className="font-dm-serif italic font-normal text-emerald-400">
              Trading Unavailable.
            </span>
          </motion.h1>

          {/* Subtitle (Bigger font, larger line-height) */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl md:text-2xl text-white/65 max-w-4xl font-light leading-relaxed mb-12"
          >
            Market records appear only when returned by a configured provider. Live qualification, trading, and liquidity deposits are unavailable until their production data and transaction paths are verified.
          </motion.p>

          {/* Action CTAs (Bigger, refined, lower contrast) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-5 mb-20"
          >
            <Link
              to="/memes"
              className="px-9 py-4 rounded-xl text-lg font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/35 hover:bg-emerald-500/25 hover:border-emerald-400/60 transition-all hover:scale-[1.01] flex items-center gap-2.5 backdrop-blur-sm"
            >
              <span>Open Markets</span>
              <span className="text-lg">→</span>
            </Link>

            <Link
              to="/markets"
              className="px-9 py-4 rounded-xl text-lg font-medium text-white/80 bg-white/[0.04] border border-white/12 hover:bg-white/10 hover:border-white/25 transition-all hover:scale-[1.01] backdrop-blur-sm"
            >
              Browse Available Records
            </Link>

            <Link
              to="/proof"
              className="px-7 py-4 rounded-xl text-lg font-medium text-white/60 hover:text-white transition-all flex items-center gap-2"
            >
              <span>View Release Status</span>
              <span className="text-base">↗</span>
            </Link>
          </motion.div>

          {/* Live Preview Ribbon (Bigger cards & metrics) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="w-full max-w-6xl rounded-2xl border border-white/12 bg-black/40 p-7 md:p-9 backdrop-blur-md shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-5 mb-5">
              <div className="flex items-center gap-3.5">
                <span className="text-sm font-mono uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  MARKET RECORDS
                </span>
                <span className="text-sm text-white/50 hidden sm:inline">Provider status is shown per record</span>
              </div>
              <Link to="/markets" className="text-sm font-mono text-white/60 hover:text-emerald-400 transition-all font-semibold">
                View Available Markets →
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
              {previewMarkets.length > 0 ? previewMarkets.map((m) => {
                const isPos = m.priceChange24hBps != null && m.priceChange24hBps >= 0;
                return (
                  <Link
                    key={m.marketId}
                    to={`/markets/${encodeURIComponent(m.marketId)}`}
                    className="p-5 rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.08] hover:border-emerald-500/40 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold text-lg text-white group-hover:text-emerald-400 transition-colors">${m.symbol}</span>
                      <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded ${m.priceChange24hBps == null ? "bg-white/5 text-white/50" : isPos ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                        {m.priceChange24hBps == null ? "Unavailable" : formatPercentBps(m.priceChange24hBps)}
                      </span>
                    </div>
                    <div className="text-2xl md:text-3xl font-mono font-bold text-white mb-2.5">
                      {m.priceUsd == null ? "Unavailable" : formatUsd(m.priceUsd)}
                    </div>
                    <div className="flex items-center justify-between text-sm text-white/50">
                      <span>Liq: {m.originSpotLiquidityUsd == null ? "Unavailable" : formatUsd(m.originSpotLiquidityUsd)}</span>
                      <span className="text-white/50 font-mono text-xs font-semibold">{m.providerState.status}</span>
                    </div>
                  </Link>
                );
              }) : <div className="col-span-full rounded-xl border border-white/8 bg-white/[0.03] p-5 text-center text-sm text-white/50">No current market records are available from the configured provider.</div>}
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
              CURRENT STATUS
            </span>
            <h2 className="text-4xl md:text-6xl lg:text-7xl font-sans font-medium tracking-tight leading-tight mb-5">
              Protocol Readiness <br />
              <span className="font-dm-serif italic font-normal text-emerald-400">Live status unavailable</span>
            </h2>
            <p className="text-white/60 text-lg md:text-xl leading-relaxed">
              A production market feed, live qualification reads, and verified transaction receipt path are not connected. Trading and liquidity deposits remain disabled.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-9 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm flex flex-col">
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider mb-3 font-bold">01 · MARKET DATA</span>
              <h3 className="text-2xl md:text-3xl font-semibold text-white mb-3.5">Provider-backed records</h3>
              <p className="text-base text-white/60 leading-relaxed">
                Market data is only displayed when returned by the configured provider. Creation-block indexing and independent token-risk checks are unavailable here.
              </p>
            </div>

            <div className="p-9 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm flex flex-col">
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider mb-3 font-bold">02 · QUALIFICATION</span>
              <h3 className="text-2xl md:text-3xl font-semibold text-white mb-3.5">No qualified markets</h3>
              <p className="text-base text-white/60 leading-relaxed">
                No current market qualification proof is available, so leverage and position capacity are not enabled.
              </p>
            </div>

            <div className="p-9 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm flex flex-col">
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider mb-3 font-bold">03 · VAULT</span>
              <h3 className="text-2xl md:text-3xl font-semibold text-white mb-3.5">Vault status unavailable</h3>
              <p className="text-base text-white/60 leading-relaxed">
                Vault balances, utilization, and settlement receipts are not currently available from a verified live read path.
              </p>
            </div>

            <div className="p-9 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm flex flex-col">
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider mb-3 font-bold">04 · ORDER PATH</span>
              <h3 className="text-2xl md:text-3xl font-semibold text-white mb-3.5">Transaction path unavailable</h3>
              <p className="text-base text-white/60 leading-relaxed">
                Local plan hashes can identify order parameters. A verified write, receipt, and keeper reconciliation path is not connected.
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
                Market and risk status, <br />
                <span className="font-dm-serif italic font-normal text-emerald-400">
                  in one terminal.
                </span>
              </h2>
              <p className="text-white/60 text-lg leading-relaxed mb-10">
                Market charts display only provider-backed observations. Order execution, automated position controls, and live risk monitoring are unavailable.
              </p>

              <div className="flex flex-col gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm font-bold mt-0.5">✓</div>
                  <div>
                    <strong className="text-lg text-white block">Trading unavailable</strong>
                    <span className="text-base text-white/60">Market and limit order submission stays disabled until a verified write and receipt path is connected.</span>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm font-bold mt-0.5">✓</div>
                  <div>
                    <strong className="text-lg text-white block">Risk evidence unavailable</strong>
                    <span className="text-base text-white/60">Token authority, liquidity lock, and holder data require current, independently verifiable provider evidence.</span>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm font-bold mt-0.5">✓</div>
                  <div>
                    <strong className="text-lg text-white block">LP deposits unavailable</strong>
                    <span className="text-base text-white/60">Vault balance, yield, and withdrawal availability require a verified on-chain read path.</span>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex gap-4">
                <Link
                  to="/memes"
                  className="px-8 py-3.5 rounded-xl text-base font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/35 hover:bg-emerald-500/25 hover:border-emerald-400/60 transition-all flex items-center gap-2"
                >
                  <span>Open Markets</span>
                  <span>→</span>
                </Link>
                <Link
                  to="/earn"
                  className="px-8 py-3.5 rounded-xl text-base font-medium text-white/80 border border-white/12 bg-white/[0.04] hover:bg-white/10 transition-all"
                >
                  View LP Status
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
                  <span className="text-white/50 ml-2 font-mono text-xs">Cluster terminal · market preview</span>
                </div>
                <span className="px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-400 text-xs font-bold">PREVIEW ONLY</span>
              </div>

              <div className="grid grid-cols-3 gap-3.5 mb-5">
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/8">
                  <span className="text-xs text-white/50 block mb-1">Oracle Price</span>
                  <span className="text-base font-bold text-emerald-400">Unavailable</span>
                </div>
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/8">
                  <span className="text-xs text-white/50 block mb-1">24h Change</span>
                  <span className="text-base font-bold text-emerald-400">Unavailable</span>
                </div>
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/8">
                  <span className="text-xs text-white/50 block mb-1">Qualified Capacity</span>
                  <span className="text-base font-bold text-white">Unavailable</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-black/60 border border-white/8 mb-5">
                <div className="flex justify-between text-xs mb-2.5 text-white/70">
                  <span>Execution Route</span>
                  <span className="text-emerald-400 font-semibold">Unavailable</span>
                </div>
                <div className="flex justify-between text-xs mb-2.5 text-white/70">
                  <span>Settlement</span>
                  <span className="text-white font-semibold">USDC · Chain ID 5042</span>
                </div>
                <div className="flex justify-between text-xs text-white/70">
                  <span>Integrity Status</span>
                  <span className="text-emerald-400 font-bold">QUALIFICATION UNAVAILABLE</span>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-center text-emerald-400 font-extrabold text-sm">
                  TRADING UNAVAILABLE
                </div>
                <div className="flex-1 p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-center text-rose-400 font-extrabold text-sm">
                  ORDER PATH NOT VERIFIED
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Call to Action Banner (Bigger & high-impact) */}
      <section className="py-24 px-6 md:px-12 lg:px-[120px] w-full border-t border-white/10 bg-gradient-to-b from-transparent to-emerald-950/20 text-center">
        <div className="max-w-4xl mx-auto">
          <span className="text-xs md:text-sm font-mono uppercase tracking-widest text-emerald-400 mb-4 block font-bold">
            CURRENT STATUS
          </span>
          <h2 className="text-5xl md:text-7xl lg:text-[76px] font-sans font-medium tracking-tight mb-7 leading-[1.05]">
            Step Into the Next Generation of <br />
            <span className="font-dm-serif italic font-normal text-emerald-400">
              Arc Meme Perpetuals.
            </span>
          </h2>
          <p className="text-white/60 text-xl md:text-2xl leading-relaxed mb-12 max-w-3xl mx-auto font-light">
            Connect a wallet to inspect its network. Trading and liquidity deposits remain disabled.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <Link
              to="/memes"
              className="px-10 py-4.5 rounded-xl text-lg font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/35 hover:bg-emerald-500/25 hover:border-emerald-400/60 transition-all hover:scale-[1.01] flex items-center gap-2"
            >
              <span>Open Markets</span>
              <span>→</span>
            </Link>
            <Link
              to="/markets"
              className="px-9 py-4.5 rounded-xl text-lg font-medium text-white/80 bg-white/[0.04] border border-white/12 hover:bg-white/10 hover:border-white/25 transition-all hover:scale-[1.01]"
            >
              View Release Status
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
            <span className="font-bold text-white text-base">CLUSTER</span>
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
            Arc Mainnet prototype · trading and deposits unavailable
          </div>
        </div>
      </footer>
    </div>
  );
}
