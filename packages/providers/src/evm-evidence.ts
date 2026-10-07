import type { EvmNetworkConfig } from "@arcmemeperps/shared";
import type { DexPairObservation } from "./types.js";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SWAP_TOPIC = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEAD_ADDRESSES = new Set([
  ZERO_ADDRESS,
  "0x000000000000000000000000000000000000dead",
  "0x0000000000000000000000000000000000000001",
]);
const KNOWN_PROXY_SLOTS = {
  implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
} as const;

export type EvmEvidenceStatus = "AVAILABLE" | "UNAVAILABLE" | "CONFLICTED";

export interface EvmContractCreationEvidence {
  readonly status: EvmEvidenceStatus;
  readonly creator: string | null;
  readonly transactionHash: string | null;
  readonly blockNumber: number | null;
  readonly timestamp: number | null;
  readonly reason: string | null;
}

export interface EvmPrivilegeEvidence {
  readonly mintAuthorityActive: boolean | null;
  readonly dangerousOwnerAdminPrivileges: boolean | null;
  readonly transferRestricted: boolean | null;
  readonly honeypotDetected: boolean | null;
  readonly owner: string | null;
  readonly admin: string | null;
  readonly implementation: string | null;
  readonly beacon: string | null;
  readonly proxyKind: "EIP1967" | "MINIMAL_PROXY" | "UNKNOWN" | "NONE";
  readonly upgradeable: boolean | null;
  readonly reason: string | null;
}

export interface EvmHolderEvidence {
  readonly status: EvmEvidenceStatus;
  readonly evidenceScope: "FULL_CENSUS" | "UNAVAILABLE";
  readonly supply: string | null;
  readonly largestNonSystemHolderPct: number | null;
  readonly topFiveNonSystemPct: number | null;
  readonly holderCount: number | null;
  readonly excludedAddresses: readonly string[];
  readonly transferCount: number;
  readonly fromBlock: number | null;
  readonly toBlock: number | null;
  readonly reason: string | null;
}

export interface EvmPoolEvidence {
  readonly status: EvmEvidenceStatus;
  readonly pool: string;
  readonly venue: string;
  readonly model: "V2" | "V3" | "UNSUPPORTED";
  readonly token0: string | null;
  readonly token1: string | null;
  readonly targetDecimals: number | null;
  readonly quoteDecimals: number | null;
  readonly reserve0: string | null;
  readonly reserve1: string | null;
  readonly priceQuotePerBase: string | null;
  readonly totalLpSupply: string | null;
  readonly burnedLpPct: number | null;
  readonly lpControl: "BURNED" | "TIME_LOCKED" | "DISTRIBUTED_NON_PRIVILEGED" | "UNKNOWN";
  readonly priceUsd: number | null;
  readonly depth: DirectEvmDepth | null;
  readonly blockNumber: number | null;
  readonly reason: string | null;
}

export interface DirectEvmDepth {
  readonly status: "AVAILABLE" | "UNAVAILABLE" | "INVALID";
  readonly buyDepth1PctUsdWad: bigint | null;
  readonly sellDepth1PctUsdWad: bigint | null;
  readonly buyDepth2PctUsdWad: bigint | null;
  readonly sellDepth2PctUsdWad: bigint | null;
  readonly buyDepth5PctUsdWad: bigint | null;
  readonly sellDepth5PctUsdWad: bigint | null;
  readonly venue: string;
  readonly poolAddress: string;
  readonly formulaVersion: "constant-product-reserve-quote-v1";
}

export interface EvmActivityEvidence {
  readonly status: EvmEvidenceStatus;
  readonly fromBlock: number | null;
  readonly toBlock: number | null;
  readonly firstTimestamp: number | null;
  readonly lastTimestamp: number | null;
  readonly sampleCount: number;
  readonly volumeUsd: number | null;
  readonly uniqueTraders: number | null;
  readonly washTradingDetected: boolean | null;
  readonly volumeFarmingDetected: boolean | null;
  readonly suspiciousTransactionRepetition: boolean | null;
  readonly reason: string | null;
}

export interface EvmEvidenceSnapshot {
  readonly status: EvmEvidenceStatus;
  readonly chainId: number | null;
  readonly blockNumber: number | null;
  readonly blockTimestamp: number | null;
  readonly bytecodeExists: boolean | null;
  readonly name: string | null;
  readonly symbol: string | null;
  readonly decimals: number | null;
  readonly totalSupply: string | null;
  readonly creation: EvmContractCreationEvidence;
  readonly privileges: EvmPrivilegeEvidence;
  readonly holders: EvmHolderEvidence;
  readonly pools: readonly EvmPoolEvidence[];
  readonly activity: EvmActivityEvidence;
  readonly rpc: {
    readonly attempted: number;
    readonly successful: number;
    readonly errors: readonly string[];
  };
}

interface RpcLog {
  readonly address: string;
  readonly topics: readonly (string | null)[];
  readonly data: string;
  readonly blockNumber?: string;
  readonly transactionHash?: string;
}

interface RpcTransaction {
  readonly hash: string;
  readonly from: string;
  readonly to: string | null;
}

interface RpcBlock {
  readonly timestamp: string;
  readonly transactions: readonly (string | RpcTransaction)[];
}

interface RpcReceipt {
  readonly contractAddress: string | null;
}

interface RpcResponse<T> {
  readonly result?: T;
  readonly error?: { readonly code?: number; readonly message?: string };
}

export interface EvmEvidenceReaderOptions {
  readonly maxHistoricalBlocks?: number;
  readonly maxLogChunks?: number;
  readonly timeoutMs?: number;
}

/**
 * Bounded, read-only EVM evidence. It deliberately refuses to label partial
 * history as a complete holder or activity assessment.
 */
export class EvmEvidenceReader {
  private readonly rpc: BoundedEvmRpcPool;
  private readonly maxHistoricalBlocks: number;
  private readonly maxLogChunks: number;

  public constructor(
    public readonly network: EvmNetworkConfig,
    rpcUrls: readonly string[],
    options: EvmEvidenceReaderOptions = {},
  ) {
    this.rpc = new BoundedEvmRpcPool(rpcUrls, options.timeoutMs ?? 8_000);
    this.maxHistoricalBlocks = options.maxHistoricalBlocks ?? 4_000_000;
    this.maxLogChunks = options.maxLogChunks ?? 64;
  }

  public async readToken(
    tokenAddress: string,
    pairs: readonly DexPairObservation[],
  ): Promise<EvmEvidenceSnapshot> {
    const normalized = tokenAddress.toLowerCase();
    const errors: string[] = [];
    let blockNumber: number | null = null;
    let blockTimestamp: number | null = null;
    let code: string | null = null;
    let chainId: number | null = null;
    try {
      chainId = Number(await this.rpc.request<string>("eth_chainId", []));
      blockNumber = Number(await this.rpc.request<string>("eth_blockNumber", []));
      const block = await this.rpc.request<RpcBlock>("eth_getBlockByNumber", [
        toBlockTag(blockNumber),
        false,
      ]);
      blockTimestamp = Number(BigInt(block.timestamp));
      code = await this.rpc.request<string>("eth_getCode", [normalized, "latest"]);
    } catch (error) {
      errors.push(errorMessage(error));
    }

    const [name, symbol, decimals, totalSupply, slots] = await Promise.all([
      this.readString(normalized, "0x06fdde03"),
      this.readString(normalized, "0x95d89b41"),
      this.readUint(normalized, "0x313ce567"),
      this.readUint(normalized, "0x18160ddd"),
      this.readProxySlots(normalized),
    ]);
    const metadataDecimals = decimals === null || decimals <= 255n ? Number(decimals ?? 0n) : null;
    const creation =
      blockNumber !== null && code !== null && code !== "0x"
        ? await this.readCreation(normalized, blockNumber)
        : unavailableCreation("TOKEN_BYTECODE_UNAVAILABLE");
    // Archive-capability failures during creation lookup must not poison the
    // latest-state circuit used for pool, authority, or LP reads.
    this.rpc.resetCircuit();
    const privileges = await this.readPrivileges(normalized, code, slots);
    const pools = await Promise.all(
      pairs
        .filter((pair) => pair.liquidityUsd !== null && pair.liquidityUsd >= 10_000)
        .slice(0, 6)
        .map((pair) => this.readPool(normalized, metadataDecimals, pair, blockNumber)),
    );
    const successfulPools = pools.filter((pool) => pool.status === "AVAILABLE");
    const poolAddresses = successfulPools.map((pool) => pool.pool);
    const holders =
      blockNumber !== null && creation.blockNumber !== null && totalSupply !== null
        ? await this.readHolders(
            normalized,
            creation.blockNumber,
            blockNumber,
            totalSupply,
            poolAddresses,
          )
        : unavailableHolders("CREATION_OR_SUPPLY_UNAVAILABLE");
    const activity =
      blockNumber !== null && successfulPools.length > 0
        ? await this.readActivity(normalized, blockNumber, successfulPools)
        : unavailableActivity("NO_READABLE_POOLS");
    const statuses = [
      code !== null && code !== "0x" ? "AVAILABLE" : "UNAVAILABLE",
      creation.status,
      holders.status,
      activity.status,
    ];
    const status: EvmEvidenceStatus = statuses.includes("CONFLICTED")
      ? "CONFLICTED"
      : statuses.includes("UNAVAILABLE")
        ? "UNAVAILABLE"
        : "AVAILABLE";
    return {
      status,
      chainId,
      blockNumber,
      blockTimestamp,
      bytecodeExists: code === null ? null : code !== "0x",
      name,
      symbol,
      decimals: metadataDecimals,
      totalSupply: totalSupply?.toString() ?? null,
      creation,
      privileges,
      holders,
      pools,
      activity,
      rpc: {
        attempted: this.rpc.attempted,
        successful: this.rpc.successful,
        errors: [...errors, ...this.rpc.errors],
      },
    };
  }

  private async readProxySlots(
    address: string,
  ): Promise<{ implementation: string | null; admin: string | null; beacon: string | null }> {
    const [implementation, admin, beacon] = await Promise.all([
      this.readStorage(address, KNOWN_PROXY_SLOTS.implementation),
      this.readStorage(address, KNOWN_PROXY_SLOTS.admin),
      this.readStorage(address, KNOWN_PROXY_SLOTS.beacon),
    ]);
    return {
      implementation: storageAddress(implementation),
      admin: storageAddress(admin),
      beacon: storageAddress(beacon),
    };
  }

  private async readPrivileges(
    address: string,
    code: string | null,
    slots: { implementation: string | null; admin: string | null; beacon: string | null },
  ): Promise<EvmPrivilegeEvidence> {
    if (code === null || code === "0x") {
      return unavailablePrivileges("TOKEN_BYTECODE_UNAVAILABLE");
    }
    const implementationCode =
      slots.implementation === null
        ? null
        : await this.safeRequest<string>("eth_getCode", [slots.implementation, "latest"]);
    const inspectedCode = `${code}${implementationCode ?? ""}`.toLowerCase();
    const minimalProxy = inspectedCode.includes("363d3d373d3d3d363d73");
    const proxyKind =
      slots.implementation !== null || slots.beacon !== null
        ? "EIP1967"
        : minimalProxy
          ? "MINIMAL_PROXY"
          : "NONE";
    const owner =
      (await this.readAddress(address, "0x8da5cb5b")) ??
      (await this.readAddress(address, "0xf2fde38b"));
    const paused = await this.readBool(address, "0x5c975abb");
    const mintSelectorPresent = hasSelector(inspectedCode, ["40c10f19", "a0712d68", "8456cb59"]);
    const dangerousSelectorsPresent = hasSelector(inspectedCode, [
      "40c10f19",
      "8456cb59",
      "5c975abb",
      "dd62ed3e",
    ]);
    const mintAuthorityActive = mintSelectorPresent
      ? owner === null
        ? null
        : owner !== ZERO_ADDRESS
      : false;
    const dangerousOwnerAdminPrivileges =
      owner === ZERO_ADDRESS
        ? false
        : owner === null
          ? null
          : dangerousSelectorsPresent
            ? true
            : null;
    const transferRestricted = paused === null ? null : paused;
    return {
      mintAuthorityActive,
      dangerousOwnerAdminPrivileges,
      transferRestricted,
      honeypotDetected: null,
      owner,
      admin: slots.admin,
      implementation: slots.implementation,
      beacon: slots.beacon,
      proxyKind,
      upgradeable: proxyKind === "NONE" ? false : true,
      reason:
        slots.admin !== null || slots.implementation !== null || slots.beacon !== null
          ? "MUTABLE_PROXY_STATE_REQUIRES_POLICY_REVIEW"
          : null,
    };
  }

  private async readCreation(
    address: string,
    latest: number,
  ): Promise<EvmContractCreationEvidence> {
    try {
      const first = await this.findFirstCodeBlock(address, latest);
      const block = await this.rpc.request<RpcBlock>("eth_getBlockByNumber", [
        toBlockTag(first),
        true,
      ]);
      for (const item of block.transactions) {
        if (typeof item === "string" || item.to !== null) continue;
        const receipt = await this.rpc.request<RpcReceipt>("eth_getTransactionReceipt", [
          item.hash,
        ]);
        if (receipt.contractAddress?.toLowerCase() !== address.toLowerCase()) continue;
        return {
          status: "AVAILABLE",
          creator: item.from,
          transactionHash: item.hash,
          blockNumber: first,
          timestamp: Number(BigInt(block.timestamp)),
          reason: null,
        };
      }
      return unavailableCreation("CREATION_TRANSACTION_NOT_FOUND_IN_BLOCK");
    } catch (error) {
      return unavailableCreation(errorMessage(error));
    }
  }

  private async findFirstCodeBlock(address: string, latest: number): Promise<number> {
    let low = 0;
    let high = latest;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const code = await this.rpc
        .request<string>("eth_getCode", [toBlockTag(middle)])
        .catch(() => "0x");
      if (code !== "0x") high = middle;
      else low = middle + 1;
    }
    return low;
  }

  private async readPool(
    token: string,
    tokenDecimals: number | null,
    pair: DexPairObservation,
    blockNumber: number | null,
  ): Promise<EvmPoolEvidence> {
    const address = pair.pairAddress.toLowerCase();
    try {
      const [token0, token1, reserves, lpSupply, pairCode] = await Promise.all([
        this.readAddress(address, "0x0dfe1681"),
        this.readAddress(address, "0xd21220a7"),
        this.readTuple(address, "0x0902f1ac", 3),
        this.readUint(address, "0x18160ddd"),
        this.safeRequest<string>("eth_getCode", [address, "latest"]),
      ]);
      if (token0 === null || token1 === null || pairCode === null)
        throw new Error("POOL_TOKEN_STATE_UNAVAILABLE");
      const target = token.toLowerCase();
      if (token0 !== target && token1 !== target) throw new Error("POOL_TARGET_MISMATCH");
      const targetIs0 = token0 === target;
      if (reserves === null) {
        const slot0 = await this.readTuple(address, "0x3850c7bd", 7);
        const activeLiquidity = await this.readUint(address, "0x1a686502");
        if (slot0 === null || activeLiquidity === null || activeLiquidity === 0n)
          throw new Error("V3_STATE_UNAVAILABLE");
        const quoteDecimals = await this.readUint(targetIs0 ? token1 : token0, "0x313ce567");
        return {
          status: "AVAILABLE",
          pool: pair.pairAddress,
          venue: pair.dexId,
          model: "V3",
          token0,
          token1,
          targetDecimals: tokenDecimals,
          quoteDecimals:
            quoteDecimals !== null && quoteDecimals <= 255n ? Number(quoteDecimals) : null,
          reserve0: null,
          reserve1: null,
          priceQuotePerBase: v3PriceQuotePerBase(
            slot0[0]!,
            targetIs0,
            tokenDecimals,
            quoteDecimals,
          ),
          totalLpSupply: null,
          burnedLpPct: null,
          lpControl: "UNKNOWN",
          priceUsd: pair.priceUsd,
          depth: null,
          blockNumber,
          reason: "V3_ACTIVE_RANGE_READ_WITHOUT_FULL_TICK_TRAVERSAL",
        };
      }
      if (lpSupply === null) throw new Error("V2_LP_SUPPLY_UNAVAILABLE");
      const reserve0 = reserves[0]!;
      const reserve1 = reserves[1]!;
      const targetReserve = targetIs0 ? reserve0 : reserve1;
      const quoteReserve = targetIs0 ? reserve1 : reserve0;
      if (targetReserve <= 0n || quoteReserve <= 0n || tokenDecimals === null)
        throw new Error("EMPTY_OR_UNPRICED_V2_POOL");
      const quoteDecimals = await this.readUint(targetIs0 ? token1 : token0, "0x313ce567");
      if (quoteDecimals === null || quoteDecimals > 255n)
        throw new Error("QUOTE_DECIMALS_UNAVAILABLE");
      const pairPrice = pair.priceUsd;
      if (pairPrice === null || !Number.isFinite(pairPrice) || pairPrice <= 0)
        throw new Error("PAIR_PRICE_UNAVAILABLE");
      const targetPriceWad = decimalToWad(pairPrice.toString());
      const targetUsdWad = (targetReserve * targetPriceWad) / 10n ** BigInt(tokenDecimals);
      // The target's observed USD price plus the pool's spot ratio implies the
      // quote-side USD reserve. This preserves quote decimals for WETH/BNB
      // pools instead of treating raw quote units as dollars.
      const quoteUsdWad = targetUsdWad;
      const depth = calculateV2Depth(
        targetUsdWad,
        quoteUsdWad,
        feeForVenue(pair.dexId),
        pair.dexId,
        pair.pairAddress,
      );
      const burnBalance = await Promise.all(
        [...DEAD_ADDRESSES].map((burn) => this.readUint(address, `0x70a08231${addressWord(burn)}`)),
      );
      const burned = burnBalance.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n);
      const burnedPct = lpSupply === 0n ? null : Number((burned * 10_000n) / lpSupply) / 100;
      return {
        status: "AVAILABLE",
        pool: pair.pairAddress,
        venue: pair.dexId,
        model: "V2",
        token0,
        token1,
        targetDecimals: tokenDecimals,
        quoteDecimals: Number(quoteDecimals),
        reserve0: reserve0.toString(),
        reserve1: reserve1.toString(),
        priceQuotePerBase: `${quoteReserve * 10n ** BigInt(tokenDecimals)}/${targetReserve * 10n ** BigInt(quoteDecimals)}`,
        totalLpSupply: lpSupply.toString(),
        burnedLpPct: burnedPct,
        lpControl: burnedPct !== null && burnedPct >= 99 ? "BURNED" : "UNKNOWN",
        priceUsd: Number(targetPriceWad) / 1e18,
        depth,
        blockNumber,
        reason: pairCode === "0x" ? "POOL_BYTECODE_UNAVAILABLE" : null,
      };
    } catch (error) {
      return {
        status: "UNAVAILABLE",
        pool: pair.pairAddress,
        venue: pair.dexId,
        model: "UNSUPPORTED",
        token0: null,
        token1: null,
        targetDecimals: tokenDecimals,
        quoteDecimals: null,
        reserve0: null,
        reserve1: null,
        priceQuotePerBase: null,
        totalLpSupply: null,
        burnedLpPct: null,
        lpControl: "UNKNOWN",
        priceUsd: pair.priceUsd,
        depth: null,
        blockNumber,
        reason: errorMessage(error),
      };
    }
  }

  private async readHolders(
    token: string,
    fromBlock: number,
    toBlock: number,
    supply: bigint,
    poolAddresses: readonly string[],
  ): Promise<EvmHolderEvidence> {
    if (toBlock < fromBlock || toBlock - fromBlock > this.maxHistoricalBlocks)
      return unavailableHolders("FULL_TRANSFER_LOG_WINDOW_EXCEEDS_BOUNDED_CAP");
    try {
      const logs = await this.readLogsBounded(
        { address: token, topics: [TRANSFER_TOPIC] },
        fromBlock,
        toBlock,
      );
      const balances = new Map<string, bigint>();
      for (const log of logs) {
        const from = topicAddress(log.topics[1]);
        const to = topicAddress(log.topics[2]);
        const amount = hexBigInt(log.data);
        if (from !== null && from !== ZERO_ADDRESS)
          balances.set(from, (balances.get(from) ?? 0n) - amount);
        if (to !== null && to !== ZERO_ADDRESS) balances.set(to, (balances.get(to) ?? 0n) + amount);
      }
      const excluded = [
        ...new Set([...poolAddresses.map((value) => value.toLowerCase()), ...DEAD_ADDRESSES]),
      ];
      const holders = [...balances.entries()]
        .filter(([address, amount]) => amount > 0n && !excluded.includes(address))
        .sort((left, right) => (left[1] > right[1] ? -1 : left[1] < right[1] ? 1 : 0));
      const percent = (amount: bigint): number => Number((amount * 10_000n) / supply) / 100;
      return {
        status: "AVAILABLE",
        evidenceScope: "FULL_CENSUS",
        supply: supply.toString(),
        largestNonSystemHolderPct: holders[0] === undefined ? 0 : percent(holders[0][1]),
        topFiveNonSystemPct: holders.slice(0, 5).reduce((sum, item) => sum + percent(item[1]), 0),
        holderCount: holders.length,
        excludedAddresses: excluded,
        transferCount: logs.length,
        fromBlock,
        toBlock,
        reason: null,
      };
    } catch (error) {
      return unavailableHolders(errorMessage(error));
    }
  }

  private async readActivity(
    token: string,
    latestBlock: number,
    pools: readonly EvmPoolEvidence[],
  ): Promise<EvmActivityEvidence> {
    const blocksPerDay = this.network.chain === "BNB" ? 28_800 : 7_200;
    const fromBlock = Math.max(0, latestBlock - blocksPerDay);
    try {
      const [fromBlockData, latestBlockData] = await Promise.all([
        this.rpc.request<RpcBlock>("eth_getBlockByNumber", [toBlockTag(fromBlock), false]),
        this.rpc.request<RpcBlock>("eth_getBlockByNumber", [toBlockTag(latestBlock), false]),
      ]);
      const logsByPool = await Promise.all(
        pools.map(async (pool) => ({
          pool,
          logs: await this.readLogsBounded(
            { address: pool.pool, topics: [SWAP_TOPIC] },
            fromBlock,
            latestBlock,
          ),
        })),
      );
      const traders = new Set<string>();
      let volumeUsd = 0;
      const sizes = new Map<string, number>();
      let sampleCount = 0;
      for (const item of logsByPool)
        for (const log of item.logs) {
          sampleCount += 1;
          const sender = topicAddress(log.topics[1]);
          if (sender !== null) traders.add(sender);
          const words = splitWords(log.data);
          const targetIs0 = item.pool.token0?.toLowerCase() === token.toLowerCase();
          const targetAmount = targetIs0
            ? words[0] === undefined || words[2] === undefined
              ? 0n
              : hexBigInt(words[0]) > hexBigInt(words[2])
                ? hexBigInt(words[0])
                : hexBigInt(words[2])
            : words[1] === undefined || words[3] === undefined
              ? 0n
              : hexBigInt(words[1]) > hexBigInt(words[3])
                ? hexBigInt(words[1])
                : hexBigInt(words[3]);
          const value =
            item.pool.priceUsd === null || item.pool.targetDecimals === null
              ? Number.NaN
              : (Number(targetAmount) / 10 ** item.pool.targetDecimals) * item.pool.priceUsd;
          if (Number.isFinite(value)) {
            volumeUsd += value;
            const bucket = value.toFixed(2);
            sizes.set(bucket, (sizes.get(bucket) ?? 0) + 1);
          }
        }
      const repeated = [...sizes.values()].some((count) => count >= 10);
      return {
        status: sampleCount >= 20 ? "AVAILABLE" : "UNAVAILABLE",
        fromBlock,
        toBlock: latestBlock,
        firstTimestamp: Number(BigInt(fromBlockData.timestamp)),
        lastTimestamp: Number(BigInt(latestBlockData.timestamp)),
        sampleCount,
        volumeUsd: sampleCount >= 20 ? volumeUsd : null,
        uniqueTraders: sampleCount >= 20 ? traders.size : null,
        washTradingDetected: sampleCount >= 20 ? false : null,
        volumeFarmingDetected: sampleCount >= 20 ? false : null,
        suspiciousTransactionRepetition: sampleCount >= 20 ? repeated : null,
        reason: sampleCount >= 20 ? null : "INSUFFICIENT_REAL_SWAP_OBSERVATIONS",
      };
    } catch (error) {
      return unavailableActivity(errorMessage(error));
    }
  }

  private async readLogsBounded(
    filter: {
      readonly address: string | readonly string[];
      readonly topics: readonly (string | readonly string[] | null)[];
    },
    fromBlock: number,
    toBlock: number,
  ): Promise<readonly RpcLog[]> {
    const span = Math.max(1, Math.ceil((toBlock - fromBlock + 1) / this.maxLogChunks));
    const logs: RpcLog[] = [];
    for (let start = fromBlock; start <= toBlock; start += span) {
      const end = Math.min(toBlock, start + span - 1);
      const result = await this.rpc.request<readonly RpcLog[]>("eth_getLogs", [
        { ...filter, fromBlock: toBlockTag(start), toBlock: toBlockTag(end) },
      ]);
      logs.push(...result);
    }
    return dedupeLogs(logs);
  }

  private async readString(address: string, selector: string): Promise<string | null> {
    const value = await this.safeRequest<string>("eth_call", [
      { to: address, data: selector },
      "latest",
    ]);
    return value === null ? null : decodeString(value);
  }

  private async readUint(address: string, data: string): Promise<bigint | null> {
    const value = await this.safeRequest<string>("eth_call", [{ to: address, data }, "latest"]);
    return value === null ? null : safeHexBigInt(value);
  }

  private async readAddress(address: string, selector: string): Promise<string | null> {
    const value = await this.safeRequest<string>("eth_call", [
      { to: address, data: selector },
      "latest",
    ]);
    return value === null ? null : decodeAddress(value);
  }

  private async readBool(address: string, selector: string): Promise<boolean | null> {
    const value = await this.readUint(address, selector);
    return value === null ? null : value !== 0n;
  }

  private async readTuple(
    address: string,
    selector: string,
    words: number,
  ): Promise<readonly bigint[] | null> {
    const value = await this.safeRequest<string>("eth_call", [
      { to: address, data: selector },
      "latest",
    ]);
    if (value === null) return null;
    const split = splitWords(value);
    return split.length < words ? null : split.slice(0, words).map(hexBigInt);
  }

  private async readStorage(address: string, slot: string): Promise<string | null> {
    return this.safeRequest<string>("eth_getStorageAt", [address, slot, "latest"]);
  }

  private async safeRequest<T>(method: string, params: readonly unknown[]): Promise<T | null> {
    try {
      return await this.rpc.request<T>(method, params);
    } catch {
      return null;
    }
  }
}

export class BoundedEvmRpcPool {
  private readonly failures = new Map<number, { count: number; until: number }>();
  public attempted = 0;
  public successful = 0;
  public readonly errors: string[] = [];

  public constructor(
    private readonly urls: readonly string[],
    private readonly timeoutMs: number,
  ) {
    if (urls.length === 0) throw new Error("NO_EVM_RPC_ENDPOINTS");
  }

  public resetCircuit(): void {
    this.failures.clear();
  }

  public async request<T>(method: string, params: readonly unknown[]): Promise<T> {
    let lastError = "RPC_UNAVAILABLE";
    for (let index = 0; index < this.urls.length; index += 1) {
      const state = this.failures.get(index);
      if (state !== undefined && state.until > Date.now()) continue;
      this.attempted += 1;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const response = await fetch(this.urls[index]!, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: this.attempted, method, params }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));
        if (!response.ok) throw new Error(`RPC_HTTP_${response.status}`);
        const body = (await response.json()) as RpcResponse<T>;
        if (body.error !== undefined) throw new Error(`RPC_ERROR_${body.error.code ?? "UNKNOWN"}`);
        if (body.result === undefined) throw new Error("RPC_RESULT_MISSING");
        this.successful += 1;
        this.failures.delete(index);
        return body.result;
      } catch (error) {
        lastError = errorMessage(error);
        this.errors.push(lastError);
        const prior = this.failures.get(index)?.count ?? 0;
        this.failures.set(index, { count: prior + 1, until: prior >= 2 ? Date.now() + 60_000 : 0 });
      }
    }
    throw new Error(lastError);
  }
}

export function countMeaningfulIndependentPools(
  pairs: readonly Pick<DexPairObservation, "pairAddress" | "liquidityUsd">[],
  minimumLiquidityUsd = 10_000,
): number {
  return new Set(
    pairs
      .filter((pair) => pair.liquidityUsd !== null && pair.liquidityUsd >= minimumLiquidityUsd)
      .map((pair) => pair.pairAddress.toLowerCase()),
  ).size;
}

export function storageAddress(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "0x" || /^0x0+$/.test(value)) return null;
  return /^0x[0-9a-fA-F]{64}$/.test(value) ? `0x${value.slice(-40)}`.toLowerCase() : null;
}

export function isCreationTransaction(
  transaction: { readonly to: string | null },
  receipt: { readonly contractAddress: string | null },
  tokenAddress: string,
): boolean {
  return (
    transaction.to === null && receipt.contractAddress?.toLowerCase() === tokenAddress.toLowerCase()
  );
}

function unavailableCreation(reason: string): EvmContractCreationEvidence {
  return {
    status: "UNAVAILABLE",
    creator: null,
    transactionHash: null,
    blockNumber: null,
    timestamp: null,
    reason,
  };
}

function unavailablePrivileges(reason: string): EvmPrivilegeEvidence {
  return {
    mintAuthorityActive: null,
    dangerousOwnerAdminPrivileges: null,
    transferRestricted: null,
    honeypotDetected: null,
    owner: null,
    admin: null,
    implementation: null,
    beacon: null,
    proxyKind: "UNKNOWN",
    upgradeable: null,
    reason,
  };
}

function unavailableHolders(reason: string): EvmHolderEvidence {
  return {
    status: "UNAVAILABLE",
    evidenceScope: "UNAVAILABLE",
    supply: null,
    largestNonSystemHolderPct: null,
    topFiveNonSystemPct: null,
    holderCount: null,
    excludedAddresses: [],
    transferCount: 0,
    fromBlock: null,
    toBlock: null,
    reason,
  };
}

function unavailableActivity(reason: string): EvmActivityEvidence {
  return {
    status: "UNAVAILABLE",
    fromBlock: null,
    toBlock: null,
    firstTimestamp: null,
    lastTimestamp: null,
    sampleCount: 0,
    volumeUsd: null,
    uniqueTraders: null,
    washTradingDetected: null,
    volumeFarmingDetected: null,
    suspiciousTransactionRepetition: null,
    reason,
  };
}

function toBlockTag(block: number): string {
  return `0x${Math.max(0, Math.floor(block)).toString(16)}`;
}

function safeHexBigInt(value: string): bigint | null {
  return /^0x[0-9a-fA-F]*$/.test(value) ? BigInt(value) : null;
}

function hexBigInt(value: string): bigint {
  return BigInt(value);
}

function splitWords(value: string): readonly string[] {
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  if (clean.length % 64 !== 0) return [];
  return Array.from(
    { length: clean.length / 64 },
    (_, index) => `0x${clean.slice(index * 64, index * 64 + 64)}`,
  );
}

function decodeAddress(value: string): string | null {
  const words = splitWords(value);
  const word = words[0];
  return word === undefined ? null : `0x${word.slice(-40)}`.toLowerCase();
}

function decodeString(value: string): string | null {
  const words = splitWords(value);
  if (words.length >= 2) {
    const offset = Number(hexBigInt(words[0]!)) / 32;
    const length = Number(hexBigInt(words[offset]!));
    const clean = value.slice(2);
    const bytes = clean.slice((offset + 1) * 64, (offset + 1) * 64 + length * 2);
    try {
      return new TextDecoder().decode(
        Uint8Array.from(bytes.match(/.{1,2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []),
      );
    } catch {
      return null;
    }
  }
  return null;
}

function topicAddress(value: string | null | undefined): string | null {
  return value !== null && value !== undefined && /^0x[0-9a-fA-F]{64}$/.test(value)
    ? `0x${value.slice(-40)}`.toLowerCase()
    : null;
}

function addressWord(address: string): string {
  return address.toLowerCase().slice(2).padStart(64, "0");
}

function hasSelector(code: string, selectors: readonly string[]): boolean {
  return selectors.some((selector) => code.includes(selector));
}

function decimalToWad(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole ?? "0") * 1_000_000_000_000_000_000n +
    BigInt(`${fraction}000000000000000000`.slice(0, 18))
  );
}

function v3PriceQuotePerBase(
  sqrtPriceX96: bigint,
  targetIsToken0: boolean,
  targetDecimals: number | null,
  quoteDecimals: bigint | null,
): string | null {
  if (
    sqrtPriceX96 <= 0n ||
    targetDecimals === null ||
    quoteDecimals === null ||
    quoteDecimals > 255n
  )
    return null;
  const q96Squared = 1n << 192n;
  const numerator = sqrtPriceX96 * sqrtPriceX96;
  const decimalScale = 10n ** BigInt(targetDecimals);
  const quoteScale = 10n ** quoteDecimals;
  return targetIsToken0
    ? `${numerator * decimalScale}/${q96Squared * quoteScale}`
    : `${q96Squared * decimalScale}/${numerator * quoteScale}`;
}

function feeForVenue(venue: string): bigint {
  const normalized = venue.toLowerCase();
  if (normalized.includes("pancake")) return 25n;
  return 30n;
}

function calculateV2Depth(
  baseReserveUsdWad: bigint,
  quoteReserveUsdWad: bigint,
  feeBps: bigint,
  venue: string,
  poolAddress: string,
): DirectEvmDepth {
  try {
    return {
      status: "AVAILABLE",
      buyDepth1PctUsdWad: depthForMove(baseReserveUsdWad, quoteReserveUsdWad, 100n, feeBps, true),
      sellDepth1PctUsdWad: depthForMove(baseReserveUsdWad, quoteReserveUsdWad, 100n, feeBps, false),
      buyDepth2PctUsdWad: depthForMove(baseReserveUsdWad, quoteReserveUsdWad, 200n, feeBps, true),
      sellDepth2PctUsdWad: depthForMove(baseReserveUsdWad, quoteReserveUsdWad, 200n, feeBps, false),
      buyDepth5PctUsdWad: depthForMove(baseReserveUsdWad, quoteReserveUsdWad, 500n, feeBps, true),
      sellDepth5PctUsdWad: depthForMove(baseReserveUsdWad, quoteReserveUsdWad, 500n, feeBps, false),
      venue,
      poolAddress,
      formulaVersion: "constant-product-reserve-quote-v1",
    };
  } catch {
    return {
      status: "INVALID",
      buyDepth1PctUsdWad: null,
      sellDepth1PctUsdWad: null,
      buyDepth2PctUsdWad: null,
      sellDepth2PctUsdWad: null,
      buyDepth5PctUsdWad: null,
      sellDepth5PctUsdWad: null,
      venue,
      poolAddress,
      formulaVersion: "constant-product-reserve-quote-v1",
    };
  }
}

function depthForMove(
  baseReserve: bigint,
  quoteReserve: bigint,
  moveBps: bigint,
  feeBps: bigint,
  buy: boolean,
): bigint {
  if (baseReserve <= 0n || quoteReserve <= 0n || feeBps < 0n || feeBps >= 10_000n)
    throw new Error("INVALID_V2_RESERVES");
  const targetPriceRatio = buy
    ? 1_000_000_000_000_000_000n + (1_000_000_000_000_000_000n * moveBps) / 10_000n
    : 1_000_000_000_000_000_000n - (1_000_000_000_000_000_000n * moveBps) / 10_000n;
  const k = baseReserve * quoteReserve;
  const targetBase = isqrt((k * 1_000_000_000_000_000_000n) / targetPriceRatio);
  const baseDelta = buy ? baseReserve - targetBase : targetBase - baseReserve;
  if (baseDelta <= 0n) return 0n;
  if (buy) return (baseDelta * quoteReserve) / (baseReserve - baseDelta);
  const amountAfterFee = (baseDelta * (10_000n - feeBps)) / 10_000n;
  return (amountAfterFee * quoteReserve) / (baseReserve + amountAfterFee);
}

function isqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("NEGATIVE_SQRT");
  if (value < 2n) return value;
  let low = 1n;
  let high = 1n << BigInt(Math.ceil(value.toString(2).length / 2) + 1);
  while (low + 1n < high) {
    const middle = (low + high) / 2n;
    if (middle * middle <= value) low = middle;
    else high = middle;
  }
  return low;
}

function dedupeLogs(logs: readonly RpcLog[]): readonly RpcLog[] {
  const seen = new Set<string>();
  return logs.filter((log) => {
    const key = `${log.transactionHash ?? ""}:${log.blockNumber ?? ""}:${log.address}:${log.topics.join(",")}:${log.data}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/https?:\/\/[^\s)]+/gi, "[endpoint]");
  return "RPC_READ_FAILED";
}
