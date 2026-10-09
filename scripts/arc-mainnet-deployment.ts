import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  stringToHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ARC_DEPLOYMENT_CONTRACTS,
  ARC_MAINNET,
  isEvmAddress,
  loadArcDeploymentConfig,
  type ArcDeploymentContract,
} from "@arcmemeperps/shared";

const ROOT = resolve(process.cwd());
const EVIDENCE_DIR = resolve(ROOT, "evidence/mainnet");
const MANIFEST_PATH = resolve(EVIDENCE_DIR, "deployment-manifest.json");
const PROGRESS_PATH = resolve(EVIDENCE_DIR, "deployment-progress.json");
const CONTRACTS_PATH = resolve(EVIDENCE_DIR, "contracts.json");
const PROVENANCE_PATH = resolve(EVIDENCE_DIR, "mainnet-provenance.json");
const RELEASE_COMMIT = "009437861a45042b66641481f3671e2897777222";
const CONTRACT_SOURCE_SHA = "0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b";

const chain = defineChain({
  id: ARC_MAINNET.chainId,
  name: ARC_MAINNET.chainName,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_MAINNET.rpcUrl] } },
  blockExplorers: { default: { name: "Arc Explorer", url: ARC_MAINNET.explorerUrl } },
});

type Artifact = { readonly abi: Abi; readonly bytecode: { readonly object: Hex }; readonly deployedBytecode: { readonly object: Hex } };
type DeploymentRecord = { readonly name: ArcDeploymentContract; readonly address: Address; readonly txHash: Hex; readonly blockNumber: string; readonly gasUsed: string; readonly effectiveGasPrice: string | null; readonly runtimeHash: Hex; readonly artifactFileSha256: string };

function artifactPath(name: ArcDeploymentContract): string {
  return resolve(ROOT, `out/${name}.sol/${name}.json`);
}

function artifact(name: ArcDeploymentContract): Artifact {
  const path = artifactPath(name);
  if (!existsSync(path)) throw new Error(`MISSING_FROZEN_ARTIFACT:${path}`);
  const value = JSON.parse(readFileSync(path, "utf8")) as Artifact;
  if (!value.bytecode?.object || !value.deployedBytecode?.object) throw new Error(`INVALID_FROZEN_ARTIFACT:${name}`);
  return value;
}

function artifactFileSha256(name: ArcDeploymentContract): string {
  return createHash("sha256").update(readFileSync(artifactPath(name))).digest("hex");
}

function runtimeHash(value: Hex): Hex {
  return keccak256(value);
}

function envAddress(name: string, required: boolean): Address | null {
  const value = process.env[name]?.trim();
  if (!value) {
    if (required) throw new Error(`MISSING_MAINNET_ROLE_ADDRESS:${name}`);
    return null;
  }
  if (!isEvmAddress(value)) throw new Error(`INVALID_MAINNET_ROLE_ADDRESS:${name}`);
  return value as Address;
}

function envBigInt(name: string, required: boolean): bigint | null {
  const value = process.env[name]?.trim();
  if (!value) {
    if (required) throw new Error(`MISSING_MAINNET_CONSTRUCTOR_INPUT:${name}`);
    return null;
  }
  if (!/^\d+$/.test(value)) throw new Error(`INVALID_MAINNET_INTEGER:${name}`);
  return BigInt(value);
}

function roleInputs(required: boolean): Record<string, Address | null> {
  return {
    deployer: envAddress("MAINNET_DEPLOYER_ADDRESS", false) ?? "0x456A3ab835Bea90b42FF207B6c42BCE0BFF3e833",
    governanceSafe: envAddress("MAINNET_GOVERNANCE_SAFE", required),
    qualificationOperator: envAddress("MAINNET_QUALIFICATION_OPERATOR", required),
    riskOperator: envAddress("MAINNET_RISK_OPERATOR", required),
    oracleAdmin: envAddress("MAINNET_ORACLE_ADMIN", required),
    reporter1: envAddress("MAINNET_ORACLE_REPORTER_1", required),
    reporter2: envAddress("MAINNET_ORACLE_REPORTER_2", required),
    reporter3: envAddress("MAINNET_ORACLE_REPORTER_3", required),
    keeper: envAddress("MAINNET_KEEPER", required),
    emergencyAuthority: envAddress("MAINNET_EMERGENCY_AUTHORITY", required),
    insuranceManager: envAddress("MAINNET_INSURANCE_MANAGER", required),
    lpRiskController: envAddress("MAINNET_LP_RISK_CONTROLLER", required),
    treasuryFeeRecipient: envAddress("MAINNET_TREASURY_FEE_RECIPIENT", false),
  };
}

function constructorSchema(required: boolean): Record<string, readonly Record<string, unknown>[]> {
  const delay = envBigInt("MAINNET_TIMELOCK_DELAY_SECONDS", required);
  const oracleAge = envBigInt("MAINNET_ORACLE_MAX_AGE_SECONDS", required);
  const oracleConfidence = envBigInt("MAINNET_ORACLE_MIN_CONFIDENCE_BPS", required);
  const lpDelay = envBigInt("MAINNET_PUBLIC_LP_DELAY_SECONDS", required);
  return {
    QualificationRegistry: [],
    MarketRegistry: [{ name: "qualificationRegistry_", type: "address", value: "<QualificationRegistry>" }],
    OracleRouter: [
      { name: "maxStaleness_", type: "uint64", value: oracleAge?.toString() ?? null },
      { name: "minimumConfidenceBps_", type: "uint256", value: oracleConfidence?.toString() ?? null },
    ],
    RiskConfig: [{ name: "qualificationRegistry_", type: "address", value: "<QualificationRegistry>" }],
    USDCMarginVault: [],
    PerpEngine: [
      { name: "marketRegistry_", type: "address", value: "<MarketRegistry>" },
      { name: "riskConfig_", type: "address", value: "<RiskConfig>" },
      { name: "oracleRouter_", type: "address", value: "<OracleRouter>" },
      { name: "marginVault_", type: "address", value: "<USDCMarginVault>" },
      { name: "insuranceFund_", type: "address", value: "<InsuranceFund>" },
    ],
    InsuranceFund: [],
    PublicLPVault: [
      { name: "asset_", type: "address", value: ARC_MAINNET.usdcAddress },
      { name: "withdrawalCooldown_", type: "uint256", value: lpDelay?.toString() ?? null },
    ],
    ADLController: [{ name: "engine_", type: "address", value: "<PerpEngine>" }],
    ProtocolTimelock: [{ name: "minDelay_", type: "uint256", value: delay?.toString() ?? null }],
  };
}

function manifest(required = false): Record<string, unknown> {
  const config = loadArcDeploymentConfig({ ...process.env, ARCMEMEPERPS_DEPLOYMENT_NETWORK: "MAINNET" });
  const artifacts = Object.fromEntries(
    ARC_DEPLOYMENT_CONTRACTS.map((name) => {
      const compiled = artifact(name);
      return [name, {
        path: artifactPath(name).replace(`${ROOT}\\`, "").replaceAll("\\", "/"),
        artifactFileSha256: artifactFileSha256(name),
        creationBytecodeHash: runtimeHash(compiled.bytecode.object),
        runtimeBytecodeHash: runtimeHash(compiled.deployedBytecode.object),
      }];
    }),
  );
  return {
    schemaVersion: "arcmemeperps/mainnet-deployment-manifest/v1",
    broadcast: false,
    status: "PENDING_MAINNET_FUNDING",
    releaseCommit: RELEASE_COMMIT,
    contractSourceSha: CONTRACT_SOURCE_SHA,
    policyVersion: "0.4.0",
    network: config.chainName,
    chainId: ARC_MAINNET.chainId,
    rpc: ARC_MAINNET.rpcUrl,
    explorer: ARC_MAINNET.explorerUrl,
    usdc: ARC_MAINNET.usdcAddress,
    deploymentId: process.env.MAINNET_DEPLOYMENT_ID ?? "arc-mainnet-pending",
    deployer: roleInputs(false).deployer,
    governanceSafe: roleInputs(false).governanceSafe,
    safeRequirements: { minimumOwners: 2, preferredOwners: 3, threshold: 2, owners: [] },
    roleAddresses: roleInputs(false),
    deploymentOrder: ["QualificationRegistry", "MarketRegistry", "OracleRouter", "RiskConfig", "USDCMarginVault", "InsuranceFund", "PerpEngine", "PublicLPVault", "ADLController", "ProtocolTimelock"],
    constructorSchema: constructorSchema(required),
    artifacts,
    zeroMarketGenesis: {
      registeredRealPerps: 0,
      liveRealPerps: 0,
      oi: "0",
      positions: 0,
      badDebt: "0",
      solvencyBlocked: false,
      qualificationProofs: 0,
      oracleMarketSequences: 0,
    },
    stopConditions: ["wrong chain", "partial deployment progress", "receipt failure", "runtime bytecode mismatch", "role mismatch", "unexpected market or exposure", "secret exposure"],
    unresolved: ["funding", "governance Safe creation", "deployment addresses", "deployment transaction hashes", "deployment blocks", "final runtime hashes"],
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertFrozenSource(): void {
  if (process.env.CONTRACT_SOURCE_SHA && process.env.CONTRACT_SOURCE_SHA !== CONTRACT_SOURCE_SHA) throw new Error("CONTRACT_SOURCE_SHA_MISMATCH");
  if (process.env.RELEASE_COMMIT && process.env.RELEASE_COMMIT !== RELEASE_COMMIT) throw new Error("RELEASE_COMMIT_MISMATCH");
}

function assertNoPartialProgress(): void {
  if (!existsSync(PROGRESS_PATH)) return;
  const progress = JSON.parse(readFileSync(PROGRESS_PATH, "utf8")) as { readonly deployments?: readonly unknown[]; readonly failed?: boolean };
  if ((progress.deployments?.length ?? 0) > 0 || progress.failed === true) throw new Error("PARTIAL_DEPLOYMENT_REQUIRES_MANUAL_REVIEW");
}

function requireAddress(value: Address | null, name: string): Address {
  if (value === null) throw new Error(`MISSING_DEPLOYMENT_ADDRESS:${name}`);
  return value;
}

const roleHash = (name: string): Hex => keccak256(stringToHex(name));

async function configureSuite(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  deployed: Partial<Record<ArcDeploymentContract, Address>>,
): Promise<readonly Hex[]> {
  const roles = roleInputs(true);
  const hashes: Hex[] = [];
  const call = async (contract: ArcDeploymentContract, functionName: string, args: readonly unknown[]): Promise<void> => {
    const address = requireAddress(deployed[contract] ?? null, contract);
    const hash = await walletClient.writeContract({
      address,
      abi: artifact(contract).abi,
      functionName,
      args,
      chain,
      account: walletClient.account!,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`CONFIGURATION_RECEIPT_FAILURE:${contract}:${functionName}`);
    hashes.push(hash);
  };
  const roleAssignments: readonly [string, Address][] = [
    ["GOVERNANCE_ADMIN", requireAddress(roles.governanceSafe ?? null, "governanceSafe")],
    ["RISK_ADMIN", requireAddress(roles.riskOperator ?? null, "riskOperator")],
    ["EMERGENCY_ADMIN", requireAddress(roles.emergencyAuthority ?? null, "emergencyAuthority")],
    ["ORACLE_ADMIN", requireAddress(roles.oracleAdmin ?? null, "oracleAdmin")],
    ["QUALIFICATION_WRITER", requireAddress(roles.qualificationOperator ?? null, "qualificationOperator")],
    ["KEEPER", requireAddress(roles.keeper ?? null, "keeper")],
    ["INSURANCE_MANAGER", requireAddress(roles.insuranceManager ?? null, "insuranceManager")],
  ];
  for (const contract of ARC_DEPLOYMENT_CONTRACTS) {
    for (const [name, account] of roleAssignments) await call(contract, "setRole", [roleHash(name), account, true]);
    await call(contract, "setGovernanceExecutor", [requireAddress(deployed.ProtocolTimelock ?? null, "ProtocolTimelock")]);
  }

  await call("USDCMarginVault", "setCollateralToken", [ARC_MAINNET.usdcAddress]);
  await call("USDCMarginVault", "setEngine", [requireAddress(deployed.PerpEngine ?? null, "PerpEngine")]);
  await call("InsuranceFund", "setCollateralToken", [ARC_MAINNET.usdcAddress]);
  await call("InsuranceFund", "setEngine", [requireAddress(deployed.PerpEngine ?? null, "PerpEngine")]);
  await call("RiskConfig", "setExposureProvider", [requireAddress(deployed.PerpEngine ?? null, "PerpEngine")]);
  await call("PublicLPVault", "setRiskController", [requireAddress(roles.lpRiskController ?? null, "lpRiskController")]);
  await call("PerpEngine", "setADLController", [requireAddress(deployed.ADLController ?? null, "ADLController")]);
  await call("PerpEngine", "setOrderKeeper", [requireAddress(roles.keeper ?? null, "keeper"), true]);
  await call("PerpEngine", "setLiquidationKeeper", [requireAddress(roles.keeper ?? null, "keeper"), true]);
  await call("ADLController", "setKeeper", [requireAddress(roles.keeper ?? null, "keeper")]);
  await call("OracleRouter", "setReporter", [requireAddress(roles.reporter1 ?? null, "reporter1"), true]);
  await call("OracleRouter", "setReporter", [requireAddress(roles.reporter2 ?? null, "reporter2"), true]);
  await call("OracleRouter", "setReporter", [requireAddress(roles.reporter3 ?? null, "reporter3"), true]);
  await call("OracleRouter", "setReporterThreshold", [2n, requireBytes32(process.env.MAINNET_REPORTER_SET_VERSION, "MAINNET_REPORTER_SET_VERSION")]);
  await call("OracleRouter", "setPolicy", [envBigInt("MAINNET_ORACLE_MAX_AGE_SECONDS", true)!, envBigInt("MAINNET_ORACLE_MIN_CONFIDENCE_BPS", true)!, 2n]);

  for (const contract of ARC_DEPLOYMENT_CONTRACTS) await call(contract, "finalizeBootstrap", []);
  return hashes;
}

function requireBytes32(value: string | undefined, name: string): Hex {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value.trim())) throw new Error(`MISSING_MAINNET_BYTES32:${name}`);
  return value.trim() as Hex;
}

function resolveArgs(name: ArcDeploymentContract, deployed: Partial<Record<ArcDeploymentContract, Address>>): readonly unknown[] {
  const address = (contract: ArcDeploymentContract) => requireAddress(deployed[contract] ?? null, contract);
  switch (name) {
    case "QualificationRegistry": return [];
    case "MarketRegistry": return [address("QualificationRegistry")];
    case "OracleRouter": return [envBigInt("MAINNET_ORACLE_MAX_AGE_SECONDS", true)!, envBigInt("MAINNET_ORACLE_MIN_CONFIDENCE_BPS", true)!];
    case "RiskConfig": return [address("QualificationRegistry")];
    case "USDCMarginVault": return [];
    case "InsuranceFund": return [];
    case "PerpEngine": return [address("MarketRegistry"), address("RiskConfig"), address("OracleRouter"), address("USDCMarginVault"), address("InsuranceFund")];
    case "PublicLPVault": return [ARC_MAINNET.usdcAddress, envBigInt("MAINNET_PUBLIC_LP_DELAY_SECONDS", true)!];
    case "ADLController": return [address("PerpEngine")];
    case "ProtocolTimelock": return [envBigInt("MAINNET_TIMELOCK_DELAY_SECONDS", true)!];
    default: throw new Error("UNSUPPORTED_CONTRACT");
  }
}

async function deploySuite(): Promise<void> {
  assertFrozenSource();
  assertNoPartialProgress();
  const config = loadArcDeploymentConfig({ ...process.env, ARCMEMEPERPS_DEPLOYMENT_NETWORK: "MAINNET" });
  if (config.deploymentStatus !== "PENDING") throw new Error("MAINNET_DEPLOYMENT_ALREADY_CONFIGURED");
  const deployer = requireAddress(roleInputs(true).deployer ?? null, "deployer");
  const privateKey = process.env.MAINNET_DEPLOYER_PRIVATE_KEY?.trim();
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("MAINNET_DEPLOYER_PRIVATE_KEY_NOT_AVAILABLE");
  const account = privateKeyToAccount(privateKey as Hex);
  if (account.address.toLowerCase() !== deployer.toLowerCase()) throw new Error("DEPLOYER_SIGNER_MISMATCH");
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
  if (await publicClient.getChainId() !== ARC_MAINNET.chainId) throw new Error("MAINNET_CHAIN_ID_MISMATCH");
  const balance = await publicClient.getBalance({ address: account.address });
  if (balance === 0n) throw new Error("MAINNET_DEPLOYER_UNFUNDED");

  const progress: { readonly schemaVersion: string; readonly chainId: number; readonly deployments: DeploymentRecord[]; failed?: boolean; failure?: string } = { schemaVersion: "arcmemeperps/mainnet-deployment-progress/v1", chainId: ARC_MAINNET.chainId, deployments: [] };
  const deployed: Partial<Record<ArcDeploymentContract, Address>> = {};
  try {
    for (const name of ["QualificationRegistry", "MarketRegistry", "OracleRouter", "RiskConfig", "USDCMarginVault", "InsuranceFund", "PerpEngine", "PublicLPVault", "ADLController", "ProtocolTimelock"] as const) {
      const compiled = artifact(name);
      const hash = await walletClient.deployContract({ abi: compiled.abi, bytecode: compiled.bytecode.object, args: resolveArgs(name, deployed) });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`DEPLOYMENT_RECEIPT_FAILURE:${name}`);
      const address = receipt.contractAddress;
      const runtime = await publicClient.getBytecode({ address });
      if (!runtime || runtimeHash(runtime) !== runtimeHash(compiled.deployedBytecode.object)) throw new Error(`RUNTIME_BYTECODE_MISMATCH:${name}`);
      deployed[name] = address;
      progress.deployments.push({ name, address, txHash: hash, blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice?.toString() ?? null, runtimeHash: runtimeHash(runtime), artifactFileSha256: artifactFileSha256(name) });
      writeJson(PROGRESS_PATH, progress);
    }
  } catch (error) {
    const failed = { ...progress, failed: true, failure: error instanceof Error ? error.message : "DEPLOYMENT_FAILED" };
    writeJson(PROGRESS_PATH, failed);
    throw error;
  }
  const configurationTxs = await configureSuite(walletClient, publicClient, deployed);
  const firstBlock = progress.deployments[0]?.blockNumber ?? null;
  const lastBlock = progress.deployments.at(-1)?.blockNumber ?? null;
  const addresses = Object.fromEntries(progress.deployments.map((item) => [item.name, item.address]));
  writeJson(CONTRACTS_PATH, {
    schemaVersion: "arcmemeperps/mainnet-contracts/v1",
    chainId: ARC_MAINNET.chainId,
    deploymentId: process.env.MAINNET_DEPLOYMENT_ID ?? "arc-mainnet-production",
    releaseCommit: RELEASE_COMMIT,
    contractSourceSha: CONTRACT_SOURCE_SHA,
    deploymentBlocks: { first: firstBlock, last: lastBlock },
    contracts: progress.deployments,
    configurationTransactions: configurationTxs,
  });
  writeJson(PROVENANCE_PATH, {
    schemaVersion: "arcmemeperps/mainnet-provenance/v1",
    releaseCommit: RELEASE_COMMIT,
    contractSourceSha: CONTRACT_SOURCE_SHA,
    policyVersion: "0.4.0",
    chain: { name: ARC_MAINNET.chainName, chainId: ARC_MAINNET.chainId, rpc: ARC_MAINNET.rpcUrl, explorer: ARC_MAINNET.explorerUrl, usdc: ARC_MAINNET.usdcAddress },
    deployment: { addresses, transactions: progress.deployments.map((item) => item.txHash), configurationTransactions: configurationTxs, blockRange: { first: firstBlock, last: lastBlock } },
    roles: roleInputs(true),
    genesis: { registeredRealPerps: 0, liveRealPerps: 0, oi: "0", positions: 0, badDebt: "0", solvencyBlocked: false },
    broadcast: true,
  });
  console.log(`DEPLOYED ${progress.deployments.length} FROZEN COMPONENTS`);
}

function main(): void {
  const command = process.argv[2] ?? "--manifest";
  if (command === "--manifest") {
    assertFrozenSource();
    writeJson(MANIFEST_PATH, manifest(false));
    console.log(`WROTE ${MANIFEST_PATH}`);
    return;
  }
  if (command === "--deploy") {
    void deploySuite().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
    return;
  }
  throw new Error("usage: tsx scripts/arc-mainnet-deployment.ts --manifest|--deploy");
}

main();
