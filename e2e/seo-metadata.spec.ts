import { expect, test, type Page } from "@playwright/test";

/**
 * Spec §9.1 — every public page carries a unique, non-empty title and
 * description, plus its own Open Graph card.
 *
 * No database, no session: see the note in seo-sitemap.spec.ts.
 */

/** Every public page: the content surface plus the auth pages, which are public too. */
const PUBLIC_PAGES = [
  "/",
  "/blog",
  "/blog/hello-world",
  "/blog/designing-for-no-vendor-lock-in",
  "/docs",
  "/docs/getting-started/installation",
  "/docs/getting-started/quickstart",
  "/docs/guides/theming",
  "/changelog",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

async function metaContent(page: Page, selector: string): Promise<string> {
  return (await page.locator(selector).first().getAttribute("content")) ?? "";
}

test("every public page has a unique, non-empty title and description", async ({ page }) => {
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();

  for (const path of PUBLIC_PAGES) {
    await page.goto(path);

    const title = await page.title();
    const description = await metaContent(page, 'meta[name="description"]');

    expect(title, `${path} has no <title>`).not.toBe("");
    expect(description, `${path} has no meta description`).not.toBe("");

    titles.set(path, title);
    descriptions.set(path, description);
  }

  // Pairwise uniqueness: a Set smaller than the list means two pages collide.
  expect(
    new Set(titles.values()).size,
    `duplicate titles: ${[...titles].map(([p, t]) => `${p}="${t}"`).join(", ")}`,
  ).toBe(titles.size);
  expect(
    new Set(descriptions.values()).size,
    `duplicate descriptions: ${[...descriptions].map(([p, d]) => `${p}="${d}"`).join(", ")}`,
  ).toBe(descriptions.size);
});

/**
 * The trap this suite exists for. Metadata segments REPLACE openGraph rather
 * than merging it, and Next only fills a page's title into openGraph when the
 * page declares one (`inheritFromMetadata`, guarded by `if (target)`). So a page
 * that sets only title/description silently ships the ROOT layout's og:title,
 * and every share card reads "SaaS Boilerplate" while <title> looks perfect.
 *
 * Asserting <title> alone would not catch it. This does.
 */
test("every public page has its own og:title, not the root's", async ({ page }) => {
  const ogTitles = new Map<string, string>();

  for (const path of PUBLIC_PAGES) {
    await page.goto(path);

    const ogTitle = await metaContent(page, 'meta[property="og:title"]');
    const ogDescription = await metaContent(page, 'meta[property="og:description"]');
    const canonical = await page.locator('link[rel="canonical"]').first().getAttribute("href");

    expect(ogTitle, `${path} has no og:title`).not.toBe("");
    expect(ogDescription, `${path} has no og:description`).not.toBe("");
    expect(canonical, `${path} has no canonical URL`).toBeTruthy();

    ogTitles.set(path, ogTitle);
  }

  expect(
    new Set(ogTitles.values()).size,
    "two pages share an og:title — one is inheriting the root's",
  ).toBe(ogTitles.size);
});

test("auth pages are public but not indexable", async ({ page }) => {
  for (const path of ["/login", "/signup", "/forgot-password", "/reset-password"]) {
    await page.goto(path);
    // The meta tag is what actually prevents indexing; robots.txt only stops crawling.
    expect(await metaContent(page, 'meta[name="robots"]'), `${path} is missing noindex`).toContain(
      "noindex",
    );
  }
});

test("content pages are indexable", async ({ page }) => {
  for (const path of ["/", "/blog", "/blog/hello-world", "/docs/guides/theming", "/changelog"]) {
    await page.goto(path);
    const robots = await page.locator('meta[name="robots"]').count();
    if (robots > 0) {
      expect(
        await metaContent(page, 'meta[name="robots"]'),
        `${path} must not be noindex`,
      ).not.toContain("noindex");
    }
  }
});

test("a blog post carries BlogPosting structured data", async ({ page }) => {
  await page.goto("/blog/hello-world");

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(blocks.length).toBeGreaterThan(0);

  const nodes = blocks.flatMap((block) => {
    const parsed: unknown = JSON.parse(block);
    return Array.isArray(parsed) ? parsed : [parsed];
  }) as Record<string, unknown>[];

  const posting = nodes.find((node) => node["@type"] === "BlogPosting");
  expect(posting, "no BlogPosting node").toBeTruthy();
  expect(posting!.headline).toBe("Hello world");
  expect(posting!.datePublished).toBe("2026-07-01");

  // Parsing above already proves the JSON is well-formed; this proves the
  // escaping cannot end the script element early.
  for (const block of blocks) expect(block).not.toContain("</script");
});

test("the OG image routes are reachable by an anonymous scraper", async ({ request }) => {
  /*
   * Regression test for a real trap: Next serves a generated OG image at a
   * pathname with NO extension (the content hash is a query), so the proxy
   * matcher's `.*\..*` skip does not apply and the default-deny guard would 307
   * it to /login. Scrapers carry no session and do not follow redirects, so that
   * turns every share card into a login page.
   */
  const res = await request.get("/opengraph-image", { maxRedirects: 0 });
  expect(res.status(), "the site OG image must not redirect to /login").toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});
