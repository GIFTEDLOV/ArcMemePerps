import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  formatUnits,
  type Hex,
  type Address
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC_MAINNET = defineChain({
  id: 5042,
  name: "Arc Mainnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
});

const PERP_ENGINE = "0xd9c3cbf1841103749f379cc1aae1a9284d8dc3e1" as Address;
const ORACLE_ROUTER = "0x1531c83ac90e5ec5998eaf42a4464757dcd2c3ff" as Address;
const ADL_CONTROLLER = "0x3c53f9f8d0c651c8a7e061872367274d8a8bf257" as Address;

const EXPOSED_ADDRESS = "0xB65685037041Ff56574a53FC49B1F5dB88ABe043" as Address;

const perpAbi = parseAbi([
  "function setLiquidationKeeper(address keeper, bool enabled) external",
  "function setOrderKeeper(address keeper, bool enabled) external",
  "function liquidationKeeper(address) view returns (bool)",
  "function orderKeeper(address) view returns (bool)"
]);

const oracleAbi = parseAbi([
  "function setUpdater(address updater, bool enabled) external",
  "function isUpdater(address) view returns (bool)"
]);

async function main() {
  const executeRequested = process.argv.includes("--execute");
  const executionEnabled = executeRequested && process.env.ALLOW_MAINNET_GOVERNANCE_WRITES === "true";
  if (executeRequested && !executionEnabled) {
    throw new Error("Governance writes require both --execute and ALLOW_MAINNET_GOVERNANCE_WRITES=true.");
  }

  const govKey = executionEnabled ? process.env.ARC_GOVERNANCE_PRIVATE_KEY : undefined;
  if (executionEnabled && (!govKey || !/^0x[0-9a-fA-F]{64}$/.test(govKey))) {
    throw new Error("Execution requires a valid ARC_GOVERNANCE_PRIVATE_KEY; deployer key fallback is disabled.");
  }
  const account = govKey ? privateKeyToAccount(govKey as Hex) : undefined;
  const publicClient = createPublicClient({ chain: ARC_MAINNET, transport: http() });
  const chainId = await publicClient.getChainId();
  if (chainId !== ARC_MAINNET.id) throw new Error(`RPC chainId ${chainId} does not match Arc Mainnet 5042.`);
  for (const [name, address] of [["PerpEngine", PERP_ENGINE], ["OracleRouter", ORACLE_ROUTER]] as const) {
    const code = await publicClient.getCode({ address });
    if (!code || code === "0x") throw new Error(`${name} has no bytecode at its configured address.`);
  }
  const walletClient = account ? createWalletClient({ account, chain: ARC_MAINNET, transport: http() }) : null;

  console.log("=== CLUSTER KEEPER REVOCATION & ROTATION SCRIPT ===");
  console.log(`Mode: ${executionEnabled ? "EXECUTION" : "READ ONLY"}`);
  console.log(`Caller / Governance Address: ${account?.address ?? "not supplied"}`);
  console.log(`Target Exposed Address: ${EXPOSED_ADDRESS}`);

  if (account) {
    const balance = await publicClient.getBalance({ address: account.address });
    console.log(`Governance native gas balance: ${formatUnits(balance, 18)} USDC`);
    if (executionEnabled && balance < 5_000_000_000_000_000n) throw new Error("Execution refused: governance wallet has less than 0.005 USDC for gas.");
  }

  // 1. Check current permissions
  const [currentLiq, currentOrder, currentUpd] = await Promise.all([
    publicClient.readContract({ address: PERP_ENGINE, abi: perpAbi, functionName: "liquidationKeeper", args: [EXPOSED_ADDRESS] }),
    publicClient.readContract({ address: PERP_ENGINE, abi: perpAbi, functionName: "orderKeeper", args: [EXPOSED_ADDRESS] }),
    publicClient.readContract({ address: ORACLE_ROUTER, abi: oracleAbi, functionName: "isUpdater", args: [EXPOSED_ADDRESS] })
  ]);

  console.log("\nCurrent On-Chain Authorization State for Exposed Address:");
  console.log(`  PerpEngine.liquidationKeeper: ${currentLiq}`);
  console.log(`  PerpEngine.orderKeeper:       ${currentOrder}`);
  console.log(`  OracleRouter.isUpdater:       ${currentUpd}`);

  if (!executionEnabled) {
    console.log("Read-only preview complete. No governance transactions were submitted.");
    return;
  }
  if (!walletClient) throw new Error("Execution signer is unavailable.");

  const rawNewKeeperAddress = process.env.NEW_KEEPER_ADDRESS;
  if (rawNewKeeperAddress && !/^0x[0-9a-fA-F]{40}$/.test(rawNewKeeperAddress)) throw new Error("NEW_KEEPER_ADDRESS must be a valid EVM address.");
  const newKeeperAddress = rawNewKeeperAddress as Address | undefined;

  // 2. Revoke permissions if enabled
  if (currentLiq) {
    console.log(`\nRevoking liquidationKeeper for ${EXPOSED_ADDRESS}...`);
    const tx = await walletClient.writeContract({
      address: PERP_ENGINE,
      abi: perpAbi,
      functionName: "setLiquidationKeeper",
      args: [EXPOSED_ADDRESS, false]
    });
    console.log(`  Tx sent: ${tx}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== "success") throw new Error(`liquidationKeeper revocation reverted: ${tx}`);
    console.log(`  ✓ Confirmed in block ${receipt.blockNumber} (Status: ${receipt.status})`);
  } else {
    console.log(`\n✓ liquidationKeeper already revoked for ${EXPOSED_ADDRESS}`);
  }

  if (currentOrder) {
    console.log(`\nRevoking orderKeeper for ${EXPOSED_ADDRESS}...`);
    const tx = await walletClient.writeContract({
      address: PERP_ENGINE,
      abi: perpAbi,
      functionName: "setOrderKeeper",
      args: [EXPOSED_ADDRESS, false]
    });
    console.log(`  Tx sent: ${tx}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== "success") throw new Error(`orderKeeper revocation reverted: ${tx}`);
    console.log(`  ✓ Confirmed in block ${receipt.blockNumber} (Status: ${receipt.status})`);
  } else {
    console.log(`✓ orderKeeper already revoked for ${EXPOSED_ADDRESS}`);
  }

  if (currentUpd) {
    console.log(`\nRevoking updater for ${EXPOSED_ADDRESS}...`);
    const tx = await walletClient.writeContract({
      address: ORACLE_ROUTER,
      abi: oracleAbi,
      functionName: "setUpdater",
      args: [EXPOSED_ADDRESS, false]
    });
    console.log(`  Tx sent: ${tx}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== "success") throw new Error(`Oracle updater revocation reverted: ${tx}`);
    console.log(`  ✓ Confirmed in block ${receipt.blockNumber} (Status: ${receipt.status})`);
  } else {
    console.log(`✓ updater already revoked for ${EXPOSED_ADDRESS}`);
  }

  // 3. Grant to new keeper if provided
  if (newKeeperAddress) {
    console.log(`\nConfiguring new keeper address: ${newKeeperAddress}...`);
    const tx1 = await walletClient.writeContract({
      address: PERP_ENGINE,
      abi: perpAbi,
      functionName: "setLiquidationKeeper",
      args: [newKeeperAddress, true]
    });
    const receipt1 = await publicClient.waitForTransactionReceipt({ hash: tx1 });
    if (receipt1.status !== "success") throw new Error(`New liquidation keeper grant reverted: ${tx1}`);
    console.log(`  ✓ Assigned liquidationKeeper to ${newKeeperAddress}`);

    const tx2 = await walletClient.writeContract({
      address: PERP_ENGINE,
      abi: perpAbi,
      functionName: "setOrderKeeper",
      args: [newKeeperAddress, true]
    });
    const receipt2 = await publicClient.waitForTransactionReceipt({ hash: tx2 });
    if (receipt2.status !== "success") throw new Error(`New order keeper grant reverted: ${tx2}`);
    console.log(`  ✓ Assigned orderKeeper to ${newKeeperAddress}`);
  }

  // 4. Final verification
  const [finalLiq, finalOrder, finalUpd] = await Promise.all([
    publicClient.readContract({ address: PERP_ENGINE, abi: perpAbi, functionName: "liquidationKeeper", args: [EXPOSED_ADDRESS] }),
    publicClient.readContract({ address: PERP_ENGINE, abi: perpAbi, functionName: "orderKeeper", args: [EXPOSED_ADDRESS] }),
    publicClient.readContract({ address: ORACLE_ROUTER, abi: oracleAbi, functionName: "isUpdater", args: [EXPOSED_ADDRESS] })
  ]);

  console.log("\n=== FINAL AUTHORIZATION VERIFICATION ===");
  console.log(`  Exposed liquidationKeeper: ${finalLiq} (Expected: false)`);
  console.log(`  Exposed orderKeeper:       ${finalOrder} (Expected: false)`);
  console.log(`  Exposed isUpdater:         ${finalUpd} (Expected: false)`);
  console.log("========================================\n");
  if (finalLiq || finalOrder || finalUpd) throw new Error("Final check failed: exposed keeper permissions remain enabled.");
  if (newKeeperAddress) {
    const [newLiq, newOrder] = await Promise.all([
      publicClient.readContract({ address: PERP_ENGINE, abi: perpAbi, functionName: "liquidationKeeper", args: [newKeeperAddress] }),
      publicClient.readContract({ address: PERP_ENGINE, abi: perpAbi, functionName: "orderKeeper", args: [newKeeperAddress] }),
    ]);
    if (!newLiq || !newOrder) throw new Error("Final check failed: replacement keeper roles are not both enabled.");
  }
}

if (process.argv[1]?.includes("revoke-and-rotate-keeper")) {
  main().catch((err) => {
    console.error("Keeper rotation error:", err);
    process.exitCode = 1;
  });
}
