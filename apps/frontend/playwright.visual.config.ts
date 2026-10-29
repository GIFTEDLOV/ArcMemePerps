import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_VISUAL_BASE_URL;
if (!baseURL) {
  throw new Error("Set E2E_VISUAL_BASE_URL to the local frontend being captured.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "ui-regression.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true },
    },
  ],
});
