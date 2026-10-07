import type { SupportedChain } from "@arcmemeperps/shared";
import { canonicalJson, keccak256Hex } from "@arcmemeperps/shared";
import { HttpJsonClient, HttpProviderError } from "./http.js";
import type { JsonValue } from "./types.js";

/**
 * Credentialless instance-local Blockscout adapter.
 *
 * The endpoint families are the documented community RPC-compatible APIs:
 * token/getTokenHolders, contract/getcontractcreation, account/tokentx, and
 * logs/getLogs. The adapter deliberately reports PARTIAL when pagination or
 * log caps prevent a complete observation; it never upgrades that state to
 * AVAILABLE by assumption.
 */

export type BlockscoutAvailability = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
export type IndexedCoverage = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";

export interface BlockscoutInstanceStatus {
  readonly provider: "BLOCKSCOUT_INSTANCE";
  readonly chain: SupportedChain;
  readonly instanceBaseUrl: string | null;
  readonly availability: BlockscoutAvailability;
  readonly supportedFeatures: readonly string[];
  readonly reason: string | null;
  readonly checkedAt: string;
}

export interface IndexedHolderRecord {
  readonly address: string;
  readonly rawAmount: string;
  readonly page: number;
  readonly fetchedAt: string;
  readonly indexedBlock: number | null;
  readonly rawResponseHash: string;
}

export interface IndexedHolderCensus {
  readonly status: BlockscoutAvailability;
  readonly coverage: IndexedCoverage;
  readonly provider: "BLOCKSCOUT_INSTANCE";
  readonly chain: SupportedChain;
  readonly token: string;
  readonly totalSupply: string | null;
  readonly decimals: number | null;
  readonly expectedHolderCount: number | null;
  readonly holders: readonly IndexedHolderRecord[];
  readonly pagesFetched: number;
  readonly pageSize: number;
  readonly fetchedAt: string;
  readonly endpointFamily: "token.getTokenHolders" | "v2.tokens.holders";
  readonly reason: string | null;
}

export interface IndexedContractCreation {
  readonly status: BlockscoutAvailability;
  readonly provider: "BLOCKSCOUT_INSTANCE";
  readonly chain: SupportedChain;
  readonly token: string;
  readonly creator: string | null;
  readonly transactionHash: string | null;
  readonly blockNumber: number | null;
  readonly timestamp: number | null;
  readonly rawResponseHash: string | null;
  readonly fetchedAt: string;
  readonly endpointFamily: "contract.getcontractcreation";
  readonly reason: string | null;
}

export interface IndexedContractMetadata {
  readonly status: BlockscoutAvailability;
  readonly provider: "BLOCKSCOUT_INSTANCE";
  readonly chain: SupportedChain;
  readonly token: string;
  readonly verified: boolean | null;
  readonly implementation: string | null;
  readonly isProxy: boolean | null;
  readonly compilerVersion: string | null;
  readonly rawResponseHash: string | null;
  readonly fetchedAt: string;
  readonly endpointFamily: "contract.getsourcecode";
  readonly reason: string | null;
}

export interface IndexedTokenTransfer {
  readonly transactionHash: string;
  readonly blockNumber: number | null;
  readonly timestamp: number | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly value: string | null;
  readonly logIndex: number | null;
  readonly token: string;
  readonly page: number;
  readonly rawResponseHash: string;
}

export interface IndexedTokenTransfers {
  readonly status: BlockscoutAvailability;
  readonly coverage: IndexedCoverage;
  readonly provider: "BLOCKSCOUT_INSTANCE";
  readonly chain: SupportedChain;
  readonly token: string;
  readonly transfers: readonly IndexedTokenTransfer[];
  readonly pagesFetched: number;
  readonly fromBlock: number | null;
  readonly toBlock: number | null;
  readonly fetchedAt: string;
  readonly endpointFamily: "account.tokentx" | "v2.tokens.transfers";
  readonly reason: string | null;
}

export interface IndexedEventLog {
  readonly address: string;
  readonly transactionHash: string;
  readonly blockNumber: number | null;
  readonly logIndex: number | null;
  readonly timestamp: number | null;
  readonly topics: readonly string[];
  readonly data: string;
  readonly rawResponseHash: string;
}

export interface IndexedEventLogs {
  readonly status: BlockscoutAvailability;
  readonly coverage: IndexedCoverage;
  readonly provider: "BLOCKSCOUT_INSTANCE";
  readonly chain: SupportedChain;
  readonly address: string;
  readonly topic0: string;
  readonly logs: readonly IndexedEventLog[];
  readonly fromBlock: number;
  readonly toBlock: number;
  readonly fetchedAt: string;
  readonly endpointFamily: "logs.getLogs";
  readonly reason: string | null;
}

export interface BlockscoutEvidenceProviderOptions {
  readonly http?: HttpJsonClient;
  readonly pageSize?: number;
  readonly maxPages?: number;
  readonly maxLogRequests?: number;
  readonly minRequestIntervalMs?: number;
}

const INSTANCE_URLS: Partial<Record<SupportedChain, string>> = {
  ETHEREUM: "https://eth.blockscout.com",
  BASE: "https://base.blockscout.com",
  BNB: "https://bsc.blockscout.com",
  ROBINHOOD: "https://robinhoodchain.blockscout.com",
};

const DEFAULT_PAGE_SIZE = 10_000;
const DEFAULT_MAX_PAGES = 250;
const DEFAULT_MAX_LOG_REQUESTS = 256;
const DEFAULT_INTERVAL_MS = 125;

export function blockscoutInstanceUrl(chain: SupportedChain): string | null {
  return INSTANCE_URLS[chain] ?? null;
}

export class BlockscoutEvidenceProvider {
  private readonly http: HttpJsonClient;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly maxLogRequests: number;
  private readonly minRequestIntervalMs: number;
  private lastRequestAt = 0;
  private requestQueue: Promise<void> = Promise.resolve();

  public constructor(
    public readonly chain: SupportedChain,
    options: BlockscoutEvidenceProviderOptions = {},
  ) {
    this.http = options.http ?? new HttpJsonClient({ timeoutMs: 20_000, maxRetries: 3 });
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    this.maxLogRequests = options.maxLogRequests ?? DEFAULT_MAX_LOG_REQUESTS;
    this.minRequestIntervalMs = options.minRequestIntervalMs ?? DEFAULT_INTERVAL_MS;
  }

  public async probe(token: string, fetchedAt: string): Promise<BlockscoutInstanceStatus> {
    const instanceBaseUrl = blockscoutInstanceUrl(this.chain);
    if (instanceBaseUrl === null) {
      return {
        provider: "BLOCKSCOUT_INSTANCE",
        chain: this.chain,
        instanceBaseUrl: null,
        availability: "UNAVAILABLE",
        supportedFeatures: [],
        reason: "NO_OFFICIAL_INSTANCE_CONFIGURED",
        checkedAt: fetchedAt,
      };
    }
    try {
      const payload = await this.request({
        module: "token",
        action: "getToken",
        contractaddress: token,
      });
      if (!isSuccessPayload(payload) || !isRecord(payload.result)) {
        try {
          const v2 = await this.requestV2(`tokens/${token}`);
          if (isRecord(v2)) {
            return {
              provider: "BLOCKSCOUT_INSTANCE",
              chain: this.chain,
              instanceBaseUrl,
              availability: "PARTIAL",
              supportedFeatures: ["v2.tokens", "v2.tokens.holders", "v2.tokens.transfers"],
              reason: `V1_${responseReason(payload)}_V2_AVAILABLE`,
              checkedAt: fetchedAt,
            };
          }
        } catch {
          // Fall through to the explicit partial classification below.
        }
        return {
          provider: "BLOCKSCOUT_INSTANCE",
          chain: this.chain,
          instanceBaseUrl,
          availability: "PARTIAL",
          supportedFeatures: [],
          reason: responseReason(payload),
          checkedAt: fetchedAt,
        };
      }
      return {
        provider: "BLOCKSCOUT_INSTANCE",
        chain: this.chain,
        instanceBaseUrl,
        availability: "AVAILABLE",
        supportedFeatures: [
          "token.getToken",
          "token.getTokenHolders",
          "contract.getcontractcreation",
          "contract.getsourcecode",
          "account.tokentx",
          "logs.getLogs",
        ],
        reason: null,
        checkedAt: fetchedAt,
      };
    } catch (error) {
      try {
        const v2 = await this.requestV2(`tokens/${token}`);
        if (isRecord(v2)) {
          return {
            provider: "BLOCKSCOUT_INSTANCE",
            chain: this.chain,
            instanceBaseUrl,
            availability: "PARTIAL",
            supportedFeatures: ["v2.tokens", "v2.tokens.holders", "v2.tokens.transfers"],
            reason: `V1_${safeError(error)}_V2_AVAILABLE`,
            checkedAt: fetchedAt,
          };
        }
      } catch {
        // Fall through to the explicit unavailable classification below.
      }
      return {
        provider: "BLOCKSCOUT_INSTANCE",
        chain: this.chain,
        instanceBaseUrl,
        availability: "UNAVAILABLE",
        supportedFeatures: [],
        reason: safeError(error),
        checkedAt: fetchedAt,
      };
    }
  }

  public async readTokenHolders(token: string, fetchedAt: string): Promise<IndexedHolderCensus> {
    const normalizedToken = token.toLowerCase();
    const empty = (status: BlockscoutAvailability, reason: string): IndexedHolderCensus => ({
      status,
      coverage: status === "UNAVAILABLE" ? "UNAVAILABLE" : "PARTIAL",
      provider: "BLOCKSCOUT_INSTANCE",
      chain: this.chain,
      token: normalizedToken,
      totalSupply: null,
      decimals: null,
      expectedHolderCount: null,
      holders: [],
      pagesFetched: 0,
      pageSize: this.pageSize,
      fetchedAt,
      endpointFamily: "token.getTokenHolders",
      reason,
    });
    try {
      const tokenPayload = await this.request({
        module: "token",
        action: "getToken",
        contractaddress: token,
      });
      if (!isSuccessPayload(tokenPayload) || !isRecord(tokenPayload.result))
        return this.readTokenHoldersV2(token, fetchedAt, responseReason(tokenPayload));
      const tokenResult = tokenPayload.result;
      const totalSupply = stringField(tokenResult, "totalSupply");
      const decimalsValue = stringField(tokenResult, "decimals");
      const decimals = decimalsValue === null ? null : safeNumber(decimalsValue);
      const holders: IndexedHolderRecord[] = [];
      let page = 1;
      let pagesFetched = 0;
      while (page <= this.maxPages) {
        const payload = await this.request({
          module: "token",
          action: "getTokenHolders",
          contractaddress: token,
          page: page.toString(),
          offset: this.pageSize.toString(),
        });
        if (!isSuccessPayload(payload) || !Array.isArray(payload.result)) {
          if (isRateLimitResponse(payload))
            return this.readTokenHoldersV2(token, fetchedAt, "V1_RATE_LIMITED");
          return {
            status: holders.length === 0 ? "UNAVAILABLE" : "PARTIAL",
            coverage: holders.length === 0 ? "UNAVAILABLE" : "PARTIAL",
            provider: "BLOCKSCOUT_INSTANCE",
            chain: this.chain,
            token: normalizedToken,
            totalSupply,
            decimals,
            expectedHolderCount: null,
            holders,
            pagesFetched,
            pageSize: this.pageSize,
            fetchedAt,
            endpointFamily: "token.getTokenHolders",
            reason: responseReason(payload),
          };
        }
        pagesFetched += 1;
        const rawHash = hashPayload(payload);
        const records = payload.result.flatMap((item) => {
          if (!isRecord(item)) return [];
          const address = stringField(item, "address");
          const rawAmount = stringField(item, "value");
          if (address === null || rawAmount === null || !isAddress(address)) return [];
          return [
            {
              address: address.toLowerCase(),
              rawAmount,
              page,
              fetchedAt,
              indexedBlock: numberField(item, "blockNumber"),
              rawResponseHash: rawHash,
            },
          ];
        });
        holders.push(...records);
        if (payload.result.length < this.pageSize) {
          return {
            status: "AVAILABLE",
            coverage: "COMPLETE",
            provider: "BLOCKSCOUT_INSTANCE",
            chain: this.chain,
            token: normalizedToken,
            totalSupply,
            decimals,
            expectedHolderCount: null,
            holders,
            pagesFetched,
            pageSize: this.pageSize,
            fetchedAt,
            endpointFamily: "token.getTokenHolders",
            reason: null,
          };
        }
        page += 1;
      }
      return {
        status: "PARTIAL",
        coverage: "PARTIAL",
        provider: "BLOCKSCOUT_INSTANCE",
        chain: this.chain,
        token: normalizedToken,
        totalSupply,
        decimals,
        expectedHolderCount: null,
        holders,
        pagesFetched,
        pageSize: this.pageSize,
        fetchedAt,
        endpointFamily: "token.getTokenHolders",
        reason: "MAX_HOLDER_PAGES_REACHED",
      };
    } catch (error) {
      if (isRateLimitError(error))
        return this.readTokenHoldersV2(token, fetchedAt, "V1_RATE_LIMITED");
      return empty("UNAVAILABLE", safeError(error));
    }
  }

  private async readTokenHoldersV2(
    token: string,
    fetchedAt: string,
    fallbackReason: string,
  ): Promise<IndexedHolderCensus> {
    const normalizedToken = token.toLowerCase();
    try {
      const summary = await this.requestV2(`tokens/${token}`);
      if (!isRecord(summary)) throw new Error("V2_TOKEN_SUMMARY_MISSING");
      const totalSupply = stringField(summary, "total_supply");
      const decimalsValue = stringField(summary, "decimals");
      const decimals = decimalsValue === null ? null : safeNumber(decimalsValue);
      const expectedHolderCount = numberField(summary, "holders_count");
      const holders: IndexedHolderRecord[] = [];
      let nextParams: JsonObject | null = null;
      let pagesFetched = 0;
      while (pagesFetched < this.maxPages) {
        const params = new URLSearchParams();
        if (nextParams !== null)
          for (const [key, value] of Object.entries(nextParams))
            if (typeof value === "string" || typeof value === "number")
              params.set(key, String(value));
        const payload = await this.requestV2(
          `tokens/${token}/holders${params.toString() ? `?${params.toString()}` : ""}`,
        );
        if (!isRecord(payload) || !Array.isArray(payload.items))
          return {
            status: holders.length === 0 ? "UNAVAILABLE" : "PARTIAL",
            coverage: holders.length === 0 ? "UNAVAILABLE" : "PARTIAL",
            provider: "BLOCKSCOUT_INSTANCE",
            chain: this.chain,
            token: normalizedToken,
            totalSupply,
            decimals,
            expectedHolderCount,
            holders,
            pagesFetched,
            pageSize: 50,
            fetchedAt,
            endpointFamily: "v2.tokens.holders",
            reason: "V2_HOLDER_RESPONSE_MISSING",
          };
        pagesFetched += 1;
        const rawHash = hashPayload(payload);
        for (const item of payload.items) {
          if (!isRecord(item)) continue;
          const addressRecord = item.address;
          const address = isRecord(addressRecord)
            ? stringField(addressRecord, "hash")
            : typeof addressRecord === "string"
              ? addressRecord
              : null;
          const rawAmount = stringField(item, "value");
          if (address === null || rawAmount === null || !isAddress(address)) continue;
          holders.push({
            address: address.toLowerCase(),
            rawAmount,
            page: pagesFetched,
            fetchedAt,
            indexedBlock: null,
            rawResponseHash: rawHash,
          });
        }
        const next = payload.next_page_params;
        if (!isRecord(next))
          return {
            status: "AVAILABLE",
            coverage: "COMPLETE",
            provider: "BLOCKSCOUT_INSTANCE",
            chain: this.chain,
            token: normalizedToken,
            totalSupply,
            decimals,
            expectedHolderCount,
            holders,
            pagesFetched,
            pageSize: 50,
            fetchedAt,
            endpointFamily: "v2.tokens.holders",
            reason: fallbackReason === "V1_RATE_LIMITED" ? "V1_RATE_LIMITED_V2_COMPLETE" : null,
          };
        nextParams = next;
      }
      return {
        status: "PARTIAL",
        coverage: "PARTIAL",
        provider: "BLOCKSCOUT_INSTANCE",
        chain: this.chain,
        token: normalizedToken,
        totalSupply,
        decimals,
        expectedHolderCount,
        holders,
        pagesFetched,
        pageSize: 50,
        fetchedAt,
        endpointFamily: "v2.tokens.holders",
        reason: "MAX_HOLDER_PAGES_REACHED",
      };
    } catch (error) {
      return {
        status: "UNAVAILABLE",
        coverage: "UNAVAILABLE",
        provider: "BLOCKSCOUT_INSTANCE",
        chain: this.chain,
        token: normalizedToken,
        totalSupply: null,
        decimals: null,
        expectedHolderCount: null,
        holders: [],
        pagesFetched: 0,
        pageSize: 50,
        fetchedAt,
        endpointFamily: "v2.tokens.holders",
        reason: `${fallbackReason}:${safeError(error)}`,
      };
    }
  }

  public async readContractCreation(
    token: string,
    fetchedAt: string,
  ): Promise<IndexedContractCreation> {
    const base = {
      provider: "BLOCKSCOUT_INSTANCE" as const,
      chain: this.chain,
      token: token.toLowerCase(),
      fetchedAt,
      endpointFamily: "contract.getcontractcreation" as const,
    };
    try {
      const payload = await this.request({
        module: "contract",
        action: "getcontractcreation",
        contractaddresses: token,
      });
      if (!isSuccessPayload(payload) || !Array.isArray(payload.result)) {
        return {
          ...base,
          status: "UNAVAILABLE",
          creator: null,
          transactionHash: null,
          blockNumber: null,
          timestamp: null,
          rawResponseHash: hashPayload(payload),
          reason: responseReason(payload),
        };
      }
      const match = payload.result.find(
        (item) =>
          isRecord(item) &&
          stringField(item, "contractAddress")?.toLowerCase() === token.toLowerCase(),
      );
      if (!isRecord(match)) {
        return {
          ...base,
          status: "PARTIAL",
          creator: null,
          transactionHash: null,
          blockNumber: null,
          timestamp: null,
          rawResponseHash: hashPayload(payload),
          reason: "CONTRACT_CREATION_RECORD_MISSING",
        };
      }
      return {
        ...base,
        status: "AVAILABLE",
        creator: normalizeAddress(stringField(match, "contractCreator")),
        transactionHash: stringField(match, "txHash"),
        blockNumber: numberField(match, "blockNumber"),
        timestamp: numberField(match, "timestamp"),
        rawResponseHash: hashPayload(payload),
        reason: null,
      };
    } catch (error) {
      return {
        ...base,
        status: "UNAVAILABLE",
        creator: null,
        transactionHash: null,
        blockNumber: null,
        timestamp: null,
        rawResponseHash: null,
        reason: safeError(error),
      };
    }
  }

  public async readContractMetadata(
    token: string,
    fetchedAt: string,
  ): Promise<IndexedContractMetadata> {
    const base = {
      provider: "BLOCKSCOUT_INSTANCE" as const,
      chain: this.chain,
      token: token.toLowerCase(),
      fetchedAt,
      endpointFamily: "contract.getsourcecode" as const,
    };
    try {
      const payload = await this.request({
        module: "contract",
        action: "getsourcecode",
        address: token,
      });
      if (!isSuccessPayload(payload)) {
        return {
          ...base,
          status: "UNAVAILABLE",
          verified: null,
          implementation: null,
          isProxy: null,
          compilerVersion: null,
          rawResponseHash: hashPayload(payload),
          reason: responseReason(payload),
        };
      }
      const result = Array.isArray(payload.result) ? payload.result[0] : payload.result;
      if (!isRecord(result)) {
        return {
          ...base,
          status: "PARTIAL",
          verified: null,
          implementation: null,
          isProxy: null,
          compilerVersion: null,
          rawResponseHash: hashPayload(payload),
          reason: "SOURCE_METADATA_MISSING",
        };
      }
      const source = stringField(result, "SourceCode");
      const abi = stringField(result, "ABI");
      const proxyValue = stringField(result, "IsProxy");
      return {
        ...base,
        status: "AVAILABLE",
        verified: (source !== null && source.length > 0) || (abi !== null && abi.length > 2),
        implementation: normalizeAddress(stringField(result, "ImplementationAddress")),
        isProxy: proxyValue === null ? null : ["1", "true"].includes(proxyValue.toLowerCase()),
        compilerVersion: stringField(result, "CompilerVersion"),
        rawResponseHash: hashPayload(payload),
        reason: null,
      };
    } catch (error) {
      return {
        ...base,
        status: "UNAVAILABLE",
        verified: null,
        implementation: null,
        isProxy: null,
        compilerVersion: null,
        rawResponseHash: null,
        reason: safeError(error),
      };
    }
  }

  public async readTokenTransfers(
    token: string,
    fetchedAt: string,
    bounds: { readonly startBlock?: number; readonly endBlock?: number } = {},
  ): Promise<IndexedTokenTransfers> {
    const normalizedToken = token.toLowerCase();
    const transfers: IndexedTokenTransfer[] = [];
    const seen = new Set<string>();
    let pagesFetched = 0;
    try {
      for (let page = 1; page <= this.maxPages; page += 1) {
        const payload = await this.request({
          module: "account",
          action: "tokentx",
          contractaddress: token,
          page: page.toString(),
          offset: this.pageSize.toString(),
          sort: "asc",
          ...(bounds.startBlock === undefined ? {} : { startblock: bounds.startBlock.toString() }),
          ...(bounds.endBlock === undefined ? {} : { endblock: bounds.endBlock.toString() }),
        });
        if (!isSuccessPayload(payload) || !Array.isArray(payload.result)) {
          if (isRateLimitResponse(payload))
            return this.readTokenTransfersV2(token, fetchedAt, "V1_RATE_LIMITED");
          return transferResult(
            this.chain,
            normalizedToken,
            transfers,
            pagesFetched,
            bounds,
            fetchedAt,
            transfers.length === 0 ? "UNAVAILABLE" : "PARTIAL",
            transfers.length === 0 ? "UNAVAILABLE" : "PARTIAL",
            responseReason(payload),
          );
        }
        pagesFetched += 1;
        const rawHash = hashPayload(payload);
        for (const item of payload.result) {
          if (!isRecord(item)) continue;
          const transactionHash = stringField(item, "hash") ?? stringField(item, "transactionHash");
          if (transactionHash === null) continue;
          const logIndex = numberField(item, "logIndex");
          const key = `${transactionHash.toLowerCase()}:${logIndex ?? ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          transfers.push({
            transactionHash,
            blockNumber: numberField(item, "blockNumber"),
            timestamp: numberField(item, "timeStamp"),
            from: normalizeAddress(stringField(item, "from")),
            to: normalizeAddress(stringField(item, "to")),
            value: stringField(item, "value"),
            logIndex,
            token: normalizedToken,
            page,
            rawResponseHash: rawHash,
          });
        }
        if (payload.result.length < this.pageSize)
          return transferResult(
            this.chain,
            normalizedToken,
            transfers,
            pagesFetched,
            bounds,
            fetchedAt,
            "AVAILABLE",
            "COMPLETE",
            null,
          );
      }
      return transferResult(
        this.chain,
        normalizedToken,
        transfers,
        pagesFetched,
        bounds,
        fetchedAt,
        "PARTIAL",
        "PARTIAL",
        "MAX_TRANSFER_PAGES_REACHED",
      );
    } catch (error) {
      if (isRateLimitError(error))
        return this.readTokenTransfersV2(token, fetchedAt, "V1_RATE_LIMITED");
      return transferResult(
        this.chain,
        normalizedToken,
        transfers,
        pagesFetched,
        bounds,
        fetchedAt,
        transfers.length === 0 ? "UNAVAILABLE" : "PARTIAL",
        transfers.length === 0 ? "UNAVAILABLE" : "PARTIAL",
        safeError(error),
      );
    }
  }

  private async readTokenTransfersV2(
    token: string,
    fetchedAt: string,
    fallbackReason: string,
  ): Promise<IndexedTokenTransfers> {
    const normalizedToken = token.toLowerCase();
    const transfers: IndexedTokenTransfer[] = [];
    const seen = new Set<string>();
    let nextParams: JsonObject | null = null;
    let pagesFetched = 0;
    try {
      while (pagesFetched < this.maxPages) {
        const params = new URLSearchParams();
        if (nextParams !== null)
          for (const [key, value] of Object.entries(nextParams))
            if (typeof value === "string" || typeof value === "number")
              params.set(key, String(value));
        const payload = await this.requestV2(
          `tokens/${token}/transfers${params.toString() ? `?${params.toString()}` : ""}`,
        );
        if (!isRecord(payload) || !Array.isArray(payload.items))
          return transferResult(
            this.chain,
            normalizedToken,
            transfers,
            pagesFetched,
            {},
            fetchedAt,
            transfers.length === 0 ? "UNAVAILABLE" : "PARTIAL",
            transfers.length === 0 ? "UNAVAILABLE" : "PARTIAL",
            "V2_TRANSFER_RESPONSE_MISSING",
          );
        pagesFetched += 1;
        const rawHash = hashPayload(payload);
        for (const item of payload.items) {
          if (!isRecord(item)) continue;
          const transactionHash = stringField(item, "transaction_hash");
          if (transactionHash === null) continue;
          const logIndex = numberField(item, "log_index");
          const key = `${transactionHash.toLowerCase()}:${logIndex ?? ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const fromRecord = isRecord(item.from) ? stringField(item.from, "hash") : null;
          const toRecord = isRecord(item.to) ? stringField(item.to, "hash") : null;
          const totalRecord = isRecord(item.total) ? stringField(item.total, "value") : null;
          transfers.push({
            transactionHash,
            blockNumber: numberField(item, "block_number"),
            timestamp: timestampField(item, "timestamp"),
            from: normalizeAddress(fromRecord),
            to: normalizeAddress(toRecord),
            value: totalRecord,
            logIndex,
            token: normalizedToken,
            page: pagesFetched,
            rawResponseHash: rawHash,
          });
        }
        const next = payload.next_page_params;
        if (!isRecord(next))
          return transferResult(
            this.chain,
            normalizedToken,
            transfers,
            pagesFetched,
            {},
            fetchedAt,
            "AVAILABLE",
            "COMPLETE",
            fallbackReason === "V1_RATE_LIMITED" ? "V1_RATE_LIMITED_V2_COMPLETE" : null,
          );
        nextParams = next;
      }
      return transferResult(
        this.chain,
        normalizedToken,
        transfers,
        pagesFetched,
        {},
        fetchedAt,
        "PARTIAL",
        "PARTIAL",
        "MAX_TRANSFER_PAGES_REACHED",
      );
    } catch (error) {
      return transferResult(
        this.chain,
        normalizedToken,
        transfers,
        pagesFetched,
        {},
        fetchedAt,
        transfers.length === 0 ? "UNAVAILABLE" : "PARTIAL",
        transfers.length === 0 ? "UNAVAILABLE" : "PARTIAL",
        safeError(error),
      );
    }
  }

  public async readLogs(
    address: string,
    topic0: string,
    fromBlock: number,
    toBlock: number,
    fetchedAt: string,
  ): Promise<IndexedEventLogs> {
    const normalizedAddress = address.toLowerCase();
    const normalizedTopic = topic0.toLowerCase();
    const logs: IndexedEventLog[] = [];
    const seen = new Set<string>();
    let requests = 0;
    let partial = false;
    const readRange = async (start: number, end: number): Promise<void> => {
      if (requests >= this.maxLogRequests) {
        partial = true;
        return;
      }
      requests += 1;
      const payload = await this.request({
        module: "logs",
        action: "getLogs",
        fromBlock: start.toString(),
        toBlock: end.toString(),
        address,
        topic0,
      });
      if (!isSuccessPayload(payload) || !Array.isArray(payload.result))
        throw new Error(responseReason(payload));
      if (payload.result.length >= 1_000 && start < end) {
        const midpoint = Math.floor((start + end) / 2);
        await readRange(start, midpoint);
        await readRange(midpoint + 1, end);
        return;
      }
      if (payload.result.length >= 1_000) partial = true;
      const rawHash = hashPayload(payload);
      for (const item of payload.result) {
        if (!isRecord(item)) continue;
        const itemAddress = normalizeAddress(stringField(item, "address"));
        const topics = arrayField(item, "topics").flatMap((value) =>
          typeof value === "string" ? [value.toLowerCase()] : [],
        );
        const transactionHash = stringField(item, "transactionHash");
        if (
          itemAddress !== normalizedAddress ||
          topics[0] !== normalizedTopic ||
          transactionHash === null
        )
          continue;
        const logIndex = numberField(item, "logIndex");
        const key = `${transactionHash.toLowerCase()}:${logIndex ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        logs.push({
          address: itemAddress,
          transactionHash,
          blockNumber: numberField(item, "blockNumber"),
          logIndex,
          timestamp: numberField(item, "timeStamp"),
          topics,
          data: stringField(item, "data") ?? "0x",
          rawResponseHash: rawHash,
        });
      }
    };
    try {
      if (fromBlock > toBlock) throw new Error("INVALID_LOG_RANGE");
      await readRange(fromBlock, toBlock);
      return {
        status: partial ? "PARTIAL" : "AVAILABLE",
        coverage: partial ? "PARTIAL" : "COMPLETE",
        provider: "BLOCKSCOUT_INSTANCE",
        chain: this.chain,
        address: normalizedAddress,
        topic0: normalizedTopic,
        logs,
        fromBlock,
        toBlock,
        fetchedAt,
        endpointFamily: "logs.getLogs",
        reason: partial ? "LOG_RESULT_OR_REQUEST_CAP_REACHED" : null,
      };
    } catch (error) {
      return {
        status: logs.length === 0 ? "UNAVAILABLE" : "PARTIAL",
        coverage: logs.length === 0 ? "UNAVAILABLE" : "PARTIAL",
        provider: "BLOCKSCOUT_INSTANCE",
        chain: this.chain,
        address: normalizedAddress,
        topic0: normalizedTopic,
        logs,
        fromBlock,
        toBlock,
        fetchedAt,
        endpointFamily: "logs.getLogs",
        reason: safeError(error),
      };
    }
  }

  private async request(params: Readonly<Record<string, string>>): Promise<JsonValue> {
    const instanceBaseUrl = blockscoutInstanceUrl(this.chain);
    if (instanceBaseUrl === null) throw new Error("NO_OFFICIAL_INSTANCE_CONFIGURED");
    const url = new URL(`${instanceBaseUrl}/api`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const previous = this.requestQueue;
    let release: () => void = () => undefined;
    this.requestQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const waitMs = Math.max(0, this.minRequestIntervalMs - (Date.now() - this.lastRequestAt));
      if (waitMs > 0) await delay(waitMs);
      this.lastRequestAt = Date.now();
      return await this.http.get<JsonValue>(url.toString());
    } finally {
      release();
    }
  }

  private async requestV2(path: string): Promise<JsonValue> {
    const instanceBaseUrl = blockscoutInstanceUrl(this.chain);
    if (instanceBaseUrl === null) throw new Error("NO_OFFICIAL_INSTANCE_CONFIGURED");
    const url = `${instanceBaseUrl}/api/v2/${path}`;
    const previous = this.requestQueue;
    let release: () => void = () => undefined;
    this.requestQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const waitMs = Math.max(0, this.minRequestIntervalMs - (Date.now() - this.lastRequestAt));
      if (waitMs > 0) await delay(waitMs);
      this.lastRequestAt = Date.now();
      return await this.http.get<JsonValue>(url);
    } finally {
      release();
    }
  }
}

export function compareIndexedBalance(
  indexedRawAmount: string,
  rpcRawAmount: string,
  relativeTolerance = 0.001,
): "CONSISTENT" | "CONFLICTED" {
  try {
    const indexed = BigInt(indexedRawAmount);
    const rpc = BigInt(rpcRawAmount);
    const denominator = indexed > rpc ? indexed : rpc;
    if (denominator === 0n) return "CONSISTENT";
    const difference = indexed > rpc ? indexed - rpc : rpc - indexed;
    return Number((difference * 1_000_000n) / denominator) / 1_000_000 <= relativeTolerance
      ? "CONSISTENT"
      : "CONFLICTED";
  } catch {
    return "CONFLICTED";
  }
}

function transferResult(
  chain: SupportedChain,
  token: string,
  transfers: readonly IndexedTokenTransfer[],
  pagesFetched: number,
  bounds: { readonly startBlock?: number; readonly endBlock?: number },
  fetchedAt: string,
  status: BlockscoutAvailability,
  coverage: IndexedCoverage,
  reason: string | null,
): IndexedTokenTransfers {
  return {
    status,
    coverage,
    provider: "BLOCKSCOUT_INSTANCE",
    chain,
    token,
    transfers,
    pagesFetched,
    fromBlock: bounds.startBlock ?? null,
    toBlock: bounds.endBlock ?? null,
    fetchedAt,
    endpointFamily: "account.tokentx",
    reason,
  };
}

function isSuccessPayload(
  payload: JsonValue,
): payload is JsonObject & { readonly result: JsonValue } {
  return isRecord(payload) && payload.status === "1";
}

type JsonObject = { readonly [key: string]: JsonValue };

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(record: JsonObject, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function numberField(record: JsonObject, key: string): number | null {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  if (typeof value === "string" && /^0x[0-9a-f]+$/i.test(value)) return Number(BigInt(value));
  return null;
}

function timestampField(record: JsonObject, key: string): number | null {
  const numeric = numberField(record, key);
  if (numeric !== null) return numeric;
  const value = stringField(record, key);
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1_000) : null;
}

function arrayField(record: JsonObject, key: string): readonly JsonValue[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function normalizeAddress(value: string | null): string | null {
  return value !== null && isAddress(value) ? value.toLowerCase() : null;
}

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function safeNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function responseReason(payload: JsonValue): string {
  if (!isRecord(payload)) return "MALFORMED_PROVIDER_RESPONSE";
  const message = stringField(payload, "message");
  const result = stringField(payload, "result");
  return (
    [message, result].filter((value): value is string => value !== null).join(":") ||
    "PROVIDER_UNAVAILABLE"
  );
}

function hashPayload(payload: JsonValue): string {
  return keccak256Hex(canonicalJson(payload));
}

function safeError(error: unknown): string {
  if (error instanceof HttpProviderError) return `HTTP_${error.status ?? "NETWORK"}`;
  if (error instanceof Error) return error.message.replace(/https?:\/\/[^\s)]+/gi, "[endpoint]");
  return "BLOCKSCOUT_READ_FAILED";
}

function isRateLimitResponse(payload: JsonValue): boolean {
  if (!isRecord(payload)) return false;
  const message = `${stringField(payload, "message") ?? ""} ${stringField(payload, "result") ?? ""}`;
  return /429|rate.?limit|too many/i.test(message);
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof HttpProviderError && error.status === 429;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
