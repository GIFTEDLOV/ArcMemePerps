import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Address, Hex } from "viem";

type ProductDeployment = {
  readonly chainId: number;
  readonly rpc: string;
  readonly deploymentBlockRange: readonly [number, number];
  readonly addresses: {
    readonly QualificationRegistry: Address;
    readonly MarketRegistry: Address;
    readonly OracleRouter: Address;
    readonly RiskConfig: Address;
    readonly USDCMarginVault: Address;
    readonly InsuranceFund: Address;
    readonly PerpEngine: Address;
    readonly PublicLPVault: Address;
    readonly ADLController: Address;
    readonly ProtocolTimelock: Address;
  };
  readonly productState: { readonly marketId: Hex; readonly oracleReporterThreshold: string };
  readonly contractSourceSha256: string;
};

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), "evidence/gate4i/product-deployment.json"), "utf8"),
) as ProductDeployment;

function configuredAddress(name: string, expected: Address): Address {
  const configured = process.env[name]?.trim();
  if (configured !== undefined && configured.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${name} must match the verified Product Testnet deployment manifest`);
  }
  return expected.toLowerCase() as Address;
}

function manifestAddress(address: Address): Address {
  return address.toLowerCase() as Address;
}

function configuredMarketId(): Hex {
  const expected = deployment.productState.marketId;
  const configured = process.env.PRODUCT_MARKET_ID?.trim();
  if (configured !== undefined && configured.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("PRODUCT_MARKET_ID must match the verified Product Testnet deployment manifest");
  }
  return expected;
}

function configuredStartBlock(): bigint {
  const expected = BigInt(deployment.deploymentBlockRange[0]);
  const configured = process.env.PRODUCT_START_BLOCK?.trim();
  if (configured !== undefined && (!/^\d+$/.test(configured) || BigInt(configured) !== expected)) {
    throw new Error("PRODUCT_START_BLOCK must match the verified Product Testnet deployment manifest");
  }
  return expected;
}

export const PRODUCT_ADDRESSES = {
  QualificationRegistry: manifestAddress(deployment.addresses.QualificationRegistry),
  MarketRegistry: manifestAddress(deployment.addresses.MarketRegistry),
  OracleRouter: configuredAddress("ORACLE_ROUTER_ADDRESS", deployment.addresses.OracleRouter),
  RiskConfig: manifestAddress(deployment.addresses.RiskConfig),
  USDCMarginVault: manifestAddress(deployment.addresses.USDCMarginVault),
  InsuranceFund: manifestAddress(deployment.addresses.InsuranceFund),
  PerpEngine: configuredAddress("PERP_ENGINE_ADDRESS", deployment.addresses.PerpEngine),
  PublicLPVault: manifestAddress(deployment.addresses.PublicLPVault),
  ADLController: manifestAddress(deployment.addresses.ADLController),
  ProtocolTimelock: manifestAddress(deployment.addresses.ProtocolTimelock),
} as const;

export const PRODUCT_RELEASE = {
  deploymentId: "arc-testnet-product-v2",
  chainId: deployment.chainId,
  rpcUrl: process.env.RPC_URL?.trim() || deployment.rpc,
  oracleRouter: PRODUCT_ADDRESSES.OracleRouter,
  perpEngine: PRODUCT_ADDRESSES.PerpEngine,
  marketId: configuredMarketId(),
  reporterSetVersion: (process.env.REPORTER_SET_VERSION ??
    "0xfcf04628118b4208901b1b67765496ba7236d1bc43590f5573d9de0305c38b26") as Hex,
  startBlock: configuredStartBlock(),
  contractSourceSha: deployment.contractSourceSha256,
  oracleIntervalMs: Number(process.env.ORACLE_INTERVAL_MS ?? "30000"),
  keeperIntervalMs: Number(process.env.KEEPER_INTERVAL_MS ?? "5000"),
} as const;

if (
  PRODUCT_RELEASE.chainId !== 5042002 ||
  PRODUCT_RELEASE.deploymentId !== "arc-testnet-product-v2"
) {
  throw new Error("PRODUCT_RELEASE_CONFIG_INVALID");
}
