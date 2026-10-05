import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  parseAbiItem,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PRODUCT_RELEASE } from "./product-release-config.js";

const chain = {
  id: PRODUCT_RELEASE.chainId,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [PRODUCT_RELEASE.rpcUrl] } },
} as const;

const oracleAbi = parseAbi([
  "function getReport(bytes32 marketId) view returns (bytes32,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint64,uint64,uint64,uint64,bytes32,bytes32)",
  "function isReportUsable(bytes32 marketId) view returns (bool)",
  "function setSignedReport((bytes32,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint64,uint64,uint64,uint64,bytes32,bytes32),bytes[] signatures)",
]);
const engineAbi = parseAbi([
  "function orders(bytes32 orderId) view returns (address,bytes32,uint8,bool,uint256,uint256,uint256,uint64,uint64,uint256,bool,bool)",
  "function executeOrder(bytes32 orderId,uint64 oracleSequence) returns (uint256)",
]);
const orderSubmittedEvent = parseAbiItem(
  "event OrderSubmitted(bytes32 indexed orderId,address indexed account,bytes32 indexed marketId,uint256 nonce)",
);

type Report = readonly [
  Hex,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  Hex,
  Hex,
];

function requiredKey(name: string): `0x${string}` {
  const value = process.env[name];
  if (value === undefined || !/^0x[0-9a-fA-F]{64}$/.test(value))
    throw new Error(`${name}_MISSING_OR_INVALID`);
  return value as `0x${string}`;
}

const publicClient = createPublicClient({ chain, transport: http(PRODUCT_RELEASE.rpcUrl) });
const reporter1 = createWalletClient({
  account: privateKeyToAccount(requiredKey("REPORTER_1_PRIVATE_KEY")),
  chain,
  transport: http(PRODUCT_RELEASE.rpcUrl),
});
const reporter2 = createWalletClient({
  account: privateKeyToAccount(requiredKey("REPORTER_2_PRIVATE_KEY")),
  chain,
  transport: http(PRODUCT_RELEASE.rpcUrl),
});
const keeper = createWalletClient({
  account: privateKeyToAccount(requiredKey("KEEPER_PRIVATE_KEY")),
  chain,
  transport: http(PRODUCT_RELEASE.rpcUrl),
});

const reportTypes = {
  CompositePriceReport: [
    { name: "arcChainId", type: "uint256" },
    { name: "oracleRouter", type: "address" },
    { name: "marketId", type: "bytes32" },
    { name: "midPriceWad", type: "uint256" },
    { name: "minPriceWad", type: "uint256" },
    { name: "maxPriceWad", type: "uint256" },
    { name: "confidenceBps", type: "uint256" },
    { name: "sourceCount", type: "uint256" },
    { name: "independentSourceCount", type: "uint256" },
    { name: "observedAt", type: "uint256" },
    { name: "validFrom", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
    { name: "sequence", type: "uint256" },
    { name: "evidenceRoot", type: "bytes32" },
    { name: "reporterSetVersion", type: "bytes32" },
  ],
} as const;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readReport(): Promise<Report> {
  const report = await publicClient.readContract({
    address: PRODUCT_RELEASE.oracleRouter,
    abi: oracleAbi,
    functionName: "getReport",
    args: [PRODUCT_RELEASE.marketId],
  });
  return report;
}

async function publishOracleReport(): Promise<{ readonly sequence: bigint; readonly txHash: Hex }> {
  const previous = await readReport();
  if (previous[0].toLowerCase() !== PRODUCT_RELEASE.marketId.toLowerCase())
    throw new Error("REPORT_MARKET_MISMATCH");
  if (previous[1] !== BigInt(PRODUCT_RELEASE.chainId)) throw new Error("REPORT_CHAIN_MISMATCH");
  if (
    previous[2] <= 0n ||
    previous[3] <= 0n ||
    previous[4] <= 0n ||
    previous[3] > previous[2] ||
    previous[2] > previous[4]
  )
    throw new Error("REPORT_PRICE_BOUNDS_INVALID");
  if (previous[6] < 2n || previous[7] < 2n) throw new Error("REPORT_SOURCE_THRESHOLD_INVALID");
  if (previous[13].toLowerCase() !== PRODUCT_RELEASE.reporterSetVersion.toLowerCase())
    throw new Error("REPORTER_SET_VERSION_MISMATCH");

  const block = await publicClient.getBlock();
  const now = block.timestamp;
  const sequence = previous[11] + 1n;
  const evidenceRoot = keccak256(
    stringToHex(`arc-testnet-product-onchain-baseline:${PRODUCT_RELEASE.marketId}:${sequence}`),
  );
  const report = {
    arcChainId: BigInt(PRODUCT_RELEASE.chainId),
    oracleRouter: PRODUCT_RELEASE.oracleRouter,
    marketId: PRODUCT_RELEASE.marketId,
    midPriceWad: previous[2],
    minPriceWad: previous[3],
    maxPriceWad: previous[4],
    confidenceBps: previous[5],
    sourceCount: previous[6],
    independentSourceCount: previous[7],
    observedAt: now,
    validFrom: now,
    expiresAt: now + 120n,
    sequence,
    evidenceRoot,
    reporterSetVersion: PRODUCT_RELEASE.reporterSetVersion,
  } as const;
  const domain = {
    name: "ArcMemePerps Oracle",
    version: "1",
    chainId: PRODUCT_RELEASE.chainId,
    verifyingContract: PRODUCT_RELEASE.oracleRouter,
  } as const;
  const signature1 = await reporter1.signTypedData({
    domain,
    types: reportTypes,
    primaryType: "CompositePriceReport",
    message: report,
  });
  const signature2 = await reporter2.signTypedData({
    domain,
    types: reportTypes,
    primaryType: "CompositePriceReport",
    message: report,
  });
  const txHash = await keeper.writeContract({
    address: PRODUCT_RELEASE.oracleRouter,
    abi: oracleAbi,
    functionName: "setSignedReport",
    args: [
      [
        PRODUCT_RELEASE.marketId,
        report.arcChainId,
        report.midPriceWad,
        report.minPriceWad,
        report.maxPriceWad,
        report.confidenceBps,
        report.sourceCount,
        report.independentSourceCount,
        report.observedAt,
        report.validFrom,
        report.expiresAt,
        report.sequence,
        report.evidenceRoot,
        report.reporterSetVersion,
      ],
      [signature1, signature2],
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error("ORACLE_PUBLICATION_REVERTED");
  const verified = await readReport();
  if (
    verified[11] !== sequence ||
    verified[0].toLowerCase() !== PRODUCT_RELEASE.marketId.toLowerCase()
  )
    throw new Error("ORACLE_PUBLICATION_NOT_OBSERVED");
  return { sequence, txHash };
}

type Order = readonly [
  Address,
  Hex,
  number,
  boolean,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  boolean,
  boolean,
];

async function keeperCycle(fromBlock: bigint, toBlock: bigint): Promise<bigint> {
  if (toBlock <= fromBlock) return toBlock;
  const logs = await publicClient.getLogs({
    address: PRODUCT_RELEASE.perpEngine,
    event: orderSubmittedEvent,
    fromBlock,
    toBlock,
  });
  for (const log of logs) {
    if (
      log.args.marketId?.toLowerCase() !== PRODUCT_RELEASE.marketId.toLowerCase() ||
      log.args.orderId === undefined
    )
      continue;
    const order: Order = await publicClient.readContract({
      address: PRODUCT_RELEASE.perpEngine,
      abi: engineAbi,
      functionName: "orders",
      args: [log.args.orderId],
    });
    if (order[10] || order[11] || order[1].toLowerCase() !== PRODUCT_RELEASE.marketId.toLowerCase())
      continue;
    const now = (await publicClient.getBlock()).timestamp;
    if (order[8] <= now) continue;
    const usable = await publicClient.readContract({
      address: PRODUCT_RELEASE.oracleRouter,
      abi: oracleAbi,
      functionName: "isReportUsable",
      args: [PRODUCT_RELEASE.marketId],
    });
    if (!usable) continue;
    const report = await readReport();
    const txHash = await keeper.writeContract({
      address: PRODUCT_RELEASE.perpEngine,
      abi: engineAbi,
      functionName: "executeOrder",
      args: [log.args.orderId, report[11]],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new Error("KEEPER_EXECUTION_REVERTED");
    process.stdout.write(`KEEPER_EXECUTED order=${log.args.orderId} tx=${txHash}\n`);
  }
  return toBlock;
}

async function main(): Promise<void> {
  const maxCycles =
    process.env.RELEASE_WORKER_MAX_CYCLES === undefined
      ? Number.POSITIVE_INFINITY
      : Number(process.env.RELEASE_WORKER_MAX_CYCLES);
  const once = process.env.RELEASE_WORKER_ONCE === "true";
  let cycles = 0;
  let orderBlock = PRODUCT_RELEASE.startBlock;
  process.stdout.write(
    `RELEASE_WORKER_READY deployment=${PRODUCT_RELEASE.deploymentId} source=ONCHAIN_CANONICAL_BASELINE threshold=2-of-3\n`,
  );
  if (once) {
    const published = await publishOracleReport();
    process.stdout.write(
      `ORACLE_PUBLISHED sequence=${published.sequence} tx=${published.txHash}\n`,
    );
    const latest = await publicClient.getBlockNumber();
    orderBlock = await keeperCycle(orderBlock, latest);
    return;
  }

  const oracleLoop = async (): Promise<void> => {
    while (cycles < maxCycles) {
      const published = await publishOracleReport();
      process.stdout.write(
        `ORACLE_PUBLISHED sequence=${published.sequence} tx=${published.txHash}\n`,
      );
      cycles += 1;
      await sleep(Math.max(5_000, PRODUCT_RELEASE.oracleIntervalMs));
    }
  };
  const keeperLoop = async (): Promise<void> => {
    while (cycles < maxCycles) {
      const latest = await publicClient.getBlockNumber();
      orderBlock = await keeperCycle(orderBlock, latest);
      await sleep(Math.max(5_000, PRODUCT_RELEASE.keeperIntervalMs));
    }
  };
  await Promise.all([oracleLoop(), keeperLoop()]);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
