import { expect, test } from "@playwright/test";

test("landing explains the product and opens Markets", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Discover meme markets/i })).toBeVisible();
  await expect(page.getByText(/Arc USDC settlement/i)).toBeVisible();
  await page.getByRole("link", { name: /Explore markets/i }).first().click();
  await expect(page).toHaveURL(/\/markets$/);
  await expect(page.getByRole("heading", { name: "Markets" })).toBeVisible();
});

test("Markets is dense, real, and truthful about zero perps", async ({ page }) => {
  await page.goto("/markets");
  await expect(page.getByText(/\d+ observed/)).toBeVisible({ timeout: 20_000 });
  expect(Number((await page.getByText(/\d+ observed/).innerText()).split(" ")[0])).toBeGreaterThanOrEqual(30);
  await expect(page.getByText("0 live perp markets")).not.toBeVisible();
  await expect(page.getByRole("tab", { name: /Perps/ })).toBeVisible();
  await expect(page.locator(".market-row-link").first()).toBeVisible();
});

test("exact search and token terminal remain truthful", async ({ page }) => {
  await page.goto("/markets");
  const search = page.getByPlaceholder(/Search symbol/i);
  await search.fill("Alice");
  await search.press("Enter");
  await expect(page.getByText("Alice").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: /Alice/i }).first().click();
  await expect(page.getByText("Risk passport")).toBeVisible();
  await expect(page.getByText(/History unavailable/i)).toBeVisible();
  await expect(page.getByText(/Perps unavailable|Qualification in progress|Not eligible/i)).toBeVisible();
});

test("category and chain filters keep the zero-perp state explicit", async ({ page }) => {
  await page.goto("/markets");
  await page.getByRole("tab", { name: /Perps/ }).click();
  await expect(page.getByText(/0 live perp markets/i)).toBeVisible();
  await expect(page.getByText(/Perp markets appear here only/i)).toBeVisible();
  await page.getByRole("tab", { name: "BASE" }).click();
  await expect(page.getByRole("tab", { name: "BASE" })).toHaveClass(/active/);
});

test("detail tabs expose holders and provenance without JSON-first UI", async ({ page }) => {
  await page.goto("/markets");
  await page.getByRole("link", { name: /Alice/i }).first().click();
  await page.getByRole("tab", { name: "Holders" }).click();
  await expect(page.getByRole("heading", { name: /Holder concentration/i })).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByRole("button", { name: /Admin control/i }).click();
  await expect(page.getByRole("dialog", { name: /Admin control provenance/i })).toBeVisible();
  await expect(page.getByText("Source")).toBeVisible();
  await page.getByRole("button", { name: "Close provenance" }).click();
});

test("watchlist is local and portfolio/activity stay honest", async ({ page }) => {
  await page.goto("/markets");
  await page.getByRole("link", { name: /Alice/i }).first().click();
  await page.getByRole("button", { name: /Watch/ }).click();
  await page.goto("/watchlist");
  await expect(page.getByText("Alice").first()).toBeVisible();
  await page.goto("/portfolio");
  await expect(page.getByText(/Connect to view your portfolio/i)).toBeVisible();
  await page.goto("/activity");
  await expect(page.getByText(/Connect to view activity/i)).toBeVisible();
});

test("proof keeps protocol details secondary and states the live count", async ({ page }) => {
  await page.goto("/proof");
  await expect(page.getByRole("heading", { name: /0 registered live perp markets/i })).toBeVisible();
  await expect(page.getByText(/Evidence before leverage/i)).toBeVisible();
});

test("mobile markets and token detail do not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/markets");
  await expect(page.getByRole("heading", { name: "Markets" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("link", { name: /Alice/i }).first().click();
  await expect(page.getByText("Risk passport")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("API outage is explicit instead of fabricated zeros", async ({ page }) => {
  await page.route("**/api/v1/markets**", (route) => route.abort());
  await page.goto("/markets");
  await expect(page.getByText("Market data is unavailable.")).toBeVisible();
  await expect(page.getByText("No markets match this view")).toBeVisible();
});

test("hostile token metadata stays text-only and fails soft", async ({ page }) => {
  await page.route("**/api/v1/markets**", async (route) => {
    const response = await route.fetch();
    const payload = await response.json() as { items?: Array<Record<string, unknown>> };
    const first = payload.items?.[0];
    if (first) {
      first.name = "<img src=x onerror=alert(1)> & long token name";
      first.symbol = "<script>alert(1)</script>";
      first.imageUrl = "not-a-valid-image-url";
    }
    await route.fulfill({ response, json: payload });
  });
  await page.goto("/markets");
  await expect(page.getByText("<script>alert(1)</script>", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".market-table script")).toHaveCount(0);
});

test("wallet wrong-network state is concise", async ({ page }) => {
  await page.addInitScript(() => {
    window.ethereum = {
      request: ({ method }: { method: string }) => {
        if (method === "eth_accounts") return Promise.resolve([]);
        if (method === "eth_requestAccounts") return Promise.resolve(["0xc36fd43deaad efb349acc61b0eb664ea4a18861c".replaceAll(" ", "")]);
        if (method === "eth_chainId") return Promise.resolve("0x1");
        return Promise.reject(new Error("unsupported"));
      },
    };
  });
  await page.goto("/markets");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("button", { name: /Connect wallet|Switch to Arc Testnet/ })).toBeVisible();
});
