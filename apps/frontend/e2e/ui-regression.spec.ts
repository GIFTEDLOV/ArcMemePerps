import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const target = process.env.E2E_VISUAL_BASE_URL;
const label = process.env.E2E_VISUAL_LABEL;
const marketAddress = "0x1111111111111111111111111111111111111111";
const marketId = `arc:${marketAddress}`;
const now = new Date().toISOString();
const visualMarket = {
  marketId,
  chain: "ARC",
  tokenAddress: marketAddress,
  symbol: "TEST",
  name: "Test Token",
  decimals: 18,
  imageUrl: null,
  sourceUrl: null,
  originPlatform: "visual regression fixture",
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
  derivatives: {
    status: "NOT_REGISTERED",
    safeOiUsd: null,
    safePositionUsd: null,
    maxLeverage: null,
    oracleQuality: null,
    sourceIndependence: null,
    reasonCodes: [],
  },
  perp: {
    status: "NOT_REGISTERED",
    deploymentId: null,
    marketId: null,
    currentOiUsd: null,
    capacityUsd: null,
    qualificationHash: null,
    riskRuleVersion: null,
  },
  providerState: {
    status: "AVAILABLE",
    fetchedAt: now,
    reason: "Fixture used only for screenshot comparison.",
  },
  freshness: { status: "UNAVAILABLE", observedAt: null, maxAgeSeconds: null },
  history: [],
  isQuarantined: false,
  quarantineReason: null,
};

test("capture the same key screens at desktop and mobile viewports", async ({ page }) => {
  test.skip(
    !target || !label,
    "Set E2E_VISUAL_BASE_URL and E2E_VISUAL_LABEL for the UI comparison.",
  );
  await page.route("**/api/v1/markets**", (route) =>
    route.fulfill({
      json: {
        items: [visualMarket],
        nextCursor: null,
        total: 1,
        discoveryCount: 1,
        currentlyObservedCount: 1,
        staleRetainedCount: 0,
        perpCount: 0,
        sources: [],
        qualificationInventory: "UNVERIFIED",
      },
    }),
  );
  await page.route("**/api/v1/protocol/status", (route) =>
    route.fulfill({
      json: {
        service: "visual-regression-fixture",
        readOnly: true,
        tradingEnabled: false,
        lpDepositsEnabled: false,
        health: { API: "OPERATIONAL", MARKET_DISCOVERY: "UNAVAILABLE", INDEXER: "UNAVAILABLE" },
        asOf: now,
      },
    }),
  );
  await page.route("**/api/v1/stream", (route) => route.abort());
  await page.route("https://api.dexscreener.com/**", (route) => route.fulfill({ json: [] }));
  await page.route(
    (url) => new URL(url).pathname.startsWith("/api/v1/markets/"),
    (route) => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({
        json: path.endsWith("/pretrade") ? { status: "UNAVAILABLE" } : { market: visualMarket },
      });
    },
  );

  const directory = resolve(process.cwd(), `../../evidence/ui-regression/${label}`);
  await mkdir(directory, { recursive: true });
  for (const [name, path] of [
    ["landing", "/landing"],
    ["markets", "/markets"],
    ["portfolio", "/portfolio"],
    ["earn", "/earn"],
  ] as const) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.screenshot({
      path: resolve(directory, `${name}-${test.info().project.name}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.goto(`/markets/${encodeURIComponent(marketId)}`, { waitUntil: "domcontentloaded" });
  await page.screenshot({
    path: resolve(directory, `market-detail-${test.info().project.name}.png`),
    fullPage: true,
    animations: "disabled",
  });
});
