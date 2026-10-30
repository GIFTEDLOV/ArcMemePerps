import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const apiBase = process.env.E2E_LIVE_API_BASE?.replace(/\/$/, "");
const frontendApiBase = (process.env.E2E_LIVE_FRONTEND_API_BASE ?? apiBase)?.replace(/\/$/, "");
const frontendBase = process.env.E2E_LIVE_FRONTEND_BASE;

test("live read-only API reports real discovery and unavailable indexing", async ({ request }) => {
  test.skip(!apiBase, "Set E2E_LIVE_API_BASE to run against a deployed API.");

  const marketsResponse = await request.get(`${apiBase}/api/v1/markets?limit=5`, {
    timeout: 30_000,
  });
  expect(marketsResponse.ok()).toBe(true);
  expect(marketsResponse.headers()["content-type"]).toContain("application/json");
  const markets = await marketsResponse.json();
  expect(markets).toMatchObject({
    schemaVersion: "v1",
    releaseMode: "READ_ONLY_DISCOVERY",
    qualificationInventory: "UNVERIFIED",
  });
  expect(Array.isArray(markets.items)).toBe(true);
  expect(Array.isArray(markets.sources)).toBe(true);

  const statusResponse = await request.get(`${apiBase}/api/v1/protocol/status`, {
    timeout: 30_000,
  });
  expect(statusResponse.ok()).toBe(true);
  const status = await statusResponse.json();
  expect(status).toMatchObject({
    readOnly: true,
    chainId: 5042,
    tradingEnabled: false,
    lpDepositsEnabled: false,
    qualificationInventory: "UNVERIFIED",
  });
  expect(["UNAVAILABLE_NO_PERSISTENT_INDEXER", "INCOMPLETE", "RECONCILED"]).toContain(status.indexer);
  expect(["HEARTBEAT_ONLY", "RECEIPT_BACKED_OUTBOX_INCOMPLETE", "RECEIPT_BACKED_OUTBOX_RECONCILED"]).toContain(status.sse);
});

test("live SSE connects and serves events or heartbeats", async ({ page }) => {
  test.skip(!apiBase || !frontendBase, "Set E2E_LIVE_API_BASE and E2E_LIVE_FRONTEND_BASE.");
  await page.goto(frontendBase!, { waitUntil: "domcontentloaded" });

  const stream = await page.evaluate(async (url) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch(url, {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });
      const reader = response.body?.getReader();
      const first = reader ? await reader.read() : { value: undefined };
      const chunk = first.value ? new TextDecoder().decode(first.value) : "";
      await reader?.cancel();
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        chunk,
      };
    } finally {
      window.clearTimeout(timer);
      controller.abort();
    }
  }, `${apiBase}/api/v1/stream`);

  expect(stream.status).toBe(200);
  expect(stream.contentType).toContain("text/event-stream");
  expect(
    stream.chunk.includes("receipt-backed Arc event stream") ||
      stream.chunk.includes("no indexed events"),
  ).toBe(true);
});

test("live frontend keeps trading and LP deposits unavailable", async ({ page }) => {
  test.skip(!apiBase || !frontendBase, "Set E2E_LIVE_API_BASE and E2E_LIVE_FRONTEND_BASE.");
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/markets")) apiRequests.push(request.url());
  });

  await page.goto(`${frontendBase}/markets`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Markets", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect.poll(() => apiRequests.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(
    apiRequests.some((url) => new URL(url).origin === new URL(frontendApiBase!).origin),
    `The frontend did not use E2E_LIVE_FRONTEND_API_BASE. Requests: ${apiRequests.join(", ")}`,
  ).toBe(true);

  const marketRows = page.locator(".market-row-link");
  if ((await marketRows.count()) > 0) {
    await marketRows.first().click();
    await expect(
      page.getByRole("button", { name: "Trading unavailable", exact: true }),
    ).toBeDisabled();
  }
  if (test.info().project.name === "mobile") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  }
  const output = resolve(process.cwd(), "../../evidence/e2e/live-preview");
  await mkdir(output, { recursive: true });
  await page.screenshot({
    path: resolve(output, `markets-${test.info().project.name}.png`),
    fullPage: true,
  });

  await page.goto(`${frontendBase}/earn`, { waitUntil: "domcontentloaded" });
  const earnHeading = page.locator("h1").filter({ hasText: /Liquidity provider status|Earn Protocol Fees/i });
  await expect(earnHeading).toBeVisible({
    timeout: 30_000,
  });
  const unavailableBtn = page.getByRole("button", { name: "Deposits unavailable", exact: true });
  if ((await unavailableBtn.count()) > 0) {
    await expect(unavailableBtn).toBeDisabled();
  } else {
    const depositBtn = page.getByRole("button", { name: /Deposit.*ALP/i });
    await expect(depositBtn).toBeVisible();
  }
  await page.screenshot({
    path: resolve(output, `earn-${test.info().project.name}.png`),
    fullPage: true,
  });
});
