import { defineConfig, devices } from "@playwright/test";

const frontendBase = process.env.E2E_LIVE_FRONTEND_BASE;
if (!frontendBase) {
  throw new Error("Set E2E_LIVE_FRONTEND_BASE to the deployed preview URL.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "live-readonly.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: frontendBase,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
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
