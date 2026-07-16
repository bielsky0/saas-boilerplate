import { defineConfig, devices } from "@playwright/test";

import { E2E_BILLING_ENV } from "./e2e/billing-fixtures";

/**
 * Playwright E2E config (spec 14.1). Auth is critical, so these run on every PR
 * and block merge. The app boots with EMAIL_PROVIDER=log so tests read the
 * verification link from the in-memory outbox via /api/dev/emails — no SMTP.
 *
 * The DB must be migrated before the web server starts (CI runs `pnpm db:migrate`;
 * locally run it once). We build + start a production server so there is no
 * first-request cold-compile in the middle of a test.
 */
const PORT = 3000;
const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: "test",
      EMAIL_PROVIDER: "log",
      // Selects the Stripe adapter and shares the signing secret with the tests
      // that sign fixtures. Verification is a local HMAC, so these dummy values
      // never reach Stripe and the suite needs no account (spec 5.4).
      ...E2E_BILLING_ENV,
    },
  },
});
