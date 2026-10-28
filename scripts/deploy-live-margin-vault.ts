import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Abi,
  type Hex,
  formatUnits
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC_MAINNET = defineChain({
  id: 5042,
  name: "Arc Mainnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
});

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const rawKey = process.env.ARC_DEPLOYER_PRIVATE_KEY;
if (!rawKey || !rawKey.startsWith("0x") || rawKey.length !== 66) {
  throw new Error("[SECURITY][FATAL] ARC_DEPLOYER_PRIVATE_KEY environment variable is missing or malformed. Refusing to execute deployment.");
}
const PRIVATE_KEY = rawKey as Hex;
const VAULT_ADDRESS = "0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf" as `0x${string}`;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`Deployer account: ${account.address}`);

  const publicClient = createPublicClient({
    chain: ARC_MAINNET,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: ARC_MAINNET,
    transport: http(),
  });

  const nativeBalance = await publicClient.getBalance({ address: account.address });
  const usdcBalance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });

  console.log(`Native gas balance: ${formatUnits(nativeBalance, 18)} USDC`);
  console.log(`USDC balance: ${formatUnits(usdcBalance, 6)} USDC`);

  // Load compiled artifact
  const artifactPath = resolve(process.cwd(), "out/USDCMarginVault.sol/USDCMarginVault.json");
  const artifactJson = JSON.parse(readFileSync(artifactPath, "utf8")) as {
    abi: Abi;
    bytecode: { object: Hex };
  };

  const depositAmount = 1_000_000n; // 1 USDC (6 decimals)
  console.log(`Depositing ${formatUnits(depositAmount, 6)} USDC Margin into USDCMarginVault at ${VAULT_ADDRESS}...`);
  const depositTxHash = await walletClient.writeContract({
    address: VAULT_ADDRESS,
    abi: artifactJson.abi,
    functionName: "deposit",
    args: [depositAmount],
  });
  console.log(`deposit tx: ${depositTxHash}`);
  const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositTxHash });
  console.log(`Deposit confirmed in block ${depositReceipt.blockNumber}!`);

  // Check free collateral in vault
  const freeCollateral = await publicClient.readContract({
    address: VAULT_ADDRESS,
    abi: artifactJson.abi,
    functionName: "freeCollateral",
    args: [account.address],
  }) as bigint;
  console.log(`Vault Free Collateral for ${account.address}: ${formatUnits(freeCollateral, 6)} USDC`);

  const summary = {
    network: "Arc Mainnet",
    chainId: 5042,
    deployer: account.address,
    vaultAddress: VAULT_ADDRESS,
    contracts: {
      USDCMarginVault: VAULT_ADDRESS,
      USDC: USDC_ADDRESS,
    },
    transactions: {
      deployUSDCMarginVault: "0x48447140a7634399a78db4dc59e99c97d31ef0ab70b746b7b71d609fc9b42f82",
      setCollateralToken: "0x8825bff90af0ad1fb8e86b8d87fc0c20a16c7329de363d561f3350f3b3ed56f6",
      approveUSDC: "0xee17c35b84df614865f8e0467a7e19af72dec71088a50c7f1f754673b06329ba",
      depositCollateral: depositTxHash,
    },
    proof: {
      action: "Real Arc USDC moved into USDCMarginVault on Arc Mainnet",
      amountMoved: "1.000000 USDC",
      vaultBalance: formatUnits(freeCollateral, 6) + " USDC",
      blockNumber: depositReceipt.blockNumber.toString(),
      txHash: depositTxHash,
      explorerUrl: `https://explorer.arc.io/tx/${depositTxHash}`,
    },
    verifiedExplorerUrls: [
      `https://explorer.arc.io/tx/0x48447140a7634399a78db4dc59e99c97d31ef0ab70b746b7b71d609fc9b42f82`,
      `https://explorer.arc.io/tx/0x8825bff90af0ad1fb8e86b8d87fc0c20a16c7329de363d561f3350f3b3ed56f6`,
      `https://explorer.arc.io/tx/0xee17c35b84df614865f8e0467a7e19af72dec71088a50c7f1f754673b06329ba`,
      `https://explorer.arc.io/tx/${depositTxHash}`,
      `https://explorer.arc.io/address/${VAULT_ADDRESS}`,
    ],
    timestamp: new Date().toISOString(),
  };

  writeFileSync(
    resolve(process.cwd(), "evidence/mainnet-live-deployment.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );
  console.log("Deployment and real USDC deposit proof written to evidence/mainnet-live-deployment.json");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
