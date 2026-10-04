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
  await page.getByRole("button", { name: /Review Long/i }).click();
  await expect(page.getByText("Immutable pretrade intent")).toBeVisible();
  await expect(page.getByText("Signature boundary")).toBeVisible();
});

test("proof keeps stress evidence separate from Product target", async ({ page }) => {
  await page.goto("/proof");
  await expect(page.getByRole("heading", { name: "Product Testnet", exact: true })).toBeVisible();
  await expect(page.getByText("STRESS / SECURITY")).toBeVisible();
  await expect(page.getByText("solvencyBlocked true")).toBeVisible();
});

test("mobile market detail remains navigable", async ({ page }) => {
  await page.goto("/markets");
  await expect(page.getByText("ARC-PRODUCT").first()).toBeVisible({ timeout: 20_000 });
  await page
    .getByRole("link", { name: /ARC-PRODUCT/i })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "ARC-PRODUCT", exact: true })).toBeVisible();
  await expect(page.locator("body")).toBeVisible();
});
