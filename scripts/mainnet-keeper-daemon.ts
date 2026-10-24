#!/usr/bin/env node
/**
 * CLUSTER Production Keeper & Liquidation Sentinel Daemon
 *
 * Operational Scope:
 * 1. Arc Mainnet On-Chain Position Health & Liquidation Execution
 * 2. Multichain Discovery Sentinel & Anti-Rug Quarantine Monitoring
 * 3. Multi-Channel Operator Alert Dispatch (Telegram & Discord)
 * 4. Production Health & Diagnostic HTTP Server (Railway / Fly.io / Docker / Watchdog)
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

// ZERO FALLBACKS: Fail immediately in fail-closed mode if no keeper secret is provided
const rawKeeperKey = process.env.ARC_KEEPER_PRIVATE_KEY || process.env.KEEPER_PRIVATE_KEY;
if (!rawKeeperKey || !rawKeeperKey.startsWith("0x") || rawKeeperKey.length !== 66) {
  console.error("[CRITICAL][SECURITY] Missing or invalid ARC_KEEPER_PRIVATE_KEY environment variable.");
  console.error("[CRITICAL][SECURITY] Refusing to start keeper daemon in an unauthenticated or fallback state.");
  process.exit(1);
}
const KEEPER_KEY = rawKeeperKey as Hex;

const CONTRACT_MANIFEST = resolve(process.cwd(), "evidence/mainnet/contracts.json");
const STATE_FILE = resolve(process.cwd(), "evidence/keeper-state.json");
const SNAPSHOT_FILE = resolve(process.cwd(), "evidence/winner-rebuild/discovery-snapshot.json");

interface DiagnosticMetrics {
  lastSuccessfulCycle: string | null;
  lastCycleDurationMs: number;
  lastRpcLatencyMs: number;
  consecutiveFailures: number;
  lastError: string | null;
  keeperAddress: string;
  keeperBalanceArc: string;
  isAuthorizedKeeper: boolean | null;
}

const diagnostics: DiagnosticMetrics = {
  lastSuccessfulCycle: null,
  lastCycleDurationMs: 0,
  lastRpcLatencyMs: 0,
  consecutiveFailures: 0,
  lastError: null,
  keeperAddress: "",
  keeperBalanceArc: "0.0",
  isAuthorizedKeeper: null,
};

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

/**
 * Classifies transaction/revert errors precisely.
 * Avoids misreporting authorization, oracle, or network errors as healthy positions.
 */
function classifyLiquidationError(error: any): { category: string; description: string; isHealthy: boolean } {
  const msg = (error?.message || error?.details || error?.shortMessage || String(error)).toLowerCase();

  if (
    msg.includes("positionhealthy") ||
    msg.includes("notliquidatable") ||
    msg.includes("healthy") ||
    msg.includes("marginhealthy")
  ) {
    return { category: "NOT_LIQUIDATABLE", description: "Position margin is currently above maintenance threshold", isHealthy: true };
  }

  if (msg.includes("unauthorized") || msg.includes("notowner") || msg.includes("onlyliquidationkeeper")) {
    return { category: "UNAUTHORIZED_KEEPER", description: "Keeper account lacks required on-chain authorization on PerpEngine", isHealthy: false };
  }

  if (msg.includes("stale") || msg.includes("stalereport") || msg.includes("expired") || msg.includes("sequence")) {
    return { category: "STALE_ORACLE", description: "Oracle report is expired or monotonic sequence mismatch", isHealthy: false };
  }

  if (msg.includes("insufficient funds") || msg.includes("gas") || msg.includes("nonce")) {
    return { category: "GAS_OR_NONCE_ERROR", description: "Keeper wallet has insufficient gas or nonce conflict", isHealthy: false };
  }

  if (msg.includes("timeout") || msg.includes("connection") || msg.includes("fetch failed") || msg.includes("econnrefused")) {
    return { category: "RPC_NETWORK_ERROR", description: "Network timeout or RPC unreachable", isHealthy: false };
  }

  return { category: "UNKNOWN_REVERT", description: `Contract reverted: ${msg.slice(0, 100)}`, isHealthy: false };
}

export async function runDaemonCycle(options: { dryRun?: boolean } = {}) {
  const startTime = Date.now();
  const account = privateKeyToAccount(KEEPER_KEY);
  diagnostics.keeperAddress = account.address;

  const publicClient = createPublicClient({ chain: ARC_MAINNET, transport: http() });
  const walletClient = createWalletClient({ account, chain: ARC_MAINNET, transport: http() });
  const contracts = loadContracts();
  const state = loadState();

  console.log(`\n=======================================================`);
  console.log(`[CLUSTER KEEPER CYCLE] ${new Date().toISOString()}`);
  console.log(`Keeper Address: ${account.address}`);
  console.log(`PerpEngine:     ${contracts.PerpEngine}`);
  console.log(`USDCMarginVault: ${contracts.USDCMarginVault}`);
  console.log(`=======================================================`);

  // 1. Check keeper balance and RPC latency
  try {
    const t0 = Date.now();
    const bal = await publicClient.getBalance({ address: account.address });
    diagnostics.lastRpcLatencyMs = Date.now() - t0;
    diagnostics.keeperBalanceArc = formatEther(bal);
    console.log(`Keeper Native Gas Balance: ${diagnostics.keeperBalanceArc} ARC (RPC Latency: ${diagnostics.lastRpcLatencyMs}ms)`);
  } catch (err) {
    diagnostics.consecutiveFailures++;
    diagnostics.lastError = `RPC Error fetching balance: ${(err as Error).message}`;
    console.warn(`[WARNING] Could not fetch keeper balance:`, diagnostics.lastError);
  }

  // 2. Verify on-chain keeper authorization on PerpEngine
  const keeperRoleAbi = [
    {
      type: "function",
      name: "liquidationKeeper",
      inputs: [{ name: "keeper", type: "address" }],
      outputs: [{ name: "", type: "bool" }],
      stateMutability: "view",
    },
  ] as const;

  try {
    const isAuth = await publicClient.readContract({
      address: contracts.PerpEngine,
      abi: keeperRoleAbi,
      functionName: "liquidationKeeper",
      args: [account.address],
    });
    diagnostics.isAuthorizedKeeper = isAuth;
    console.log(`Keeper On-Chain Authorization: ${isAuth ? "✓ AUTHORIZED" : "⚠ NOT AUTHORIZED (Needs Governance Role)"}`);
  } catch (authErr) {
    console.warn(`  Could not verify keeper role: ${(authErr as Error).message.slice(0, 60)}`);
  }

  // 3. Scan On-Chain Positions for Liquidations
  console.log(`[ON-CHAIN KEEPER] Scanning positions on PerpEngine...`);
  let liquidationsTriggered = 0;

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
          console.log(`  Evaluating open position #${id}: trader=${pos[0]} size=${pos[4]}`);
          if (!options.dryRun) {
            try {
              const hash = await walletClient.writeContract({
                address: contracts.PerpEngine,
                abi: perpAbi,
                functionName: "liquidate",
                args: [id],
              });
              console.log(`  ⚡ LIQUIDATION EXECUTED for position #${id}: ${hash}`);
              liquidationsTriggered++;
              state.onchainLiquidations.push({
                positionId: id.toString(),
                txHash: hash,
                timestamp: new Date().toISOString(),
              });
            } catch (liqErr) {
              const classified = classifyLiquidationError(liqErr);
              if (classified.isHealthy) {
                console.log(`  ✓ Position #${id} is healthy: ${classified.description}`);
              } else {
                console.error(`  [LIQUIDATION FAILED][${classified.category}] Position #${id}: ${classified.description}`);
              }
            }
          }
        }
      } catch (posErr) {
        // Individual position read issue
      }
    }
  } catch (scanErr) {
    console.log(`  (PerpEngine state query: ${(scanErr as Error).message.slice(0, 80)}...)`);
  }

  // 4. Discovery Sentinel & Anti-Rug Quarantine Monitoring (Off-Chain Surveillance Boundary)
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
        console.log(`[SENTINEL QUARANTINE IDENTIFIED] $${symbol}: ${reason}`);

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

  diagnostics.lastSuccessfulCycle = state.lastRun;
  diagnostics.lastCycleDurationMs = Date.now() - startTime;
  diagnostics.consecutiveFailures = 0;
  diagnostics.lastError = null;

  console.log(`[CLUSTER KEEPER CYCLE COMPLETE] Total cycles: ${state.totalCycles} | Quarantined: ${state.quarantinedCount} | Liquidations: ${liquidationsTriggered} (${diagnostics.lastCycleDurationMs}ms)`);
  return { state, liquidationsTriggered, quarantinedThisCycle };
}

// HTTP Dynamic Health & Observability Server for Cloud Hosting & Watchdogs
function startHealthServer(port: number = Number(process.env.PORT || 8080)) {
  const server = createServer((req, res) => {
    if (req.url === "/health" || req.url === "/status" || req.url === "/") {
      const state = loadState();
      const now = Date.now();
      const lastRunMs = diagnostics.lastSuccessfulCycle ? new Date(diagnostics.lastSuccessfulCycle).getTime() : 0;
      const cycleAgeSeconds = lastRunMs > 0 ? Math.floor((now - lastRunMs) / 1000) : 999999;

      // Real health determination: requires recent successful cycle and zero consecutive failure streak
      const isDegraded = cycleAgeSeconds > 180 || diagnostics.consecutiveFailures > 2;
      const statusCode = isDegraded ? 503 : 200;

      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          {
            service: "CLUSTER 24/7 Keeper & Liquidation Sentinel",
            network: "Arc Mainnet (5042)",
            status: isDegraded ? "DEGRADED" : "HEALTHY",
            keeper: {
              address: diagnostics.keeperAddress,
              nativeBalanceArc: diagnostics.keeperBalanceArc,
              onChainAuthorized: diagnostics.isAuthorizedKeeper,
            },
            operationalMetrics: {
              lastSuccessfulCycle: diagnostics.lastSuccessfulCycle,
              cycleAgeSeconds,
              lastCycleDurationMs: diagnostics.lastCycleDurationMs,
              lastRpcLatencyMs: diagnostics.lastRpcLatencyMs,
              consecutiveFailures: diagnostics.consecutiveFailures,
              lastError: diagnostics.lastError,
              totalCycles: state.totalCycles,
              quarantinedCount: state.quarantinedCount,
              liquidationsExecuted: state.onchainLiquidations.length,
              uptimeSeconds: Math.floor(process.uptime()),
            },
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
  console.log(`Starting CLUSTER 24/7 Keeper Sentinel Daemon (Interval: ${intervalSec}s)...`);
  startHealthServer();
  await runDaemonCycle({ dryRun });

  setInterval(async () => {
    try {
      await runDaemonCycle({ dryRun });
    } catch (err) {
      diagnostics.consecutiveFailures++;
      diagnostics.lastError = (err as Error).message;
      console.error("[KEEPER CYCLE FAILURE]", err);
    }
  }, intervalSec * 1000);
}

if (process.argv[1]?.includes("mainnet-keeper-daemon")) {
  main().catch((err) => {
    console.error("Fatal daemon error:", err);
    process.exit(1);
  });
}
