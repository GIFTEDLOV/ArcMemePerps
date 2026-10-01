import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const SUPPORTED_CHAINS = ["ARC", "SOLANA", "ETHEREUM", "BASE", "BNB", "ROBINHOOD"] as const;

export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];
export type ChainId = SupportedChain;
export type Hex = `0x${string}`;

export const SUPPORTED_EVM_CHAIN_IDS: Readonly<Partial<Record<SupportedChain, number>>> = {
  ARC: 5042,
  ETHEREUM: 1,
  BASE: 8453,
  BNB: 56,
  ROBINHOOD: 4663,
};

const EVM_CHAINS: ReadonlySet<SupportedChain> = new Set([
  "ARC",
  "ETHEREUM",
  "BASE",
  "BNB",
  "ROBINHOOD",
]);

export const isSupportedChain = (value: string): value is SupportedChain =>
  (SUPPORTED_CHAINS as readonly string[]).includes(value);

export function normalizeTokenAddress(chain: SupportedChain, tokenAddress: string): string {
  const trimmed = tokenAddress.trim();
  if (trimmed.length === 0) {
    throw new Error("token address must not be empty");
  }

  if (EVM_CHAINS.has(chain)) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      throw new Error(`invalid EVM token address for ${chain}`);
    }
    return trimmed.toLowerCase();
  }

  decodeBase58PublicKey(trimmed);
  return trimmed;
}

export function canonicalMarketKey(chain: SupportedChain, tokenAddress: string): string {
  const normalizedAddress = normalizeTokenAddress(chain, tokenAddress);
  return `arcmemeperps/market/v1|chain=${chain}|addressLength=${normalizedAddress.length}|address=${normalizedAddress}`;
}

export function marketIdForToken(chain: SupportedChain, tokenAddress: string): Hex {
  const normalizedAddress = normalizeTokenAddress(chain, tokenAddress);
  const chainId = SUPPORTED_EVM_CHAIN_IDS[chain];
  if (chainId !== undefined) {
    return marketIdForEvmToken(chainId, normalizedAddress);
  }
  return marketIdForSolanaToken(normalizedAddress);
}

export function marketIdForEvmToken(chainId: number, tokenAddress: string): Hex {
  const normalizedAddress = normalizeEvmAddress(tokenAddress);
  const tokenBytes = hexToBytes(normalizedAddress);
  const addressWord = new Uint8Array(32);
  addressWord.set(tokenBytes, 12);
  return keccak256Hex(
    concatBytes(
      keccak_256(new TextEncoder().encode("ARCMEMEPERPS_MARKET_ID_V2")),
      keccak_256(new TextEncoder().encode("EVM")),
      uint256Word(BigInt(chainId)),
      addressWord,
    ),
  );
}

export function marketIdForSolanaToken(publicKey: string): Hex {
  return keccak256Hex(
    concatBytes(
      keccak_256(new TextEncoder().encode("ARCMEMEPERPS_MARKET_ID_V2")),
      keccak_256(new TextEncoder().encode("SOLANA")),
      decodeBase58PublicKey(publicKey),
    ),
  );
}

export function tokenIdentityHash(chain: SupportedChain, tokenAddress: string): Hex {
  const normalizedAddress = normalizeTokenAddress(chain, tokenAddress);
  const chainId = SUPPORTED_EVM_CHAIN_IDS[chain];
  if (chainId !== undefined) {
    const addressWord = new Uint8Array(32);
    addressWord.set(hexToBytes(normalizedAddress), 12);
    return keccak256Hex(
      concatBytes(
        keccak_256(new TextEncoder().encode("ARCMEMEPERPS_TOKEN_ID_V1")),
        keccak_256(new TextEncoder().encode("EVM")),
        uint256Word(BigInt(chainId)),
        addressWord,
      ),
    );
  }
  return keccak256Hex(
    concatBytes(
      keccak_256(new TextEncoder().encode("ARCMEMEPERPS_TOKEN_ID_V1")),
      keccak_256(new TextEncoder().encode("SOLANA")),
      decodeBase58PublicKey(normalizedAddress),
    ),
  );
}

export function qualificationHashBytes(input: Uint8Array | string): Uint8Array {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return keccak_256(bytes);
}

export function keccak256Hex(input: Uint8Array | string): Hex {
  return `0x${bytesToHex(qualificationHashBytes(input))}`;
}

export function canonicalJson(value: CanonicalValue): string {
  return JSON.stringify(sortCanonicalValue(value));
}

export type CanonicalValue =
  null | boolean | number | string | CanonicalValue[] | { readonly [key: string]: CanonicalValue };

function sortCanonicalValue(value: CanonicalValue): CanonicalValue {
  if (Array.isArray(value)) {
    return value.map(sortCanonicalValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, sortCanonicalValue(child)]),
    );
  }
  return value;
}

function normalizeEvmAddress(tokenAddress: string): string {
  const trimmed = tokenAddress.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error("invalid EVM token address");
  }
  return trimmed.toLowerCase();
}

function hexToBytes(value: string): Uint8Array {
  const output = new Uint8Array((value.length - 2) / 2);
  for (let index = 2; index < value.length; index += 2) {
    output[(index - 2) / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return output;
}

function uint256Word(value: bigint): Uint8Array {
  if (value < 0n || value > (1n << 256n) - 1n) {
    throw new Error("uint256 out of range");
  }
  const output = new Uint8Array(32);
  let remaining = value;
  for (let index = 31; index >= 0; index -= 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function decodeBase58PublicKey(value: string): Uint8Array {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
    throw new Error("invalid Solana public key encoding");
  }
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes: number[] = [0];
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("invalid Solana public key character");
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      const next = bytes[index]! * 58 + carry;
      bytes[index] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const character of value) {
    if (character !== "1") break;
    bytes.push(0);
  }
  const decoded = Uint8Array.from(bytes.reverse());
  if (decoded.length !== 32) throw new Error("Solana public key must decode to 32 bytes");
  return decoded;
}

export { NETWORK_CONFIGS, rpcUrlForNetwork, rpcUrlsForNetwork } from "./networks.js";
export type { EvmNetworkConfig, SolanaNetworkConfig, SupportedNetworkConfig } from "./networks.js";
export * from "./math.js";
export * from "./arc-usdc.js";
export * from "./health.js";
