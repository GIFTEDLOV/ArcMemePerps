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
  const contracts: Record<string, `0x${string}`> = {};
  for (const name of CONTRACT_ENV_NAMES) {
    const value = import.meta.env[`VITE_MAINNET_${name.toUpperCase()}`];
    if (typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)) contracts[name] = value as `0x${string}`;
  }
  return contracts;
}

const contracts = publicContracts();
const deploymentStatus = import.meta.env.VITE_ARC_DEPLOYMENT_STATUS === "DEPLOYED" && Object.keys(contracts).length === CONTRACT_ENV_NAMES.length
  ? "DEPLOYED_ZERO_MARKETS"
  : "DEPLOYMENT_PENDING";

export const WINNER_CONFIG = {
  deploymentId: import.meta.env.VITE_MAINNET_DEPLOYMENT_ID ?? "arc-mainnet-pending",
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

export const CHAIN_OPTIONS = ["ALL", "SOLANA", "BASE", "BNB", "ETHEREUM", "ARC", "ROBINHOOD"] as const;
export const LIFECYCLE_OPTIONS = ["ALL", "NEW", "BONDING", "BONDED", "GRADUATED", "MIGRATED", "DEX_LIVE", "ESTABLISHED"] as const;

export const STRESS_EVIDENCE = {
  deploymentId: "STRESS_SECURITY_DEPLOYMENT",
  solvencyBlocked: true,
  badDebtBaseUnits: "2099781",
} as const;
