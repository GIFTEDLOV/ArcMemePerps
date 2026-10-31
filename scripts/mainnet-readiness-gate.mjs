// Read-only Arc Mainnet release gate. Never signs, sends or simulates transactions.
// Checks the exact manifest and the two deployed financial contract governance roots.
// A HOLD result is not a release authorization.
import { readFile } from "node:fs/promises";
import { createPublicClient, http, parseAbi } from "viem";

const NETWORK = 5042;
const ZERO = "0x0000000000000000000000000000000000000000";
const ABI = parseAbi([
  "function owner() view returns (address)",
  "function governanceExecutor() view returns (address)",
  "function bootstrapFinalized() view returns (bool)",
  "function publicLpActive() view returns (bool)",
]);
const financial = ["PerpEngine", "PublicLPVault"];
const required = [
  "USDCMarginVault", "QualificationRegistry", "MarketRegistry", "OracleRouter",
  "RiskConfig", "InsuranceFund", "PerpEngine", "PublicLPVault",
  "ADLController", "ProtocolTimelock",
];
const lower = (a) => String(a).toLowerCase();
const primaryUrl = process.env.ARC_RPC_PRIMARY ?? "https://rpc.mainnet.arc.io";
const secondaryUrl = process.env.ARC_RPC_SECONDARY ?? "https://rpc.quicknode.mainnet.arc.io";
const makeClient = (url) => createPublicClient({ transport: http(url, { timeout: 15000, retryCount: 2 }) });

export function assessReleaseGate(input) {
  const blockers = [];
  if (input.index.gaps !== 0 || input.index.singleSourceRanges !== 0) blockers.push("UNVERIFIED_INDEX_COVERAGE");
  if (!Number.isSafeInteger(input.index.observedRegisteredMarkets) ||
      input.index.observedRegisteredMarkets < 1) blockers.push("NO_REGISTERED_MARKETS");
  if (!Number.isSafeInteger(input.index.observedQualificationApprovals) ||
      input.index.observedQualificationApprovals < 1) blockers.push("NO_QUALIFIED_MARKET_APPROVALS");
  if (input.status.qualificationInventory !== "VERIFIED") blockers.push("LIVE_MARKET_QUALIFICATION_UNVERIFIED");
  for (const name of financial) {
    const s = input.governance[name];
    if (!s || s.bootstrapFinalized !== true) blockers.push(name + "_BOOTSTRAP_NOT_FINALIZED");
    if (!s?.governanceExecutor || lower(s.governanceExecutor) === ZERO) blockers.push(name + "_GOVERNANCE_EXECUTOR_MISSING");
    if (s?.governanceExecutor && s?.owner &&
      lower(s.governanceExecutor) === lower(s.owner)) blockers.push(name + "_OWNER_IS_GOVERNANCE");
  }
  if (input.index.status !== "COMPLETE") blockers.push("INDEX_NOT_COMPLETE");
  const unsafe = (input.status.tradingEnabled === true || input.status.lpDepositsEnabled === true) && blockers.length > 0;
  return { decision: unsafe ? "UNSAFE" : blockers.length > 0 ? "HOLD" : "REVIEW_REQUIRED", blockers };
}

export async function runReadOnlyProbe() {
  const manifest = JSON.parse(await readFile(new URL("../evidence/mainnet/contracts.json", import.meta.url), "utf8"));
  if (manifest.chainId !== NETWORK) throw Error("MANIFEST_CHAIN_MISMATCH");
  for (const name of required) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(manifest.deployedAddresses?.[name] ?? "")) {
      throw Error("INVALID_MANIFEST_CONTRACT:" + name);
    }
  }
  const clients = [makeClient(primaryUrl), makeClient(secondaryUrl)];
  const chainIds = await Promise.all(clients.map((c) => c.getChainId()));
  if (chainIds.some((id) => id !== NETWORK)) throw Error("RPC_CHAIN_MISMATCH");
  const heads = await Promise.all(clients.map((c) => c.getBlockNumber()));
  const pinned = heads.reduce((a, b) => (a < b ? a : b)) - 64n;
  if (pinned <= 0n) throw Error("UNSAFE_RPC_HEAD");
  const anchors = await Promise.all(clients.map((c) => c.getBlock({ blockNumber: pinned })));
  if (lower(anchors[0].hash) !== lower(anchors[1].hash)) throw Error("RPC_CANONICAL_HASH_MISMATCH");
  const addresses = manifest.deployedAddresses;
  for (const name of required) {
    const code = await clients[0].getCode({ address: addresses[name], blockNumber: pinned });
    if (!code || code === "0x") throw Error("MISSING_CONTRACT_CODE:" + name);
  }
  const governance = {};
  for (const name of financial) {
    const address = addresses[name];
    const snapshots = [];
    for (const c of clients) {
      const [owner, governanceExecutor, bootstrapFinalized] = await Promise.all([
        c.readContract({ address, abi: ABI, functionName: "owner", blockNumber: pinned }),
        c.readContract({ address, abi: ABI, functionName: "governanceExecutor", blockNumber: pinned }),
        c.readContract({ address, abi: ABI, functionName: "bootstrapFinalized", blockNumber: pinned }),
      ]);
      snapshots.push({ owner, governanceExecutor, bootstrapFinalized });
    }
    if (JSON.stringify(snapshots[0]).toLowerCase() !== JSON.stringify(snapshots[1]).toLowerCase()) {
      throw Error("RPC_GOVERNANCE_DISAGREEMENT:" + name);
    }
    governance[name] = snapshots[0];
  }
  const api = process.env.CLUSTER_READONLY_API ?? "https://cluster-readonly-api.vercel.app";
  const get = async (route) => {
    const response = await fetch(api + route, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw Error("PRODUCTION_API_UNAVAILABLE");
    return response.json();
  };
  const [index, status] = await Promise.all([
    get("/api/v1/index/status"), get("/api/v1/protocol/status")
  ]);
  if (status.chainId !== NETWORK || status.readOnly !== true) throw Error("PRODUCTION_API_CHAIN_OR_MODE_MISMATCH");
  const decision = assessReleaseGate({ index, status, governance });
  return { network: NETWORK, pinnedBlock: pinned.toString(), pinnedHash: anchors[0].hash,
    governance, indexedThrough: index.throughBlock, ...decision,
    tradingEnabled: status.tradingEnabled, lpDepositsEnabled: status.lpDepositsEnabled };
}

if (process.argv[1]?.endsWith("mainnet-readiness-gate.mjs")) {
  runReadOnlyProbe().then((result) => {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (result.decision === "UNSAFE" ||
        (process.argv.includes("--require-ready") && result.decision !== "REVIEW_REQUIRED")) process.exitCode = 1;
  }).catch((error) => {
    process.stderr.write("RELEASE_GATE_READ_FAILED: " + (error instanceof Error ? error.message : "UNKNOWN") + "\n");
    process.exitCode = 1;
  });
}
