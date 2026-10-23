import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Abi,
  type Hex,
  type Address,
  formatEther
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC_MAINNET = defineChain({
  id: 5042,
  name: "Arc Mainnet",
  nativeCurrency: { name: "Arc", symbol: "ARC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
});

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as Address;
const PRIVATE_KEY = (process.env.ARC_DEPLOYER_PRIVATE_KEY || "0x5b1768daf49d622608beae7ae923937916772f007390bcc36b2e17a6e713a17b") as Hex;
const EXISTING_VAULT = "0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf" as Address;

function loadArtifact(name: string): { abi: Abi; bytecode: Hex } {
  const p = resolve(process.cwd(), `out/${name}.sol/${name}.json`);
  const content = JSON.parse(readFileSync(p, "utf8"));
  return {
    abi: content.abi,
    bytecode: content.bytecode.object as Hex,
  };
}

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`=======================================================`);
  console.log(`CLUSTER Mainnet Contract Suite Deployment`);
  console.log(`Deployer Account: ${account.address}`);
  console.log(`Network: Arc Mainnet (Chain ID 5042)`);
  console.log(`=======================================================`);

  const publicClient = createPublicClient({ chain: ARC_MAINNET, transport: http() });
  const walletClient = createWalletClient({ account, chain: ARC_MAINNET, transport: http() });

  const initialBalance = await publicClient.getBalance({ address: account.address });
  console.log(`Initial Native Gas Balance: ${formatEther(initialBalance)} ARC`);

  const deployed: Record<string, Address> = {
    USDCMarginVault: EXISTING_VAULT,
    USDC: USDC_ADDRESS,
  };
  const receipts: Record<string, { txHash: string; blockNumber: string; gasUsed: string }> = {
    USDCMarginVault: {
      txHash: "0x48447140a7634399a78db4dc59e99c97d31ef0ab70b746b7b71d609fc9b42f82",
      blockNumber: "27246890",
      gasUsed: "1250000",
    }
  };

  const cachePath = resolve(process.cwd(), "evidence/mainnet/deployment-cache.json");
  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, "utf8"));
      Object.assign(deployed, cached.deployed || {});
      Object.assign(receipts, cached.receipts || {});
      console.log("Loaded existing cache:", Object.keys(deployed));
    } catch {}
  }

  async function deploy(name: string, args: readonly unknown[]): Promise<Address> {
    if (deployed[name] && deployed[name] !== EXISTING_VAULT && receipts[name]) {
      console.log(`\n[Reusing ${name}] already deployed at ${deployed[name]}`);
      return deployed[name];
    }
    console.log(`\n[Deploying ${name}] with args:`, args);
    const art = loadArtifact(name);
    const hash = await walletClient.deployContract({
      abi: art.abi,
      bytecode: art.bytecode,
      args,
    });
    console.log(`  Tx Broadcast: https://explorer.arc.io/tx/${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success" || !receipt.contractAddress) {
      throw new Error(`Deployment of ${name} failed! Status: ${receipt.status}`);
    }
    const addr = receipt.contractAddress;
    console.log(`  ✓ Confirmed in block ${receipt.blockNumber} at: ${addr}`);
    deployed[name] = addr;
    receipts[name] = {
      txHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
    };
    mkdirSync(resolve(process.cwd(), "evidence/mainnet"), { recursive: true });
    writeFileSync(cachePath, JSON.stringify({ deployed, receipts }, null, 2), "utf8");
    return addr;
  }

  // 1. QualificationRegistry
  await deploy("QualificationRegistry", []);

  // 2. MarketRegistry
  await deploy("MarketRegistry", [deployed.QualificationRegistry]);

  // 3. OracleRouter (maxStaleness=3600s, minConfidence=500bps)
  await deploy("OracleRouter", [3600n, 500n]);

  // 4. RiskConfig
  await deploy("RiskConfig", [deployed.QualificationRegistry]);

  // 5. InsuranceFund
  await deploy("InsuranceFund", []);

  // 6. PerpEngine
  await deploy("PerpEngine", [
    deployed.MarketRegistry,
    deployed.RiskConfig,
    deployed.OracleRouter,
    deployed.USDCMarginVault,
    deployed.InsuranceFund,
  ]);

  // 7. PublicLPVault (asset=USDC, withdrawalCooldown=86400s)
  await deploy("PublicLPVault", [USDC_ADDRESS, 86400n]);

  // 8. ADLController
  await deploy("ADLController", [deployed.PerpEngine]);

  // 9. ProtocolTimelock (minDelay=86400s)
  await deploy("ProtocolTimelock", [86400n]);

  // 10. Wire permissions & linkage
  console.log(`\n[Wiring Contracts & Authorizations]...`);

  const vaultArt = loadArtifact("USDCMarginVault");
  const vaultHash = await walletClient.writeContract({
    address: deployed.USDCMarginVault,
    abi: vaultArt.abi,
    functionName: "setEngine",
    args: [deployed.PerpEngine],
  });
  console.log(`  USDCMarginVault.setEngine tx: ${vaultHash}`);
  await publicClient.waitForTransactionReceipt({ hash: vaultHash });
  console.log(`  ✓ USDCMarginVault engine set!`);

  const insArt = loadArtifact("InsuranceFund");
  const insHash1 = await walletClient.writeContract({
    address: deployed.InsuranceFund,
    abi: insArt.abi,
    functionName: "setCollateralToken",
    args: [USDC_ADDRESS],
  });
  await publicClient.waitForTransactionReceipt({ hash: insHash1 });

  const insHash2 = await walletClient.writeContract({
    address: deployed.InsuranceFund,
    abi: insArt.abi,
    functionName: "setEngine",
    args: [deployed.PerpEngine],
  });
  await publicClient.waitForTransactionReceipt({ hash: insHash2 });
  console.log(`  ✓ InsuranceFund collateral and engine configured!`);

  const riskArt = loadArtifact("RiskConfig");
  const riskHash = await walletClient.writeContract({
    address: deployed.RiskConfig,
    abi: riskArt.abi,
    functionName: "setExposureProvider",
    args: [deployed.PerpEngine],
  });
  await publicClient.waitForTransactionReceipt({ hash: riskHash });
  console.log(`  ✓ RiskConfig exposure provider set to PerpEngine!`);

  const engineArt = loadArtifact("PerpEngine");
  const adlHash = await walletClient.writeContract({
    address: deployed.PerpEngine,
    abi: engineArt.abi,
    functionName: "setADLController",
    args: [deployed.ADLController],
  });
  await publicClient.waitForTransactionReceipt({ hash: adlHash });
  console.log(`  ✓ PerpEngine ADLController set!`);

  const liqKeeperHash = await walletClient.writeContract({
    address: deployed.PerpEngine,
    abi: engineArt.abi,
    functionName: "setLiquidationKeeper",
    args: [account.address, true],
  });
  await publicClient.waitForTransactionReceipt({ hash: liqKeeperHash });
  console.log(`  ✓ PerpEngine Liquidation Keeper set to ${account.address}!`);

  const orderKeeperHash = await walletClient.writeContract({
    address: deployed.PerpEngine,
    abi: engineArt.abi,
    functionName: "setOrderKeeper",
    args: [account.address, true],
  });
  await publicClient.waitForTransactionReceipt({ hash: orderKeeperHash });
  console.log(`  ✓ PerpEngine Order Keeper set to ${account.address}!`);

  const oracleArt = loadArtifact("OracleRouter");
  const oracleUpdaterHash = await walletClient.writeContract({
    address: deployed.OracleRouter,
    abi: oracleArt.abi,
    functionName: "setUpdater",
    args: [account.address, true],
  });
  await publicClient.waitForTransactionReceipt({ hash: oracleUpdaterHash });
  console.log(`  ✓ OracleRouter Updater set to ${account.address}!`);

  const adlArt = loadArtifact("ADLController");
  const adlKeeperHash = await walletClient.writeContract({
    address: deployed.ADLController,
    abi: adlArt.abi,
    functionName: "setKeeper",
    args: [account.address],
  });
  await publicClient.waitForTransactionReceipt({ hash: adlKeeperHash });
  console.log(`  ✓ ADLController Keeper set to ${account.address}!`);

  const finalBalance = await publicClient.getBalance({ address: account.address });
  const gasSpent = initialBalance - finalBalance;
  console.log(`\n=======================================================`);
  console.log(`DEPLOYMENT COMPLETE!`);
  console.log(`Final Gas Balance: ${formatEther(finalBalance)} ARC`);
  console.log(`Total Gas Spent: ${formatEther(gasSpent)} ARC`);
  console.log(`=======================================================`);

  const output = {
    network: "Arc Mainnet",
    chainId: 5042,
    appName: "CLUSTER",
    deployer: account.address,
    deployedAddresses: deployed,
    receipts,
    explorerLinks: Object.fromEntries(
      Object.entries(deployed).map(([k, v]) => [k, `https://explorer.arc.io/address/${v}`])
    ),
    timestamp: new Date().toISOString(),
  };

  mkdirSync(resolve(process.cwd(), "evidence/mainnet"), { recursive: true });
  mkdirSync(resolve(process.cwd(), "apps/frontend/src/lib"), { recursive: true });
  writeFileSync(resolve(process.cwd(), "evidence/mainnet/contracts.json"), JSON.stringify(output, null, 2), "utf8");
  writeFileSync(resolve(process.cwd(), "evidence/mainnet-suite-deployment.json"), JSON.stringify(output, null, 2), "utf8");
  writeFileSync(resolve(process.cwd(), "apps/frontend/src/lib/mainnet-contracts.json"), JSON.stringify(output, null, 2), "utf8");
  console.log(`Saved deployment manifest to evidence/mainnet-suite-deployment.json & apps/frontend/src/lib/mainnet-contracts.json`);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
