import { createPublicClient, http, type PublicClient } from "viem";
import type { EvmNetworkConfig, Hex } from "@arcmemeperps/shared";
import type { HttpJsonClient } from "./http.js";
import { evidenceRecord, providerErrorEvidence } from "./evidence.js";
import type { ProviderResult, RpcTokenEvidence } from "./types.js";

const ERC20_ABI = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;
const EIP1967_BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50" as const;

export class EvmRpcProvider {
  public readonly providerName = "canonical-evm-rpc";
  private readonly client: PublicClient;

  public constructor(
    public readonly network: EvmNetworkConfig,
    rpcUrl: string,
  ) {
    this.client = createPublicClient({
      chain: {
        id: network.chainId,
        name: network.name,
        nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      },
      transport: http(rpcUrl),
    });
  }

  public async readToken(
    tokenAddress: string,
    fetchedAt: string,
  ): Promise<ProviderResult<RpcTokenEvidence>> {
    try {
      const [chainId, block, code, implementationSlot, adminSlot, beaconSlot] = await Promise.all([
        this.client.getChainId(),
        this.client.getBlock({ blockTag: "latest" }),
        this.client.getBytecode({ address: tokenAddress as `0x${string}` }),
        this.client.getStorageAt({
          address: tokenAddress as `0x${string}`,
          slot: EIP1967_IMPLEMENTATION_SLOT,
        }),
        this.client.getStorageAt({
          address: tokenAddress as `0x${string}`,
          slot: EIP1967_ADMIN_SLOT,
        }),
        this.client.getStorageAt({
          address: tokenAddress as `0x${string}`,
          slot: EIP1967_BEACON_SLOT,
        }),
      ]);
      if (chainId !== this.network.chainId) {
        throw new Error(
          `wrong chain returned: expected ${this.network.chainId}, received ${chainId}`,
        );
      }
      const blockNumber = block.number ?? 0n;
      const blockHash: Hex = block.hash;
      const observations = await Promise.all([
        this.readString(tokenAddress, "name"),
        this.readString(tokenAddress, "symbol"),
        this.readNumber(tokenAddress, "decimals"),
        this.readBigInt(tokenAddress, "totalSupply"),
      ]);
      const [name, symbol, decimals, totalSupply] = observations;
      const value: RpcTokenEvidence = {
        chainId,
        blockNumber,
        blockHash,
        blockTimestamp: Number(block.timestamp),
        bytecodeExists: code !== undefined && code !== "0x",
        proxyDetected:
          code === undefined ? null : hasProxySignal(code, implementationSlot, beaconSlot),
        proxyImplementation: storageAddress(implementationSlot),
        proxyAdminAddress: storageAddress(adminSlot),
        name,
        symbol,
        decimals: decimals === null || (decimals >= 0 && decimals <= 255) ? decimals : null,
        totalSupply,
      };
      return {
        status: "AVAILABLE",
        value,
        reason: null,
        error: null,
        evidence: [
          evidenceRecord({
            evidenceId: `${this.providerName}:latest-block`,
            kind: "evm-latest-block",
            provider: this.providerName,
            chain: this.network.chain,
            network: this.network.name,
            endpointClass: "RPC",
            dataVersion: "eth_getBlockByNumber",
            schemaVersion: "1",
            blockNumber: blockNumber.toString(),
            blockHash,
            observedAt: new Date(Number(block.timestamp) * 1_000).toISOString(),
            sourceTimestamp: new Date(Number(block.timestamp) * 1_000).toISOString(),
            fetchedAt,
            freshness: "FRESH",
            confidence: 1,
            status: "AVAILABLE",
            value: {
              chainId,
              blockNumber: blockNumber.toString(),
              blockHash,
              blockTimestamp: Number(block.timestamp),
            },
          }),
          evidenceRecord({
            evidenceId: `${this.providerName}:token-metadata`,
            kind: "erc20-token-metadata",
            provider: this.providerName,
            chain: this.network.chain,
            network: this.network.name,
            endpointClass: "RPC",
            dataVersion: "erc20-view-functions",
            schemaVersion: "1",
            blockNumber: blockNumber.toString(),
            blockHash,
            observedAt: new Date(Number(block.timestamp) * 1_000).toISOString(),
            sourceTimestamp: new Date(Number(block.timestamp) * 1_000).toISOString(),
            fetchedAt,
            freshness: "FRESH",
            confidence: 1,
            status: "AVAILABLE",
            value: {
              bytecodeExists: value.bytecodeExists,
              name: value.name,
              symbol: value.symbol,
              decimals: value.decimals,
              totalSupply: value.totalSupply?.toString() ?? null,
              proxyDetected: value.proxyDetected,
              proxyImplementation: value.proxyImplementation,
              proxyAdminAddress: value.proxyAdminAddress,
            },
          }),
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "EVM RPC read failed";
      return {
        status: "ERROR",
        value: null,
        reason: null,
        error: message,
        evidence: [
          providerErrorEvidence(
            { chain: this.network.chain, network: this.network.name, fetchedAt },
            this.providerName,
            "evm-read",
            message,
            "RPC",
          ),
        ],
      };
    }
  }

  private async readString(
    address: string,
    functionName: "name" | "symbol",
  ): Promise<string | null> {
    try {
      const value = await this.client.readContract({
        address: address as `0x${string}`,
        abi: ERC20_ABI,
        functionName,
      });
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  }

  private async readNumber(address: string, functionName: "decimals"): Promise<number | null> {
    try {
      const value = await this.client.readContract({
        address: address as `0x${string}`,
        abi: ERC20_ABI,
        functionName,
      });
      return typeof value === "number" ? value : typeof value === "bigint" ? Number(value) : null;
    } catch {
      return null;
    }
  }

  private async readBigInt(address: string, functionName: "totalSupply"): Promise<bigint | null> {
    try {
      const value = await this.client.readContract({
        address: address as `0x${string}`,
        abi: ERC20_ABI,
        functionName,
      });
      return typeof value === "bigint" ? value : null;
    } catch {
      return null;
    }
  }
}

function hasProxySignal(
  code: Hex,
  implementationSlot: Hex | undefined,
  beaconSlot: Hex | undefined,
): boolean {
  return (
    code !== "0x" &&
    (storageAddress(implementationSlot) !== null ||
      storageAddress(beaconSlot) !== null ||
      code.toLowerCase().includes("363d3d373d3d3d363d73"))
  );
}

function storageAddress(value: Hex | undefined): Hex | null {
  if (value === undefined || value === "0x" || /^0x0+$/.test(value)) return null;
  if (value.length !== 66) return null;
  return `0x${value.slice(-40)}`;
}

export type ReadOnlyRpcClient = HttpJsonClient;
