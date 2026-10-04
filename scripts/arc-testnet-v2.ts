import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { createPublicClient, getAddress, http, parseAbi, type Address } from "viem";

export const ARC_TESTNET_CHAIN_ID = 5_042_002;
export const ARC_TESTNET_RPC = "https://rpc.testnet.arc.io";
export const ARC_USDC = "0x3600000000000000000000000000000000000000" as Address;
export const CONTRACT_SOURCE_SHA =
  "0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b";
export const RISK_RULE_VERSION = "0.1.0";
export const QUALIFICATION_PROOF_VERSION = "2";
export const API_VERSION = "v1";

export const DEPLOYMENT_ORDER = [
  "QualificationRegistry",
  "MarketRegistry",
  "OracleRouter",
  "RiskConfig",
  "USDCMarginVault",
  "InsuranceFund",
  "PerpEngine",
  "PublicLPVault",
  "ADLController",
  "ProtocolTimelock",
] as const;

export type DeploymentContract = (typeof DEPLOYMENT_ORDER)[number];

export interface ActorRecord {
  readonly role: string;
  readonly publicAddress: Address;
  readonly signerSourceLabel: string;
}

interface ActorManifest {
  readonly actors: ActorRecord[];
}

export interface FundingRequirement {
  readonly role: string;
  readonly address: Address;
  readonly protocolRequiredUsdcBaseUnits: bigint;
  readonly gasReserveUsdcBaseUnits: bigint;
  readonly requiredEconomicUsdcBaseUnits: bigint;
  readonly requiresOnchainWrite: boolean;
}

export interface FundingObservation extends FundingRequirement {
  readonly nativeBalanceBaseUnits: bigint;
  readonly erc20BalanceBaseUnits: bigint;
  readonly nativeEconomicEquivalentBaseUnits: bigint;
  readonly unifiedEconomicBalanceBaseUnits: bigint;
  readonly economicDeficitBaseUnits: bigint;
  readonly nativeErc20RepresentationMatch: boolean;
  readonly gasCapability: "PASS" | "NOT_REQUIRED" | "FAIL";
}

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

const ROLE_ORDER = [
  "V2_DEPLOYER",
  "GOVERNANCE_ADMIN",
  "RISK_ADMIN",
  "EMERGENCY_ADMIN",
  "ORACLE_ADMIN",
  "QUALIFICATION_WRITER",
  "KEEPER",
  "INSURANCE_MANAGER",
  "REPORTER_1",
  "REPORTER_2",
  "REPORTER_3",
  "TRADER_LONG",
  "TRADER_SHORT",
  "LIQUIDATOR",
  "LP_1",
  "LP_2",
] as const;

export const REQUIRED_ACTOR_ROLES = [...ROLE_ORDER] as readonly string[];

export function expectedFunding(): FundingRequirement[] {
  const plan: Record<string, { protocol: bigint; gas: bigint }> = {
    V2_DEPLOYER: { protocol: 7_000_000n, gas: 1_000_000n },
    GOVERNANCE_ADMIN: { protocol: 0n, gas: 250_000n },
    EMERGENCY_ADMIN: { protocol: 0n, gas: 250_000n },
    QUALIFICATION_WRITER: { protocol: 0n, gas: 250_000n },
    KEEPER: { protocol: 0n, gas: 500_000n },
    TRADER_LONG: { protocol: 500_000n, gas: 250_000n },
    TRADER_SHORT: { protocol: 500_000n, gas: 250_000n },
    LP_1: { protocol: 1_000_000n, gas: 250_000n },
    LP_2: { protocol: 1_000_000n, gas: 250_000n },
  };
  return ROLE_ORDER.map((role) => {
    const entry = plan[role] ?? { protocol: 0n, gas: 0n };
    return {
      role,
      address: "0x0000000000000000000000000000000000000000",
      protocolRequiredUsdcBaseUnits: entry.protocol,
      gasReserveUsdcBaseUnits: entry.gas,
      requiredEconomicUsdcBaseUnits: entry.protocol + entry.gas,
      requiresOnchainWrite: entry.gas > 0n,
    };
  });
}

async function filesUnder(root: string, directory: string, extension: string): Promise<string[]> {
  const absolute = join(root, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(root, child, extension)));
    else if (entry.name.endsWith(extension)) files.push(child);
  }
  return files;
}

export async function hashTree(
  root: string,
  directories: readonly string[],
  extension: string,
): Promise<string> {
  const files = (await Promise.all(directories.map((directory) => filesUnder(root, directory, extension))))
    .flat()
    .sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(root, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await readFile(join(root, file)));
    hash.update("\0");
  }
  return `0x${hash.digest("hex")}`;
}

export async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export function assertDistinctActors(actors: readonly ActorRecord[]): void {
  const seen = new Set<string>();
  for (const actor of actors) {
    const normalized = getAddress(actor.publicAddress).toLowerCase();
    if (seen.has(normalized)) throw new Error(`duplicate signer address for ${actor.role}`);
    seen.add(normalized);
  }
}

export function buildDeploymentPlan(manifest: Record<string, unknown>): string[] {
  const order = manifest.deploymentOrder;
  if (!Array.isArray(order) || order.length !== DEPLOYMENT_ORDER.length) {
    throw new Error("candidate manifest does not contain the complete V2 deployment order");
  }
  for (const [index, value] of order.entries()) {
    if (value !== DEPLOYMENT_ORDER[index]) {
      throw new Error(`deployment order mismatch at index ${index}`);
    }
  }
  return [...DEPLOYMENT_ORDER];
}

/**
 * Pure candidate-manifest validation used by both the read-only preflight and
 * deterministic wrong-environment tests. It deliberately does not perform
 * RPC calls or broadcasts.
 */
export function validateManifestBasics(manifest: Record<string, unknown>): string[] {
  const failures: string[] = [];
  if (manifest.chainId !== ARC_TESTNET_CHAIN_ID) failures.push("candidate chain ID is not Arc Testnet");
  if (manifest.rpcIdentity !== ARC_TESTNET_RPC) failures.push("candidate RPC identity mismatch");
  const collateral = manifest.collateral;
  const collateralAddress =
    typeof collateral === "object" && collateral !== null && "address" in collateral &&
    typeof collateral.address === "string"
      ? collateral.address
      : undefined;
  if (collateralAddress?.toLowerCase() !== ARC_USDC.toLowerCase()) {
    failures.push("candidate USDC address mismatch");
  }
  if (manifest.contractSourceSha256 !== CONTRACT_SOURCE_SHA) {
    failures.push("candidate contract SHA mismatch");
  }
  if (manifest.status !== "CANDIDATE_ONLY_NOT_DEPLOYED") {
    failures.push("candidate manifest is not marked undeployed");
  }
  try {
    buildDeploymentPlan(manifest);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "invalid deployment order");
  }
  if (!manifest.constructorArguments || typeof manifest.constructorArguments !== "object") {
    failures.push("candidate constructor arguments are missing");
  } else {
    for (const name of DEPLOYMENT_ORDER) {
      if (!Object.prototype.hasOwnProperty.call(manifest.constructorArguments, name)) {
        failures.push(`missing constructor arguments for ${name}`);
      }
    }
  }
  return failures;
}

export function validateActorManifest(actors: readonly ActorRecord[]): string[] {
  const failures: string[] = [];
  const byRole = new Map<string, ActorRecord>();
  for (const actor of actors) {
    if (!REQUIRED_ACTOR_ROLES.includes(actor.role)) failures.push(`unexpected actor ${actor.role}`);
    if (byRole.has(actor.role)) failures.push(`duplicate actor role ${actor.role}`);
    byRole.set(actor.role, actor);
    if (!/^0x[0-9a-fA-F]{40}$/.test(actor.publicAddress)) {
      failures.push(`invalid actor ${actor.role}`);
    }
  }
  for (const role of REQUIRED_ACTOR_ROLES) {
    if (!byRole.has(role)) failures.push(`missing actor ${role}`);
  }
  try {
    assertDistinctActors(actors);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "actor distinctness failure");
  }
  return failures;
}

/** Returns only contracts that are not already proven deployed in a progress map. */
export function remainingDeployments(
  manifest: Record<string, unknown>,
  deployedAddresses: Record<string, string | undefined>,
): DeploymentContract[] {
  const order = buildDeploymentPlan(manifest);
  return order.filter((name) => {
    const address = deployedAddresses[name];
    return !address || /^0x0{40}$/i.test(address);
  }) as DeploymentContract[];
}

export function assertRuntimeBytecode(expected: string, actual: string): void {
  const normalize = (value: string): string => value.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]*$/.test(normalize(expected)) || !/^[0-9a-f]*$/.test(normalize(actual))) {
    throw new Error("runtime bytecode is not valid hexadecimal");
  }
  if (normalize(expected) !== normalize(actual)) throw new Error("runtime bytecode mismatch");
}

export function fundingDeficit(balance: bigint, required: bigint): bigint {
  return balance >= required ? 0n : required - balance;
}

export function deploymentArtifacts(root: string): Record<DeploymentContract, string> {
  return Object.fromEntries(
    DEPLOYMENT_ORDER.map((name) => [name, join(root, "out", `${name}.sol`, `${name}.json`)]),
  ) as Record<DeploymentContract, string>;
}

function asJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item,
  );
}

async function observeFunding(
  client: ReturnType<typeof createPublicClient>,
  requirements: readonly FundingRequirement[],
): Promise<FundingObservation[]> {
  return Promise.all(
    requirements.map(async (requirement) => {
      const nativeBalance = await client.getBalance({ address: requirement.address });
      const erc20Balance = await client.readContract({
        address: ARC_USDC,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [requirement.address],
      });
      const nativeEconomicEquivalent = nativeBalance / 1_000_000_000_000n;
      const representationMatch =
        nativeEconomicEquivalent === erc20Balance;
      const economicDeficit = fundingDeficit(
        erc20Balance,
        requirement.requiredEconomicUsdcBaseUnits,
      );
      return {
        ...requirement,
        nativeBalanceBaseUnits: nativeBalance,
        erc20BalanceBaseUnits: erc20Balance,
        nativeEconomicEquivalentBaseUnits: nativeEconomicEquivalent,
        unifiedEconomicBalanceBaseUnits: erc20Balance,
        economicDeficitBaseUnits: economicDeficit,
        nativeErc20RepresentationMatch: representationMatch,
        gasCapability: !requirement.requiresOnchainWrite
          ? "NOT_REQUIRED"
          : representationMatch && nativeEconomicEquivalent >= requirement.requiredEconomicUsdcBaseUnits
            ? "PASS"
            : "FAIL",
      };
    }),
  );
}

export async function runPreflight(root = process.cwd()): Promise<number> {
  const manifestPath = join(root, "deployments", "arc-testnet-v2", "manifest.candidate.json");
  const actorsPath = join(root, "deployments", "arc-testnet-v2", "actors.candidate.json");
  const manifest = await loadJson<Record<string, unknown>>(manifestPath);
  const actorManifest = await loadJson<ActorManifest>(actorsPath);
  const actors = actorManifest.actors;
  const failures: string[] = [];

  failures.push(...validateManifestBasics(manifest));
  failures.push(...validateActorManifest(actors));
  const actorByRole = new Map(actors.map((actor) => [actor.role, actor]));
  for (const role of ROLE_ORDER) {
    const actor = actorByRole.get(role);
    if (!actor) continue;
    const keystoreDir = process.env.ARCMEMEPERPS_KEYSTORE_DIR ??
      resolve(process.env.USERPROFILE ?? process.env.HOME ?? root, ".arcmemeperps", "gate4g-recovered-keystores");
    try {
      await stat(join(keystoreDir, role));
    } catch {
      failures.push(`missing encrypted keystore for ${role}`);
    }
  }

  const artifacts = deploymentArtifacts(root);
  for (const [name, artifact] of Object.entries(artifacts)) {
    try {
      const parsed = await loadJson<{ bytecode?: { object?: string }; deployedBytecode?: { object?: string } }>(artifact);
      if (!parsed.bytecode?.object || !parsed.deployedBytecode?.object) {
        failures.push(`artifact missing bytecode for ${name}`);
      }
    } catch {
      failures.push(`missing compiled artifact for ${name}`);
    }
  }

  const computedBackendSourceSha = await hashTree(root, ["apps", "packages", "scripts"], ".ts");
  if (manifest.backendSourceSha256 !== computedBackendSourceSha) {
    failures.push("candidate backend SHA mismatch");
  }

  const client = createPublicClient({ transport: http(manifest.rpcIdentity as string) });
  let observations: FundingObservation[] = [];
  try {
    const chainId = await client.getChainId();
    if (chainId !== ARC_TESTNET_CHAIN_ID) failures.push(`RPC returned chain ${chainId}`);
    const code = await client.getBytecode({ address: ARC_USDC });
    if (!code || code === "0x") failures.push("canonical Arc USDC has no bytecode");
    const decimals = await client.readContract({ address: ARC_USDC, abi: ERC20_ABI, functionName: "decimals" });
    if (decimals !== 6) failures.push(`canonical Arc USDC decimals=${decimals}`);
    const requirements = expectedFunding().map((requirement) => ({
      ...requirement,
      address: actorByRole.get(requirement.role)?.publicAddress ?? requirement.address,
    }));
    if (requirements.some((requirement) => requirement.address === "0x0000000000000000000000000000000000000000")) {
      failures.push("funding plan contains an unresolved actor address");
    } else {
      observations = await observeFunding(client, requirements);
    }
  } catch (error) {
    failures.push(`Arc Testnet read-only preflight failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  const fundingDeficits = observations.filter(
    (observation) =>
      observation.economicDeficitBaseUnits > 0n ||
      !observation.nativeErc20RepresentationMatch ||
      observation.gasCapability === "FAIL",
  );
  const hardFailures = failures.filter((failure) => !failure.startsWith("funding deficit:"));
  const result = {
    mode: "READ_ONLY_PREDEPLOY_PREFLIGHT",
    chainId: ARC_TESTNET_CHAIN_ID,
    rpc: ARC_TESTNET_RPC,
    contractSourceSha256: CONTRACT_SOURCE_SHA,
    backendSourceSha256: computedBackendSourceSha,
    deploymentOrder: DEPLOYMENT_ORDER,
    actors: actors.map(({ role, publicAddress, signerSourceLabel }) => ({ role, publicAddress, signerSourceLabel })),
    funding: observations,
    failures,
    fundingDeficits,
    status:
      hardFailures.length === 0 && fundingDeficits.length === 0
        ? "PASS"
        : hardFailures.length === 0
          ? "FAIL_FUNDING"
          : "FAIL",
  };
  console.log(asJson(result));
  return hardFailures.length === 0 && fundingDeficits.length === 0 ? 0 : 1;
}

export async function main(): Promise<void> {
  const code = await runPreflight();
  process.exitCode = code;
}

if (process.argv[1]?.endsWith("arc-testnet-v2.ts")) void main();
