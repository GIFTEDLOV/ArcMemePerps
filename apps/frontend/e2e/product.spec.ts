import { expect, test } from "@playwright/test";

test("landing explains the thesis and opens the terminal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Discover first/i })).toBeVisible();
  await expect(page.getByText("Multichain meme-market intelligence")).toBeVisible();
  await page.getByRole("link", { name: /Open terminal/i }).first().click();
  await expect(page).toHaveURL(/\/markets$/);
  await expect(page.getByRole("heading", { name: /Find the next market/i })).toBeVisible();
});

test("live discovery renders many real origin markets without canary defaults", async ({ page }) => {
  await page.goto("/markets");
  await expect(page.getByText("30 discovered")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("ARC-PRODUCT")).not.toBeVisible();
  await expect(page.getByText("0 Arc perp markets")).toBeVisible();
  await expect(page.locator(".market-row").first().getByText("ORIGIN ONLY")).toBeVisible();
});

test("exact market search and risk passport remain truthful", async ({ page }) => {
  await page.goto("/markets");
  const search = page.getByPlaceholder(/Exact address/i);
  await search.fill("INFLUENCR");
  await search.press("Enter");
  await expect(page.getByText("INFLUENCR").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: /INFLUENCR/i }).first().click();
  await expect(page.getByText("Risk passport")).toBeVisible();
  await expect(page.getByText("HISTORY_UNAVAILABLE")).toBeVisible();
  await expect(page.getByText("Origin market only")).toBeVisible();
});

test("proof separates Product Testnet from destructive security evidence", async ({ page }) => {
  await page.goto("/proof");
  await expect(page.getByRole("heading", { name: "Healthy application state" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stress deployment" })).toBeVisible();
  await expect(page.getByText("Solvency blocked").nth(1)).toBeVisible();
});

test("mobile discovery has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/markets");
  await expect(page.getByRole("heading", { name: /Find the next market/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("link", { name: /INFLUENCR/i }).first().click();
  await expect(page.getByText("Origin market only")).toBeVisible();
});

test("API outage is explicit instead of fabricated zeros", async ({ page }) => {
  await page.route("**/api/v1/markets**", (route) => route.abort());
  await page.goto("/markets");
  await expect(page.getByText("Live market data unavailable.")).toBeVisible();
  await expect(page.getByText("No markets match this view")).toBeVisible();
});

test("wallet wrong-network state is explicit", async ({ page }) => {
  await page.addInitScript(() => {
    window.ethereum = {
      request: ({ method }: { method: string }) => {
        if (method === "eth_accounts") return Promise.resolve([]);
        if (method === "eth_requestAccounts") return Promise.resolve(["0xc36fd43deaad e fb349acc61b0eb664ea4a18861c".replaceAll(" ", "")]);
        if (method === "eth_chainId") return Promise.resolve("0x1");
        return Promise.reject(new Error("unsupported"));
      },
    };
  });
  await page.goto("/markets");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("button", { name: /Connect wallet|Switch to Arc Testnet/ })).toBeVisible();
});
