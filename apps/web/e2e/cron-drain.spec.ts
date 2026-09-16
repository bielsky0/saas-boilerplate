import { expect, test } from "@playwright/test";

/**
 * The job drain endpoint's guard (spec 12, 19.1).
 *
 * The point of these is the STATUS CODE, not the rejection. If the route were not
 * exempted in `src/proxy.ts`, an unauthenticated request would be answered with a
 * 307 to /login — and a cron pinger follows redirects, lands on a 200, and reports
 * success while draining nothing. A green dashboard over a dead queue, with
 * retries silently never running. Asserting 401/404 rather than "not 200" is what
 * pins that down.
 *
 * CRON_SECRET is unset in the E2E env, so the route answers 404 here — the
 * BILLING_PROVIDER=none precedent. That still proves the proxy exemption: without
 * it, this would be a 307.
 */

test("the drain endpoint is not behind the session guard", async ({ request }) => {
  const res = await request.get("/api/cron/jobs", { maxRedirects: 0 });

  // The one thing that must never happen.
  expect(res.status()).not.toBe(307);
  expect(res.headers()["location"]).toBeUndefined();
  // 404 (no CRON_SECRET configured) or 401 (configured, bad token) — both are the
  // route answering for itself.
  expect([401, 404]).toContain(res.status());
});

test("a wrong bearer token never drains", async ({ request }) => {
  const res = await request.get("/api/cron/jobs", {
    headers: { authorization: "Bearer definitely-not-the-cron-secret" },
    maxRedirects: 0,
  });
  expect([401, 404]).toContain(res.status());
  expect(await res.text()).not.toContain("claimed");
});
