import { expect, test } from "@playwright/test";

/**
 * Locale negotiation in the proxy (spec 16.1).
 *
 * `localePrefix: "always"`, so an unprefixed URL is a REDIRECT to a language, and
 * which language it picks is the negotiation. These specs pin the browser locale
 * per-test, overriding the suite-wide `en-US` in playwright.config.ts — they are
 * the reason that pin exists: everything else must be deterministic so these can
 * vary one thing on purpose.
 */

test("an unprefixed URL redirects to the default locale", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
});

test.describe("with a Polish browser", () => {
  test.use({ locale: "pl-PL" });

  test("Accept-Language decides the language of an unprefixed URL", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/pl$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  });

  test("a URL that already names a locale wins over the browser's", async ({ page }) => {
    // The URL is the thing a person links, bookmarks and shares. If Accept-Language
    // could override it, sharing /en/blog with a Polish colleague would show them
    // something other than what was sent.
    await page.goto("/en/blog");
    await expect(page).toHaveURL(/\/en\/blog$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("with a browser whose language we do not speak", () => {
  test.use({ locale: "de-DE" });

  test("falls back to the default locale rather than 404ing", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
  });
});

/**
 * THE HEADER IS ATTACKER-CONTROLLED, and it is parsed in the PROXY — which runs
 * on every request to every route. `@formatjs/intl-localematcher` throws a
 * RangeError on a structurally invalid language tag, so an unguarded `match()`
 * here is not a broken page, it is a 500 on the entire site from one curl.
 */
test("a malformed Accept-Language cannot take the site down", async ({ request }) => {
  for (const header of ["???", "*", "en-US;q=bad,,,;;", "-", "x".repeat(500)]) {
    const res = await request.get("/", {
      headers: { "accept-language": header },
      maxRedirects: 0,
    });
    expect(res.status(), `Accept-Language: ${header.slice(0, 20)} must not 500`).toBe(307);
    expect(res.headers()["location"]).toContain("/en");
  }
});
