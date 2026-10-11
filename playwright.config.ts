import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

import {
  E2E_AUTH_SECRET,
  E2E_DATABASE_URL,
  E2E_MEDIA_DIR,
  E2E_PASSWORD,
  E2E_PORT,
  E2E_SESSION_FILE,
} from "./e2e/environment";

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
    // Logs in once through the real form; every other test starts signed in.
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"], channel } },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], channel, storageState: E2E_SESSION_FILE },
    },
    {
      name: "mobile",
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], channel, storageState: E2E_SESSION_FILE },
    },
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
      // A production build requires login (fail closed); the E2E server gets its own values.
      APP_PASSWORD: E2E_PASSWORD,
      AUTH_SECRET: E2E_AUTH_SECRET,
      // No test can incur provider charges, even if .env.local has a real key.
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "e2e-not-a-real-key",
      GEMINI_MODEL: "gemini-3.8-flash",
      OPENAI_API_KEY: "e2e-not-a-real-key",
      OPENAI_MODEL: "e2e-fake-model",
      NODE_OPTIONS: `--require "${resolve("e2e/ai-fetch-stub.cjs").replaceAll("\\", "/")}"`,
    },
  },
});
