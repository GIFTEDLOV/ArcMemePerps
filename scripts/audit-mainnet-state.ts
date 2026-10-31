import { createPublicClient, http, parseAbi, type Address } from "viem";

const client = createPublicClient({
  transport: http("https://rpc.mainnet.arc.io"),
});

const accessAbi = parseAbi([
  "function owner() view returns (address)",
  "function governanceExecutor() view returns (address)",
  "function bootstrapFinalized() view returns (bool)",
  "function hasRole(bytes32, address) view returns (bool)"
]);

const perpAbi = parseAbi([
  "function owner() view returns (address)",
  "function governanceExecutor() view returns (address)",
  "function bootstrapFinalized() view returns (bool)",
  "function liquidationKeeper(address) view returns (bool)",
  "function orderKeeper(address) view returns (bool)",
  "function marginVault() view returns (address)",
  "function oracleRouter() view returns (address)",
  "function insuranceFund() view returns (address)"
]);

const oracleAbi = parseAbi([
  "function owner() view returns (address)",
  "function governanceExecutor() view returns (address)",
  "function bootstrapFinalized() view returns (bool)",
  "function isUpdater(address) view returns (bool)"
]);

const contracts: Record<string, Address> = {
  PerpEngine: "0xd9c3cbf1841103749f379cc1aae1a9284d8dc3e1",
  OracleRouter: "0x1531c83ac90e5ec5998eaf42a4464757dcd2c3ff",
  USDCMarginVault: "0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf",
  InsuranceFund: "0x8b0550babc3b802d89c17dfbee85828e14e6a22b",
  PublicLPVault: "0x9ff8358dc5ee866e0b9707d0139cf47b399f5257",
  ProtocolTimelock: "0xab0177c7fdad783faf27f145ecb95e92863fd4c2",
  ADLController: "0x3c53f9f8d0c651c8a7e061872367274d8a8bf257",
  QualificationRegistry: "0x67b175dd57d17d8ef4bd307d1a20a8d5438180e7",
  MarketRegistry: "0x7ebddb2c1f1ae68a2e5b984fe9e75115cdb8ef1b",
  RiskConfig: "0x89ea15e527f7d06503ed2e7c958c2ac0e5799f85"
};

const EXPOSED = "0xB65685037041Ff56574a53FC49B1F5dB88ABe043" as Address;

async function check() {
  console.log("=== ARC MAINNET (5042) ON-CHAIN AUDIT ===");
  const chainId = await client.getChainId();
  console.log("Chain ID:", chainId);

  for (const [name, addr] of Object.entries(contracts)) {
    console.log(`\n--- ${name} (${addr}) ---`);
    try {
      const owner = await client.readContract({ address: addr, abi: accessAbi, functionName: "owner" });
      console.log("  owner:", owner);
    } catch {
      console.log("  owner: [reverted/unsupported]");
    }
    try {
      const gov = await client.readContract({ address: addr, abi: accessAbi, functionName: "governanceExecutor" });
      console.log("  governanceExecutor:", gov);
    } catch {
      console.log("  governanceExecutor: [reverted/unsupported]");
    }
    try {
      const bf = await client.readContract({ address: addr, abi: accessAbi, functionName: "bootstrapFinalized" });
      console.log("  bootstrapFinalized:", bf);
    } catch {
      console.log("  bootstrapFinalized: [reverted/unsupported]");
    }
  }

  console.log("\n=== EXPOSED ADDRESS CHECKS ===");
  console.log("Exposed Address:", EXPOSED);
  const bal = await client.getBalance({ address: EXPOSED });
  console.log("Native Balance:", bal.toString(), "wei");

  try {
    const liq = await client.readContract({
      address: contracts.PerpEngine,
      abi: perpAbi,
      functionName: "liquidationKeeper",
      args: [EXPOSED]
    });
    const ord = await client.readContract({
      address: contracts.PerpEngine,
      abi: perpAbi,
      functionName: "orderKeeper",
      args: [EXPOSED]
    });
    console.log("PerpEngine.liquidationKeeper:", liq);
    console.log("PerpEngine.orderKeeper:", ord);
  } catch (e: any) {
    console.log("PerpEngine check failed:", e.message);
  }

  try {
    const upd = await client.readContract({
      address: contracts.OracleRouter,
      abi: oracleAbi,
      functionName: "isUpdater",
      args: [EXPOSED]
    });
    console.log("OracleRouter.isUpdater:", upd);
  } catch (e: any) {
    console.log("OracleRouter check failed:", e.message);
  }

  // Margin vault references in PerpEngine
  try {
    const mv = await client.readContract({
      address: contracts.PerpEngine,
      abi: perpAbi,
      functionName: "marginVault"
    });
    console.log("PerpEngine.marginVault:", mv);
  } catch (e: any) {
    console.log("PerpEngine.marginVault:", e.message);
  }

  console.log("\n=== LIVE PROTOCOL BALANCES & ASSETS ===");
  const marginVaultAbi = parseAbi([
    "function rawCash() view returns (uint256)",
    "function totalFreeCollateral() view returns (uint256)",
    "function totalLockedCollateral() view returns (uint256)",
    "function protocolBacking() view returns (uint256)",
    "function collateralToken() view returns (address)",
    "function engine() view returns (address)"
  ]);

  const lpVaultAbi = parseAbi([
    "function totalShares() view returns (uint256)",
    "function managedAssets() view returns (uint256)",
    "function publicLpActive() view returns (bool)",
    "function navAssets() view returns (uint256)"
  ]);

  const timelockAbi = parseAbi([
    "function delay() view returns (uint256)"
  ]);

  try {
    const [rawCash, free, locked, backing, colToken, eng] = await Promise.all([
      client.readContract({ address: contracts.USDCMarginVault, abi: marginVaultAbi, functionName: "rawCash" }),
      client.readContract({ address: contracts.USDCMarginVault, abi: marginVaultAbi, functionName: "totalFreeCollateral" }),
      client.readContract({ address: contracts.USDCMarginVault, abi: marginVaultAbi, functionName: "totalLockedCollateral" }),
      client.readContract({ address: contracts.USDCMarginVault, abi: marginVaultAbi, functionName: "protocolBacking" }),
      client.readContract({ address: contracts.USDCMarginVault, abi: marginVaultAbi, functionName: "collateralToken" }),
      client.readContract({ address: contracts.USDCMarginVault, abi: marginVaultAbi, functionName: "engine" })
    ]);
    console.log("USDCMarginVault live state:");
    console.log(`  rawCash:               ${rawCash}`);
    console.log(`  totalFreeCollateral:   ${free}`);
    console.log(`  totalLockedCollateral: ${locked}`);
    console.log(`  protocolBacking:       ${backing}`);
    console.log(`  collateralToken:       ${colToken}`);
    console.log(`  engine:                ${eng}`);
  } catch (e: any) {
    console.log("USDCMarginVault live read error:", e.message);
  }

  try {
    const [shares, managed, active, nav] = await Promise.all([
      client.readContract({ address: contracts.PublicLPVault, abi: lpVaultAbi, functionName: "totalShares" }),
      client.readContract({ address: contracts.PublicLPVault, abi: lpVaultAbi, functionName: "managedAssets" }),
      client.readContract({ address: contracts.PublicLPVault, abi: lpVaultAbi, functionName: "publicLpActive" }),
      client.readContract({ address: contracts.PublicLPVault, abi: lpVaultAbi, functionName: "navAssets" })
    ]);
    console.log("PublicLPVault live state:");
    console.log(`  totalShares:    ${shares}`);
    console.log(`  managedAssets:  ${managed}`);
    console.log(`  publicLpActive: ${active}`);
    console.log(`  navAssets:      ${nav}`);
  } catch (e: any) {
    console.log("PublicLPVault live read error:", e.message);
  }

  try {
    const delay = await client.readContract({ address: contracts.ProtocolTimelock, abi: timelockAbi, functionName: "delay" });
    console.log(`ProtocolTimelock.delay: ${delay}`);
  } catch (e: any) {
    console.log("ProtocolTimelock delay read error:", e.message);
  }
}

check().catch(console.error);
