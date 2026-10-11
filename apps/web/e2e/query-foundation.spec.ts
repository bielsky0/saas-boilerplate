import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { apiUrl, loginAsFreshUser } from "./helpers";

/**
 * Etap 4, faza 1 — fundament TanStack Query (Next jako frontend do NestJS).
 *
 * PoC na dashboardzie (`ApiStatus` → `GET /v1/health`) udowadnia w przeglądarce:
 * provider zamontowany, klient przeglądarkowy dociera do API z sesją cookie,
 * stany loading/error/ok renderują się, 401/403 nie retryują, a zapytania do
 * API nie łamią CSP (`connect-src`, `CSP_MODE=enforce`).
 */

async function loginAsQueryUser(page: Page, request: APIRequestContext): Promise<string> {
  return loginAsFreshUser(page, request, "query");
}

/**
 * Wait until a counter stops changing (stable for `stableMs`), returning its
 * value. Guards tests against app-initiated remounts (e.g. the shell's
 * mount-time same-URL transition): instead of asserting an exact request
 * count — which couples the test to render timing — tests assert quiescence
 * (no retry storm) plus a small upper bound.
 */
async function waitForQuiescence(
  read: () => number,
  stableMs = 1500,
  timeout = 15000,
): Promise<number> {
  const start = Date.now();
  let last = read();
  let lastChange = start;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const now = read();
    if (now !== last) {
      last = now;
      lastChange = Date.now();
    }
    if (Date.now() - lastChange >= stableMs) return last;
    if (Date.now() - start > timeout) throw new Error(`counter never settled (last=${last})`);
  }
}

/**
 * Intercept the health endpoint with CORS-correct responses.
 *
 * The browser client always sends `content-type: application/json` (even for
 * GET), so every attempt is preceded by an OPTIONS preflight. A bare
 * `route.fulfill({ status })` answers the preflight without CORS headers —
 * the GET never fires and the fetch rejects with a TypeError instead of the
 * intended ApiError, which would silently test the wrong path. The preflight
 * is answered like Nest's own CORS layer (origin + credentials) and only GET
 * hits are counted.
 */
async function interceptHealth(page: Page, status: number, onGet: () => void): Promise<void> {
  await page.route("**/v1/health", async (route) => {
    const cors = {
      "Access-Control-Allow-Origin": "http://localhost:3000",
      "Access-Control-Allow-Credentials": "true",
    };
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          ...cors,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "content-type",
        },
      });
      return;
    }
    onGet();
    await route.fulfill({
      status,
      contentType: "application/json",
      headers: cors,
      body: "{}",
    });
  });
}

test("query PoC shows live API status on the dashboard", async ({ page, request }) => {
  await loginAsQueryUser(page, request);

  await expect(page.getByTestId("api-status")).toBeVisible();
  // Health endpoint answers fast — ok state replaces the loading state.
  await expect(page.getByTestId("api-status-ok")).toBeVisible();
  await expect(page.getByTestId("api-status-ok")).toHaveText("API connected");

  // The UI copy matches what the API really returns (no mocked payload).
  const res = await request.get(apiUrl("/v1/health"));
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});

test("query PoC renders in Polish under /pl", async ({ page, request }) => {
  await loginAsQueryUser(page, request);

  await page.goto("/pl/dashboard");
  await expect(page.getByTestId("api-status")).toBeVisible();
  await expect(page.getByTestId("api-status-ok")).toHaveText("Połączono z API");
});

test("401 from the API renders error state without retry", async ({ page, request }) => {
  await loginAsQueryUser(page, request);

  let healthGets = 0;
  await interceptHealth(page, 401, () => {
    healthGets += 1;
  });
  await page.goto("/en/dashboard");

  await expect(page.getByTestId("api-status-error")).toBeVisible();
  // Drain: the shell performs one same-URL client transition on mount
  // (NuqsAdapter sync), which remounts the PoC and re-fires the query once
  // the cached error is not fresh data. Wait for quiescence first — then the
  // 401 rule (no retries) must hold exactly: zero new GETs, bounded total.
  const settled = await waitForQuiescence(() => healthGets);
  await page.waitForTimeout(2000);
  expect(healthGets).toBe(settled);
  expect(settled).toBeLessThanOrEqual(3);
});

test("500 from the API retries, then renders error state", async ({ page, request }) => {
  await loginAsQueryUser(page, request);

  let healthGets = 0;
  await interceptHealth(page, 500, () => {
    healthGets += 1;
  });
  await page.goto("/en/dashboard");

  await expect(page.getByTestId("api-status-error")).toBeVisible();
  const settled = await waitForQuiescence(() => healthGets);
  await page.waitForTimeout(2000);
  // A retry happened (more than the bare minimum) and then it stopped.
  expect(settled).toBeGreaterThanOrEqual(2);
  expect(healthGets).toBe(settled);
  expect(settled).toBeLessThanOrEqual(4);
});

test("dashboard issues no CSP violations or failed requests", async ({ page, request }) => {
  await loginAsQueryUser(page, request);

  // Listeners attach AFTER the login navigation: the login page fires `_rsc`
  // prefetch requests that are routinely aborted mid-navigation, which is
  // pre-existing behaviour, not a Query regression. What this test owns is the
  // fresh dashboard load below — including the cross-origin fetch to the API.
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/content-security-policy/i.test(msg.text())) violations.push(msg.text());
  });
  page.on("pageerror", (err) => violations.push(String(err)));

  const failed: string[] = [];
  page.on("requestfailed", (req) => failed.push(`${req.method()} ${req.url()}`));

  await page.goto("/en/dashboard");
  await expect(page.getByTestId("api-status-ok")).toBeVisible();

  expect(violations).toEqual([]);
  // Only the API origin is owned by this test (the `connect-src` guarantee):
  // same-origin `?_rsc` prefetch aborts and superseded document navigations
  // are routine Next.js router churn during login handoff, not app breakage.
  const apiOrigin = new URL(apiUrl("/v1/health")).origin;
  const apiFailed = failed.filter((url) => url.startsWith(apiOrigin));
  expect(apiFailed).toEqual([]);
});
