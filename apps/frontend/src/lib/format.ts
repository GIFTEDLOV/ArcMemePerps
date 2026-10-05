export function wad(value: string | number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === "") return "UNAVAILABLE";
  try {
    const raw = BigInt(value);
    const whole = raw / 1_000_000_000_000_000_000n;
    const fraction = (raw % 1_000_000_000_000_000_000n).toString().padStart(18, "0").slice(0, decimals);
    return `$${whole.toLocaleString()}${decimals ? `.${fraction}` : ""}`;
  } catch {
    return "UNAVAILABLE";
  }
}

export function usdc(value: string | number | bigint | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === "") return "UNAVAILABLE";
  try {
    const raw = BigInt(value);
    const whole = raw / 1_000_000n;
    const fraction = (raw % 1_000_000n).toString().padStart(6, "0").slice(0, decimals);
    return `$${whole.toLocaleString()}${decimals ? `.${fraction}` : ""}`;
  } catch {
    return "UNAVAILABLE";
  }
}

export function pctBps(value: number | null | undefined): string {
  return value === null || value === undefined ? "UNAVAILABLE" : `${(value / 100).toFixed(2)}%`;
}

export function shortAddress(value: string | null | undefined): string {
  if (!value) return "UNAVAILABLE";
  return value.length > 13 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

export function freshness(observedAt: string | undefined): string {
  if (!observedAt) return "UNAVAILABLE";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(observedAt)) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
}

export function effectiveFreshness(
  declared: string | null | undefined,
  observedAt: string | undefined,
  maxAgeSeconds = 120,
): string {
  if (!declared) return "UNAVAILABLE";
  if (!observedAt) return declared === "FRESH" ? "UNAVAILABLE" : declared;
  const timestamp = Date.parse(observedAt);
  if (!Number.isFinite(timestamp)) return "UNAVAILABLE";
  return Date.now() - timestamp <= maxAgeSeconds * 1000 ? declared : "STALE";
}
