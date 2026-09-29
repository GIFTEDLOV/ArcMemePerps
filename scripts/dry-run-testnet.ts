const expectedChainId = 5_042_002n;
const expectedUsdc = "0x3600000000000000000000000000000000000000";

const config = {
  network: "ARC_TESTNET",
  chainId: BigInt(process.env.ARC_TESTNET_CHAIN_ID ?? expectedChainId.toString()),
  rpcUrl: process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.io",
  collateralToken: process.env.ARC_TESTNET_USDC_ADDRESS ?? expectedUsdc,
  collateralDecimals: 6,
  riskRuleVersion: process.env.RISK_RULE_VERSION ?? "0.1.0",
  initialOpenInterest: 0n,
  insuranceCapital: BigInt(process.env.INITIAL_INSURANCE_CAPITAL_USDC ?? "0"),
  oracleRouterConfigured: process.env.ORACLE_ROUTER_ADDRESS !== undefined,
  initialRolesConfigured: process.env.PROTOCOL_OWNER_ADDRESS !== undefined,
};

const errors: string[] = [];
if (config.chainId !== expectedChainId)
  errors.push(`wrong Arc Testnet chain ID: ${config.chainId}`);
if (!/^0x[0-9a-fA-F]{40}$/.test(config.collateralToken))
  errors.push("invalid collateral token address");
if (config.collateralDecimals !== 6) errors.push("collateral must use 6 decimals");
if (config.initialOpenInterest !== 0n) errors.push("initial OI must be zero");
if (config.insuranceCapital < 0n) errors.push("insurance capital cannot be negative");

console.log(
  JSON.stringify(
    { mode: "DRY_RUN_ONLY", config, errors },
    (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
    2,
  ),
);

if (errors.length > 0) process.exitCode = 1;
