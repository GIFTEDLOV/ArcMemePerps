export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export type AlertType =
  | "TOKEN_QUARANTINED"
  | "KEEPER_AUTOCLOSE"
  | "SAFETY_FILTER_PASSED"
  | "EMERGENCY_DELIST";

export interface AlertPayload {
  readonly symbol: string;
  readonly name?: string | undefined;
  readonly chain?: string | undefined;
  readonly poolAddress?: string | undefined;
  readonly reason: string;
  readonly severity: AlertSeverity;
  readonly type: AlertType;
  readonly liquidityUsd?: number | undefined;
  readonly volume24hUsd?: number | undefined;
  readonly preservedUsdc?: string | undefined;
  readonly timestamp?: string | undefined;
  readonly url?: string | undefined;
}

export interface AlertConfig {
  readonly telegramBotToken?: string | undefined;
  readonly telegramChatId?: string | undefined;
  readonly discordWebhookUrl?: string | undefined;
  readonly dryRun?: boolean | undefined;
}

export interface AlertDispatchResult {
  readonly telegram: boolean;
  readonly discord: boolean;
  readonly logged: boolean;
  readonly errors: string[];
}

export function formatDiscordPayload(payload: AlertPayload): Record<string, unknown> {
  const color =
    payload.severity === "CRITICAL"
      ? 15158332 // Red
      : payload.severity === "WARNING"
      ? 15105570 // Orange
      : 3066993; // Green

  const titlePrefix =
    payload.severity === "CRITICAL"
      ? "🚨 [CRITICAL WATCHDOG DELIST]"
      : payload.severity === "WARNING"
      ? "⚠️ [ANTI-RUG QUARANTINE]"
      : "🛡️ [SAFETY FILTER VERIFIED]";

  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    { name: "Token", value: `$${payload.symbol}${payload.name ? ` (${payload.name})` : ""}`, inline: true },
    { name: "Chain", value: payload.chain || "Solana", inline: true },
    { name: "Event Type", value: payload.type, inline: true },
    { name: "Trigger Reason", value: payload.reason, inline: false },
  ];

  if (payload.liquidityUsd !== undefined) {
    fields.push({ name: "Liquidity", value: `$${payload.liquidityUsd.toLocaleString()}`, inline: true });
  }
  if (payload.volume24hUsd !== undefined) {
    fields.push({ name: "24h Volume", value: `$${payload.volume24hUsd.toLocaleString()}`, inline: true });
  }
  if (payload.preservedUsdc) {
    fields.push({ name: "Preserved Margin", value: payload.preservedUsdc, inline: true });
  }
  if (payload.poolAddress) {
    fields.push({ name: "Pool Address", value: `\`${payload.poolAddress}\``, inline: false });
  }

  return {
    username: "ArcMemePerps Watchdog",
    avatar_url: "https://arcmemeperps.vercel.app/favicon.ico",
    embeds: [
      {
        title: `${titlePrefix} $${payload.symbol}`,
        description:
          payload.type === "KEEPER_AUTOCLOSE"
            ? `Arc Safety Keeper auto-closed active trader positions to protect remaining USDC margin.`
            : payload.type === "TOKEN_QUARANTINED"
            ? `Token was immediately locked to CLOSE_ONLY. Open positions must close.`
            : `Token successfully satisfied 100% of strict anti-rug safety rules.`,
        color,
        fields,
        url: payload.url || "https://arcmemeperps.vercel.app",
        timestamp: payload.timestamp || new Date().toISOString(),
        footer: {
          text: "ArcMemePerps Fail-Closed Protocol • Settled in Arc USDC",
        },
      },
    ],
  };
}

export function formatTelegramMessage(payload: AlertPayload): string {
  const icon =
    payload.severity === "CRITICAL"
      ? "🚨"
      : payload.severity === "WARNING"
      ? "⚠️"
      : "🛡️";

  const lines = [
    `${icon} *ARCMEMEPERPS SECURITY ALERT*`,
    `*Token:* $${payload.symbol} ${payload.name ? `(${payload.name})` : ""}`,
    `*Action:* ${payload.type}`,
    `*Severity:* ${payload.severity}`,
    `*Reason:* ${payload.reason}`,
  ];

  if (payload.chain) {
    lines.push(`*Origin Chain:* ${payload.chain}`);
  }
  if (payload.liquidityUsd !== undefined) {
    lines.push(`*Liquidity:* $${payload.liquidityUsd.toLocaleString()}`);
  }
  if (payload.volume24hUsd !== undefined) {
    lines.push(`*24h Volume:* $${payload.volume24hUsd.toLocaleString()}`);
  }
  if (payload.preservedUsdc) {
    lines.push(`*Preserved Collateral:* ${payload.preservedUsdc}`);
  }
  if (payload.poolAddress) {
    lines.push(`*Pool:* \`${payload.poolAddress}\``);
  }

  lines.push(`\n🔗 [Inspect on ArcMemePerps](${payload.url || "https://arcmemeperps.vercel.app"})`);

  return lines.join("\n");
}

export async function sendDiscordAlert(
  webhookUrl: string,
  payload: AlertPayload,
  fetchFn: typeof fetch = fetch
): Promise<{ success: boolean; error?: string }> {
  try {
    const body = formatDiscordPayload(payload);
    const res = await fetchFn(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { success: false, error: `Discord HTTP ${res.status}: ${errText}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendTelegramAlert(
  botToken: string,
  chatId: string,
  payload: AlertPayload,
  fetchFn: typeof fetch = fetch
): Promise<{ success: boolean; error?: string }> {
  try {
    const text = formatTelegramMessage(payload);
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { success: false, error: `Telegram HTTP ${res.status}: ${errText}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function dispatchMultiChannelAlert(
  payload: AlertPayload,
  config?: AlertConfig,
  fetchFn: typeof fetch = fetch
): Promise<AlertDispatchResult> {
  const telegramBotToken = config?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = config?.telegramChatId || process.env.TELEGRAM_CHAT_ID;
  const discordWebhookUrl = config?.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL;
  const dryRun = config?.dryRun ?? false;

  let telegramSuccess = false;
  let discordSuccess = false;
  const errors: string[] = [];

  // Always log for local/keeper audit trail
  const logPrefix = `[KEEPER_ALERT][${payload.severity}][${payload.type}] $${payload.symbol}`;
  // eslint-disable-next-line no-console
  console.log(`${logPrefix} => ${payload.reason}`);

  if (dryRun) {
    return {
      telegram: true,
      discord: true,
      logged: true,
      errors: [],
    };
  }

  if (discordWebhookUrl) {
    const result = await sendDiscordAlert(discordWebhookUrl, payload, fetchFn);
    discordSuccess = result.success;
    if (!result.success && result.error) errors.push(result.error);
  }

  if (telegramBotToken && telegramChatId) {
    const result = await sendTelegramAlert(telegramBotToken, telegramChatId, payload, fetchFn);
    telegramSuccess = result.success;
    if (!result.success && result.error) errors.push(result.error);
  }

  return {
    telegram: telegramSuccess,
    discord: discordSuccess,
    logged: true,
    errors,
  };
}
