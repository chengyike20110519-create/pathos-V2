import { defineConfig, devices } from "@playwright/test";

const PORT = 3212;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/e2e", open: "never" }],
  ],
  outputDir: "test-results/e2e",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node tests/e2e-server.mjs",
    url: `${baseURL}/api/pathos/preview?endpoint=manifest`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      PATHOS_DATA_MODE: "fixture",
      E2E_PORT: String(PORT),
      PATHOS_PREVIEW_BUNDLE_DIR: "./data/preview",
      DATABASE_URL: "postgresql://pathos_e2e:pathos_e2e@127.0.0.1:1/pathos_e2e",
    },
  },
});
