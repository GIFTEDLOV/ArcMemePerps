import type { SolanaNetworkConfig } from "@arcmemeperps/shared";
import { HttpJsonClient, HttpProviderError } from "./http.js";
import { evidenceRecord, providerErrorEvidence } from "./evidence.js";
import type { JsonValue, ProviderResult, SolanaMintEvidence } from "./types.js";

const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9SsAq1mD4";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
let nextRpcRequestAt = 0;

interface SolanaRpcResponse<T> {
  readonly jsonrpc: string;
  readonly id: number;
  readonly result?: T;
  readonly error?: { readonly code: number; readonly message: string };
}

interface TokenAccountInfo {
  readonly data?: {
    readonly parsed?: {
      readonly info?: { readonly owner?: string };
    };
  };
}

interface ProgramTokenAccount {
  readonly pubkey: string;
  readonly account: { readonly data: [string, string] };
}

type ProgramTokenAccountsResult =
  | { readonly context?: { readonly slot: number }; readonly value?: readonly ProgramTokenAccount[] }
  | readonly ProgramTokenAccount[];

export class SolanaRpcProvider {
  public readonly providerName = "canonical-solana-rpc";
  private readonly client: HttpJsonClient;

  public constructor(
    public readonly network: SolanaNetworkConfig,
    rpcUrl: string,
    client?: HttpJsonClient,
  ) {
    this.client = client ?? new HttpJsonClient();
    this.rpcUrl = rpcUrl;
  }

  private readonly rpcUrl: string;

  public async readMint(
    mintAddress: string,
    fetchedAt: string,
  ): Promise<ProviderResult<SolanaMintEvidence>> {
    try {
      const account = await this.call<{
        context: { slot: number };
        value: { owner: string; data: [string, string] } | null;
      }>("getAccountInfo", [mintAddress, { encoding: "base64", commitment: "confirmed" }]);
      let largest: { context: { slot: number }; value: { address: string; amount: string }[] } | null = null;
      let largestError: string | null = null;
      let largestDataVersion = "getTokenLargestAccounts";
      try {
        largest = await this.call<{ context: { slot: number }; value: { address: string; amount: string }[] }>(
          "getTokenLargestAccounts",
          [mintAddress, { commitment: "confirmed" }],
        );
      } catch (error) {
        largestError = error instanceof Error ? error.message : "getTokenLargestAccounts failed";
        try {
          const fallback = await this.call<ProgramTokenAccountsResult>("getProgramAccounts", [
            account.value?.owner ?? SPL_TOKEN_PROGRAM,
            {
              encoding: "base64",
              filters: [{ memcmp: { offset: 0, bytes: mintAddress } }],
              dataSlice: { offset: 64, length: 8 },
              withContext: true,
              commitment: "confirmed",
            },
          ]);
          const fallbackValue: readonly ProgramTokenAccount[] = isProgramTokenAccountList(fallback)
            ? fallback
            : fallback.value ?? [];
          largest = {
            context: isProgramTokenAccountList(fallback)
              ? account.context
              : fallback.context ?? account.context,
            value: fallbackValue
              .map((item) => ({ address: item.pubkey, amount: readBase64U64(item.account.data[0]) }))
              .sort((left, right) => (BigInt(right.amount) > BigInt(left.amount) ? 1 : -1))
              .slice(0, 20),
          };
          largestError = null;
          largestDataVersion = "getProgramAccounts:mint-filter:dataSlice-amount";
        } catch (fallbackError) {
          largestError = `${largestError};fallback=${fallbackError instanceof Error ? fallbackError.message : "getProgramAccounts failed"}`;
        }
      }
      const largestAddresses = largest?.value.map((item) => item.address) ?? [];
      let ownerByAccount = new Map<string, string>();
      if (largestAddresses.length > 0) {
        try {
          const accounts = await this.call<{
            context: { slot: number };
            value: (TokenAccountInfo | null)[];
          }>("getMultipleAccounts", [largestAddresses, { encoding: "jsonParsed", commitment: "confirmed" }]);
          ownerByAccount = new Map(
            accounts.value.flatMap((item, index) => {
              const owner = item?.data?.parsed?.info?.owner;
              return owner === undefined ? [] : [[largestAddresses[index]!.toLowerCase(), owner] as const];
            }),
          );
        } catch {
          // Owner resolution is enrichment. Preserve canonical mint/account evidence
          // when a node does not support parsed multiple-account reads.
        }
      }
      const value = parseMint(account, largest, ownerByAccount);
      const slot = BigInt(account.context.slot);
      const ownerProgram = account.value?.owner ?? "";
      return {
        status: "AVAILABLE",
        value: { ...value, slot },
        reason: null,
        error: null,
        evidence: [
          evidenceRecord({
            evidenceId: `${this.providerName}:mint-account`,
            kind: "solana-mint-account",
            provider: this.providerName,
            chain: "SOLANA",
            network: this.network.name,
            endpointClass: "RPC",
            dataVersion: "getAccountInfo",
            schemaVersion: "1",
            slot: slot.toString(),
            observedAt: fetchedAt,
            sourceTimestamp: fetchedAt,
            fetchedAt,
            freshness: "FRESH",
            confidence: 1,
            status: "AVAILABLE",
            value: {
              ownerProgram,
              accountExists: value.accountExists,
              tokenProgram: value.tokenProgram,
              supply: value.supply?.toString() ?? null,
              decimals: value.decimals,
              mintAuthority: value.mintAuthority,
              freezeAuthority: value.freezeAuthority,
            },
          }),
          evidenceRecord({
            evidenceId: `${this.providerName}:largest-token-accounts`,
            kind: "solana-largest-token-accounts",
            provider: this.providerName,
            chain: "SOLANA",
            network: this.network.name,
            endpointClass: "RPC",
            dataVersion: largestDataVersion,
            schemaVersion: "1",
            slot: slot.toString(),
            observedAt: fetchedAt,
            sourceTimestamp: fetchedAt,
            fetchedAt,
            freshness: "FRESH",
            confidence: 0.95,
            status: largestError === null ? "AVAILABLE" : "UNAVAILABLE",
            value: largestError === null ? value.largestAccounts.map((item) => ({
              address: item.address,
              amount: item.amount.toString(),
              owner: item.owner,
            })) : null,
            unavailableReason: largestError,
          }),
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Solana RPC read failed";
      return {
        status: "ERROR",
        value: null,
        reason: null,
        error: message,
        evidence: [
          providerErrorEvidence(
            { chain: "SOLANA", network: this.network.name, fetchedAt },
            this.providerName,
            "solana-read",
            message,
            "RPC",
          ),
        ],
      };
    }
  }

  private async call<T>(method: string, params: JsonValue[]): Promise<T> {
    const now = Date.now();
    const waitFor = Math.max(0, nextRpcRequestAt - now);
    if (waitFor > 0) await new Promise((resolve) => setTimeout(resolve, waitFor));
    nextRpcRequestAt = Date.now() + 500;
    const response = await this.client.post<JsonValue>(this.rpcUrl, {
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    });
    const parsed = response as unknown as SolanaRpcResponse<T>;
    if (parsed.error) throw new HttpProviderError(parsed.error.message, null, this.rpcUrl, false);
    if (parsed.result === undefined)
      throw new Error(`Solana RPC response missing result for ${method}`);
    return parsed.result;
  }
}

function parseMint(
  account: { context: { slot: number }; value: { owner: string; data: [string, string] } | null },
  largest: { context: { slot: number }; value: { address: string; amount: string }[] } | null,
  ownerByAccount: ReadonlyMap<string, string>,
): Omit<SolanaMintEvidence, "slot"> {
  const accountValue = account.value;
  if (accountValue === null) {
    return {
      ownerProgram: "",
      accountExists: false,
      tokenProgram: "UNKNOWN",
      supply: null,
      decimals: null,
      mintAuthority: null,
      freezeAuthority: null,
    largestAccounts: [],
    };
  }
  const tokenProgram =
    accountValue.owner === SPL_TOKEN_PROGRAM
      ? "SPL_TOKEN"
      : accountValue.owner === TOKEN_2022_PROGRAM
        ? "TOKEN_2022"
        : "UNKNOWN";
  const data = decodeBase64(accountValue.data[0]);
  if (data.length < 82)
    throw new Error("Solana mint account data is shorter than the SPL mint layout");
  const mintAuthorityOption = readU32(data, 0);
  const mintAuthority = mintAuthorityOption === 0 ? null : encodeBase58(data.slice(4, 36));
  const supply = readU64(data, 36);
  const decimals = data[44]!;
  const freezeAuthorityOption = readU32(data, 46);
  const freezeAuthority = freezeAuthorityOption === 0 ? null : encodeBase58(data.slice(50, 82));
  return {
    ownerProgram: accountValue.owner,
    accountExists: true,
    tokenProgram,
    supply,
    decimals,
    mintAuthority,
    freezeAuthority,
    largestAccounts: (largest?.value ?? []).map((item) => {
      if (typeof item.amount !== "string") throw new Error(`invalid token-account amount:${JSON.stringify(item)}`);
      return {
        address: item.address,
        amount: BigInt(item.amount),
        owner: ownerByAccount.get(item.address.toLowerCase()) ?? null,
      };
    }),
  };
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  );
}

function readU64(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let index = 7; index >= 0; index -= 1)
    value = (value << 8n) + BigInt(bytes[offset + index]!);
  return value;
}

function readBase64U64(value: string): string {
  const binary = decodeBase64(value);
  if (binary.length < 8) throw new Error("token-account amount slice is shorter than 8 bytes");
  return readU64(binary, 0).toString();
}

function isProgramTokenAccountList(value: ProgramTokenAccountsResult): value is readonly ProgramTokenAccount[] {
  return Array.isArray(value);
}

function encodeBase58(bytes: Uint8Array): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index]! * 256 + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  for (const byte of bytes)
    if (byte === 0) digits.push(0);
    else break;
  return digits
    .reverse()
    .map((digit) => alphabet[digit]!)
    .join("");
}
