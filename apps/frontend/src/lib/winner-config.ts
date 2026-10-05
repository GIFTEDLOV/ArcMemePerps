import productDeployment from "../../../../evidence/gate4i/product-deployment.json";

export const WINNER_CONFIG = {
  deploymentId: "arc-testnet-product-v2",
  chainId: 5_042_002,
  chainName: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.io",
  apiUrl: import.meta.env.VITE_API_URL ?? "/api/v1",
  marketId: productDeployment.productState.marketId as `0x${string}`,
  usdc: "0x3600000000000000000000000000000000000000" as `0x${string}`,
  contracts: productDeployment.addresses as Record<string, `0x${string}`>,
  contractSourceSha: productDeployment.contractSourceSha256,
} as const;

export const CHAIN_OPTIONS = ["ALL", "SOLANA", "BASE", "BNB", "ETHEREUM", "ARC", "ROBINHOOD"] as const;
export const LIFECYCLE_OPTIONS = ["ALL", "NEW", "BONDING", "BONDED", "GRADUATED", "MIGRATED", "DEX_LIVE", "ESTABLISHED"] as const;

export const STRESS_EVIDENCE = {
  deploymentId: "STRESS_SECURITY_DEPLOYMENT",
  solvencyBlocked: true,
  badDebtBaseUnits: "2099781",
} as const;
