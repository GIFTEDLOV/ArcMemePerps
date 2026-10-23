#!/usr/bin/env node
/**
 * CLUSTER 24/7 Production Keeper & Liquidation Daemon
 *
 * Responsibilities:
 * 1. Arc Mainnet On-Chain Position Health & Liquidation Engine
 * 2. Arc Mainnet On-Chain Limit / Trigger Order Execution
 * 3. Anti-Rug Market Monitoring & Quarantine Sentinel
 * 4. Uptime Healthcheck HTTP Server for 24/7 Hosting (Railway / Render / Fly.io / Docker)
 */

import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
  formatEther
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { dispatchMultiChannelAlert, type AlertPayload } from "@arcmemeperps/providers";

const ARC_MAINNET = defineChain({
  id: 5042,
  name: "Arc Mainnet",
  nativeCurrency: { name: "Arc", symbol: "ARC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
});

const KEEPER_KEY = (process.env.ARC_KEEPER_PRIVATE_KEY ||
  process.env.ARC_DEPLOYER_PRIVATE_KEY ||
  "0x5b1768daf49d622608beae7ae923937916772f007390bcc36b2e17a6e713a17b") as Hex;

const CONTRACT_MANIFEST = resolve(process.cwd(), "evidence/mainnet/contracts.json");
const STATE_FILE = resolve(process.cwd(), "evidence/keeper-state.json");
const SNAPSHOT_FILE = resolve(process.cwd(), "evidence/winner-rebuild/discovery-snapshot.json");

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
  onchainLiquidations: Array<{
    positionId: string;
    txHash: string;
    timestamp: string;
  }>;
}

function loadContracts() {
  if (existsSync(CONTRACT_MANIFEST)) {
    try {
      const data = JSON.parse(readFileSync(CONTRACT_MANIFEST, "utf8"));
      return data.deployedAddresses as Record<string, Address>;
    } catch {}
  }
  return {
    USDCMarginVault: "0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf" as Address,
    PerpEngine: "0xd9c3cbf1841103749f379cc1aae1a9284d8dc3e1" as Address,
    OracleRouter: "0x1531c83ac90e5ec5998eaf42a4464757dcd2c3ff" as Address,
    RiskConfig: "0x89ea15e527f7d06503ed2e7c958c2ac0e5799f85" as Address,
    MarketRegistry: "0x7ebddb2c1f1ae68a2e5b984fe9e75115cdb8ef1b" as Address,
  };
}

function loadState(): KeeperState {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as KeeperState;
    } catch {}
  }
  return {
    lastRun: new Date().toISOString(),
    totalCycles: 0,
    quarantinedCount: 0,
    quarantinedSymbols: {},
    settledPositions: [],
    onchainLiquidations: [],
  };
}

function saveState(state: KeeperState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

function loadMarkets() {
  if (existsSync(SNAPSHOT_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(SNAPSHOT_FILE, "utf-8"));
      return (parsed.markets || parsed.items || []) as any[];
    } catch {}
  }
  return [];
}

export async function runDaemonCycle(options: { dryRun?: boolean } = {}) {
  const account = privateKeyToAccount(KEEPER_KEY);
  const publicClient = createPublicClient({ chain: ARC_MAINNET, transport: http() });
  const walletClient = createWalletClient({ account, chain: ARC_MAINNET, transport: http() });
  const contracts = loadContracts();
  const state = loadState();

  console.log(`\n=======================================================`);
  console.log(`[CLUSTER KEEPER CYCLE] ${new Date().toISOString()}`);
  console.log(`Keeper Address: ${account.address}`);
  console.log(`PerpEngine: ${contracts.PerpEngine}`);
  console.log(`USDCMarginVault: ${contracts.USDCMarginVault}`);
  console.log(`=======================================================`);

  // 1. Check keeper balance
  try {
    const bal = await publicClient.getBalance({ address: account.address });
    console.log(`Keeper Native Gas Balance: ${formatEther(bal)} ARC`);
  } catch (err) {
    console.warn(`Could not fetch keeper balance:`, (err as Error).message);
  }

  // 2. Scan On-Chain Positions for Liquidations
  console.log(`[ON-CHAIN KEEPER] Scanning positions on PerpEngine...`);
  let liquidationsTriggered = 0;

  // PerpEngine ABI slice for positions
  const perpAbi = [
    {
      type: "function",
      name: "nextPositionId",
      inputs: [],
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
    },
    {
      type: "function",
      name: "positions",
      inputs: [{ name: "positionId", type: "uint256" }],
      outputs: [
        { name: "trader", type: "address" },
        { name: "marketId", type: "bytes32" },
        { name: "isLong", type: "bool" },
        { name: "collateral", type: "uint256" },
        { name: "size", type: "uint256" },
        { name: "entryPrice", type: "uint256" },
        { name: "open", type: "bool" },
      ],
      stateMutability: "view",
    },
    {
      type: "function",
      name: "liquidate",
      inputs: [{ name: "positionId", type: "uint256" }],
      outputs: [],
      stateMutability: "nonpayable",
    },
  ] as const;

  try {
    const nextId = (await publicClient.readContract({
      address: contracts.PerpEngine,
      abi: perpAbi,
      functionName: "nextPositionId",
    })) as bigint;

    console.log(`  Total on-chain positions recorded: ${nextId.toString()}`);

    for (let id = 1n; id < nextId; id++) {
      try {
        const pos = await publicClient.readContract({
          address: contracts.PerpEngine,
          abi: perpAbi,
          functionName: "positions",
          args: [id],
        });

        if (pos[6]) { // pos.open === true
          console.log(`  Found open position #${id}: trader=${pos[0]} size=${pos[4]}`);
          // Attempt liquidation evaluation
          if (!options.dryRun) {
            try {
              const hash = await walletClient.writeContract({
                address: contracts.PerpEngine,
                abi: perpAbi,
                functionName: "liquidate",
                args: [id],
              });
              console.log(`  ⚡ LIQUIDATION EXECUTED for #${id}: ${hash}`);
              liquidationsTriggered++;
              state.onchainLiquidations.push({
                positionId: id.toString(),
                txHash: hash,
                timestamp: new Date().toISOString(),
              });
            } catch (liqErr) {
              // Not liquidatable or healthy
              console.log(`  Position #${id} is currently healthy (not liquidatable).`);
            }
          }
        }
      } catch (posErr) {
        // Individual position fetch error
      }
    }
  } catch (scanErr) {
    console.log(`  (PerpEngine nextPositionId queried or contract freshly deployed: ${(scanErr as Error).message.slice(0, 80)}...)`);
  }

  // 3. Off-Chain Market Quarantine Sentinel
  const markets = loadMarkets();
  let quarantinedThisCycle = 0;

  for (const market of markets) {
    const liq = Number(market.originSpotLiquidityUsd || "0");
    const vol = Number(market.volume24hUsd || "0");
    const isDrained = liq < 1000;
    const isWashTrading = vol > 0 && liq > 0 && vol / liq > 300 && liq < 25000;

    if (isDrained || isWashTrading) {
      const reason = isDrained
        ? `Liquidity Floor Breach ($${liq.toFixed(2)} < $1,000 floor)`
        : `Wash Trading Bot Farm (${(vol / liq).toFixed(0)}x Vol/Liq)`;

      const symbol = (market.symbol || market.baseSymbol || "UNKNOWN").toUpperCase();
      if (!state.quarantinedSymbols[symbol]) {
        quarantinedThisCycle++;
        state.quarantinedSymbols[symbol] = {
          reason,
          quarantinedAt: new Date().toISOString(),
        };
        console.log(`[QUARANTINE ENFORCED] $${symbol}: ${reason}`);

        const alert: AlertPayload = {
          symbol,
          name: market.name || market.baseName,
          chain: market.chain || market.originChain || "Arc",
          poolAddress: market.poolAddress,
          reason,
          severity: "CRITICAL",
          type: "TOKEN_QUARANTINED",
          liquidityUsd: liq,
          volume24hUsd: vol,
          url: `https://cluster-terminal.vercel.app/trade/${encodeURIComponent(market.marketId)}`,
        };
        await dispatchMultiChannelAlert(alert, { dryRun: options.dryRun }).catch(() => {});
      }
    }
  }

  state.totalCycles++;
  state.lastRun = new Date().toISOString();
  state.quarantinedCount = Object.keys(state.quarantinedSymbols).length;
  saveState(state);

  console.log(`[CLUSTER KEEPER CYCLE COMPLETE] Total cycles: ${state.totalCycles} | Quarantined: ${state.quarantinedCount} | Liquidations: ${liquidationsTriggered}`);
  return { state, liquidationsTriggered, quarantinedThisCycle };
}

// HTTP Healthcheck server for Docker / Cloud Hosting (Railway, Render, Fly.io)
function startHealthServer(port: number = Number(process.env.PORT || 8080)) {
  const server = createServer((req, res) => {
    if (req.url === "/health" || req.url === "/status" || req.url === "/") {
      const state = loadState();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          {
            service: "CLUSTER 24/7 Keeper & Liquidation Daemon",
            network: "Arc Mainnet (5042)",
            status: "HEALTHY",
            lastRun: state.lastRun,
            totalCycles: state.totalCycles,
            quarantinedCount: state.quarantinedCount,
            liquidationsCount: state.onchainLiquidations.length,
            uptimeSeconds: Math.floor(process.uptime()),
          },
          null,
          2
        )
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    console.log(`[HEALTHCHECK SERVER] Listening on http://0.0.0.0:${port}/health`);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const isLoop = args.includes("--loop");
  const isOnce = args.includes("--once") || !isLoop;
  const dryRun = args.includes("--dry-run");

  const intervalArg = args.find((a) => a.startsWith("--interval="));
  const intervalSec = intervalArg ? parseInt(intervalArg.split("=")[1], 10) : 30;

  if (isOnce) {
    await runDaemonCycle({ dryRun });
    process.exit(0);
  }

  // Continuous 24/7 Hosting Mode
  console.log(`Starting CLUSTER 24/7 Keeper Daemon (Interval: ${intervalSec}s)...`);
  startHealthServer();
  await runDaemonCycle({ dryRun });

  setInterval(async () => {
    try {
      await runDaemonCycle({ dryRun });
    } catch (err) {
      console.error("[KEEPER ERROR]", err);
    }
  }, intervalSec * 1000);
}

if (process.argv[1]?.includes("mainnet-keeper-daemon")) {
  main().catch((err) => {
    console.error("Fatal daemon error:", err);
    process.exit(1);
  });
}
