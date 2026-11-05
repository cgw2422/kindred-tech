import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a running app with the development seed data
 * (npm run db:seed). By default they reuse a server on :3000 or start `npm run dev`.
 */
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {} } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {} }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npm run dev", url: "http://localhost:3000/api/health", reuseExistingServer: true, timeout: 120_000 },
});
