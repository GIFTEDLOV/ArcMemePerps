import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const SUPPORTED_CHAINS = ["ARC", "SOLANA", "ETHEREUM", "BASE", "BNB", "ROBINHOOD"] as const;

export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];
export type ChainId = SupportedChain;
export type Hex = `0x${string}`;

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

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
    throw new Error("invalid Solana token address");
  }
  return trimmed;
}

export function canonicalMarketKey(chain: SupportedChain, tokenAddress: string): string {
  const normalizedAddress = normalizeTokenAddress(chain, tokenAddress);
  return `arcmemeperps/market/v1|chain=${chain}|addressLength=${normalizedAddress.length}|address=${normalizedAddress}`;
}

/**
 * The Solidity registry stores the chain namespace as a left-aligned bytes32 label and the
 * normalized origin token as bytes. This helper uses the exact same packed preimage.
 */
export function marketIdForToken(chain: SupportedChain, tokenAddress: string): Hex {
  const normalizedAddress = normalizeTokenAddress(chain, tokenAddress);
  const domain = new TextEncoder().encode("ARCMEMEPERPS_MARKET_V1");
  const chainNamespace = new Uint8Array(32);
  chainNamespace.set(new TextEncoder().encode(chain));
  const token = new TextEncoder().encode(normalizedAddress);
  const packed = new Uint8Array(domain.length + chainNamespace.length + token.length);
  packed.set(domain, 0);
  packed.set(chainNamespace, domain.length);
  packed.set(token, domain.length + chainNamespace.length);
  return keccak256Hex(packed);
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
