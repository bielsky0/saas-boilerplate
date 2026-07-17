import { expect, test } from "@playwright/test";

/**
 * Language switching (spec 16.1) — acceptance criterion: switching the language
 * changes both the UI and the URL.
 *
 * These assert the CHROME, not the prose. §16 localizes the app's interface; a
 * blog post's body stays English under a translated shell (see CONTENT_LOCALE in
 * features/content/source.ts), and `i18n-content.spec.ts`-style assertions about
 * translated posts would be testing a promise the product does not make.
 *
 * No database, no session: these are chrome facts, like the SEO specs. Do not add
 * `uniqueEmail()` here out of habit.
 */

test("the switcher changes the URL, the copy and <html lang>, and the choice survives a reload", async ({
  page,
}) => {
  await page.goto("/en/blog");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("navigation", { name: "Content" })).toBeVisible();

  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("menuitem", { name: "Polski" }).click();

  // THE URL MOVES. A switcher that changed only the copy would leave the address
  // bar lying, and the page unlinkable in the language you are reading.
  await page.waitForURL("**/pl/blog");
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  // THE COPY MOVES: `Content` -> `Treści` (the nav's accessible name).
  // Scoped to the header nav — the same links are repeated in the footer.
  const nav = page.getByRole("navigation", { name: "Treści" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Dokumentacja" })).toBeVisible();

  // THE CHOICE STICKS. Reloading must not re-negotiate back to the browser's
  // language — that is the whole reason the action writes a cookie.
  await page.reload();
  await expect(page).toHaveURL(/\/pl\/blog$/);
  await expect(
    page.getByRole("navigation", { name: "Treści" }).getByRole("link", { name: "Dokumentacja" }),
  ).toBeVisible();
});

/**
 * The cookie is what makes an UNPREFIXED entry point honour the choice. Without
 * it, `/` re-negotiates from Accept-Language every time and a Polish reader on an
 * English-locale browser re-picks on every visit.
 */
test("after switching, an unprefixed URL negotiates to the chosen language", async ({ page }) => {
  await page.goto("/en/blog");
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("menuitem", { name: "Polski" }).click();
  await page.waitForURL("**/pl/blog");

  // `/` carries no locale and the browser locale is pinned to en-US (see
  // playwright.config.ts), so ONLY the cookie can produce /pl here.
  await page.goto("/");
  await expect(page).toHaveURL(/\/pl$/);
});
