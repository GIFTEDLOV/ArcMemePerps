import deployment from "../../../../evidence/gate4i/product-deployment.json";

export const PRODUCT = {
  id: "arc-testnet-product-v2",
  chainId: 5042002,
  chainName: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.io",
  apiUrl: import.meta.env.VITE_API_URL ?? "/api/v1",
  marketId: deployment.productState.marketId,
  addresses: deployment.addresses,
  contractSourceSha: deployment.contractSourceSha256,
  runtimeParity: deployment.runtimeBytecodeParity,
  riskRuleVersion: deployment.productState.riskRuleVersion,
} as const;

export const STRESS = {
  id: "STRESS_SECURITY_DEPLOYMENT",
  marketId: "0xf8ffffb2f0f52e8bb2b71484007f5cf705f41f83369be65b4fba067293723387",
  badDebt: "2099781",
  solvencyBlocked: true,
} as const;
