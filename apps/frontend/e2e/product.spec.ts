import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const tokenAddress = "0x1111111111111111111111111111111111111111";
const marketId = `arc:${tokenAddress}`;
const marketPage = {
  items: [{
    marketId,
    chain: "ARC",
    tokenAddress,
    symbol: "TEST",
    name: "Test Token",
    decimals: 18,
    imageUrl: null,
    sourceUrl: null,
    originPlatform: "E2E fixture",
    lifecycle: { status: "DISCOVERED", observedAt: null, confidenceBps: null, evidenceHash: null },
    priceUsd: "0.25",
    priceChange24hBps: null,
    volume24hUsd: null,
    transactions24h: null,
    originSpotLiquidityUsd: null,
    originDepth2PctUsd: null,
    holders: null,
    top10ConcentrationBps: null,
    largestClusterBps: null,
    integrity: { status: "UNKNOWN", reasonCodes: [], observations: [] },
    derivatives: { status: "NOT_REGISTERED", safeOiUsd: null, safePositionUsd: null, maxLeverage: null, oracleQuality: null, sourceIndependence: null, reasonCodes: [] },
    perp: { status: "NOT_REGISTERED", deploymentId: null, marketId: null, currentOiUsd: null, capacityUsd: null, qualificationHash: null, riskRuleVersion: null },
    providerState: { status: "AVAILABLE", fetchedAt: "2026-10-28T00:00:00.000Z", reason: "Fixture only; not live backend evidence." },
    freshness: { status: "UNAVAILABLE", observedAt: null, maxAgeSeconds: null },
    history: [],
    isQuarantined: false,
    quarantineReason: null,
  }],
  nextCursor: null,
  total: 1,
  discoveryCount: 1,
  currentlyObservedCount: 1,
  staleRetainedCount: 0,
  perpCount: 0,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/markets**", (route) => route.fulfill({ json: marketPage }));
  await page.route("**/api/v1/protocol/status", (route) => route.fulfill({ json: { health: {}, asOf: "2026-10-28T00:00:00.000Z" } }));
  await page.route("**/api/v1/stream", (route) => route.abort());
  await page.route("https://api.dexscreener.com/**", (route) => route.fulfill({ json: [] }));
});

async function saveScreenshot(page: Page, name: string) {
  const folder = resolve(process.cwd(), "../../evidence/e2e/screenshots");
  await mkdir(folder, { recursive: true });
  await page.screenshot({ path: resolve(folder, `${name}-${test.info().project.name}.png`), animations: "disabled", timeout: 10_000 });
}

test("landing states current availability without fabricated status metrics", async ({ page }) => {
  await page.goto("/landing");
  await expect(page.getByText("Trading Unavailable.", { exact: true })).toBeVisible();
  await expect(page.getByText(/qualification, trading, and liquidity deposits are unavailable/i)).toBeVisible();
  await expect(page.getByText("Trading Unavailable.", { exact: true })).toBeVisible();
  await saveScreenshot(page, "landing-availability");
});

test("market records preserve missing metrics and keep the order path disabled", async ({ page }) => {
  await page.goto("/markets");
  await expect(page.getByRole("heading", { name: "Markets", exact: true })).toBeVisible();
  await expect(page.locator(".market-row-link")).toHaveCount(1);
  await expect(page.getByText("Source flags: 0")).toBeVisible();

  await page.locator(".market-row-link").click();
  await expect(page.getByRole("heading", { name: "Trade TEST" })).toBeVisible();
  const tradeButton = page.getByRole("button", { name: "Trading unavailable", exact: true });
  await expect(tradeButton).toBeDisabled();
  await expect(page.getByText(/No qualified live Arc market or verified write\/receipt path/)).toBeVisible();
  await expect(page.getByText("Preview Size (not submitted)")).toBeVisible();
  await saveScreenshot(page, "trade-unavailable");
});

test("LP deposit controls cannot report a client-only successful deposit", async ({ page }) => {
  await page.goto("/earn");
  await expect(page.getByRole("heading", { name: "Liquidity provider status" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deposits unavailable", exact: true })).toBeDisabled();
  await expect(page.getByText(/Deposits are disabled until the live vault address/)).toBeVisible();
  await expect(page.getByText(/APY|annual yield/i)).toHaveCount(0);
  await saveScreenshot(page, "lp-deposits-unavailable");
});

test("legacy browser session data cannot create an authenticated wallet", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("arcmemeperps.active_email_session", JSON.stringify({ email: "unverified@example.invalid", address: "0x2222222222222222222222222222222222222222" }));
  });
  await page.goto("/portfolio");
  await expect(page.getByText("Connect to view your portfolio")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Wallet", exact: true })).toBeVisible();
});

test("the token importer rejects an address with no Arc contract bytecode", async ({ page }) => {
  await page.route("https://rpc.mainnet.arc.io/**", async (route) => {
    const request = route.request().postDataJSON() as { method?: string };
    const result = request.method === "eth_getCode" ? "0x" : "0x";
    await route.fulfill({ json: { jsonrpc: "2.0", id: 1, result } });
  });
  await page.goto("/markets");
  await page.getByRole("button", { name: "Import Arc Token" }).click();
  await page.getByPlaceholder("0x3600000000000000000000000000000000000000").fill(tokenAddress);
  await page.getByRole("button", { name: "Read Metadata & Add" }).click();
  await expect(page.getByText("No contract bytecode was returned for this address on Arc Mainnet.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Import Arc Meme Token" })).toBeVisible();
});

test("mobile market detail fits the viewport and shows unavailable execution", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/markets");
  await expect(page.getByRole("heading", { name: "Markets", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator(".market-row-link").click();
  await expect(page.getByRole("button", { name: "Trading unavailable", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await saveScreenshot(page, "mobile-trade-unavailable");
});

test("a connected wallet never receives a signing request from the disabled order path", async ({ page }) => {
  await page.addInitScript(() => {
    const address = "0x3333333333333333333333333333333333333333";
    (window as unknown as { __walletCalls: string[] }).__walletCalls = [];
    (window as unknown as { ethereum: unknown }).ethereum = {
      request: async ({ method }: { method: string }) => {
        (window as unknown as { __walletCalls: string[] }).__walletCalls.push(method);
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [address];
        if (method === "eth_chainId") return "0x13b2";
        return null;
      },
      on: () => undefined,
      removeListener: () => undefined,
    };
  });

  await page.goto("/markets");
  await page.locator(".market-row-link").click();
  await expect(page.getByRole("button", { name: "Trading unavailable", exact: true })).toBeDisabled();
  const walletCalls = await page.evaluate(() => (window as unknown as { __walletCalls: string[] }).__walletCalls);
  expect(walletCalls.some((method) => method.startsWith("eth_send") || method.startsWith("personal_sign"))).toBe(false);
});
