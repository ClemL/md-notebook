import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3123);
const baseURL = `http://localhost:${PORT}`;

/**
 * CHROMIUM_PATH lets a sandbox with a pre-installed browser skip `playwright install`.
 * CI leaves it unset and uses the browser Playwright downloads.
 */
const executablePath = process.env.CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    permissions: ["clipboard-read", "clipboard-write"],
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: undefined, launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
