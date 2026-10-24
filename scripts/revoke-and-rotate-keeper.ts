import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  formatEther,
  type Hex,
  type Address
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC_MAINNET = defineChain({
  id: 5042,
  name: "Arc Mainnet",
  nativeCurrency: { name: "Arc", symbol: "ARC", decimals: 18 },
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
  const govKey = process.env.ARC_GOVERNANCE_PRIVATE_KEY || process.env.ARC_DEPLOYER_PRIVATE_KEY;
  if (!govKey || !govKey.startsWith("0x")) {
    console.error("[ERROR] Missing ARC_GOVERNANCE_PRIVATE_KEY or ARC_DEPLOYER_PRIVATE_KEY.");
    console.error("Please provide the governance key via environment variable to authorize revocation.");
    process.exit(1);
  }

  const account = privateKeyToAccount(govKey as Hex);
  const publicClient = createPublicClient({ chain: ARC_MAINNET, transport: http() });
  const walletClient = createWalletClient({ account, chain: ARC_MAINNET, transport: http() });

  console.log("=== CLUSTER KEEPER REVOCATION & ROTATION SCRIPT ===");
  console.log(`Caller / Governance Address: ${account.address}`);
  console.log(`Target Exposed Address: ${EXPOSED_ADDRESS}`);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Governance Balance: ${formatEther(balance)} ARC/USDC`);

  if (balance < 1000000000000000n) { // 0.001 USDC
    console.warn("\n[WARNING] Governance balance is low. Need at least ~0.005 USDC for gas to broadcast revocation txs.");
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

  const newKeeperAddress = process.env.NEW_KEEPER_ADDRESS as Address | undefined;

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
    await publicClient.waitForTransactionReceipt({ hash: tx1 });
    console.log(`  ✓ Assigned liquidationKeeper to ${newKeeperAddress}`);

    const tx2 = await walletClient.writeContract({
      address: PERP_ENGINE,
      abi: perpAbi,
      functionName: "setOrderKeeper",
      args: [newKeeperAddress, true]
    });
    await publicClient.waitForTransactionReceipt({ hash: tx2 });
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
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
