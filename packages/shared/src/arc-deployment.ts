export const ARC_MAINNET = {
  network: "MAINNET",
  chainId: 5042,
  chainName: "Arc Mainnet",
  rpcUrl: "https://rpc.mainnet.arc.io",
  explorerUrl: "https://explorer.arc.io",
  usdcAddress: "0x3600000000000000000000000000000000000000",
} as const;

export const ARC_TESTNET = {
  network: "TESTNET",
  chainId: 5042002,
  chainName: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.io",
  explorerUrl: "https://testnet.arcscan.app",
  usdcAddress: "0x3600000000000000000000000000000000000000",
} as const;

export const ARC_DEPLOYMENT_CONTRACTS = [
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

export type ArcDeploymentContract = (typeof ARC_DEPLOYMENT_CONTRACTS)[number];
export type ArcDeploymentNetwork = "MAINNET" | "TESTNET";
export type ArcDeploymentLifecycle = "DEPLOYMENT_PENDING" | "DEPLOYED_MARKETS_UNVERIFIED" | "DEPLOYED_ZERO_MARKETS" | "LIVE_MARKETS_AVAILABLE";
export type ArcDeploymentAddresses = Partial<Record<ArcDeploymentContract, string>>;

export interface ArcDeploymentConfig {
  readonly network: ArcDeploymentNetwork;
  readonly chainId: number;
  readonly chainName: string;
  readonly rpcUrl: string;
  readonly explorerUrl: string;
  readonly usdcAddress: string;
  readonly deploymentId: string;
  readonly policyVersion: "0.4.0";
  readonly startBlock: bigint | null;
  readonly addresses: ArcDeploymentAddresses;
  readonly deploymentStatus: "PENDING" | "DEPLOYED";
  readonly lifecycle: ArcDeploymentLifecycle;
  readonly persistenceNamespace: string;
}

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const CONTRACT_ENV_VARS: Readonly<Record<ArcDeploymentContract, string>> = {
  MarketRegistry: "MAINNET_MARKET_REGISTRY",
  QualificationRegistry: "MAINNET_QUALIFICATION_REGISTRY",
  OracleRouter: "MAINNET_ORACLE_ROUTER",
  RiskConfig: "MAINNET_RISK_CONFIG",
  USDCMarginVault: "MAINNET_USDC_MARGIN_VAULT",
  PerpEngine: "MAINNET_PERP_ENGINE",
  InsuranceFund: "MAINNET_INSURANCE_FUND",
  PublicLPVault: "MAINNET_PUBLIC_LP_VAULT",
  ADLController: "MAINNET_ADL_CONTROLLER",
  ProtocolTimelock: "MAINNET_PROTOCOL_TIMELOCK",
};

export function isEvmAddress(value: unknown): value is string {
  return typeof value === "string" && ADDRESS_PATTERN.test(value.trim());
}

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function parseChainId(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = envValue(env, name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseStartBlock(env: NodeJS.ProcessEnv): bigint | null {
  const value = envValue(env, "MAINNET_START_BLOCK");
  if (!value) return null;
  if (!/^\d+$/.test(value)) throw new Error("MAINNET_START_BLOCK must be a non-negative integer");
  return BigInt(value);
}

function readAddresses(env: NodeJS.ProcessEnv, networkPrefix = "MAINNET"): ArcDeploymentAddresses {
  const addresses: ArcDeploymentAddresses = {};
  for (const contract of ARC_DEPLOYMENT_CONTRACTS) {
    const envName = CONTRACT_ENV_VARS[contract].replace("MAINNET_", `${networkPrefix}_`);
    const value = envValue(env, envName);
    if (value) {
      if (!isEvmAddress(value)) throw new Error(`${envName} must be a valid EVM address`);
      addresses[contract] = value;
    }
  }
  return addresses;
}

function allAddressesPresent(addresses: ArcDeploymentAddresses): boolean {
  return ARC_DEPLOYMENT_CONTRACTS.every((contract) => isEvmAddress(addresses[contract]));
}

function addressIdentity(addresses: ArcDeploymentAddresses): string {
  return ARC_DEPLOYMENT_CONTRACTS.map((contract) => `${contract}=${addresses[contract] ?? "pending"}`).join(",");
}

export function deploymentLifecycle(input: {
  readonly deploymentStatus: "PENDING" | "DEPLOYED";
  readonly registeredPerpCount?: number;
  readonly livePerpCount?: number;
}): ArcDeploymentLifecycle {
  if (input.deploymentStatus !== "DEPLOYED") return "DEPLOYMENT_PENDING";
  if (input.livePerpCount === undefined) return "DEPLOYED_MARKETS_UNVERIFIED";
  if (input.livePerpCount > 0) return "LIVE_MARKETS_AVAILABLE";
  return "DEPLOYED_ZERO_MARKETS";
}

export function loadArcDeploymentConfig(env: NodeJS.ProcessEnv = process.env): ArcDeploymentConfig {
  const network = (envValue(env, "ARCMEMEPERPS_DEPLOYMENT_NETWORK") ?? "MAINNET").toUpperCase();
  if (network !== "MAINNET" && network !== "TESTNET") {
    throw new Error("ARCMEMEPERPS_DEPLOYMENT_NETWORK must be MAINNET or TESTNET");
  }

  if (network === "TESTNET") {
    const chainId = parseChainId(env, "ARC_TESTNET_CHAIN_ID", ARC_TESTNET.chainId);
    if (chainId !== ARC_TESTNET.chainId) throw new Error(`Arc Testnet chain ID must be ${ARC_TESTNET.chainId}`);
    const addresses = readAddresses(env, "TESTNET");
    const deploymentStatus = allAddressesPresent(addresses) ? "DEPLOYED" : "PENDING";
    const deploymentId = envValue(env, "TESTNET_DEPLOYMENT_ID") ?? "arc-testnet-pending";
    return {
      ...ARC_TESTNET,
      network,
      chainId,
      rpcUrl: envValue(env, "ARC_TESTNET_RPC_URL") ?? ARC_TESTNET.rpcUrl,
      usdcAddress: envValue(env, "ARC_TESTNET_USDC_ADDRESS") ?? ARC_TESTNET.usdcAddress,
      deploymentId,
      policyVersion: "0.4.0",
      startBlock: null,
      addresses,
      deploymentStatus,
      lifecycle: deploymentLifecycle({ deploymentStatus }),
      persistenceNamespace: `arcmemeperps:testnet:chain-${chainId}:${deploymentId}:contracts-${addressIdentity(addresses)}`,
    };
  }

  const chainId = parseChainId(env, "ARC_MAINNET_CHAIN_ID", ARC_MAINNET.chainId);
  if (chainId !== ARC_MAINNET.chainId) throw new Error("Arc Mainnet chain ID must be 5042");
  const usdcAddress = envValue(env, "ARC_MAINNET_USDC_ADDRESS") ?? ARC_MAINNET.usdcAddress;
  if (!isEvmAddress(usdcAddress) || usdcAddress.toLowerCase() !== ARC_MAINNET.usdcAddress.toLowerCase()) {
    throw new Error("ARC_MAINNET_USDC_ADDRESS must match the official Arc Mainnet USDC address");
  }
  const addresses = readAddresses(env);
  const startBlock = parseStartBlock(env);
  const deploymentStatus = allAddressesPresent(addresses) && startBlock !== null ? "DEPLOYED" : "PENDING";
  const deploymentId = envValue(env, "MAINNET_DEPLOYMENT_ID") ?? "arc-mainnet-pending";
  const policyVersion = envValue(env, "RISK_RULE_VERSION") ?? "0.4.0";
  if (policyVersion !== "0.4.0") throw new Error("RISK_RULE_VERSION must remain 0.4.0");
  return {
    ...ARC_MAINNET,
    network,
    chainId,
    rpcUrl: envValue(env, "ARC_MAINNET_RPC_URL") ?? ARC_MAINNET.rpcUrl,
    explorerUrl: envValue(env, "ARC_MAINNET_EXPLORER_URL") ?? ARC_MAINNET.explorerUrl,
    usdcAddress,
    deploymentId,
    policyVersion,
    startBlock,
    addresses,
    deploymentStatus,
    lifecycle: deploymentLifecycle({ deploymentStatus }),
    persistenceNamespace: `arcmemeperps:mainnet:chain-${chainId}:${deploymentId}:contracts-${addressIdentity(addresses)}`,
  };
}

export function contractAddressEnvVar(contract: ArcDeploymentContract): string {
  return CONTRACT_ENV_VARS[contract];
}

export function arcDeploymentSummary(config: ArcDeploymentConfig): Record<string, unknown> {
  return {
    network: config.network === "MAINNET" ? "Arc Mainnet" : "Arc Testnet",
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    explorerUrl: config.explorerUrl,
    usdc: config.usdcAddress,
    deploymentId: config.deploymentId,
    deploymentStatus: config.lifecycle,
    policyVersion: config.policyVersion,
    addresses: config.addresses,
    persistenceNamespace: config.persistenceNamespace,
  };
}
