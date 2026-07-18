import { test as base, expect } from "@playwright/test";

/**
 * Rate-limit E2E env + per-test bucket isolation (spec 2.1 / 22.3).
 *
 * ─── The problem this solves ────────────────────────────────────────────────
 *
 * The suite runs `fullyParallel` against ONE origin, and a local `next start` has
 * no reverse proxy, so `clientIp()` finds no X-Forwarded-For and every request in
 * every worker lands in the same `"unknown"` bucket. With a real 5-per-15-minutes
 * login limit that is not a flake — it is a guaranteed failure within seconds,
 * and the message ("too many sign-in attempts") looks nothing like the cause.
 *
 * ─── Why not just relax the limits in CI ────────────────────────────────────
 *
 * Because then the suite never exercises the configuration that ships. The env
 * below deliberately pins PRODUCTION values; isolation comes from giving each
 * test its own bucket instead of from making the limit unreachable. A spec that
 * fails here because it exceeded 5 login attempts is telling you something true.
 *
 * Disabling the limiter outright is worse still: acceptance criterion 2 is "a
 * 429 with a retry header", which is untestable against a disabled limiter.
 *
 * The header is honoured only when NODE_ENV !== "production" (see `testBucket` in
 * src/lib/security/rate-limit.ts), so it cannot be used to escape a bucket in a
 * real deployment. Same guard style as the /api/dev routes.
 *
 * ⚠️ Any spec that drives a login MUST import `test` from this file rather than
 * from `@playwright/test`, or it shares the default bucket with every other
 * worker. `/api/dev/*` is exempt from the limiter entirely, so pure seeding does
 * not need it.
 *
 * Imported by playwright.config.ts, so the ENV export must stay free of any
 * `@playwright/test` import at module scope.
 */
export const E2E_RATE_LIMIT_ENV = {
  RATE_LIMIT_MODE: "enforce",
  // Per-process counting is exactly right here: the suite runs one server.
  RATE_LIMIT_PROVIDER: "memory",
  // PRODUCTION values, deliberately — see the header.
  RATE_LIMIT_LOGIN_ATTEMPTS: "5",
  RATE_LIMIT_LOGIN_WINDOW_S: "900",
} as const;

export const RATE_LIMIT_BUCKET_HEADER = "x-e2e-rate-limit-bucket";

/** Collision-proof across parallel workers and repeat runs. */
export function uniqueBucket(prefix = "bucket"): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

/**
 * `test` with an automatic per-test bucket.
 *
 * Set on BOTH contexts on purpose: `context` covers the login form, which reaches
 * the server as a server-action POST from the browser, and `request` covers
 * direct API calls. A fixture that set only one would isolate half of a test and
 * leak the other half into the shared bucket.
 */
export const test = base.extend<{ bucket: string }>({
  bucket: [
    async ({}, use, testInfo) => {
      await use(uniqueBucket(testInfo.title.replace(/\W+/g, "-").slice(0, 40)));
    },
    { scope: "test" },
  ],

  context: async ({ context, bucket }, use) => {
    await context.setExtraHTTPHeaders({ [RATE_LIMIT_BUCKET_HEADER]: bucket });
    await use(context);
  },

  request: async ({ playwright, baseURL, bucket }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { [RATE_LIMIT_BUCKET_HEADER]: bucket },
    });
    await use(ctx);
    await ctx.dispose();
  },
});

export { expect };
