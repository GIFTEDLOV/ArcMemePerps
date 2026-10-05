import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Address, Hex } from "viem";

type ProductDeployment = {
  readonly addresses: { readonly OracleRouter: Address; readonly PerpEngine: Address };
  readonly productState: { readonly marketId: Hex; readonly oracleReporterThreshold: string };
  readonly contractSourceSha256: string;
};

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), "evidence/gate4i/product-deployment.json"), "utf8"),
) as ProductDeployment;

export const PRODUCT_RELEASE = {
  deploymentId: "arc-testnet-product-v2",
  chainId: 5042002,
  rpcUrl: process.env.RPC_URL ?? "https://rpc.testnet.arc.io",
  oracleRouter: (process.env.ORACLE_ROUTER_ADDRESS ?? deployment.addresses.OracleRouter) as Address,
  perpEngine: (process.env.PERP_ENGINE_ADDRESS ?? deployment.addresses.PerpEngine) as Address,
  marketId: (process.env.PRODUCT_MARKET_ID ?? deployment.productState.marketId) as Hex,
  reporterSetVersion: (process.env.REPORTER_SET_VERSION ??
    "0xfcf04628118b4208901b1b67765496ba7236d1bc43590f5573d9de0305c38b26") as Hex,
  startBlock: BigInt(process.env.PRODUCT_START_BLOCK ?? "65487723"),
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
