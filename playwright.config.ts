import { defineConfig, devices } from "@playwright/test";

import { E2E_BILLING_ENV } from "./e2e/billing-fixtures";
import { APEX_ORIGIN, E2E_HOST_ENV } from "./e2e/host-fixtures";
import { E2E_RATE_LIMIT_ENV } from "./e2e/rate-limit-fixtures";
import { E2E_STORAGE_ENV } from "./e2e/storage-fixtures";
import { E2E_TENANCY_ENV, ORG_DEPENDENT_SPECS, TENANCY_MODE } from "./e2e/tenancy-fixtures";

/**
 * Playwright E2E config (spec 14.1). Auth is critical, so these run on every PR
 * and block merge. The app boots with EMAIL_PROVIDER=log so tests read the
 * verification link from the in-memory outbox via /api/dev/emails — no SMTP.
 *
 * The DB must be migrated before the web server starts (CI runs `pnpm db:migrate`;
 * locally run it once). The storage suite needs MinIO reachable at
 * localhost:9000 with its bucket created — `pnpm db:up` starts it locally (the
 * `minio` + `minio_init` compose services); CI runs it as a service + a bucket
 * step. We build + start a production server so there is no first-request
 * cold-compile in the middle of a test.
 */
/**
 * `baseURL` is the platform APEX, not localhost (F4.5). Academies live on
 * `{subdomain}.localtest.me:3000`, and specs reach those with absolute URLs from
 * `tenantUrl()` — see e2e/host-fixtures.ts for why real hosts rather than a
 * spoofed Host header. Every pre-existing spec is unaffected: relative paths
 * still resolve against the apex, which is where the staff panel still lives.
 */
const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? APEX_ORIGIN;

export default defineConfig({
  testDir: "./e2e",
  /**
   * Multi-tenancy mode (spec 1.4). The `disabled` leg hides the org UI, so the 13
   * specs that drive it cannot pass — they are skipped rather than rewritten to
   * self-skip. See e2e/tenancy-fixtures.ts for why that criterion was revised.
   */
  testIgnore: TENANCY_MODE === "disabled" ? ORG_DEPENDENT_SPECS : [],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    /**
     * PIN THE BROWSER LOCALE (spec 16.1).
     *
     * Chromium otherwise inherits the HOST's locale, which it sends as
     * `Accept-Language` — so once the proxy negotiates (§16), the language this
     * suite runs in depends on the machine it runs on. A developer in Warsaw and
     * a CI runner in us-east would exercise different languages, and the ~14
     * specs that assert English copy would pass in one place and fail in the
     * other, for a reason nothing in the failure message mentions.
     *
     * This is the same argument features/content/format.ts makes about pinning a
     * date locale: unpinned is not neutral, it is "whatever the machine thinks".
     * Pinned, the suite asserts English forever and locale behaviour is tested
     * explicitly, by the specs that override this per-test.
     */
    locale: "en-US",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm start",
    url: baseURL,
    /**
     * ⚠️ Reuse is forced OFF outside `required` mode. A server already running on
     * :3000 in the default mode would otherwise be silently reused by the
     * `disabled` leg, which would then assert disabled behaviour against a
     * required-mode server — and every failure message would be about a missing
     * switcher, not about the stale server. This footgun has already cost time
     * twice in this repo (faza 7 and faza 11a.1); here it is closed in config.
     */
    reuseExistingServer: !process.env.CI && TENANCY_MODE === "required",
    timeout: 120_000,
    env: {
      NODE_ENV: "test",
      EMAIL_PROVIDER: "log",
      // Selects the Stripe adapter and shares the signing secret with the tests
      // that sign fixtures. Verification is a local HMAC, so these dummy values
      // never reach Stripe and the suite needs no account (spec 5.4).
      ...E2E_BILLING_ENV,
      // Selects the S3 adapter against local MinIO (spec 21 / 25).
      ...E2E_STORAGE_ENV,
      // Rate limiting at PRODUCTION limits (spec 2.1 / 22.3). The suite stays
      // green because each test gets its own bucket via a header fixture, not
      // because the limits are relaxed — see e2e/rate-limit-fixtures.ts.
      ...E2E_RATE_LIMIT_ENV,
      // Which tenancy mode this leg boots in (spec 1.4). Default `required`.
      ...E2E_TENANCY_ENV,
      // Root domain for tenant hosts (langlion §2.27, F4.5). Also repoints the
      // absolute-URL vars at the apex so mailed links stay reachable.
      ...E2E_HOST_ENV,
    },
  },
});
