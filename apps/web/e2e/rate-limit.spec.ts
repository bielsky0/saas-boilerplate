import { type Page } from "@playwright/test";

import { expect, test, RATE_LIMIT_BUCKET_HEADER, uniqueBucket } from "./rate-limit-fixtures";
import { loginViaUi, registerViaApi, uniqueEmail, apiUrl } from "./helpers";

/**
 * Rate limiting (spec 2.1 — login attempts).
 *
 * Faza 3.4: the edge limiter is gone — the bucket below is counted exclusively
 * by the main API (login bucket from faza 2.1, peek-before-hash in
 * apps/api/src/auth/auth.service.ts). Every test below drives that limiter,
 * either through the real form or straight at `POST /v1/auth/sign-in`; nothing
 * here touches a web-owned counter anymore.
 *
 * Acceptance criteria under test:
 *   1. the login endpoint keeps its §2.1 limit (blocks after 5 failures)
 *   2. exceeding the bucket answers 429 with `{ ok: false, code: "RATE_LIMITED" }`
 *
 * Every test runs at PRODUCTION limits and gets its own bucket from the fixture —
 * see e2e/rate-limit-fixtures.ts for why that is better than relaxing the limits.
 */

const LOGIN_LIMIT = 5;

/** One failed sign-in through the real form. */
async function failLogin(page: Page, email: string): Promise<string> {
  await page.goto("/login");
  await loginViaUi(page, email, "WrongPassword9");
  const error = page.locator('p[role="alert"]');
  await expect(error).toBeVisible();
  return (await error.textContent()) ?? "";
}

test("the login limit exists and blocks after the configured failures", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("rl-login");
  await registerViaApi(request, email);

  // Attempts 1..LIMIT are merely wrong, not blocked.
  for (let i = 0; i < LOGIN_LIMIT; i += 1) {
    expect(await failLogin(page, email)).toBe("Invalid email or password.");
  }

  // The next one is refused before the password is ever checked.
  expect(await failLogin(page, email)).toBe(
    "Too many sign-in attempts. Try again in a few minutes.",
  );
});

test("the lockout is per client, not global", async ({ browser, request, baseURL }) => {
  const email = uniqueEmail("rl-isolated");
  await registerViaApi(request, email);

  // A DIFFERENT bucket from the one this test's fixture assigned — i.e. a second
  // client. If the limiter were counting globally, the earlier test's traffic (or
  // this one's) would already have blocked it.
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { [RATE_LIMIT_BUCKET_HEADER]: uniqueBucket("other-client") },
  });
  const page = await context.newPage();

  expect(await failLogin(page, email)).toBe("Invalid email or password.");
  await context.close();
});

/**
 * §2.1's OTHER half must survive the limiter.
 *
 * The lockout message is a new observable, so it could become the
 * account-enumeration oracle that e2e/login-enumeration.spec.ts exists to
 * prevent. It does not, because the bucket is keyed on the CLIENT and never on
 * the submitted email — this test is what makes that claim checkable.
 */
test("the lockout message does not reveal whether the account exists", async ({
  browser,
  request,
  baseURL,
}) => {
  const realEmail = uniqueEmail("rl-enum-real");
  await registerViaApi(request, realEmail);
  const ghostEmail = uniqueEmail("rl-enum-ghost");

  async function lockoutMessageFor(email: string, locale: "en" | "pl"): Promise<string> {
    const context = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { [RATE_LIMIT_BUCKET_HEADER]: uniqueBucket(`enum-${locale}`) },
    });
    const page = await context.newPage();
    const path = locale === "pl" ? "/pl/login" : "/login";

    let message = "";
    for (let i = 0; i <= LOGIN_LIMIT; i += 1) {
      await page.goto(path);
      if (locale === "pl") {
        await page.getByLabel("E-mail").fill(email);
        await page.getByLabel("Hasło").fill("WrongPassword9");
        await page.getByRole("button", { name: "Zaloguj się" }).click();
      } else {
        await loginViaUi(page, email, "WrongPassword9");
      }
      const error = page.locator('p[role="alert"]');
      await expect(error).toBeVisible();
      message = (await error.textContent()) ?? "";
    }

    await context.close();
    return message;
  }

  const realLockout = await lockoutMessageFor(realEmail, "en");
  const ghostLockout = await lockoutMessageFor(ghostEmail, "en");
  expect(realLockout).toBe("Too many sign-in attempts. Try again in a few minutes.");
  expect(ghostLockout, "the lockout must be indistinguishable for a ghost account").toBe(
    realLockout,
  );

  /*
   * And in Polish, for the reason login-enumeration.spec.ts spells out: the suite
   * is pinned to en-US, so a pl-only divergence between these two branches would
   * ship silently.
   */
  const realPl = await lockoutMessageFor(realEmail, "pl");
  const ghostPl = await lockoutMessageFor(ghostEmail, "pl");
  expect(realPl).toBe("Zbyt wiele prób logowania. Spróbuj ponownie za kilka minut.");
  expect(ghostPl, "the two branches must stay indistinguishable in pl too").toBe(realPl);
});

/**
 * ACCEPTANCE CRITERION 2 — the 429 and its code, straight at the main API.
 *
 * Faza 3.4: the web counts nothing, so this drives `POST /v1/auth/sign-in`
 * directly — wrong password until the bucket is exhausted, then one past it.
 * Each failure consumes (peek-before-hash in auth.service.ts); the next one is
 * refused before the password is ever checked, answering 429 with the
 * machine-stable code the browser client maps to `auth.errors.tooManyAttempts`.
 */
test("exceeding the login bucket answers 429 with RATE_LIMITED", async ({ request }) => {
  const email = uniqueEmail("rl-direct");
  await registerViaApi(request, email);

  let blocked: Awaited<ReturnType<typeof request.post>> | null = null;

  // One past the login limit; the fixture's bucket makes this test's own
  // traffic the only traffic in the counter.
  for (let i = 0; i <= LOGIN_LIMIT; i += 1) {
    const res = await request.post(apiUrl("/v1/auth/sign-in"), {
      data: { email, password: "WrongPassword9" },
    });
    if (res.status() === 429) {
      blocked = res;
      break;
    }
    expect(res.status(), "a wrong password is 401, not a block").toBe(401);
  }

  expect(blocked, `no 429 within ${LOGIN_LIMIT + 1} sign-in attempts`).not.toBeNull();
  expect(await blocked!.json()).toEqual({ ok: false, code: "RATE_LIMITED" });
});

/**
 * The UI and the API share ONE login counter.
 *
 * The fixture sets the same per-test bucket header on both the browser context
 * and the direct request context — so failures driven through the real form
 * must be visible to a direct API call in the same test. If the two paths ever
 * counted separately (a forked limiter), this is the test that catches it.
 */
test("the UI and the API share one login counter", async ({ page, request }) => {
  const email = uniqueEmail("rl-shared");
  await registerViaApi(request, email);

  // Exhaust the bucket through the real form — merely wrong, not blocked.
  for (let i = 0; i < LOGIN_LIMIT; i += 1) {
    expect(await failLogin(page, email)).toBe("Invalid email or password.");
  }

  // Same bucket, direct call: the API sees the same exhaustion and refuses
  // before checking the password.
  const res = await request.post(apiUrl("/v1/auth/sign-in"), {
    data: { email, password: "WrongPassword9" },
  });
  expect(res.status()).toBe(429);
  expect(await res.json()).toEqual({ ok: false, code: "RATE_LIMITED" });
});

/**
 * The postgres provider, which the E2E server does NOT boot with (the suite runs
 * on `memory`), so without this route its atomic upsert would have no coverage.
 */
test("the postgres store counts, blocks, resets and prunes", async ({ request }) => {
  const key = `e2e:${uniqueBucket("pg")}`;
  const rule = { limit: 3, windowMs: 60_000 };

  const first = await request.post(apiUrl("/v1/dev/rate-limit"), {
    data: { provider: "postgres", key, ...rule, times: 4, reset: true },
  });
  expect(first.ok()).toBe(true);
  const body = (await first.json()) as {
    decisions: { allowed: boolean; remaining: number }[];
  };

  // Three allowed, the fourth blocked — and `remaining` counts down honestly.
  expect(body.decisions.map((d) => d.allowed)).toEqual([true, true, true, false]);
  expect(body.decisions.map((d) => d.remaining)).toEqual([2, 1, 0, 0]);

  // A reset returns the key to a fresh window rather than merely decrementing.
  const afterReset = await request.post(apiUrl("/v1/dev/rate-limit"), {
    data: { provider: "postgres", key, ...rule, times: 1, reset: true, prune: true },
  });
  const resetBody = (await afterReset.json()) as {
    decisions: { allowed: boolean; remaining: number }[];
    pruned: number;
  };
  expect(resetBody.decisions[0]?.allowed).toBe(true);
  expect(resetBody.decisions[0]?.remaining).toBe(2);
  // Prune must not remove a LIVE counter — only expired ones.
  expect(resetBody.pruned).toBeGreaterThanOrEqual(0);

  const stillCounted = await request.post(apiUrl("/v1/dev/rate-limit"), {
    data: { provider: "postgres", key, ...rule, times: 0 },
  });
  const peek = (await stillCounted.json()) as { peeked: { remaining: number } };
  expect(peek.peeked.remaining, "prune must not have dropped the live window").toBe(2);
});

/** An expired window resets rather than staying blocked. */
test("a counter resets once its window has passed", async ({ request }) => {
  const key = `e2e:${uniqueBucket("expiry")}`;
  // A 1s window, so expiry is observable without a slow test.
  const rule = { limit: 2, windowMs: 1_000 };

  const exhaust = await request.post(apiUrl("/v1/dev/rate-limit"), {
    data: { provider: "postgres", key, ...rule, times: 3, reset: true },
  });
  const exhausted = (await exhaust.json()) as { decisions: { allowed: boolean }[] };
  expect(exhausted.decisions.map((d) => d.allowed)).toEqual([true, true, false]);

  await new Promise((resolve) => setTimeout(resolve, 1_200));

  const after = await request.post(apiUrl("/v1/dev/rate-limit"), {
    data: { provider: "postgres", key, ...rule, times: 1 },
  });
  const revived = (await after.json()) as { decisions: { allowed: boolean; remaining: number }[] };
  expect(revived.decisions[0]?.allowed, "an expired window must reset, not stay blocked").toBe(
    true,
  );
  expect(revived.decisions[0]?.remaining).toBe(1);
});
