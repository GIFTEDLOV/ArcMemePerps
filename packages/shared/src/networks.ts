import type { SupportedChain } from "./index.js";

export interface EvmNetworkConfig {
  readonly kind: "EVM";
  readonly chain: SupportedChain;
  readonly chainId: number;
  readonly name: string;
  readonly rpcEnvVar: string;
  readonly defaultRpcUrl: string;
  readonly dexScreenerChainId: string;
  readonly goPlusChainId: string;
  readonly bubbleMapsChainId: string;
}

export interface SolanaNetworkConfig {
  readonly kind: "SOLANA";
  readonly chain: "SOLANA";
  readonly name: string;
  readonly rpcEnvVar: string;
  readonly defaultRpcUrl: string;
  readonly dexScreenerChainId: "solana";
  readonly goPlusChainId: "solana";
  readonly bubbleMapsChainId: "solana";
}

export type SupportedNetworkConfig = EvmNetworkConfig | SolanaNetworkConfig;

export const NETWORK_CONFIGS = {
  ARC: {
    kind: "EVM",
    chain: "ARC",
    chainId: 5042,
    name: "Arc Mainnet",
    rpcEnvVar: "ARC_MAINNET_RPC_URL",
    defaultRpcUrl: "https://rpc.mainnet.arc.io",
    dexScreenerChainId: "arc",
    goPlusChainId: "5042",
    bubbleMapsChainId: "arc",
  },
  SOLANA: {
    kind: "SOLANA",
    chain: "SOLANA",
    name: "Solana Mainnet Beta",
    rpcEnvVar: "SOLANA_RPC_URL",
    defaultRpcUrl: "https://api.mainnet-beta.solana.com",
    dexScreenerChainId: "solana",
    goPlusChainId: "solana",
    bubbleMapsChainId: "solana",
  },
  ETHEREUM: {
    kind: "EVM",
    chain: "ETHEREUM",
    chainId: 1,
    name: "Ethereum Mainnet",
    rpcEnvVar: "ETHEREUM_RPC_URL",
    defaultRpcUrl: "https://ethereum-rpc.publicnode.com",
    dexScreenerChainId: "ethereum",
    goPlusChainId: "1",
    bubbleMapsChainId: "eth",
  },
  BASE: {
    kind: "EVM",
    chain: "BASE",
    chainId: 8453,
    name: "Base Mainnet",
    rpcEnvVar: "BASE_RPC_URL",
    defaultRpcUrl: "https://mainnet.base.org",
    dexScreenerChainId: "base",
    goPlusChainId: "8453",
    bubbleMapsChainId: "base",
  },
  BNB: {
    kind: "EVM",
    chain: "BNB",
    chainId: 56,
    name: "BNB Smart Chain Mainnet",
    rpcEnvVar: "BNB_RPC_URL",
    defaultRpcUrl: "https://bsc-dataseed.binance.org",
    dexScreenerChainId: "bsc",
    goPlusChainId: "56",
    bubbleMapsChainId: "bsc",
  },
  ROBINHOOD: {
    kind: "EVM",
    chain: "ROBINHOOD",
    chainId: 4663,
    name: "Robinhood Chain Mainnet",
    rpcEnvVar: "ROBINHOOD_RPC_URL",
    defaultRpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    dexScreenerChainId: "robinhood",
    goPlusChainId: "4663",
    bubbleMapsChainId: "robinhood",
  },
} as const satisfies Record<SupportedChain, SupportedNetworkConfig>;

export function rpcUrlForNetwork(
  network: SupportedNetworkConfig,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return environment[network.rpcEnvVar]?.trim() || network.defaultRpcUrl;
}

/**
 * Returns an ordered, de-duplicated RPC pool. The primary URL uses the existing
 * network variable; optional comma-separated fallbacks use `<RPC_ENV_VAR>_FALLBACKS`.
 */
export function rpcUrlsForNetwork(
  network: SupportedNetworkConfig,
  environment: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const primary = rpcUrlForNetwork(network, environment);
  const fallbackKey = `${network.rpcEnvVar}_FALLBACKS`;
  const fallbacks = (environment[fallbackKey] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set([primary, ...fallbacks])];
}
