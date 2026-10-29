import {
  decodeFunctionResult,
  encodeFunctionData,
  keccak256,
  parseAbi,
  toBytes,
  type Hex,
} from "viem";
import {
  marketIdForToken,
  solanaPublicKeyBytes,
  SUPPORTED_EVM_CHAIN_IDS,
  type SupportedChain,
} from "@arcmemeperps/shared";

const RPC_DEFAULTS = [
  "https://rpc.mainnet.arc.io",
  "https://arc.nodely.dev",
  "https://arc.drpc.org",
  "https://rpc.quicknode.mainnet.arc.io",
] as const;
const ADDRESSES = {
  market: "0x7ebddb2c1f1ae68a2e5b984fe9e75115cdb8ef1b",
  qualification: "0x67b175dd57d17d8ef4bd307d1a20a8d5438180e7",
  risk: "0x89ea15e527f7d06503ed2e7c958c2ac0e5799f85",
  oracle: "0x1531c83ac90e5ec5998eaf42a4464757dcd2c3ff",
  engine: "0xd9c3cbf1841103749f379cc1aae1a9284d8dc3e1",
  margin: "0xa818dd503641ffdfe11ff8a4b7e8020d2a36bcaf",
  insurance: "0x8b0550babc3b802d89c17dfbee85828e14e6a22b",
  lp: "0x9ff8358dc5ee866e0b9707d0139cf47b399f5257",
  adl: "0x3c53f9f8d0c651c8a7e061872367274d8a8bf257",
  timelock: "0xab0177c7fdad783faf27f145ecb95e92863fd4c2",
  usdc: "0x3600000000000000000000000000000000000000",
} as const;

const ABI = parseAbi([
  "function bootstrapFinalized() view returns (bool)",
  "function owner() view returns (address)",
  "function governanceExecutor() view returns (address)",
  "function marketExists(bytes32 marketId) view returns (bool)",
  "function getMarket(bytes32 marketId) view returns ((bytes32 marketId, bytes32 originChain, bytes originToken, bytes32 lifecycle, uint8 state, bool exists) market)",
  "function isApproved(bytes32 marketId) view returns (bool)",
  "function getQualification(bytes32 marketId) view returns ((bytes32 proofHash, bytes32 ruleVersion, uint64 qualifiedAt, uint64 expiresAt, uint256 maxLeverage, uint256 maxOI, uint256 maxPosition, bool approved) qualification)",
  "function getConfig(bytes32 marketId) view returns ((uint256 maxLeverage, uint256 maxOI, uint256 maxPosition, uint256 maintenanceMarginBps, uint256 liquidationPenaltyBps, uint8 status) config)",
  "function qualificationRegistry() view returns (address)",
  "function appliedQualificationProof(bytes32 marketId) view returns (bytes32)",
  "function appliedQualificationAt(bytes32 marketId) view returns (uint64)",
  "function isReportUsable(bytes32 marketId) view returns (bool)",
  "function getUsablePrice(bytes32 marketId) view returns (uint256 price, uint64 observedAt, uint256 confidenceBps)",
  "function getReport(bytes32 marketId) view returns ((bytes32 marketId, uint256 arcChainId, uint256 midPrice, uint256 minPrice, uint256 maxPrice, uint256 confidenceBps, uint256 sourceCount, uint256 independentSourceCount, uint64 observedAt, uint64 validFrom, uint64 expiresAt, uint64 sequence, bytes32 evidenceRoot, bytes32 reporterSetVersion) report)",
  "function minimumIndependentSources() view returns (uint256)",
  "function maxStaleness() view returns (uint64)",
  "function minimumConfidenceBps() view returns (uint256)",
  "function reporterThreshold() view returns (uint256)",
  "function reporterSetVersion() view returns (bytes32)",
  "function retiredReporterSetVersion(bytes32 version) view returns (bool)",
  "function domainChainId() view returns (uint256)",
  "function totalOpenInterest(bytes32 marketId) view returns (uint256)",
  "function solvencyBlocked() view returns (bool)",
  "function marketRegistry() view returns (address)",
  "function riskConfig() view returns (address)",
  "function oracleRouter() view returns (address)",
  "function marginVault() view returns (address)",
  "function insuranceFund() view returns (address)",
  "function adlController() view returns (address)",
  "function engine() view returns (address)",
  "function collateralToken() view returns (address)",
  "function actualCustodyUsdc() view returns (uint256)",
  "function expectedCustodyUsdc() view returns (uint256)",
  "function withdrawableLiquidity() view returns (uint256)",
  "function protocolBadDebt() view returns (uint256)",
  "function insuranceCoveredBadDebt() view returns (uint256)",
  "function availableCapital() view returns (uint256)",
  "function badDebtCovered() view returns (uint256)",
  "function uncoveredBadDebt() view returns (uint256)",
  "function publicLpActive() view returns (bool)",
  "function asset() view returns (address)",
  "function decimals() view returns (uint8)",
  "function minDelay() view returns (uint256)",
]);

type FunctionName = (typeof ABI)[number]["name"];
type JsonRpcResult<T> = {
  jsonrpc?: string;
  id?: number;
  result?: T;
  error?: { code?: number; message?: string };
};
type RpcSource = { url: string; name: string };
type RpcCall = {
  key: string;
  address: string;
  functionName: FunctionName;
  args?: readonly unknown[];
};
type CheckStatus = "PASS" | "FAIL" | "UNKNOWN";
type Check = {
  status: CheckStatus;
  evidence: string | null;
  reason: string | null;
  sources: string[];
};
type RpcMethod = (url: string, method: string, params: unknown[]) => Promise<unknown>;
type BatchRequest = { method: string; params: unknown[] };
type BatchOutcome = { result?: unknown; error?: string };
type RpcBatchMethod = (url: string, requests: BatchRequest[]) => Promise<BatchOutcome[]>;

const HASH_ZERO = `0x${"00".repeat(32)}`.toLowerCase();
const SOLANA_ORIGIN_CHAIN = keccak256(toBytes("SOLANA"));
const makePass = (evidence: unknown = null): Check => ({
  status: "PASS",
  evidence: evidence === null ? null : evidenceText(evidence),
  reason: null,
  sources: [],
});
const makeFail = (reason: string, evidence: unknown = null): Check => ({
  status: "FAIL",
  evidence: evidence === null ? null : evidenceText(evidence),
  reason,
  sources: [],
});

function evidenceText(value: unknown): string {
  if (typeof value === "bigint") return value.toString(10);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return String(value);
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return "UNSERIALIZABLE_EVIDENCE";
  }
}
const makeUnknown = (reason: string): Check => ({
  status: "UNKNOWN",
  evidence: null,
  reason,
  sources: [],
});

function rpcSources(): RpcSource[] {
  const configured = typeof process !== "undefined" ? process.env.ARC_READ_RPC_URLS : undefined;
  const urls = configured
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean) ?? [...RPC_DEFAULTS];
  const unique = [...new Set(urls)].slice(0, 4);
  return unique.map((url, index) => {
    try {
      return { url, name: new URL(url).hostname || `rpc-${index + 1}` };
    } catch {
      return { url, name: `rpc-${index + 1}` };
    }
  });
}

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(4500),
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === 2) throw new Error(`RPC_HTTP_${response.status}`);
      } else {
        const body = (await response.json()) as JsonRpcResult<unknown>;
        if (body.error) throw new Error(`RPC_ERROR_${body.error.code ?? "UNKNOWN"}`);
        if (!("result" in body)) throw new Error("RPC_RESULT_MISSING");
        return body.result;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "RPC_READ_FAILED";
      const retryable =
        message.startsWith("RPC_HTTP_429") ||
        /^RPC_HTTP_5\d\d$/.test(message) ||
        /timeout|fetch failed|network/i.test(message);
      if (!retryable || attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }
  throw new Error("RPC_RETRIES_EXHAUSTED");
}

async function rpcBatch(url: string, requests: BatchRequest[]): Promise<BatchOutcome[]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          requests.map((request, index) => ({
            jsonrpc: "2.0",
            id: index + 1,
            method: request.method,
            params: request.params,
          })),
        ),
        signal: AbortSignal.timeout(5500),
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === 2) throw new Error(`RPC_HTTP_${response.status}`);
      } else {
        const body = await response.json();
        const responses = Array.isArray(body) ? body : [body];
        const byId = new Map<number, JsonRpcResult<unknown>>();
        for (const item of responses as Array<JsonRpcResult<unknown>>) {
          if (typeof item.id === "number") byId.set(item.id, item);
        }
        const outcomes = requests.map((_, index) => {
          const item = byId.get(index + 1);
          if (!item) return { error: "RPC_BATCH_RESULT_MISSING" };
          if (item.error)
            return {
              error: `RPC_ERROR_${item.error.code ?? "UNKNOWN"}_${item.error.message ?? ""}`,
            };
          if (!("result" in item)) return { error: "RPC_RESULT_MISSING" };
          return { result: item.result };
        });
        if (
          attempt < 2 &&
          outcomes.some((outcome) => outcome.error?.toLowerCase().includes("rate limit"))
        ) {
          await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
          continue;
        }
        return outcomes;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "RPC_READ_FAILED";
      const retryable =
        message.startsWith("RPC_HTTP_429") ||
        /^RPC_HTTP_5\d\d$/.test(message) ||
        /timeout|fetch failed|network/i.test(message);
      if (!retryable || attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw new Error("RPC_BATCH_RETRIES_EXHAUSTED");
}

function asHex(value: unknown): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value))
    throw new Error("RPC_INVALID_HEX");
  return value as Hex;
}

function encodeRead(functionName: FunctionName, args: readonly unknown[] = []): Hex {
  return encodeFunctionData({ abi: ABI, functionName, args } as never);
}

function decodeRead(functionName: FunctionName, data: Hex): unknown {
  return decodeFunctionResult({ abi: ABI, functionName, data } as never);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value) && value.length === 1) value = value[0];
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["market", "qualification", "config", "report"]) {
    const nested = record[key];
    if (typeof nested === "object" && nested !== null) return nested as Record<string, unknown>;
  }
  return record;
}

function field(record: Record<string, unknown> | null, name: string, index: number): unknown {
  if (record && name in record) return record[name];
  return Array.isArray(record) ? record[index] : undefined;
}

function sameHex(left: unknown, right: unknown): boolean {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    left.toLowerCase() === right.toLowerCase()
  );
}

function addressMatches(actual: unknown, expected: string): boolean {
  return typeof actual === "string" && actual.toLowerCase() === expected.toLowerCase();
}

function wordBytes(value: unknown): string | null {
  return typeof value === "string" && /^0x(?:[0-9a-f]{2})*$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function inputChain(value: string): SupportedChain | null {
  const allowed: SupportedChain[] = ["ARC", "ETHEREUM", "BASE", "BNB", "ROBINHOOD", "SOLANA"];
  const upper = value.toUpperCase();
  return allowed.includes(upper as SupportedChain) ? (upper as SupportedChain) : null;
}

function sourcePair(sources: RpcSource[], pairIndex: number): RpcSource[] {
  if (sources.length <= 2) return sources;
  const pairCount = Math.ceil(sources.length / 2);
  const start = (pairIndex % pairCount) * 2;
  return [sources[start]!, sources[(start + 1) % sources.length]!];
}

async function consensusRead(
  sources: RpcSource[],
  blockTag: unknown,
  call: RpcCall,
  rpcMethod: RpcMethod = rpc,
  rpcBatchMethod: RpcBatchMethod = rpcBatch,
): Promise<{ raw: Hex; value: unknown }> {
  const data = encodeRead(call.functionName, call.args);
  const request = [{ method: "eth_call", params: [{ to: call.address, data }, blockTag] }];
  const results =
    rpcMethod === rpc
      ? await Promise.all(
          sources.map(async (source) => {
            const [outcome] = await rpcBatchMethod(source.url, request);
            if (!outcome || outcome.error)
              throw new Error(outcome?.error ?? "RPC_BATCH_RESULT_MISSING");
            return outcome.result;
          }),
        )
      : await Promise.all(
          sources.map((source) => rpcMethod(source.url, "eth_call", request[0]!.params)),
        );
  const raw = results.map(asHex);
  if (raw.some((result) => result.toLowerCase() !== raw[0]!.toLowerCase()))
    throw new Error("RPC_DISAGREEMENT");
  return { raw: raw[0]!, value: decodeRead(call.functionName, raw[0]!) };
}

async function consensusReadMany(
  sources: RpcSource[],
  blockTag: unknown,
  calls: RpcCall[],
  batchMethod: RpcBatchMethod,
): Promise<Array<{ key: string; value?: unknown; error?: string; sources: string[] }>> {
  const requests = calls.map((entry) => ({
    method: "eth_call",
    params: [{ to: entry.address, data: encodeRead(entry.functionName, entry.args) }, blockTag],
  }));
  const providerResults = await Promise.all(
    sources.map((source) => batchMethod(source.url, requests)),
  );
  return calls.map((entry, index) => {
    const outcomes = providerResults.map((results) => results[index]);
    if (outcomes.some((item) => !item || item.error)) {
      return {
        key: entry.key,
        error: outcomes.find((item) => !item || item.error)?.error ?? "RPC_BATCH_RESULT_MISSING",
        sources: sources.map((source) => source.name),
      };
    }
    try {
      const raw = outcomes.map((item) => asHex(item!.result));
      if (raw.some((item) => item.toLowerCase() !== raw[0]!.toLowerCase())) {
        return {
          key: entry.key,
          error: "RPC_DISAGREEMENT",
          sources: sources.map((source) => source.name),
        };
      }
      return {
        key: entry.key,
        value: decodeRead(entry.functionName, raw[0]!),
        sources: sources.map((source) => source.name),
      };
    } catch (error) {
      return {
        key: entry.key,
        error: error instanceof Error ? error.message : "RPC_DECODE_FAILED",
        sources: sources.map((source) => source.name),
      };
    }
  });
}

function call(
  key: string,
  address: string,
  functionName: FunctionName,
  args?: readonly unknown[],
): RpcCall {
  return args === undefined ? { key, address, functionName } : { key, address, functionName, args };
}

export const verificationAbi = ABI;
export const encodeVerificationRead = encodeRead;
export const decodeVerificationRead = decodeRead;

export function canonicalOriginMatches(
  chain: SupportedChain,
  tokenAddress: string,
  expectedMarketId: Hex,
  market: Record<string, unknown>,
): boolean {
  const marketId = field(market, "marketId", 0);
  const originChain = field(market, "originChain", 1);
  const originToken = field(market, "originToken", 2);
  if (!sameHex(marketId, expectedMarketId)) return false;
  if (chain === "SOLANA") {
    try {
      return (
        sameHex(originChain, SOLANA_ORIGIN_CHAIN) &&
        wordBytes(originToken) === solanaPublicKeyBytes(tokenAddress).toLowerCase()
      );
    } catch {
      return false;
    }
  }
  const chainId = SUPPORTED_EVM_CHAIN_IDS[chain];
  if (chainId === undefined) return false;
  try {
    return (
      BigInt(String(originChain)) === BigInt(chainId) &&
      wordBytes(originToken) === tokenAddress.toLowerCase()
    );
  } catch {
    return false;
  }
}

function getRpcError(error: unknown): string {
  return error instanceof Error ? error.message : "RPC_READ_FAILED";
}

export async function verifyArcMarket(
  chainInput: string,
  tokenInput: string,
  dependencies: {
    rpcMethod?: RpcMethod;
    rpcBatchMethod?: RpcBatchMethod;
    sources?: RpcSource[];
  } = {},
): Promise<Response> {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "x-content-type-options": "nosniff",
  };
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers });
  const chain = inputChain(chainInput);
  if (!chain || typeof tokenInput !== "string" || tokenInput.length > 64) {
    return json(
      { error: "CHAIN_AND_TOKEN_REQUIRED", tradingEnabled: false, lpDepositsEnabled: false },
      400,
    );
  }

  let marketId: Hex;
  let canonicalToken: string;
  try {
    marketId = marketIdForToken(chain, tokenInput);
    canonicalToken = chain === "SOLANA" ? tokenInput.trim() : tokenInput.trim().toLowerCase();
  } catch {
    return json(
      { error: "INVALID_CHAIN_OR_TOKEN_ADDRESS", tradingEnabled: false, lpDepositsEnabled: false },
      400,
    );
  }

  const sources = dependencies.sources ?? rpcSources();
  const rpcMethod = dependencies.rpcMethod ?? rpc;
  const rpcBatchMethod = dependencies.rpcBatchMethod ?? rpcBatch;
  const checks: Record<string, Check> = {};
  const result = (status: number, extra: Record<string, unknown> = {}) =>
    json(
      {
        schemaVersion: "v1",
        marketIdentity: { chain, tokenAddress: canonicalToken, marketId },
        tradingEnabled: false,
        lpDepositsEnabled: false,
        ...extra,
      },
      status,
    );

  if (sources.length < 2 || new Set(sources.map((source) => source.name)).size < 2) {
    return result(503, {
      status: "UNKNOWN",
      releaseGate: "BLOCKED",
      checks: { rpcQuorum: makeUnknown("TWO_INDEPENDENT_ARC_RPC_ENDPOINTS_REQUIRED") },
      sourceCount: sources.length,
    });
  }

  let blockNumber = 0n;
  let blockHash = "";
  let blockTimestamp = 0n;
  let blockTag = "";
  let usedHashPin = false;
  try {
    const chains = await Promise.all(
      sources.map((source) => rpcMethod(source.url, "eth_chainId", [])),
    );
    if (chains.some((value) => BigInt(String(value)) !== 5042n)) throw new Error("RPC_WRONG_CHAIN");
    const heads = await Promise.all(
      sources.map((source) => rpcMethod(source.url, "eth_blockNumber", [])),
    );
    blockNumber = heads
      .map((head) => BigInt(String(head)))
      .reduce((minimum, value) => (value < minimum ? value : minimum));
    blockTag = `0x${blockNumber.toString(16)}`;
    const blocks = (await Promise.all(
      sources.map((source) => rpcMethod(source.url, "eth_getBlockByNumber", [blockTag, false])),
    )) as Array<{ hash?: unknown; timestamp?: unknown } | null>;
    const hashes = blocks.map((block) => block?.hash);
    if (!hashes[0] || !sameHex(hashes[0], hashes[1]))
      throw new Error("RPC_BLOCK_HASH_DISAGREEMENT");
    blockHash = evidenceText(hashes[0]);
    blockTimestamp = BigInt(evidenceText(blocks[0]?.timestamp ?? "0x0"));
    try {
      const sampleData = encodeRead("bootstrapFinalized");
      const blockRef = { blockHash, requireCanonical: true };
      const sample = await Promise.all(
        sources.map((source) =>
          rpcMethod(source.url, "eth_call", [{ to: ADDRESSES.engine, data: sampleData }, blockRef]),
        ),
      );
      if (asHex(sample[0]).toLowerCase() !== asHex(sample[1]).toLowerCase())
        throw new Error("RPC_DISAGREEMENT");
      usedHashPin = true;
    } catch (error) {
      // Some Arc gateways implement block-number calls but not EIP-1898. The same
      // block hash is still rechecked at the end before any result can be returned.
      if (getRpcError(error) === "RPC_DISAGREEMENT") throw error;
    }
  } catch (error) {
    return result(503, {
      status: "UNKNOWN",
      releaseGate: "BLOCKED",
      verificationMethod: "DUAL_RPC_PINNED_BLOCK_REQUIRED",
      sources: sources.map((source) => source.name),
      checks: { rpcConsensus: makeUnknown(getRpcError(error)) },
    });
  }

  checks.rpcChain = makePass("5042 on every configured source");
  checks.rpcBlockConsensus = makePass(`block ${blockNumber}, hash ${blockHash}`);
  const checkSourcesByRead: Record<string, string[]> = {
    rpcChain: sources.map((source) => source.name),
    rpcBlockConsensus: sources.map((source) => source.name),
  };
  const reads: RpcCall[] = [
    ...[
      "market",
      "qualification",
      "risk",
      "oracle",
      "engine",
      "margin",
      "insurance",
      "lp",
      "adl",
    ].map((key) =>
      call(`${key}Bootstrap`, ADDRESSES[key as keyof typeof ADDRESSES], "bootstrapFinalized"),
    ),
    ...[
      "market",
      "qualification",
      "risk",
      "oracle",
      "engine",
      "margin",
      "insurance",
      "lp",
      "adl",
    ].map((key) => call(`${key}Owner`, ADDRESSES[key as keyof typeof ADDRESSES], "owner")),
    ...[
      "market",
      "qualification",
      "risk",
      "oracle",
      "engine",
      "margin",
      "insurance",
      "lp",
      "adl",
    ].map((key) =>
      call(
        `${key}GovernanceExecutor`,
        ADDRESSES[key as keyof typeof ADDRESSES],
        "governanceExecutor",
      ),
    ),
    call("marketQualificationRegistry", ADDRESSES.market, "qualificationRegistry"),
    call("riskQualificationRegistry", ADDRESSES.risk, "qualificationRegistry"),
    call("engineMarketRegistry", ADDRESSES.engine, "marketRegistry"),
    call("engineRiskConfig", ADDRESSES.engine, "riskConfig"),
    call("engineOracleRouter", ADDRESSES.engine, "oracleRouter"),
    call("engineMarginVault", ADDRESSES.engine, "marginVault"),
    call("engineInsuranceFund", ADDRESSES.engine, "insuranceFund"),
    call("engineADLController", ADDRESSES.engine, "adlController"),
    call("marginEngine", ADDRESSES.margin, "engine"),
    call("marginCollateralToken", ADDRESSES.margin, "collateralToken"),
    call("insuranceCollateralToken", ADDRESSES.insurance, "collateralToken"),
    call("insuranceEngine", ADDRESSES.insurance, "engine"),
    call("lpAsset", ADDRESSES.lp, "asset"),
    call("lpActive", ADDRESSES.lp, "publicLpActive"),
    call("adlEngine", ADDRESSES.adl, "engine"),
    call("usdcDecimals", ADDRESSES.usdc, "decimals"),
    call("oracleDomainChain", ADDRESSES.oracle, "domainChainId"),
    call("oracleMinIndependentSources", ADDRESSES.oracle, "minimumIndependentSources"),
    call("oracleReporterThreshold", ADDRESSES.oracle, "reporterThreshold"),
    call("oracleReporterSetVersion", ADDRESSES.oracle, "reporterSetVersion"),
    call("oracleMaxStaleness", ADDRESSES.oracle, "maxStaleness"),
    call("oracleMinimumConfidence", ADDRESSES.oracle, "minimumConfidenceBps"),
    call("marginActualCustody", ADDRESSES.margin, "actualCustodyUsdc"),
    call("marginExpectedCustody", ADDRESSES.margin, "expectedCustodyUsdc"),
    call("marginWithdrawable", ADDRESSES.margin, "withdrawableLiquidity"),
    call("marginProtocolBadDebt", ADDRESSES.margin, "protocolBadDebt"),
    call("marginInsuranceCoveredBadDebt", ADDRESSES.margin, "insuranceCoveredBadDebt"),
    call("insuranceAvailableCapital", ADDRESSES.insurance, "availableCapital"),
    call("insuranceActualCustody", ADDRESSES.insurance, "actualCustodyUsdc"),
    call("insuranceBadDebtCovered", ADDRESSES.insurance, "badDebtCovered"),
    call("insuranceUncoveredBadDebt", ADDRESSES.insurance, "uncoveredBadDebt"),
    call("lpActualCustody", ADDRESSES.lp, "actualCustodyUsdc"),
    call("lpExpectedCustody", ADDRESSES.lp, "expectedCustodyUsdc"),
    call("timelockMinDelay", ADDRESSES.timelock, "minDelay"),
    call("usdcCode", ADDRESSES.usdc, "decimals"),
    call("marketExists", ADDRESSES.market, "marketExists", [marketId]),
    call("qualificationApproved", ADDRESSES.qualification, "isApproved", [marketId]),
    call("qualification", ADDRESSES.qualification, "getQualification", [marketId]),
    call("riskConfig", ADDRESSES.risk, "getConfig", [marketId]),
    call("riskAppliedProof", ADDRESSES.risk, "appliedQualificationProof", [marketId]),
    call("riskAppliedAt", ADDRESSES.risk, "appliedQualificationAt", [marketId]),
    call("oracleUsable", ADDRESSES.oracle, "isReportUsable", [marketId]),
    call("oraclePrice", ADDRESSES.oracle, "getUsablePrice", [marketId]),
    call("oracleReport", ADDRESSES.oracle, "getReport", [marketId]),
    call("openInterest", ADDRESSES.engine, "totalOpenInterest", [marketId]),
    call("engineSolvencyBlocked", ADDRESSES.engine, "solvencyBlocked"),
  ];
  const errors: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const pinnedBlockRef = usedHashPin ? { blockHash, requireCanonical: true } : blockTag;
  for (let offset = 0; offset < reads.length; offset += 8) {
    const batchCalls = reads.slice(offset, offset + 8);
    const pairIndex = Math.floor(offset / 8) % Math.ceil(sources.length / 2);
    const selectedSources = sourcePair(sources, pairIndex);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const batch = await consensusReadMany(
        selectedSources,
        pinnedBlockRef,
        batchCalls,
        rpcBatchMethod,
      );
      const fallbackCalls = batch
        .filter((read) => read.error)
        .map((read) => batchCalls.find((entry) => entry.key === read.key)!);
      let fallbackResults: Array<{
        key: string;
        value?: unknown;
        error?: string;
        sources: string[];
      }> = [];
      if (fallbackCalls.length > 0 && sources.length > 2) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        fallbackResults = await consensusReadMany(
          sourcePair(sources, pairIndex + 1),
          pinnedBlockRef,
          fallbackCalls,
          rpcBatchMethod,
        );
      }
      const finalResults = new Map(batch.map((read) => [read.key, read]));
      for (const read of fallbackResults) finalResults.set(read.key, read);
      for (const read of finalResults.values()) {
        checkSourcesByRead[read.key] = read.sources;
        if (read.error) errors[read.key] = read.error;
        else {
          values[read.key] = read.value;
          delete errors[read.key];
        }
      }
    } catch (error) {
      for (const entry of reads.slice(offset, offset + 8)) {
        errors[entry.key] = getRpcError(error);
        checkSourcesByRead[entry.key] = selectedSources.map((source) => source.name);
      }
    }
  }

  const codeEntries = Object.entries(ADDRESSES);
  for (let offset = 0; offset < codeEntries.length; offset += 8) {
    const entries = codeEntries.slice(offset, offset + 8);
    const selectedSources = sourcePair(sources, Math.floor(offset / 8));
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const codeResults = await Promise.all(
        selectedSources.map((source) =>
          rpcBatchMethod(
            source.url,
            entries.map(([, address]) => ({ method: "eth_getCode", params: [address, blockTag] })),
          ),
        ),
      );
      for (let index = 0; index < entries.length; index += 1) {
        const [key] = entries[index]!;
        const outcomes = codeResults.map((provider) => provider[index]);
        checkSourcesByRead[`${key}Code`] = selectedSources.map((source) => source.name);
        if (outcomes.some((item) => !item || item.error)) {
          checks[`${key}Code`] = makeUnknown(
            outcomes.find((item) => !item || item.error)?.error ?? "RPC_BATCH_RESULT_MISSING",
          );
          continue;
        }
        const code = String(outcomes[0]!.result);
        if (String(outcomes[1]!.result).toLowerCase() !== code.toLowerCase()) {
          checks[`${key}Code`] = makeUnknown("RPC_DISAGREEMENT");
        } else {
          checks[`${key}Code`] =
            code.length > 2
              ? makePass(`runtime bytes ${(code.length - 2) / 2}`)
              : makeFail("CONTRACT_CODE_MISSING");
        }
      }
    } catch (error) {
      for (const [key] of codeEntries.slice(offset, offset + 8)) {
        checks[`${key}Code`] = makeUnknown(getRpcError(error));
        checkSourcesByRead[`${key}Code`] = selectedSources.map((source) => source.name);
      }
    }
  }

  const readPass = (key: string, reason = "READ_FAILED_OR_RPC_DISAGREEMENT"): Check =>
    key in values ? makePass() : makeUnknown(errors[key] ?? reason);
  const boolCheck = (name: string, key: string, expected: boolean) => {
    const value = values[key];
    checks[name] =
      typeof value !== "boolean"
        ? readPass(key)
        : value === expected
          ? makePass(String(expected))
          : makeFail("ONCHAIN_STATE_MISMATCH", value);
  };
  const addressCheck = (name: string, key: string, expected: string) => {
    const value = values[key];
    checks[name] =
      typeof value !== "string"
        ? readPass(key)
        : addressMatches(value, expected)
          ? makePass(value)
          : makeFail("WRONG_CONTRACT_WIRING", value);
  };
  const intValue = (value: unknown): bigint | null =>
    typeof value === "bigint"
      ? value
      : typeof value === "number" && Number.isSafeInteger(value)
        ? BigInt(value)
        : null;

  for (const name of [
    "market",
    "qualification",
    "risk",
    "oracle",
    "engine",
    "margin",
    "insurance",
    "lp",
    "adl",
  ]) {
    boolCheck(`${name}BootstrapFinalized`, `${name}Bootstrap`, true);
    addressCheck(
      `${name}GovernanceExecutorIsTimelock`,
      `${name}GovernanceExecutor`,
      ADDRESSES.timelock,
    );
  }
  addressCheck(
    "marketQualificationRegistryWiring",
    "marketQualificationRegistry",
    ADDRESSES.qualification,
  );
  addressCheck(
    "riskQualificationRegistryWiring",
    "riskQualificationRegistry",
    ADDRESSES.qualification,
  );
  addressCheck("engineMarketRegistryWiring", "engineMarketRegistry", ADDRESSES.market);
  addressCheck("engineRiskConfigWiring", "engineRiskConfig", ADDRESSES.risk);
  addressCheck("engineOracleRouterWiring", "engineOracleRouter", ADDRESSES.oracle);
  addressCheck("engineMarginVaultWiring", "engineMarginVault", ADDRESSES.margin);
  addressCheck("engineInsuranceFundWiring", "engineInsuranceFund", ADDRESSES.insurance);
  addressCheck("engineADLControllerWiring", "engineADLController", ADDRESSES.adl);
  addressCheck("marginEngineWiring", "marginEngine", ADDRESSES.engine);
  addressCheck("marginUsesUSDC", "marginCollateralToken", ADDRESSES.usdc);
  addressCheck("insuranceEngineWiring", "insuranceEngine", ADDRESSES.engine);
  addressCheck("insuranceUsesUSDC", "insuranceCollateralToken", ADDRESSES.usdc);
  addressCheck("publicLPUsesUSDC", "lpAsset", ADDRESSES.usdc);
  addressCheck("adlEngineWiring", "adlEngine", ADDRESSES.engine);
  boolCheck("publicLPDepositsRemainDisabled", "lpActive", false);
  const decimals = intValue(values.usdcDecimals);
  checks.usdcUsesSixDecimals =
    decimals === null
      ? readPass("usdcDecimals")
      : decimals === 6n
        ? makePass("6")
        : makeFail("UNEXPECTED_USDC_DECIMALS", decimals);
  checks.usdcCode = checks.usdcCode ?? makeUnknown("USDC_CODE_NOT_CHECKED");
  checks.oracleDomainIsArc =
    intValue(values.oracleDomainChain) === 5042n
      ? makePass("5042")
      : values.oracleDomainChain === undefined
        ? readPass("oracleDomainChain")
        : makeFail("ORACLE_DOMAIN_CHAIN_MISMATCH", values.oracleDomainChain);
  checks.marginCustodyReconciled =
    values.marginActualCustody !== undefined && values.marginExpectedCustody !== undefined
      ? intValue(values.marginActualCustody) === intValue(values.marginExpectedCustody)
        ? makePass(`USDC base units=${evidenceText(values.marginActualCustody)}`)
        : makeFail(
            "CUSTODY_ACCOUNTING_DISCREPANCY",
            `${evidenceText(values.marginActualCustody)} / ${evidenceText(values.marginExpectedCustody)}`,
          )
      : makeUnknown(
          errors.marginActualCustody ?? errors.marginExpectedCustody ?? "CUSTODY_READ_FAILED",
        );
  const debt = intValue(values.marginProtocolBadDebt);
  const covered = intValue(values.marginInsuranceCoveredBadDebt);
  checks.noUncoveredBadDebt =
    debt === null || covered === null
      ? makeUnknown(
          errors.marginProtocolBadDebt ??
            errors.marginInsuranceCoveredBadDebt ??
            "BAD_DEBT_READ_FAILED",
        )
      : debt <= covered
        ? makePass(`uncovered base units=${(debt - covered).toString()}`)
        : makeFail("UNCOVERED_BAD_DEBT", (debt - covered).toString());
  const insuranceCash = intValue(values.insuranceActualCustody);
  const insuranceAvailable = intValue(values.insuranceAvailableCapital);
  checks.insuranceCustodyReconciled =
    insuranceCash === null || insuranceAvailable === null
      ? makeUnknown(
          errors.insuranceActualCustody ??
            errors.insuranceAvailableCapital ??
            "INSURANCE_CUSTODY_READ_FAILED",
        )
      : insuranceCash === insuranceAvailable
        ? makePass(`actual=${insuranceCash} base units; available=${insuranceAvailable} base units`)
        : makeFail(
            "INSURANCE_CUSTODY_ACCOUNTING_DISCREPANCY",
            `actual=${insuranceCash}; available=${insuranceAvailable}`,
          );
  const insuranceCovered = intValue(values.insuranceBadDebtCovered);
  const insuranceUncovered = intValue(values.insuranceUncoveredBadDebt);
  checks.insuranceBadDebtCountersReadable =
    insuranceCovered === null || insuranceUncovered === null
      ? makeUnknown(
          errors.insuranceBadDebtCovered ??
            errors.insuranceUncoveredBadDebt ??
            "INSURANCE_BAD_DEBT_COUNTERS_UNAVAILABLE",
        )
      : makePass(
          `covered=${insuranceCovered} base units; uncovered=${insuranceUncovered} base units`,
        );
  boolCheck("engineNotSolvencyBlocked", "engineSolvencyBlocked", false);
  checks.accessControlInventory = makeUnknown(
    "ROLE_MAPPING_IS_NOT_ENUMERABLE_AND_DEPLOYMENT_ROLE_ADDRESSES_ARE_UNRECORDED",
  );
  checks.lpToEngineEconomicIntegration = makeFail(
    "EXISTING_PUBLIC_LP_IS_NOT_CONNECTED_TO_ENGINE_MARGIN_SETTLEMENT",
  );

  const isRegistered = values.marketExists;
  boolCheck("marketRegistered", "marketExists", true);
  const qualification = recordValue(values.qualification);
  const risk = recordValue(values.riskConfig);
  const report = recordValue(values.oracleReport);
  const usablePrice = values.oraclePrice;

  if (isRegistered === true) {
    const marketRead =
      reads.find((item) => item.key === "marketRecord") ??
      call("marketRecord", ADDRESSES.market, "getMarket", [marketId]);
    try {
      const marketSources = sourcePair(sources, 0);
      const read = await consensusRead(
        marketSources,
        usedHashPin ? ({ blockHash, requireCanonical: true } as unknown as string) : blockTag,
        marketRead,
        rpcMethod,
        rpcBatchMethod,
      );
      checkSourcesByRead.marketRecord = marketSources.map((source) => source.name);
      const market = recordValue(read.value);
      const actualState = intValue(field(market, "state", 4));
      const identityMatches = canonicalOriginMatches(chain, canonicalToken, marketId, market ?? {});
      checks.canonicalMarketIdentity = identityMatches
        ? makePass("canonical bytes32 ID and stored origin tuple agree")
        : makeFail("CANONICAL_MARKET_ORIGIN_MISMATCH", JSON.stringify(market));
      checks.marketIsLive =
        actualState === 3n ? makePass("state=LIVE") : makeFail("MARKET_NOT_LIVE", actualState);
    } catch (error) {
      checks.canonicalMarketIdentity = makeUnknown(getRpcError(error));
      checks.marketIsLive = makeUnknown("MARKET_STATE_UNAVAILABLE");
    }

    boolCheck("qualificationCurrentlyApproved", "qualificationApproved", true);
    const proofHash = field(qualification, "proofHash", 0);
    const ruleVersion = field(qualification, "ruleVersion", 1);
    const qualifiedAt = intValue(field(qualification, "qualifiedAt", 2));
    const expiresAt = intValue(field(qualification, "expiresAt", 3));
    const maxLeverage = intValue(field(qualification, "maxLeverage", 4));
    const maxOi = intValue(field(qualification, "maxOI", 5));
    const maxPosition = intValue(field(qualification, "maxPosition", 6));
    const approved = field(qualification, "approved", 7);
    const qualificationKnown =
      proofHash !== undefined &&
      ruleVersion !== undefined &&
      qualifiedAt !== null &&
      expiresAt !== null &&
      maxLeverage !== null &&
      maxOi !== null &&
      maxPosition !== null &&
      approved !== undefined;
    checks.qualificationEvidence = !qualificationKnown
      ? makeUnknown(errors.qualification ?? "QUALIFICATION_READ_FAILED")
      : sameHex(proofHash, HASH_ZERO) ||
          sameHex(ruleVersion, HASH_ZERO) ||
          approved !== true ||
          qualifiedAt! <= 0n ||
          (expiresAt! !== 0n && BigInt(blockTimestamp) >= expiresAt!)
        ? makeFail("QUALIFICATION_PROOF_MISSING_REVOKED_OR_EXPIRED")
        : makePass(
            `rule=${evidenceText(ruleVersion)}, proof=${evidenceText(proofHash)}, expiresAt=${expiresAt}`,
          );
    const riskStatus = intValue(field(risk, "status", 5));
    const riskLeverage = intValue(field(risk, "maxLeverage", 0));
    const riskOi = intValue(field(risk, "maxOI", 1));
    const riskPosition = intValue(field(risk, "maxPosition", 2));
    const maintenanceMarginBps = intValue(field(risk, "maintenanceMarginBps", 3));
    const liquidationPenaltyBps = intValue(field(risk, "liquidationPenaltyBps", 4));
    const appliedProof = values.riskAppliedProof;
    const appliedAt = intValue(values.riskAppliedAt);
    const riskKnown =
      riskStatus !== null &&
      riskLeverage !== null &&
      riskOi !== null &&
      riskPosition !== null &&
      maintenanceMarginBps !== null &&
      liquidationPenaltyBps !== null &&
      appliedProof !== undefined &&
      appliedAt !== null;
    checks.riskMatchesQualification = !riskKnown
      ? makeUnknown(errors.riskConfig ?? "RISK_CONFIG_READ_FAILED")
      : riskStatus === 3n &&
          riskLeverage! > 0n &&
          riskLeverage! <= 5_000_000_000_000_000_000n &&
          riskOi! > 0n &&
          riskPosition! > 0n &&
          riskLeverage! <= (maxLeverage ?? -1n) &&
          riskOi! <= (maxOi ?? -1n) &&
          riskPosition! <= (maxPosition ?? -1n) &&
          riskPosition! <= riskOi! &&
          maintenanceMarginBps! > 0n &&
          maintenanceMarginBps! <= 10_000n &&
          liquidationPenaltyBps! <= 10_000n &&
          sameHex(appliedProof, proofHash) &&
          appliedAt === qualifiedAt
        ? makePass("live risk bounds do not exceed the approved proof")
        : makeFail("RISK_STATUS_PROOF_OR_LIMIT_MISMATCH");
    const currentOpenInterest = intValue(values.openInterest);
    checks.openInterestWithinRiskLimit =
      currentOpenInterest === null || riskOi === null
        ? makeUnknown(
            errors.openInterest ?? errors.riskConfig ?? "OPEN_INTEREST_OR_RISK_LIMIT_UNAVAILABLE",
          )
        : currentOpenInterest <= riskOi
          ? makePass(`openInterest=${currentOpenInterest}, maxOI=${riskOi}`)
          : makeFail(
              "OPEN_INTEREST_EXCEEDS_RISK_LIMIT",
              `openInterest=${currentOpenInterest}, maxOI=${riskOi}`,
            );
    boolCheck("oracleReportCurrentlyUsable", "oracleUsable", true);
    const reportMarket = field(report, "marketId", 0);
    const reportChain = intValue(field(report, "arcChainId", 1));
    const midPrice = intValue(field(report, "midPrice", 2));
    const minPrice = intValue(field(report, "minPrice", 3));
    const maxPrice = intValue(field(report, "maxPrice", 4));
    const confidence = intValue(field(report, "confidenceBps", 5));
    const sourceCount = intValue(field(report, "sourceCount", 6));
    const independentSources = intValue(field(report, "independentSourceCount", 7));
    const observedAt = intValue(field(report, "observedAt", 8));
    const validFrom = intValue(field(report, "validFrom", 9));
    const expires = intValue(field(report, "expiresAt", 10));
    const sequence = intValue(field(report, "sequence", 11));
    const evidenceRoot = field(report, "evidenceRoot", 12);
    const reportSetVersion = field(report, "reporterSetVersion", 13);
    const minSources = intValue(values.oracleMinIndependentSources);
    const maxStaleness = intValue(values.oracleMaxStaleness);
    const minimumConfidence = intValue(values.oracleMinimumConfidence);
    const policyKnown = minSources !== null && maxStaleness !== null && minimumConfidence !== null;
    const reportKnown =
      reportMarket !== undefined &&
      reportChain !== null &&
      midPrice !== null &&
      minPrice !== null &&
      maxPrice !== null &&
      confidence !== null &&
      sourceCount !== null &&
      independentSources !== null &&
      observedAt !== null &&
      validFrom !== null &&
      expires !== null &&
      sequence !== null;
    if (!reportKnown || !policyKnown) {
      checks.oracleReportEvidence = makeUnknown(
        errors.oracleReport ??
          errors.oracleMinIndependentSources ??
          errors.oracleMaxStaleness ??
          errors.oracleMinimumConfidence ??
          "ORACLE_REPORT_OR_POLICY_READ_FAILED",
      );
      checks.oracleUsableTuple = makeUnknown(errors.oraclePrice ?? "USABLE_PRICE_READ_FAILED");
    } else {
      const usableTuple = Array.isArray(usablePrice) ? usablePrice : [];
      const tuplePrice = intValue(usableTuple[0]);
      const tupleObserved = intValue(usableTuple[1]);
      const tupleConfidence = intValue(usableTuple[2]);
      checks.oracleUsableTuple =
        tuplePrice === midPrice && tupleObserved === observedAt && tupleConfidence === confidence
          ? makePass(
              `price=${tuplePrice}, observedAt=${tupleObserved}, confidenceBps=${tupleConfidence}`,
            )
          : makeFail("USABLE_PRICE_TUPLE_DOES_NOT_MATCH_REPORT", usableTuple.map(String).join(","));
      const currentBlockTime = BigInt(blockTimestamp);
      const valid =
        sameHex(reportMarket, marketId) &&
        reportChain === 5042n &&
        midPrice! > 0n &&
        minPrice! <= midPrice! &&
        midPrice! <= maxPrice! &&
        confidence! >= minimumConfidence! &&
        sourceCount! >= independentSources! &&
        independentSources! >= minSources! &&
        sequence! > 0n &&
        observedAt! <= currentBlockTime &&
        currentBlockTime - observedAt! <= maxStaleness! &&
        validFrom! <= currentBlockTime &&
        expires! >= currentBlockTime &&
        expires! <= currentBlockTime + maxStaleness! &&
        !sameHex(evidenceRoot, HASH_ZERO) &&
        !sameHex(reportSetVersion, HASH_ZERO);
      checks.oracleReportEvidence = valid
        ? makePass(
            `sequence=${sequence}, independentSources=${independentSources}, evidenceRoot=${String(evidenceRoot)}`,
          )
        : makeFail("ORACLE_REPORT_EVIDENCE_STALE_OR_INCOMPLETE");
    }
    checks.oracleReporterThresholdConfigured =
      intValue(values.oracleReporterThreshold) !== null &&
      intValue(values.oracleReporterThreshold)! > 0n
        ? makePass(String(values.oracleReporterThreshold))
        : values.oracleReporterThreshold === undefined
          ? readPass("oracleReporterThreshold")
          : makeFail("REPORTER_THRESHOLD_NOT_CONFIGURED", values.oracleReporterThreshold);
    const reportVersion = field(report, "reporterSetVersion", 13);
    const currentVersion = values.oracleReporterSetVersion;
    checks.oracleReporterSetCurrent =
      reportVersion === undefined || currentVersion === undefined
        ? makeUnknown(
            errors.oracleReport ??
              errors.oracleReporterSetVersion ??
              "REPORTER_SET_VERSION_UNAVAILABLE",
          )
        : sameHex(reportVersion, currentVersion)
          ? makePass(evidenceText(currentVersion))
          : makeFail(
              "REPORTER_SET_VERSION_MISMATCH",
              `${evidenceText(reportVersion)} / ${evidenceText(currentVersion)}`,
            );
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const retiredSources = sourcePair(sources, 0);
      const retired = await consensusRead(
        retiredSources,
        pinnedBlockRef,
        call("oracleReportRetired", ADDRESSES.oracle, "retiredReporterSetVersion", [reportVersion]),
        rpcMethod,
        rpcBatchMethod,
      );
      checkSourcesByRead.oracleReportRetired = retiredSources.map((source) => source.name);
      checks.oracleReporterSetNotRetired =
        retired.value === false
          ? makePass("reporter set version is active")
          : makeFail("ORACLE_REPORTER_SET_RETIRED", reportVersion);
    } catch (error) {
      checks.oracleReporterSetNotRetired = makeUnknown(getRpcError(error));
    }
  } else {
    const registrationReason =
      isRegistered === false
        ? "MARKET_NOT_REGISTERED"
        : (errors.marketExists ?? "MARKET_REGISTRATION_UNKNOWN");
    for (const name of [
      "canonicalMarketIdentity",
      "marketIsLive",
      "qualificationCurrentlyApproved",
      "qualificationEvidence",
      "riskMatchesQualification",
      "oracleReportCurrentlyUsable",
      "oracleReportEvidence",
      "oracleUsableTuple",
      "oracleReporterThresholdConfigured",
      "oracleReporterSetCurrent",
      "oracleReporterSetNotRetired",
      "openInterestWithinRiskLimit",
    ]) {
      checks[name] = makeUnknown(registrationReason);
    }
  }

  checks.openInterestReadable =
    values.openInterest === undefined
      ? readPass("openInterest")
      : makePass(`base units=${evidenceText(values.openInterest)}`);
  checks.marginWithdrawableReadable =
    values.marginWithdrawable === undefined
      ? readPass("marginWithdrawable")
      : makePass(`USDC base units=${evidenceText(values.marginWithdrawable)}`);
  checks.insuranceCapitalReadable =
    values.insuranceAvailableCapital === undefined
      ? readPass("insuranceAvailableCapital")
      : makePass(`USDC base units=${evidenceText(values.insuranceAvailableCapital)}`);
  checks.lpCustodyReconciled =
    values.lpActualCustody === undefined || values.lpExpectedCustody === undefined
      ? makeUnknown(errors.lpActualCustody ?? errors.lpExpectedCustody ?? "LP_CUSTODY_READ_FAILED")
      : intValue(values.lpActualCustody) === intValue(values.lpExpectedCustody)
        ? makePass(`USDC base units=${evidenceText(values.lpActualCustody)}`)
        : makeFail(
            "LP_CUSTODY_ACCOUNTING_DISCREPANCY",
            `${evidenceText(values.lpActualCustody)} / ${evidenceText(values.lpExpectedCustody)}`,
          );
  checks.timelockDelayReadable =
    values.timelockMinDelay === undefined
      ? readPass("timelockMinDelay")
      : makePass(`seconds=${evidenceText(values.timelockMinDelay)}`);
  checks.usdcCode = checks.usdcCode ?? makeUnknown(errors.usdcCode ?? "USDC_CODE_UNAVAILABLE");

  try {
    const finalBlocks = (await Promise.all(
      sources.map((source) => rpcMethod(source.url, "eth_getBlockByNumber", [blockTag, false])),
    )) as Array<{ hash?: unknown } | null>;
    if (finalBlocks.some((block) => !sameHex(block?.hash, blockHash)))
      checks.blockStillCanonical = makeFail("BLOCK_HASH_CHANGED_DURING_READ");
    else checks.blockStillCanonical = makePass(blockHash);
    checkSourcesByRead.blockStillCanonical = sources.map((source) => source.name);
  } catch (error) {
    checks.blockStillCanonical = makeUnknown(getRpcError(error));
    checkSourcesByRead.blockStillCanonical = sources.map((source) => source.name);
  }

  const checkReadKeys: Record<string, string[]> = {
    marketRegistered: ["marketExists"],
    marketQualificationRegistryWiring: ["marketQualificationRegistry"],
    riskQualificationRegistryWiring: ["riskQualificationRegistry"],
    engineMarketRegistryWiring: ["engineMarketRegistry"],
    engineRiskConfigWiring: ["engineRiskConfig"],
    engineOracleRouterWiring: ["engineOracleRouter"],
    engineMarginVaultWiring: ["engineMarginVault"],
    engineInsuranceFundWiring: ["engineInsuranceFund"],
    engineADLControllerWiring: ["engineADLController"],
    marginEngineWiring: ["marginEngine"],
    marginUsesUSDC: ["marginCollateralToken"],
    insuranceEngineWiring: ["insuranceEngine"],
    insuranceUsesUSDC: ["insuranceCollateralToken"],
    publicLPUsesUSDC: ["lpAsset"],
    adlEngineWiring: ["adlEngine"],
    accessControlInventory: [
      "marketOwner",
      "marketGovernanceExecutor",
      "qualificationOwner",
      "qualificationGovernanceExecutor",
      "riskOwner",
      "riskGovernanceExecutor",
      "oracleOwner",
      "oracleGovernanceExecutor",
      "engineOwner",
      "engineGovernanceExecutor",
      "marginOwner",
      "marginGovernanceExecutor",
      "insuranceOwner",
      "insuranceGovernanceExecutor",
      "lpOwner",
      "lpGovernanceExecutor",
      "adlOwner",
      "adlGovernanceExecutor",
    ],
    marketIsLive: ["marketRecord"],
    canonicalMarketIdentity: ["marketRecord"],
    qualificationCurrentlyApproved: ["qualificationApproved"],
    qualificationEvidence: ["qualification", "qualificationApproved"],
    riskMatchesQualification: ["riskConfig", "riskAppliedProof", "riskAppliedAt", "qualification"],
    oracleReportCurrentlyUsable: ["oracleUsable"],
    oracleReportEvidence: [
      "oracleReport",
      "oracleMinIndependentSources",
      "oracleMaxStaleness",
      "oracleMinimumConfidence",
    ],
    oracleUsableTuple: ["oraclePrice", "oracleReport"],
    oracleReporterThresholdConfigured: ["oracleReporterThreshold"],
    oracleReporterSetCurrent: ["oracleReporterSetVersion", "oracleReport"],
    oracleReporterSetNotRetired: ["oracleReportRetired"],
    engineNotSolvencyBlocked: ["engineSolvencyBlocked"],
    marginCustodyReconciled: ["marginActualCustody", "marginExpectedCustody"],
    noUncoveredBadDebt: ["marginProtocolBadDebt", "marginInsuranceCoveredBadDebt"],
    usdcUsesSixDecimals: ["usdcDecimals"],
    oracleDomainIsArc: ["oracleDomainChain"],
    publicLPDepositsRemainDisabled: ["lpActive"],
    openInterestReadable: ["openInterest"],
    marginWithdrawableReadable: ["marginWithdrawable"],
    insuranceCapitalReadable: ["insuranceAvailableCapital"],
    insuranceCustodyReconciled: ["insuranceActualCustody", "insuranceAvailableCapital"],
    insuranceBadDebtCountersReadable: ["insuranceBadDebtCovered", "insuranceUncoveredBadDebt"],
    openInterestWithinRiskLimit: ["openInterest", "riskConfig"],
    lpCustodyReconciled: ["lpActualCustody", "lpExpectedCustody"],
    timelockDelayReadable: ["timelockMinDelay"],
    rpcChain: ["rpcChain"],
    rpcBlockConsensus: ["rpcBlockConsensus"],
    blockStillCanonical: ["blockStillCanonical"],
  };
  for (const [name, check] of Object.entries(checks)) {
    const keys =
      checkReadKeys[name] ??
      (name.endsWith("BootstrapFinalized")
        ? [`${name.slice(0, -"BootstrapFinalized".length)}Bootstrap`]
        : name.endsWith("GovernanceExecutorIsTimelock")
          ? [name.slice(0, -"IsTimelock".length)]
          : [name]);
    check.sources = [...new Set(keys.flatMap((key) => checkSourcesByRead[key] ?? []))];
  }

  const allChecks = Object.values(checks);
  const contractGatePassed =
    allChecks.length > 0 && allChecks.every((check) => check.status === "PASS");
  const status = contractGatePassed
    ? "VERIFIED_ONCHAIN"
    : Object.values(checks).some((check) => check.status === "FAIL")
      ? "BLOCKED"
      : "UNKNOWN";
  const failed = Object.entries(checks)
    .filter(([, check]) => check.status === "FAIL")
    .map(([check, value]) => ({ check, reason: value.reason, evidence: value.evidence }));
  const unknown = Object.entries(checks)
    .filter(([, check]) => check.status === "UNKNOWN")
    .map(([check, value]) => ({ check, reason: value.reason }));
  const marketIsRegistered = checks.marketRegistered?.status === "PASS";
  return result(200, {
    status,
    releaseGate: "BLOCKED",
    verificationMethod: usedHashPin
      ? "DUAL_RPC_EIP1898_BLOCK_HASH"
      : "DUAL_RPC_BLOCK_NUMBER_WITH_HASH_RECHECK",
    sources: sources.map((source) => source.name),
    block: {
      number: blockNumber.toString(),
      hash: blockHash,
      timestamp: blockTimestamp.toString(),
    },
    freshness: {
      blockAgeSeconds: Math.max(0, Math.floor(Date.now() / 1000 - Number(blockTimestamp))),
    },
    contractGatePassed,
    allReleaseGatesPassed: false,
    checks,
    failed,
    unknown,
    readDiagnostics: errors,
    roleInventory: "UNKNOWN_MAPPING_NOT_ENUMERABLE",
    authorityAddresses: Object.fromEntries(
      [
        "market",
        "qualification",
        "risk",
        "oracle",
        "engine",
        "margin",
        "insurance",
        "lp",
        "adl",
      ].map((name) => [
        name,
        {
          owner: values[`${name}Owner`] ?? null,
          governanceExecutor: values[`${name}GovernanceExecutor`] ?? null,
        },
      ]),
    ),
    productionCapabilities: { discovery: "READ_ONLY", trading: false, lpDeposits: false },
    remainingReleaseGates: [
      "HISTORICAL_PERSISTENT_EVENT_INDEX_AND_CANONICAL_MARKET_RECONCILIATION",
      "INDEPENDENT_ORACLE_SOURCE_PROVENANCE_AND_SIGNER_ROLE_INVENTORY",
      "DEPLOYED_BYTECODE_AND_SOURCE_PARITY",
      "EXISTING_PUBLIC_LP_TO_TRADER_SETTLEMENT_ACCOUNTING_AND_INDEPENDENT_AUDIT",
      "KEEPER_AND_SIGNED_ORDER_END_TO_END_TESTNET_RECEIPTS",
      "HUMAN_GOVERNANCE_AND_FINANCIAL_RELEASE_APPROVAL",
    ],
    marketEvidence: marketIsRegistered
      ? "DIRECT_MARKET_REGISTRY_RECORD"
      : "NOT_FOUND_FOR_REQUESTED_CANONICAL_ID",
    note: "An on-chain read result is not trade authorization. No financial write path is enabled.",
  });
}

export const verificationContractAddresses = ADDRESSES;
