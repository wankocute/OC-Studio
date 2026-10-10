import { defineConfig, devices } from "@playwright/test";

import { E2E_DATABASE_URL, E2E_MEDIA_DIR, E2E_PORT } from "./e2e/environment";

const baseURL = `http://localhost:${E2E_PORT}`;
// Optional: run against an installed browser instead of the bundled Chromium, e.g. "chrome" or "msedge".
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel } },
  ],
  webServer: {
    // A production build: no on-demand compilation or hot reloads to slow down or disturb tests.
    command: `pnpm build && pnpm start --port ${E2E_PORT}`,
    url: baseURL,
    // Always start our own server: an already running dev server would use the real database.
    reuseExistingServer: false,
    timeout: 600_000,
    // Process env wins over .env.local, so the app talks only to the E2E database and folder.
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      MEDIA_STORAGE_DIR: E2E_MEDIA_DIR,
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
