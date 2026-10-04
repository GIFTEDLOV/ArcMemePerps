const MAX_NAME_LENGTH = 128;
const MAX_SYMBOL_LENGTH = 32;

export interface UntrustedTokenMetadata {
  readonly name?: unknown;
  readonly symbol?: unknown;
  readonly image?: unknown;
  readonly website?: unknown;
  readonly social?: unknown;
}

export interface NormalizedTokenMetadata {
  readonly name: string | null;
  readonly symbol: string | null;
  readonly image: string | null;
  readonly website: string | null;
  readonly social: string | null;
}

/** Normalize provider-controlled token metadata before it reaches an API response. */
export function normalizeTokenMetadata(input: UntrustedTokenMetadata): NormalizedTokenMetadata {
  return {
    name: safeText(input.name, MAX_NAME_LENGTH),
    symbol: safeText(input.symbol, MAX_SYMBOL_LENGTH),
    image: safeUrl(input.image),
    website: safeUrl(input.website),
    social: safeUrl(input.social),
  };
}

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = [...value.normalize("NFKC")]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f;
    })
    .join("")
    .trim();
  return normalized.length === 0 ? null : normalized.slice(0, maxLength);
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
