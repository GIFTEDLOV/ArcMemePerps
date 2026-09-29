const expectedChainId = 5_042_002n;
const expectedUsdc = "0x3600000000000000000000000000000000000000";

export interface DeploymentRiskBudgetInput {
  readonly vaultBackingUsdc: bigint;
  readonly insuranceUsdc: bigint;
  readonly maxLeverageX: bigint;
  readonly maxOIUsdc: bigint;
  readonly maxLongOIUsdc: bigint;
  readonly maxShortOIUsdc: bigint;
  readonly maxPositionUsdc: bigint;
}

export function deploymentRiskBudget(input: DeploymentRiskBudgetInput) {
  const backstopUsdc = input.vaultBackingUsdc + input.insuranceUsdc;
  const worstBoundedDirectionalExposureUsdc =
    input.maxLongOIUsdc > input.maxShortOIUsdc ? input.maxLongOIUsdc : input.maxShortOIUsdc;
  const safe =
    input.maxLeverageX <= 5n &&
    input.maxPositionUsdc <= input.maxOIUsdc &&
    input.maxLongOIUsdc <= input.maxOIUsdc &&
    input.maxShortOIUsdc <= input.maxOIUsdc &&
    worstBoundedDirectionalExposureUsdc <= backstopUsdc / 10n;

  return {
    vaultBackingUsdc: input.vaultBackingUsdc,
    insuranceUsdc: input.insuranceUsdc,
    backstopUsdc,
    maxLeverageX: input.maxLeverageX,
    maxOIUsdc: input.maxOIUsdc,
    maxLongOIUsdc: input.maxLongOIUsdc,
    maxShortOIUsdc: input.maxShortOIUsdc,
    maxPositionUsdc: input.maxPositionUsdc,
    worstBoundedDirectionalExposureUsdc,
    status: safe ? "RISK_BUDGET_SAFE" : "RISK_BUDGET_UNSAFE",
  } as const;
}

const config = {
  network: "ARC_TESTNET",
  chainId: BigInt(process.env.ARC_TESTNET_CHAIN_ID ?? expectedChainId.toString()),
  rpcUrl: process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.io",
  collateralToken: process.env.ARC_TESTNET_USDC_ADDRESS ?? expectedUsdc,
  collateralDecimals: 6,
  riskRuleVersion: process.env.RISK_RULE_VERSION ?? "0.1.0",
  initialOpenInterest: 0n,
  insuranceCapital: BigInt(process.env.INITIAL_INSURANCE_BASE_UNITS ?? "2000000"),
  vaultBacking: BigInt(process.env.INITIAL_VAULT_BACKING_BASE_UNITS ?? "5000000"),
  maxLeverageX: 2n,
  maxOI: 1_000_000n,
  maxLongOI: 500_000n,
  maxShortOI: 500_000n,
  maxPosition: 200_000n,
  oracleRouterConfigured: process.env.ORACLE_ROUTER_ADDRESS !== undefined,
  initialRolesConfigured: process.env.PROTOCOL_OWNER_ADDRESS !== undefined,
};

const riskBudget = deploymentRiskBudget({
  vaultBackingUsdc: config.vaultBacking,
  insuranceUsdc: config.insuranceCapital,
  maxLeverageX: config.maxLeverageX,
  maxOIUsdc: config.maxOI,
  maxLongOIUsdc: config.maxLongOI,
  maxShortOIUsdc: config.maxShortOI,
  maxPositionUsdc: config.maxPosition,
});

const errors: string[] = [];
if (config.chainId !== expectedChainId)
  errors.push(`wrong Arc Testnet chain ID: ${config.chainId}`);
if (!/^0x[0-9a-fA-F]{40}$/.test(config.collateralToken))
  errors.push("invalid collateral token address");
if (config.collateralDecimals !== 6) errors.push("collateral must use 6 decimals");
if (config.initialOpenInterest !== 0n) errors.push("initial OI must be zero");
if (config.insuranceCapital < 0n) errors.push("insurance capital cannot be negative");
if (riskBudget.status !== "RISK_BUDGET_SAFE") errors.push("deployment risk budget is unsafe");

console.log(
  JSON.stringify(
    { mode: "DRY_RUN_ONLY", config, riskBudget, errors },
    (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
    2,
  ),
);

if (errors.length > 0) process.exitCode = 1;
