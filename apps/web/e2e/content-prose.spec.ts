import { expect, test } from "@playwright/test";

/**
 * Spec §7.1/§8 — long-form content is styled by the design tokens.
 *
 * These two assertions exist because both failures are SILENT: the page still
 * renders, nothing errors, and only a human looking at it would notice. Neither
 * is covered by the metadata or no-JS specs, which never look at colour.
 *
 * No database, no session: see the note in seo-sitemap.spec.ts.
 */

test("prose text uses the foreground token in both themes, without prose-invert", async ({
  page,
}) => {
  await page.goto("/docs/guides/theming");
  const paragraph = page.locator(".prose p").first();

  /*
   * @tailwindcss/typography ships a hard-coded grey palette (--tw-prose-body is
   * #364153 = rgb(54,65,83) by default). globals.css maps its variables onto our
   * tokens instead; if that mapping is dropped or loses the cascade, the text
   * silently reverts to the plugin's grey.
   */
  expect(await paragraph.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(23, 23, 23)");

  await page.evaluate(() => document.documentElement.classList.add("dark"));

  /*
   * And this is the claim that `dark:prose-invert` is unnecessary: our tokens
   * already flip under .dark, so one mapping is correct in both themes. If
   * someone "fixes" it by adding prose-invert, the plugin's own dark palette
   * layers on top and this assertion fails.
   */
  expect(await paragraph.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(237, 237, 237)");
});

test("inline code does not render literal backticks", async ({ page }) => {
  await page.goto("/docs/guides/theming");
  const code = page.locator(".prose :not(pre) > code").first();
  await expect(code).toBeVisible();

  /*
   * The plugin decorates inline <code> with `content: "`"` on ::before/::after,
   * which prints backticks around every inline code span. It is invisible to any
   * DOM-text assertion, because the backticks are generated content.
   */
  for (const pseudo of ["::before", "::after"]) {
    const content = await code.evaluate((el, p) => getComputedStyle(el, p).content, pseudo);
    expect(content, `inline code renders a literal backtick via ${pseudo}`).toBe("none");
  }
});
