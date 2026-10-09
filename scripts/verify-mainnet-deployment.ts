import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  defineChain,
  http,
  keccak256,
  parseAbi,
  parseAbiItem,
  stringToHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { ARC_DEPLOYMENT_CONTRACTS, ARC_MAINNET, isEvmAddress } from "@arcmemeperps/shared";

const ROOT = resolve(process.cwd());
const contractsPath = resolve(ROOT, "evidence/mainnet/contracts.json");
const expectedSourceSha = "0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b";
const chain = defineChain({ id: ARC_MAINNET.chainId, name: ARC_MAINNET.chainName, nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [ARC_MAINNET.rpcUrl] } } });

type Artifact = { readonly abi: Abi; readonly deployedBytecode: { readonly object: Hex } };
type ContractEvidence = { readonly name: string; readonly address: Address; readonly txHash: Hex; readonly blockNumber: string; readonly runtimeHash: Hex };
type ContractsFile = { readonly chainId: number; readonly contractSourceSha: string; readonly deploymentBlocks: { readonly first: string | null; readonly last: string | null }; readonly contracts: readonly ContractEvidence[] };

function artifact(name: string): Artifact {
  return JSON.parse(readFileSync(resolve(ROOT, `out/${name}.sol/${name}.json`), "utf8")) as Artifact;
}

function runtimeHash(bytecode: Hex): Hex {
  return keccak256(bytecode);
}

function requireAddress(file: ContractsFile, name: string): Address {
  const record = file.contracts.find((item) => item.name === name);
  if (!record || !isEvmAddress(record.address)) throw new Error(`MISSING_MAINNET_CONTRACT:${name}`);
  return record.address;
}

async function main(): Promise<void> {
  if (!existsSync(contractsPath)) throw new Error("MAINNET_CONTRACT_MANIFEST_NOT_FOUND");
  const file = JSON.parse(readFileSync(contractsPath, "utf8")) as ContractsFile;
  if (file.chainId !== ARC_MAINNET.chainId) throw new Error("MAINNET_CHAIN_ID_MISMATCH");
  if (file.contractSourceSha !== expectedSourceSha) throw new Error("CONTRACT_SOURCE_SHA_MISMATCH");
  const publicClient = createPublicClient({ chain, transport: http(ARC_MAINNET.rpcUrl) });
  if (await publicClient.getChainId() !== ARC_MAINNET.chainId) throw new Error("MAINNET_RPC_CHAIN_ID_MISMATCH");
  const addresses = Object.fromEntries(ARC_DEPLOYMENT_CONTRACTS.map((name) => [name, requireAddress(file, name)])) as Record<string, Address>;
  const read = async <T>(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<T> =>
    (await publicClient.readContract({ address, abi, functionName, args })) as T;
  for (const name of ARC_DEPLOYMENT_CONTRACTS) {
    const code = await publicClient.getBytecode({ address: addresses[name]! });
    if (!code || runtimeHash(code) !== runtimeHash(artifact(name).deployedBytecode.object)) throw new Error(`RUNTIME_BYTECODE_MISMATCH:${name}`);
  }

  const accessAbi = parseAbi([
    "function owner() view returns (address)",
    "function governanceExecutor() view returns (address)",
    "function bootstrapFinalized() view returns (bool)",
    "function hasRole(bytes32,address) view returns (bool)",
  ]);
  const roles: Record<string, Hex> = Object.fromEntries(["GOVERNANCE_ADMIN", "RISK_ADMIN", "EMERGENCY_ADMIN", "ORACLE_ADMIN", "QUALIFICATION_WRITER", "KEEPER", "INSURANCE_MANAGER"].map((name) => [name, keccak256(stringToHex(name))]));
  const deployer = (process.env.MAINNET_DEPLOYER_ADDRESS ?? "0x456A3ab835Bea90b42FF207B6c42BCE0BFF3e833") as Address;
  const roleState: Record<string, unknown> = {};
  for (const name of ARC_DEPLOYMENT_CONTRACTS) {
    const finalized = await read<boolean>(addresses[name]!, accessAbi, "bootstrapFinalized");
    const executor = await read<Address>(addresses[name]!, accessAbi, "governanceExecutor");
    const owner = await read<Address>(addresses[name]!, accessAbi, "owner");
    if (!finalized || executor === "0x0000000000000000000000000000000000000000") throw new Error(`BOOTSTRAP_NOT_FINALIZED:${name}`);
    if (await read<boolean>(addresses[name]!, accessAbi, "hasRole", [roles.GOVERNANCE_ADMIN, deployer])) throw new Error(`DEPLOYER_ROLE_REMAINS:${name}`);
    roleState[name] = { owner, governanceExecutor: executor, bootstrapFinalized: finalized };
  }

  const minDelay = await read<bigint>(addresses.ProtocolTimelock!, parseAbi(["function minDelay() view returns (uint256)"]), "minDelay");
  if (minDelay === 0n) throw new Error("TIMELOCK_DELAY_ZERO");
  const engineAbi = parseAbi(["function solvencyBlocked() view returns (bool)", "function nextPositionId() view returns (uint256)"]);
  const solvencyBlocked = await read<boolean>(addresses.PerpEngine!, engineAbi, "solvencyBlocked");
  const nextPositionId = await read<bigint>(addresses.PerpEngine!, engineAbi, "nextPositionId");
  const badDebt = await read<bigint>(addresses.USDCMarginVault!, parseAbi(["function protocolBadDebt() view returns (uint256)"]), "protocolBadDebt");
  if (solvencyBlocked || nextPositionId !== 1n || badDebt !== 0n) throw new Error("GENESIS_ASSERTION_FAILED");

  const fromBlock = file.deploymentBlocks.first === null ? undefined : BigInt(file.deploymentBlocks.first);
  const toBlock = file.deploymentBlocks.last === null ? undefined : BigInt(file.deploymentBlocks.last);
  const registered = await publicClient.getLogs({ address: addresses.MarketRegistry, event: parseAbiItem("event MarketRegistered(bytes32 indexed marketId, bytes32 indexed originChain, bytes originToken)"), fromBlock, toBlock });
  const qualified = await publicClient.getLogs({ address: addresses.QualificationRegistry, event: parseAbiItem("event QualificationApproved(bytes32 indexed marketId, bytes32 indexed proofHash, bytes32 indexed ruleVersion, uint256 maxLeverage, uint256 maxOI, uint256 maxPosition, uint64 expiresAt)"), fromBlock, toBlock });
  const oracleUpdates = await publicClient.getLogs({ address: addresses.OracleRouter, event: parseAbiItem("event ReportUpdated(bytes32 indexed marketId, uint64 indexed sequence)"), fromBlock, toBlock });
  if (registered.length !== 0 || qualified.length !== 0 || oracleUpdates.length !== 0) throw new Error("NONZERO_GENESIS_MARKET_ACTIVITY");
  console.log(JSON.stringify({ chainId: ARC_MAINNET.chainId, runtimeParity: "PASS", roles: roleState, timelock: { minDelay: minDelay.toString() }, genesis: { registeredRealPerps: 0, liveRealPerps: 0, oi: "0", positions: 0, badDebt: badDebt.toString(), solvencyBlocked }, deployerPrivileges: "NONE_AFTER_BOOTSTRAP_FINALIZATION", events: { registered: registered.length, qualified: qualified.length, oracleMarketSequences: oracleUpdates.length } }, null, 2));
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
