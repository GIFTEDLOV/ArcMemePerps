export function shorten(value: string | null | undefined, left = 6, right = 4): string {
  if (!value) return "UNAVAILABLE";
  if (value.length <= left + right + 1) return value;
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

export function formatDecimal(value: string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === "") return "UNAVAILABLE";
  const negative = value.startsWith("-");
  const raw = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = raw.split(".");
  const trimmed = fraction.slice(0, decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${trimmed ? `.${trimmed}` : ""}`;
}

export function formatUsd(value: string | null | undefined, maxDecimals = 2): string {
  if (value === null || value === undefined) return "UNAVAILABLE";
  const normalized = value.startsWith("-") ? value.slice(1) : value;
  const fraction = normalized.split(".")[1] ?? "";
  const firstSignificant = fraction.search(/[1-9]/);
  const displayDecimals = normalized.startsWith("0.") && firstSignificant >= maxDecimals
    ? Math.min(Math.max(maxDecimals, firstSignificant + 4), 12)
    : maxDecimals;
  const number = formatDecimal(value, displayDecimals);
  return number === "UNAVAILABLE" ? number : `$${number}`;
}

export function formatWad(value: string | null | undefined, maxDecimals = 4): string {
  if (!value) return "UNAVAILABLE";
  const negative = value.startsWith("-");
  const raw = negative ? value.slice(1) : value;
  const padded = raw.padStart(19, "0");
  const split = padded.length - 18;
  const whole = padded.slice(0, split);
  const fraction = padded.slice(split).slice(0, maxDecimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function formatWadUsd(value: string | null | undefined, maxDecimals = 2): string {
  const formatted = formatWad(value, maxDecimals);
  return formatted === "UNAVAILABLE" ? formatted : `$${formatted}`;
}

export function formatPercentBps(value: number | null | undefined): string {
  if (value === null || value === undefined) return "UNAVAILABLE";
  return `${(value / 100).toFixed(2)}%`;
}

export function ageLabel(value: string | null | undefined): string {
  if (!value) return "UNAVAILABLE";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "UNAVAILABLE";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

export function statusClass(value: string | null | undefined): string {
  const normalized = (value ?? "").toUpperCase();
  if (["LIVE", "QUALIFIED", "ELIGIBLE", "FRESH", "AVAILABLE", "OPERATIONAL", "PASS"].includes(normalized)) return "status-good";
  if (["WATCH", "STALE", "PARTIAL", "BONDING", "UNKNOWN"].includes(normalized)) return "status-watch";
  if (["BLOCKED", "REJECTED", "PAUSED", "CLOSE_ONLY", "UNAVAILABLE", "CONFLICTED"].includes(normalized)) return "status-bad";
  return "status-muted";
}
