#!/usr/bin/env node
/**
 * Read-only by default. Liquidation writes require both --execute and
 * KEEPER_ENABLE_MAINNET_LIQUIDATIONS=true, plus a verified manifest and keeper role.
 * This daemon intentionally does not use a checked-in market snapshot as live input.
 */

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatUnits,
  http,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { applyPositionIndexPage, classifyLiquidationError, shouldExecuteMainnetKeeper } from "./keeper-safety";

const RPC_URL = process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io";
const ARC_MAINNET = defineChain({
  id: 5042,
  name: "Arc Mainnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
});

const CONTRACT_MANIFEST = resolve(process.cwd(), "evidence/mainnet/contracts.json");
const STATE_FILE = resolve(process.env.KEEPER_STATE_FILE || "var/keeper-state.json");
const MAX_EVENT_BLOCKS_PER_CYCLE = 10_000n;
const MAX_TOUCHED_POSITIONS_PER_CYCLE = 1_000;
const MAX_TRACKED_ACTIVE_POSITIONS = 1_000;

const positionEvents = [
  parseAbiItem("event PositionOpened(uint256 indexed positionId, address indexed trader, bytes32 indexed marketId, bool isLong, uint256 collateral, uint256 size, uint256 entryPrice)"),
  parseAbiItem("event PositionReduced(uint256 indexed positionId, uint256 collateralReleased, uint256 sizeReduced)"),
  parseAbiItem("event PositionClosed(uint256 indexed positionId, int256 pnl, uint256 badDebt)"),
  parseAbiItem("event PositionLiquidated(uint256 indexed positionId, int256 pnl, uint256 badDebt)"),
  parseAbiItem("event ADLPositionReduced(uint256 indexed positionId, uint256 sizeReduced, uint256 economicReduction, uint256 executionPrice)"),
] as const;

interface KeeperState {
  lastConfirmedCycle: string | null;
  totalCycles: number;
  confirmedLiquidations: Array<{ positionId: string; txHash: string; timestamp: string }>;
  eventCheckpoint: string;
  activePositionIds: string[];
  indexIdentity: string;
}

interface DiagnosticMetrics {
  lastSuccessfulRead: string | null;
  lastCycleDurationMs: number;
  lastRpcLatencyMs: number;
  consecutiveFailures: number;
  lastError: string | null;
  keeperAddress: string | null;
  keeperBalanceUsdc: string | null;
  isAuthorizedKeeper: boolean | null;
  executionEnabled: boolean;
  positionsScanned: number;
  openPositions: number;
  simulatedLiquidations: number | null;
  indexReady: boolean;
}

const diagnostics: DiagnosticMetrics = {
  lastSuccessfulRead: null,
  lastCycleDurationMs: 0,
  lastRpcLatencyMs: 0,
  consecutiveFailures: 0,
  lastError: null,
  keeperAddress: null,
  keeperBalanceUsdc: null,
  isAuthorizedKeeper: null,
  executionEnabled: false,
  positionsScanned: 0,
  openPositions: 0,
  simulatedLiquidations: null,
  indexReady: false,
};

let cycleRunning = false;

function loadContracts(): { PerpEngine: Address; deploymentBlock: bigint } {
  if (!existsSync(CONTRACT_MANIFEST)) {
    throw new Error("Missing evidence/mainnet/contracts.json; no hard-coded contract fallback is permitted.");
  }
  const manifest = JSON.parse(readFileSync(CONTRACT_MANIFEST, "utf8")) as {
    chainId?: number;
    deployedAddresses?: Record<string, string>;
    receipts?: Record<string, { blockNumber?: string }>;
  };
  if (manifest.chainId !== ARC_MAINNET.id) throw new Error("Contract manifest chainId does not match Arc Mainnet (5042).");
  const address = manifest.deployedAddresses?.PerpEngine;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/i.test(address)) {
    throw new Error("Contract manifest has no valid PerpEngine address.");
  }
  const rawDeploymentBlock = manifest.receipts?.PerpEngine?.blockNumber;
  if (!rawDeploymentBlock || !/^\d+$/.test(rawDeploymentBlock) || BigInt(rawDeploymentBlock) <= 0n) {
    throw new Error("Contract manifest has no valid PerpEngine deployment block for event indexing.");
  }
  return { PerpEngine: address as Address, deploymentBlock: BigInt(rawDeploymentBlock) };
}

function loadState(deploymentBlock: bigint, engineAddress: Address): KeeperState {
  const indexIdentity = `${ARC_MAINNET.id}:${engineAddress.toLowerCase()}:${deploymentBlock}`;
  const initial: KeeperState = {
    lastConfirmedCycle: null,
    totalCycles: 0,
    confirmedLiquidations: [],
    eventCheckpoint: (deploymentBlock - 1n).toString(),
    activePositionIds: [],
    indexIdentity,
  };
  if (!existsSync(STATE_FILE)) return initial;
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8")) as Partial<KeeperState>;
    if (parsed.indexIdentity && parsed.indexIdentity !== indexIdentity) {
      throw new Error("Keeper state belongs to a different chain, PerpEngine, or deployment block; use a separate KEEPER_STATE_FILE.");
    }
    const checkpoint = typeof parsed.eventCheckpoint === "string" && /^\d+$/.test(parsed.eventCheckpoint)
      ? BigInt(parsed.eventCheckpoint)
      : deploymentBlock - 1n;
    const activePositionIds = Array.isArray(parsed.activePositionIds)
      ? parsed.activePositionIds.filter((id): id is string => typeof id === "string" && /^\d+$/.test(id))
      : [];
    const state: KeeperState = {
      lastConfirmedCycle: typeof parsed.lastConfirmedCycle === "string" ? parsed.lastConfirmedCycle : null,
      totalCycles: Number.isSafeInteger(parsed.totalCycles) && (parsed.totalCycles ?? 0) >= 0 ? parsed.totalCycles! : 0,
      // Legacy quarantine rows and unconfirmed write hashes are deliberately ignored.
      confirmedLiquidations: Array.isArray(parsed.confirmedLiquidations)
        ? parsed.confirmedLiquidations.filter((item) =>
            typeof item?.positionId === "string" && /^\d+$/.test(item.positionId) &&
            typeof item?.txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(item.txHash) &&
            typeof item?.timestamp === "string" && Number.isFinite(Date.parse(item.timestamp)))
        : [],
      eventCheckpoint: (checkpoint >= deploymentBlock - 1n ? checkpoint : deploymentBlock - 1n).toString(),
      activePositionIds: [...new Set(activePositionIds)],
      indexIdentity,
    };
    if (state.activePositionIds.length > MAX_TRACKED_ACTIVE_POSITIONS) {
      throw new Error(`Keeper state exceeds the ${MAX_TRACKED_ACTIVE_POSITIONS} active-position safety cap.`);
    }
    return state;
  } catch {
    throw new Error("Keeper state file is invalid; refusing to overwrite it.");
  }
}

function saveState(state: KeeperState): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  const temporaryFile = `${STATE_FILE}.tmp`;
  writeFileSync(temporaryFile, JSON.stringify(state, null, 2), "utf8");
  renameSync(temporaryFile, STATE_FILE);
}

const perpAbi = [
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
  { type: "function", name: "liquidationKeeper", inputs: [{ name: "keeper", type: "address" }], outputs: [{ name: "", type: "bool" }], stateMutability: "view" },
  { type: "function", name: "liquidate", inputs: [{ name: "positionId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
] as const;

export async function runDaemonCycle(options: { dryRun?: boolean; executionRequested?: boolean } = {}) {
  if (cycleRunning) throw new Error("Keeper cycle already running; overlapping cycles are refused.");
  cycleRunning = true;
  const startTime = Date.now();
  const dryRun = options.dryRun !== false;
  const executionEnabled = !dryRun && options.executionRequested === true && shouldExecuteMainnetKeeper(["--execute"], process.env.KEEPER_ENABLE_MAINNET_LIQUIDATIONS);
  diagnostics.executionEnabled = executionEnabled;

  try {
    if (!dryRun && !executionEnabled) {
      throw new Error("Execution refused: pass --execute and set KEEPER_ENABLE_MAINNET_LIQUIDATIONS=true.");
    }

    let account: ReturnType<typeof privateKeyToAccount> | undefined;
    if (executionEnabled) {
      const rawKeeperKey = process.env.ARC_KEEPER_PRIVATE_KEY || process.env.KEEPER_PRIVATE_KEY;
      if (!rawKeeperKey || !/^0x[0-9a-fA-F]{64}$/.test(rawKeeperKey)) {
        throw new Error("Execution refused: ARC_KEEPER_PRIVATE_KEY is missing or malformed.");
      }
      account = privateKeyToAccount(rawKeeperKey as Hex);
      diagnostics.keeperAddress = account.address;
    } else if (process.env.KEEPER_ADDRESS && /^0x[0-9a-fA-F]{40}$/.test(process.env.KEEPER_ADDRESS)) {
      diagnostics.keeperAddress = process.env.KEEPER_ADDRESS;
    } else {
      diagnostics.keeperAddress = null;
    }

    const publicClient = createPublicClient({ chain: ARC_MAINNET, transport: http(RPC_URL) });
    const contracts = loadContracts();
    const chainId = await publicClient.getChainId();
    if (chainId !== ARC_MAINNET.id) throw new Error(`RPC chainId ${chainId} does not match 5042.`);

    const code = await publicClient.getCode({ address: contracts.PerpEngine });
    if (!code || code === "0x") throw new Error("PerpEngine has no bytecode at the manifest address.");

    if (diagnostics.keeperAddress) {
      const isAuthorized = await publicClient.readContract({
        address: contracts.PerpEngine,
        abi: perpAbi,
        functionName: "liquidationKeeper",
        args: [diagnostics.keeperAddress as Address],
      });
      diagnostics.isAuthorizedKeeper = isAuthorized;
      if (executionEnabled && !isAuthorized) throw new Error("Execution refused: keeper is not authorized on PerpEngine.");
    } else {
      diagnostics.isAuthorizedKeeper = null;
    }

    if (executionEnabled && !account) throw new Error("Execution refused: signer account is unavailable.");
    const walletClient = executionEnabled && account
      ? createWalletClient({ account, chain: ARC_MAINNET, transport: http(RPC_URL) })
      : null;

    const balanceAddress = diagnostics.keeperAddress;
    if (balanceAddress) {
      const started = Date.now();
      const balance = await publicClient.getBalance({ address: balanceAddress as Address });
      diagnostics.lastRpcLatencyMs = Date.now() - started;
      diagnostics.keeperBalanceUsdc = formatUnits(balance, 18);
    }

    const state = loadState(contracts.deploymentBlock, contracts.PerpEngine);
    const headBlock = await publicClient.getBlockNumber();
    const checkpoint = BigInt(state.eventCheckpoint);
    if (checkpoint > headBlock) throw new Error("Keeper event checkpoint is ahead of the RPC head; refusing to trust a reorged or inconsistent index.");
    const fromBlock = checkpoint + 1n;
    const toBlock = fromBlock > headBlock
      ? checkpoint
      : (headBlock - checkpoint > MAX_EVENT_BLOCKS_PER_CYCLE ? checkpoint + MAX_EVENT_BLOCKS_PER_CYCLE : headBlock);
    let touchedIds: string[] = [];

    if (fromBlock <= toBlock) {
      const touched = new Set<string>();
      for (const event of positionEvents) {
        const logs = await publicClient.getLogs({ address: contracts.PerpEngine, event, fromBlock, toBlock });
        for (const log of logs) {
          const args = log.args as { positionId?: bigint };
          if (typeof args.positionId === "bigint") touched.add(args.positionId.toString());
        }
      }
      if (touched.size > MAX_TOUCHED_POSITIONS_PER_CYCLE) {
        throw new Error(`Event page touched ${touched.size} positions, above the ${MAX_TOUCHED_POSITIONS_PER_CYCLE} safety cap; checkpoint was not advanced.`);
      }
      touchedIds = [...touched];
      const openById = new Map<string, boolean>();
      for (const id of touchedIds) {
        const position = await publicClient.readContract({
          address: contracts.PerpEngine,
          abi: perpAbi,
          functionName: "positions",
          args: [BigInt(id)],
        });
        openById.set(id, position[6]);
      }
      const nextActive = applyPositionIndexPage(state.activePositionIds, touchedIds, openById);
      if (nextActive.length > MAX_TRACKED_ACTIVE_POSITIONS) {
        throw new Error(`Active positions exceed the ${MAX_TRACKED_ACTIVE_POSITIONS} safety cap; checkpoint was not advanced.`);
      }
      state.activePositionIds = nextActive;
      state.eventCheckpoint = toBlock.toString();
      saveState(state);
    }

    diagnostics.indexReady = BigInt(state.eventCheckpoint) >= headBlock;
    const openPositions: Array<{ id: bigint; open: boolean }> = [];
    for (const id of state.activePositionIds) {
      const position = await publicClient.readContract({ address: contracts.PerpEngine, abi: perpAbi, functionName: "positions", args: [BigInt(id)] });
      if (position[6]) openPositions.push({ id: BigInt(id), open: true });
    }
    diagnostics.positionsScanned = touchedIds.length + openPositions.length;
    diagnostics.openPositions = openPositions.length;

    const liquidatable: bigint[] = [];
    const canSimulateAsKeeper = diagnostics.indexReady && diagnostics.keeperAddress !== null && diagnostics.isAuthorizedKeeper === true;
    if (canSimulateAsKeeper) {
      for (const position of openPositions) {
        try {
          await publicClient.simulateContract({
            address: contracts.PerpEngine,
            abi: perpAbi,
            functionName: "liquidate",
            args: [position.id],
            account: diagnostics.keeperAddress as Address,
          });
          liquidatable.push(position.id);
        } catch (error) {
          const classified = classifyLiquidationError(error);
          if (!classified.isHealthy) throw new Error(`[${classified.category}] ${classified.description}`);
        }
      }
      diagnostics.simulatedLiquidations = liquidatable.length;
    } else {
      diagnostics.simulatedLiquidations = null;
    }

    if (executionEnabled && walletClient && diagnostics.indexReady) {
      for (const positionId of liquidatable) {
        // Repeat simulation immediately before each write to reduce stale-state risk.
        await publicClient.simulateContract({ address: contracts.PerpEngine, abi: perpAbi, functionName: "liquidate", args: [positionId], account: account!.address });
        const hash = await walletClient.writeContract({ address: contracts.PerpEngine, abi: perpAbi, functionName: "liquidate", args: [positionId] });
        const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
        if (receipt.status !== "success") throw new Error(`Liquidation transaction ${hash} did not succeed.`);
        const confirmedPosition = await publicClient.readContract({ address: contracts.PerpEngine, abi: perpAbi, functionName: "positions", args: [positionId] });
        if (confirmedPosition[6]) throw new Error(`Liquidation receipt ${hash} succeeded but position ${positionId} remains open.`);
        state.confirmedLiquidations.push({ positionId: positionId.toString(), txHash: hash, timestamp: new Date().toISOString() });
        state.lastConfirmedCycle = new Date().toISOString();
        state.totalCycles++;
        saveState(state);
      }
    }

    diagnostics.lastSuccessfulRead = new Date().toISOString();
    diagnostics.lastCycleDurationMs = Date.now() - startTime;
    diagnostics.consecutiveFailures = 0;
    diagnostics.lastError = null;
    if (executionEnabled && diagnostics.indexReady && liquidatable.length === 0) {
      state.totalCycles++;
      state.lastConfirmedCycle = diagnostics.lastSuccessfulRead;
      saveState(state);
    }
    console.log(JSON.stringify({ mode: executionEnabled ? "EXECUTION_ENABLED" : "READ_ONLY", chainId, eventCheckpoint: state.eventCheckpoint, headBlock: headBlock.toString(), indexReady: diagnostics.indexReady, eventPositionsReconciled: touchedIds.length, openPositions: openPositions.length, simulatedLiquidations: diagnostics.indexReady ? liquidatable.length : null }, null, 2));
    return { state, liquidationsConfirmed: executionEnabled ? liquidatable.length : 0 };
  } catch (error) {
    diagnostics.consecutiveFailures++;
    diagnostics.lastError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    diagnostics.lastCycleDurationMs = Date.now() - startTime;
    cycleRunning = false;
  }
}

function startHealthServer(port = Number(process.env.PORT || 8080)) {
  const server = createServer((req, res) => {
    if (req.url !== "/health" && req.url !== "/status" && req.url !== "/") {
      res.writeHead(404);
      res.end();
      return;
    }
    const ageSeconds = diagnostics.lastSuccessfulRead ? Math.floor((Date.now() - new Date(diagnostics.lastSuccessfulRead).getTime()) / 1000) : null;
    const unhealthy = ageSeconds === null || ageSeconds > 180 || diagnostics.consecutiveFailures > 0 || !diagnostics.indexReady;
    const status = unhealthy ? "DEGRADED" : diagnostics.executionEnabled ? "EXECUTION_ENABLED" : "READ_ONLY";
    res.writeHead(unhealthy ? 503 : 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      service: "CLUSTER Keeper Diagnostics",
      network: "Arc Mainnet (5042)",
      status,
      keeper: { address: diagnostics.keeperAddress, balanceUsdc: diagnostics.keeperBalanceUsdc, onChainAuthorized: diagnostics.isAuthorizedKeeper },
      executionEnabled: diagnostics.executionEnabled,
      positionsScanned: diagnostics.positionsScanned,
      openPositions: diagnostics.openPositions,
      eventIndexReady: diagnostics.indexReady,
      simulatedLiquidations: diagnostics.simulatedLiquidations,
      lastSuccessfulRead: diagnostics.lastSuccessfulRead,
      cycleAgeSeconds: ageSeconds,
      lastCycleDurationMs: diagnostics.lastCycleDurationMs,
      lastRpcLatencyMs: diagnostics.lastRpcLatencyMs,
      consecutiveFailures: diagnostics.consecutiveFailures,
      lastError: diagnostics.lastError,
      uptimeSeconds: Math.floor(process.uptime()),
    }, null, 2));
  });
  server.listen(port, () => console.log(`[HEALTHCHECK SERVER] Listening on port ${port}`));
}

async function main() {
  const args = process.argv.slice(2);
  const isLoop = args.includes("--loop");
  const executeRequested = args.includes("--execute") && !args.includes("--dry-run");
  if (executeRequested && !shouldExecuteMainnetKeeper(args, process.env.KEEPER_ENABLE_MAINNET_LIQUIDATIONS)) {
    throw new Error("Execution refused: --execute and KEEPER_ENABLE_MAINNET_LIQUIDATIONS=true are both required.");
  }
  const intervalArg = args.find((argument) => argument.startsWith("--interval="));
  const intervalSeconds = intervalArg ? Number.parseInt(intervalArg.split("=")[1] ?? "30", 10) : 30;
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 5) throw new Error("Keeper interval must be an integer of at least 5 seconds.");

  if (!isLoop) {
    await runDaemonCycle({ dryRun: !executeRequested, executionRequested: executeRequested });
    return;
  }

  startHealthServer();
  while (true) {
    try {
      await runDaemonCycle({ dryRun: !executeRequested, executionRequested: executeRequested });
    } catch (error) {
      console.error("[KEEPER CYCLE FAILURE]", error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalSeconds * 1000));
  }
}

if (process.argv[1]?.includes("mainnet-keeper-daemon")) {
  main().catch((error) => {
    console.error("Fatal daemon error:", error);
    process.exitCode = 1;
  });
}
