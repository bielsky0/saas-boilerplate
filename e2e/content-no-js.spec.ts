import { expect, test } from "@playwright/test";

/**
 * Spec §9.1 — public content is server-rendered: its body is in the HTML, not
 * assembled by client JavaScript.
 *
 * Disabling JS is the honest version of this check. A crawler that never runs a
 * script must see the same prose a reader does; if any of this content were
 * client-rendered, these pages would come back empty and the SEO work would be
 * decoration.
 *
 * No database, no session: see the note in seo-sitemap.spec.ts.
 */
test.use({ javaScriptEnabled: false });

test("a blog post renders its body without JavaScript", async ({ page }) => {
  await page.goto("/blog/hello-world");

  await expect(page.getByRole("heading", { level: 1, name: "Hello world" })).toBeVisible();
  // Prose from the MDX body, not the frontmatter.
  await expect(
    page.getByText("Every SaaS starts by rebuilding the same foundations"),
  ).toBeVisible();
  // A heading from inside the MDX, proving the body compiled and rendered.
  await expect(page.getByRole("heading", { name: "No vendor lock-in" })).toBeVisible();
});

test("the blog index lists posts without JavaScript", async ({ page }) => {
  await page.goto("/blog");

  await expect(page.getByRole("link", { name: "Hello world" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Designing for no vendor lock-in" })).toBeVisible();
});

test("a docs page renders its body and sidebar without JavaScript", async ({ page }) => {
  await page.goto("/docs/guides/theming");

  await expect(page.getByRole("heading", { level: 1, name: "Theming" })).toBeVisible();
  await expect(page.getByText("Every colour, radius and font")).toBeVisible();

  // The hierarchical nav (§8.3) is server-rendered too, and marks the active page.
  const nav = page.getByRole("navigation", { name: "Documentation" });
  await expect(nav.getByRole("link", { name: "Installation" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Theming" })).toHaveAttribute("aria-current", "page");
});

test("the changelog renders its entries without JavaScript", async ({ page }) => {
  await page.goto("/changelog");

  await expect(page.getByRole("heading", { level: 1, name: "Changelog" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1.2.0" })).toBeVisible();
  await expect(page.getByText("Transactional email behind a provider adapter")).toBeVisible();
});

/**
 * Docs search (§8.3) is a plain GET form, which is exactly why it still works
 * here: the browser submits it natively, and the server renders the results. A
 * client-component search box would fail this test — which is the point.
 */
test("docs search works without JavaScript and matches body text", async ({ page }) => {
  await page.goto("/docs");

  // "triplet" appears only in the BODY of the theming doc — never in a title or
  // description — so a hit proves the index really covers content (§8.3).
  await page.getByRole("searchbox", { name: "Search documentation" }).fill("triplet");
  await page.keyboard.press("Enter");

  await page.waitForURL("**/docs?q=triplet");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("1 result");
  await expect(page.getByRole("link", { name: "Theming" }).first()).toBeVisible();
});

test("docs search reports no matches honestly", async ({ page }) => {
  await page.goto("/docs?q=zzzznotawordzzzz");
  await expect(page.getByText("Nothing matched")).toBeVisible();
});
