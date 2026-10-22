#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  dispatchMultiChannelAlert,
  type AlertPayload,
} from "@arcmemeperps/providers";

interface MarketItem {
  readonly marketId: string;
  readonly symbol?: string;
  readonly baseSymbol?: string;
  readonly name?: string;
  readonly baseName?: string;
  readonly chain?: string;
  readonly originChain?: string;
  readonly originSpotLiquidityUsd?: string;
  readonly volume24hUsd?: string;
  readonly poolAddress?: string;
  isQuarantined?: boolean;
  quarantineReason?: string;
}

interface StoredPosition {
  readonly id: string;
  readonly symbol: string;
  readonly marketId: string;
  readonly collateral: string;
  readonly size: string;
  readonly side: string;
}

interface KeeperState {
  lastRun: string;
  totalCycles: number;
  quarantinedCount: number;
  quarantinedSymbols: Record<string, { reason: string; quarantinedAt: string }>;
  settledPositions: Array<{
    positionId: string;
    symbol: string;
    preservedCollateral: string;
    reason: string;
    timestamp: string;
  }>;
}

const STATE_FILE = resolve(process.cwd(), "evidence/keeper-state.json");
const SNAPSHOT_FILE = resolve(process.cwd(), "evidence/winner-rebuild/discovery-snapshot.json");

function loadState(): KeeperState {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as KeeperState;
    } catch {
      // fallback
    }
  }
  return {
    lastRun: new Date().toISOString(),
    totalCycles: 0,
    quarantinedCount: 0,
    quarantinedSymbols: {},
    settledPositions: [],
  };
}

function saveState(state: KeeperState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

function loadMarkets(): MarketItem[] {
  if (existsSync(SNAPSHOT_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(SNAPSHOT_FILE, "utf-8")) as {
        markets?: MarketItem[];
        items?: MarketItem[];
      };
      return parsed.markets || parsed.items || [];
    } catch {
      // fallback
    }
  }
  return [];
}

export async function runKeeperCycle(options: { dryRun?: boolean } = {}): Promise<{
  quarantinedThisCycle: number;
  settledThisCycle: number;
  alertsSent: number;
}> {
  const state = loadState();
  const markets = loadMarkets();

  let quarantinedThisCycle = 0;
  let settledThisCycle = 0;
  let alertsSent = 0;

  console.log(`[ARC SAFETY KEEPER] Scanning ${markets.length} registered markets for rug risks...`);

  for (const market of markets) {
    const liq = Number(market.originSpotLiquidityUsd || "0");
    const vol = Number(market.volume24hUsd || "0");

    const isDrained = liq < 1000;
    const isWashTrading = vol > 0 && liq > 0 && vol / liq > 300 && liq < 25000;
    const isEndangered = isDrained || isWashTrading;

    if (isEndangered) {
      const reason = isDrained
        ? `Liquidity Floor Breach ($${liq.toFixed(2)} < $1,000 floor)`
        : `Wash Trading Bot Farm (${(vol / liq).toFixed(0)}x Vol/Liq)`;

      const symbol = (market.symbol || market.baseSymbol || "UNKNOWN").toUpperCase();
      const name = market.name || market.baseName;
      const chain = market.chain || market.originChain || "Solana";

      if (!state.quarantinedSymbols[symbol]) {
        quarantinedThisCycle++;
        state.quarantinedSymbols[symbol] = {
          reason,
          quarantinedAt: new Date().toISOString(),
        };

        console.log(`[QUARANTINE ENFORCED] $${symbol}: ${reason}`);

        const alert: AlertPayload = {
          symbol,
          name,
          chain,
          poolAddress: market.poolAddress,
          reason,
          severity: "CRITICAL",
          type: "TOKEN_QUARANTINED",
          liquidityUsd: liq,
          volume24hUsd: vol,
          url: `https://arcmemeperps.vercel.app/trade/${encodeURIComponent(market.marketId)}`,
        };

        const result = await dispatchMultiChannelAlert(alert, { dryRun: options.dryRun });
        if (result.telegram || result.discord) {
          alertsSent++;
        }
      }
    }
  }

  state.totalCycles++;
  state.lastRun = new Date().toISOString();
  state.quarantinedCount = Object.keys(state.quarantinedSymbols).length;

  saveState(state);

  console.log(
    `[ARC SAFETY KEEPER COMPLETE] Cycles: ${state.totalCycles} | Quarantined Total: ${state.quarantinedCount} | New Flags: ${quarantinedThisCycle}`
  );

  return { quarantinedThisCycle, settledThisCycle, alertsSent };
}

async function main() {
  const args = process.argv.slice(2);
  const isLoop = args.includes("--loop");
  const isOnce = args.includes("--once") || !isLoop;
  const dryRun = args.includes("--dry-run");

  const intervalArg = args.find((a) => a.startsWith("--interval="));
  const rawInterval = intervalArg?.split("=")[1];
  const intervalSec = rawInterval ? parseInt(rawInterval, 10) : 15;

  console.log(`=======================================================`);
  console.log(`🛡️  ArcMemePerps 24/7 Standalone Anti-Rug Keeper Bot  🛡️`);
  console.log(`Mode: ${isLoop ? `Continuous Loop (${intervalSec}s)` : "Single Execution"}`);
  console.log(`Dry-run: ${dryRun}`);
  console.log(`=======================================================\n`);

  if (isOnce) {
    await runKeeperCycle({ dryRun });
    process.exit(0);
  }

  // Loop mode
  await runKeeperCycle({ dryRun });
  setInterval(async () => {
    try {
      await runKeeperCycle({ dryRun });
    } catch (err) {
      console.error("[KEEPER_ERROR]", err);
    }
  }, intervalSec * 1000);
}

if (process.argv[1]?.includes("standalone-keeper-service")) {
  main().catch((err) => {
    console.error("Fatal keeper error:", err);
    process.exit(1);
  });
}
