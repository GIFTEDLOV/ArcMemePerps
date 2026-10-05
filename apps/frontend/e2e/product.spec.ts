import { expect, test } from "@playwright/test";

test("landing and terminal entry render live Product framing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Markets worth trading")).toBeVisible();
  await page
    .getByRole("link", { name: /Open terminal/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("COMMAND CENTER", { exact: true })).toBeVisible();
});

test("live Product market opens passport and immutable review surface", async ({ page }) => {
  await page.goto("/markets");
  await expect(page.getByText("ARC-PRODUCT").first()).toBeVisible({ timeout: 20_000 });
  await page
    .getByRole("link", { name: /ARC-PRODUCT/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/markets\//);
  await expect(page.getByText("RISK PASSPORT", { exact: true })).toBeVisible();
  await expect(page.getByText("Insufficient historical series")).toBeVisible();
  await expect(page.getByText("STALE", { exact: true }).first()).toBeVisible();
  const reviewButton = page.getByRole("button", { name: /Review Long/i });
  if (await reviewButton.isDisabled()) {
    await expect(page.getByText(/Risk-increasing review is disabled/)).toBeVisible();
  } else {
    await reviewButton.click();
    await expect(page.getByText(/Review invalidated|Immutable pretrade intent/)).toBeVisible();
  }
});

test("proof keeps stress evidence separate from Product target", async ({ page }) => {
  await page.goto("/proof");
  await expect(page.getByRole("heading", { name: "Product Testnet", exact: true })).toBeVisible();
  await expect(page.getByText("STRESS / SECURITY")).toBeVisible();
  await expect(page.getByText("solvencyBlocked true")).toBeVisible();
});

test("mobile market detail remains navigable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/markets");
  await expect(page.getByText("ARC-PRODUCT").first()).toBeVisible({ timeout: 20_000 });
  await page
    .getByRole("link", { name: /ARC-PRODUCT/i })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "ARC-PRODUCT", exact: true })).toBeVisible();
  await expect(page.locator("body")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("market search accepts the canonical market identity and detail tabs are live", async ({
  page,
}) => {
  await page.goto("/markets");
  const search = page.getByPlaceholder(/address or market ID/i);
  await search.fill("0xf8ffffb2f0f52e8bb2b71484007f5cf705f41f83369be65b4fba067293723387");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("ARC-PRODUCT").first()).toBeVisible();
  await page
    .getByRole("link", { name: /ARC-PRODUCT/i })
    .first()
    .click();
  await page.getByRole("tab", { name: "Holders" }).click();
  await expect(page.getByRole("heading", { name: "Ownership evidence" })).toBeVisible();
  await page.getByRole("tab", { name: "Deployer" }).click();
  await expect(page.getByRole("heading", { name: "Origin evidence" })).toBeVisible();
  await page.getByRole("tab", { name: "Proof" }).click();
  await expect(page.getByRole("heading", { name: "Evidence bound to eligibility" })).toBeVisible();
});

test("all primary routes expose a deliberate live surface", async ({ page }) => {
  const routes = [
    "/app",
    "/portfolio",
    "/activity",
    "/earn",
    "/profile/0xc36fd43deaadefb349acc61b0eb664ea4a18861c",
    "/competitions",
    "/notifications",
    "/attention",
    "/proof",
    "/system",
    "/settings",
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator(".page")).toBeVisible();
  }
});

test("API outage stays explicit instead of fabricating market rows", async ({ page }) => {
  await page.route("**/api/v1/markets", (route) => route.abort());
  await page.goto("/markets");
  await expect(page.getByText("Canonical data is unavailable")).toBeVisible();
  await expect(page.getByText("ARC-PRODUCT")).not.toBeVisible();
});

test("wallet wrong-network state is explicit", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("arcmemeperps.wallet");
    window.ethereum = {
      request: ({ method }: { method: string }) => {
        if (method === "eth_requestAccounts")
          return Promise.resolve(["0xc36fd43deaadefb349acc61b0eb664ea4a18861c"]);
        if (method === "eth_chainId") return Promise.resolve("0x1");
        return Promise.reject(new Error("unsupported"));
      },
    };
  });
  await page.goto("/app");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("button", { name: "Switch to Arc Testnet" })).toBeVisible();
});
