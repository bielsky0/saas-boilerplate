import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "./rate-limit-fixtures";

/**
 * Spec §8.2, §9.1 — sitemap.xml lists every published post and updates itself as
 * content is published.
 *
 * These specs touch no database and need no session, so the suite's usual
 * unique-data rule (uniqueEmail(), unique slugs) does not apply here. Content is
 * the boilerplate's own example posts, which are stable fixtures by design.
 */

const BLOG_DIR = path.join(process.cwd(), "src/content/blog");

/** Every URL in the sitemap, as root-relative paths. */
async function sitemapPaths(baseURL: string, xml: string): Promise<string[]> {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.replace(baseURL, "") || "/");
}

test("sitemap.xml is served as XML and lists the public pages in every locale", async ({
  request,
  baseURL,
}) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("xml");

  const paths = await sitemapPaths(baseURL!, await res.text());

  // Chrome pages exist per language, so each is listed under every locale (§16.1).
  for (const locale of ["en", "pl"]) {
    expect(paths).toContain(`/${locale}`);
    expect(paths).toContain(`/${locale}/blog`);
    expect(paths).toContain(`/${locale}/docs`);
    expect(paths).toContain(`/${locale}/changelog`);
  }

  // The bare paths are NOT listed: `/` negotiates and 307s, so advertising it as
  // a canonical URL would put a redirect in the index. It appears as x-default
  // only — asserted below.
  expect(paths).not.toContain("/blog");

  // Public but unindexable: reachable without a session, deliberately not listed.
  expect(paths).not.toContain("/en/login");
  expect(paths).not.toContain("/en/signup");
  expect(paths).not.toContain("/pl/login");
});

/**
 * hreflang is the part a crawler acts on, and it is invisible in the rendered
 * site — nothing else in the suite would notice if it vanished.
 */
test("chrome pages cross-link their languages with hreflang + x-default", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();

  // The <url> block for /en/blog must advertise both languages and x-default.
  const block = /<url>\s*<loc>[^<]*\/en\/blog<\/loc>[\s\S]*?<\/url>/.exec(xml)?.[0];
  expect(block, "no <url> block for /en/blog").toBeTruthy();

  expect(block).toContain('hreflang="en"');
  expect(block).toContain('hreflang="pl"');
  expect(block).toContain('hreflang="x-default"');
  expect(block).toContain("/pl/blog");
});

/**
 * The one failure the registry design cannot catch at compile time: creating a
 * post's files and forgetting to add the line to src/content/blog/index.ts.
 * Nothing imports the orphan, so nothing errors — it is simply invisible. Here,
 * fs is available and cheap, so the test is what notices.
 */
test("every published post directory appears in the sitemap", async ({ request, baseURL }) => {
  const paths = await sitemapPaths(baseURL!, await (await request.get("/sitemap.xml")).text());
  const slugs = readdirSync(BLOG_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  expect(slugs.length).toBeGreaterThan(0);

  for (const slug of slugs) {
    const meta = readFileSync(path.join(BLOG_DIR, slug, "meta.ts"), "utf8");
    const status = /status:\s*"(draft|published)"/.exec(meta)?.[1];

    /*
     * Fail loudly rather than skip. If status stops being a literal (moved to a
     * variable, renamed), this regex silently misses and every assertion below
     * would vacuously pass — the test would go green precisely when it stopped
     * testing anything.
     */
    if (!status) {
      throw new Error(
        `Could not read status from ${slug}/meta.ts. If the meta shape changed, update this test — do not let it pass vacuously.`,
      );
    }

    /*
     * Posts are listed under the language they are WRITTEN in, once — not once
     * per locale (§16.1). `/pl/blog/x` renders (Polish chrome, English prose) but
     * is deliberately absent here and canonicals to `/en/blog/x`: hreflang between
     * two URLs serving identical prose invites Google to pick one arbitrarily.
     * See CONTENT_LOCALE in features/content/source.ts.
     */
    if (status === "published") {
      expect(
        paths,
        `published post "${slug}" is missing from the sitemap — is it in src/content/blog/index.ts?`,
      ).toContain(`/en/blog/${slug}`);
      expect(paths, `post "${slug}" must not be listed per-locale`).not.toContain(
        `/pl/blog/${slug}`,
      );
    } else {
      expect(paths, `draft "${slug}" must never reach the sitemap`).not.toContain(
        `/en/blog/${slug}`,
      );
    }
  }
});

test("a draft is not published: absent from the index and 404 at its URL", async ({
  page,
  request,
}) => {
  const draft = "scaling-postgres-for-multi-tenancy";

  expect((await request.get(`/blog/${draft}`)).status()).toBe(404);

  await page.goto("/blog");
  await expect(page.getByRole("link", { name: "Scaling Postgres for multi-tenancy" })).toHaveCount(
    0,
  );
});

test("no URL in the sitemap is broken", async ({ request, baseURL }) => {
  const paths = await sitemapPaths(baseURL!, await (await request.get("/sitemap.xml")).text());

  for (const p of paths) {
    expect(
      (await request.get(p)).status(),
      `${p} is listed in the sitemap but does not resolve`,
    ).toBe(200);
  }
});

test("robots.txt points at the sitemap and disallows the unindexable pages", async ({
  request,
}) => {
  const body = await (await request.get("/robots.txt")).text();

  expect(body).toContain("Sitemap: ");
  expect(body).toContain("/sitemap.xml");
  expect(body).toContain("Disallow: /login");
  // The route guard already hides these; naming them here would only advertise them.
  expect(body).not.toContain("/admin");
  expect(body).not.toContain("/dashboard");
});
