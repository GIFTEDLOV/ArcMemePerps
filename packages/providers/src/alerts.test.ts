import { describe, it, expect, vi } from "vitest";
import {
  formatDiscordPayload,
  formatTelegramMessage,
  sendDiscordAlert,
  sendTelegramAlert,
  dispatchMultiChannelAlert,
  type AlertPayload,
} from "./alerts.js";

describe("Alert Dispatcher (Discord & Telegram)", () => {
  const sampleQuarantineAlert: AlertPayload = {
    symbol: "DOGEPERP",
    name: "Doge Perpetual Safe",
    chain: "Solana",
    poolAddress: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
    reason: "Drained Liquidity ($340.00 < $1,000 floor)",
    severity: "CRITICAL",
    type: "TOKEN_QUARANTINED",
    liquidityUsd: 340,
    volume24hUsd: 12000,
    preservedUsdc: "$250.00 USDC",
    url: "https://arcmemeperps.vercel.app/trade/solana-dogeperp",
  };

  it("formats Discord payload with red embed and metadata fields", () => {
    const payload = formatDiscordPayload(sampleQuarantineAlert);
    expect(payload.username).toBe("ArcMemePerps Watchdog");
    const embeds = payload.embeds as Array<Record<string, unknown>>;
    expect(embeds).toHaveLength(1);
    const firstEmbed = embeds[0]!;
    expect(firstEmbed.color).toBe(15158332);
    expect(firstEmbed.title).toContain("[CRITICAL WATCHDOG DELIST] $DOGEPERP");
    expect(firstEmbed.url).toBe("https://arcmemeperps.vercel.app/trade/solana-dogeperp");

    const fields = firstEmbed.fields as Array<{ name: string; value: string }>;
    expect(fields.some((f) => f.name === "Token" && f.value.includes("DOGEPERP"))).toBe(true);
    expect(fields.some((f) => f.name === "Trigger Reason" && f.value.includes("Drained Liquidity"))).toBe(true);
    expect(fields.some((f) => f.name === "Preserved Margin" && f.value === "$250.00 USDC")).toBe(true);
  });

  it("formats Telegram markdown message with markdown formatting and emojis", () => {
    const msg = formatTelegramMessage(sampleQuarantineAlert);
    expect(msg).toContain("🚨 *ARCMEMEPERPS SECURITY ALERT*");
    expect(msg).toContain("*Token:* $DOGEPERP (Doge Perpetual Safe)");
    expect(msg).toContain("*Action:* TOKEN_QUARANTINED");
    expect(msg).toContain("*Severity:* CRITICAL");
    expect(msg).toContain("*Reason:* Drained Liquidity ($340.00 < $1,000 floor)");
    expect(msg).toContain("*Preserved Collateral:* $250.00 USDC");
    expect(msg).toContain("[Inspect on ArcMemePerps]");
  });

  it("sends Discord webhook successfully on HTTP 200/204", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(""),
    } as unknown as Response);

    const res = await sendDiscordAlert("https://discord.com/api/webhooks/test", sampleQuarantineAlert, mockFetch);
    expect(res.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("handles Discord webhook failure gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Invalid Webhook Token"),
    } as unknown as Response);

    const res = await sendDiscordAlert("https://discord.com/api/webhooks/test", sampleQuarantineAlert, mockFetch);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Discord HTTP 400");
  });

  it("sends Telegram alert successfully on HTTP 200", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"ok":true}'),
    } as unknown as Response);

    const res = await sendTelegramAlert("bot12345", "-1001234567890", sampleQuarantineAlert, mockFetch);
    expect(res.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
    const callArgs = mockFetch.mock.calls[0]!;
    expect(callArgs[0]).toBe("https://api.telegram.org/botbot12345/sendMessage");
  });

  it("dispatches multi-channel alerts and honors dryRun", async () => {
    const res = await dispatchMultiChannelAlert(sampleQuarantineAlert, { dryRun: true });
    expect(res.logged).toBe(true);
    expect(res.telegram).toBe(true);
    expect(res.discord).toBe(true);
    expect(res.errors).toHaveLength(0);
  });
});
