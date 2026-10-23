const MAINNET_CHAIN_ID = 5_042;
const MAINNET_RPC_URL = "https://rpc.mainnet.arc.io";
const MAINNET_EXPLORER_URL = "https://explorer.arc.io";
const MAINNET_USDC = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const CONTRACT_ENV_NAMES = [
  "MarketRegistry",
  "QualificationRegistry",
  "OracleRouter",
  "RiskConfig",
  "USDCMarginVault",
  "PerpEngine",
  "InsuranceFund",
  "PublicLPVault",
  "ADLController",
  "ProtocolTimelock",
] as const;

function publicContracts(): Record<string, `0x${string}`> {
  const contracts: Record<string, `0x${string}`> = {
    USDCMarginVault: "0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf",
    USDC: "0x3600000000000000000000000000000000000000",
    QualificationRegistry: "0x67b175dd57d17d8ef4bd307d1a20a8d5438180e7",
    MarketRegistry: "0x7ebddb2c1f1ae68a2e5b984fe9e75115cdb8ef1b",
    OracleRouter: "0x1531c83ac90e5ec5998eaf42a4464757dcd2c3ff",
    RiskConfig: "0x89ea15e527f7d06503ed2e7c958c2ac0e5799f85",
    InsuranceFund: "0x8b0550babc3b802d89c17dfbee85828e14e6a22b",
    PerpEngine: "0xd9c3cbf1841103749f379cc1aae1a9284d8dc3e1",
    PublicLPVault: "0x9ff8358dc5ee866e0b9707d0139cf47b399f5257",
    ADLController: "0x3c53f9f8d0c651c8a7e061872367274d8a8bf257",
    ProtocolTimelock: "0xab0177c7fdad783faf27f145ecb95e92863fd4c2",
  };
  for (const name of CONTRACT_ENV_NAMES) {
    const value = import.meta.env[`VITE_MAINNET_${name.toUpperCase()}`];
    if (typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)) contracts[name] = value as `0x${string}`;
  }
  return contracts;
}

const contracts = publicContracts();
const deploymentStatus: "DEPLOYED_ZERO_MARKETS" | "DEPLOYMENT_PENDING" = "DEPLOYED_ZERO_MARKETS";

export const WINNER_CONFIG = {
  deploymentId: import.meta.env.VITE_MAINNET_DEPLOYMENT_ID ?? "arc-mainnet-live",
  chainId: MAINNET_CHAIN_ID,
  chainName: "Arc Mainnet",
  explorerUrl: MAINNET_EXPLORER_URL,
  deploymentStatus,
  riskRuleVersion: "0.4.0",
  rpcUrl: import.meta.env.VITE_ARC_MAINNET_RPC_URL ?? MAINNET_RPC_URL,
  apiUrl: import.meta.env.VITE_API_URL ?? "/api/v1",
  marketId: null,
  usdc: MAINNET_USDC,
  contracts,
  contractSourceSha: "0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b",
} as const;

export const CHAIN_OPTIONS = ["ALL", "ARC", "SOLANA", "BASE", "BNB", "ETHEREUM", "ROBINHOOD"] as const;
export const LIFECYCLE_OPTIONS = ["ALL", "NEW", "BONDING", "BONDED", "GRADUATED", "MIGRATED", "DEX_LIVE", "ESTABLISHED"] as const;

export const STRESS_EVIDENCE = {
  deploymentId: "STRESS_SECURITY_DEPLOYMENT",
  solvencyBlocked: true,
  badDebtBaseUnits: "2099781",
} as const;
